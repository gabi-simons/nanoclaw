/**
 * L4 deterministic smoke — credential-free real-container round-trip.
 *
 * Proves the keystone end-to-end: a real Docker container spawns with NO
 * OneCLI gateway and NO credentials (NANOCLAW_SMOKE=1), runs the scriptable
 * 'stub' provider (NANOCLAW_STUB_SCRIPT), and a canned prompt round-trips
 * inbound.db -> container -> outbound.db with a deterministic golden assert.
 *
 * This is the prototype of the OSS<->agentops `nanoclaw:smoke` contract:
 *   exit 0 = round-trip + golden matched · exit 1 = anything else.
 * No model, no secrets, no network — it asserts the plumbing, not behaviour.
 *
 * Usage: pnpm exec tsx scripts/smoke-stub.ts   (needs Docker; GH runners have it)
 */
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const EXPECTED = 'PONG 42';
const DEST = 'smoke-dest';

// Must be set BEFORE routeInbound → spawnContainer reads them at build-args time.
process.env.NANOCLAW_SMOKE = '1';
process.env.NANOCLAW_STUB_SCRIPT = `<message to="${DEST}">${EXPECTED}</message>`;

const TEST_DIR = '/tmp/nanoclaw-smoke-stub';
if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true });
fs.mkdirSync(TEST_DIR, { recursive: true });

import { initDb } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrations/index.js';
import { createAgentGroup } from '../src/db/agent-groups.js';
import { createMessagingGroup, createMessagingGroupAgent } from '../src/db/messaging-groups.js';
import { replaceDestinations } from '../src/db/session-db.js';
import { routeInbound } from '../src/router.js';
import { findSession } from '../src/db/sessions.js';
import { inboundDbPath, outboundDbPath } from '../src/session-manager.js';
import { killContainer } from '../src/container-runner.js';

function fail(msg: string): never {
  console.error(`\n✗ SMOKE FAIL: ${msg}`);
  process.exit(1);
}

const centralDb = initDb(path.join(TEST_DIR, 'v2.db'));
runMigrations(centralDb);

const groupDir = path.join(path.resolve(process.cwd(), 'groups'), 'smoke-stub');
fs.mkdirSync(groupDir, { recursive: true });
fs.writeFileSync(path.join(groupDir, 'CLAUDE.md'), '# Smoke agent\n');

createAgentGroup({
  id: 'ag-smoke',
  name: 'Smoke Agent',
  folder: 'smoke-stub',
  agent_provider: 'stub', // → container.json provider → createProvider('stub')
  created_at: new Date().toISOString(),
});
createMessagingGroup({
  id: 'mg-smoke',
  channel_type: 'test',
  platform_id: 'smoke-channel',
  name: 'Smoke Channel',
  is_group: 0,
  unknown_sender_policy: 'public',
  created_at: new Date().toISOString(),
});
createMessagingGroupAgent({
  id: 'mga-smoke',
  messaging_group_id: 'mg-smoke',
  agent_group_id: 'ag-smoke',
  engage_mode: 'pattern',
  engage_pattern: '.',
  sender_scope: 'all',
  ignored_message_policy: 'drop',
  session_mode: 'shared',
  priority: 0,
  created_at: new Date().toISOString(),
});

console.log('=== L4 smoke: routing a canned prompt (credential-free, stub provider) ===');
await routeInbound({
  channelType: 'test',
  platformId: 'smoke-channel',
  threadId: null,
  message: {
    id: 'smoke-in-1',
    kind: 'chat',
    content: JSON.stringify({ sender: 'SmokeBot', text: 'ping' }),
    timestamp: new Date().toISOString(),
  },
});

const session = findSession('mg-smoke', null);
if (!session) fail('no session created');
console.log(`✓ session ${session.id} · container_status=${session.container_status}`);

// Seed the destination the stub replies to. Wins the race against container
// boot (seconds); findByName resolves it on the container's first poll.
const inDbPath = inboundDbPath('ag-smoke', session.id);
const inDb = new Database(inDbPath);
replaceDestinations(inDb, [
  {
    name: DEST,
    display_name: 'Smoke Dest',
    type: 'channel',
    channel_type: 'test',
    platform_id: 'smoke-channel',
    agent_group_id: null,
  },
]);
inDb.close();
console.log(`✓ seeded destination "${DEST}"`);

const outDbPath = outboundDbPath('ag-smoke', session.id);
const TIMEOUT_MS = 120_000;
const start = Date.now();

function readOut(): Array<Record<string, unknown>> {
  try {
    const db = new Database(outDbPath, { readonly: true });
    const rows = db.prepare('SELECT * FROM messages_out').all() as Array<Record<string, unknown>>;
    db.close();
    return rows;
  } catch {
    return [];
  }
}

console.log('=== waiting for the container round-trip (no model, no creds) ===');
let out: Array<Record<string, unknown>> = [];
while (out.length === 0) {
  out = readOut();
  if (out.length > 0) break;
  if (Date.now() - start > TIMEOUT_MS) {
    await killContainer(session.id).catch(() => {});
    fail(`timed out after ${TIMEOUT_MS / 1000}s with no messages_out`);
  }
  const s = Math.floor((Date.now() - start) / 1000);
  if (s > 0 && s % 10 === 0) process.stdout.write(`  ${s}s...`);
  await new Promise((r) => setTimeout(r, 1000));
}

await killContainer(session.id).catch(() => {});

// Golden assert — not just "nonempty" (the weakness the testing-strategy flagged).
if (out.length !== 1) fail(`expected exactly 1 messages_out row, got ${out.length}`);
const text = (JSON.parse(out[0].content as string) as { text?: string }).text;
if (text !== EXPECTED) fail(`golden mismatch: expected "${EXPECTED}", got "${text}"`);

console.log(`\n✓ SMOKE PASS — credential-free container round-trip produced "${text}" deterministically`);
fs.rmSync(groupDir, { recursive: true, force: true });
process.exit(0);
