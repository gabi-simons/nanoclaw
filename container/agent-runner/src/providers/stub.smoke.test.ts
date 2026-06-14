import { describe, it, expect, beforeEach, afterEach } from 'bun:test';

import { initTestSessionDb, closeSessionDb, getInboundDb } from '../db/connection.js';
import { getUndeliveredMessages } from '../db/messages-out.js';
import { runPollLoop } from '../poll-loop.js';
import type { AgentProvider } from './types.js';
import { createProvider } from './factory.js';
import { makeScriptedResponder } from './stub.js'; // also registers the 'stub' provider

const STUB_ENV = 'NANOCLAW_STUB_SCRIPT';

beforeEach(() => {
  initTestSessionDb();
  // A destination the scripted <message to="..."> can resolve to.
  getInboundDb()
    .prepare(
      `INSERT INTO destinations (name, display_name, type, channel_type, platform_id, agent_group_id)
       VALUES ('smoke-dest', 'Smoke Dest', 'channel', 'discord', 'chan-smoke', NULL)`,
    )
    .run();
});

afterEach(() => {
  closeSessionDb();
  delete process.env[STUB_ENV];
});

function insertMessage(id: string, text: string): void {
  getInboundDb()
    .prepare(
      `INSERT INTO messages_in (id, kind, timestamp, status, platform_id, channel_type, thread_id, content)
       VALUES (?, 'chat', datetime('now'), 'pending', 'chan-smoke', 'discord', 'thread-smoke', ?)`,
    )
    .run(id, JSON.stringify({ sender: 'SmokeBot', text }));
}

function runLoopWithTimeout(provider: AgentProvider, signal: AbortSignal, timeoutMs: number): Promise<void> {
  return Promise.race([
    runPollLoop({ provider, providerName: 'stub', cwd: '/tmp', signal }),
    new Promise<void>((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))),
    new Promise<void>((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
  ]);
}

async function waitFor(condition: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timeout');
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  }
}

// The keystone the review flagged as impossible today: the container boot path
// calls createProvider(name) with NO responseFactory, so a scripted stub could
// not be driven through it. This proves a 'stub' provider closes that seam.
describe('StubProvider — scriptable through createProvider() [POC keystone]', () => {
  it('createProvider("stub") + NANOCLAW_STUB_SCRIPT drives a deterministic messages_out with no model/creds', async () => {
    process.env[STUB_ENV] = '<message to="smoke-dest">PONG 42</message>';
    insertMessage('in-1', 'ping');

    // The exact call the container boot path makes — no constructor args.
    const provider = createProvider('stub');

    const controller = new AbortController();
    const loop = runLoopWithTimeout(provider, controller.signal, 3000);

    await waitFor(() => getUndeliveredMessages().length > 0, 3000);
    controller.abort();

    const out = getUndeliveredMessages();
    expect(out).toHaveLength(1);
    expect(JSON.parse(out[0].content).text).toBe('PONG 42');
    expect(out[0].in_reply_to).toBe('in-1');
    expect(out[0].platform_id).toBe('chan-smoke');
    expect(out[0].channel_type).toBe('discord');

    await loop.catch(() => {});
  });
});

describe('makeScriptedResponder — script parsing [POC]', () => {
  it('returns a literal non-JSON script verbatim for every call', () => {
    const respond = makeScriptedResponder('<message to="d">hi</message>');
    expect(respond('first')).toBe('<message to="d">hi</message>');
    expect(respond('second')).toBe('<message to="d">hi</message>');
  });

  it('replays a JSON array one entry per call, last entry repeating', () => {
    const respond = makeScriptedResponder('["a","b"]');
    expect(respond('1')).toBe('a');
    expect(respond('2')).toBe('b');
    expect(respond('3')).toBe('b');
  });

  it('yields empty (→ no messages_out) when unset or empty', () => {
    expect(makeScriptedResponder(undefined)('x')).toBe('');
    expect(makeScriptedResponder('')('x')).toBe('');
  });
});
