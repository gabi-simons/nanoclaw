import { MockProvider } from './mock.js';
import { registerProvider } from './provider-registry.js';

/**
 * Build a scripted prompt→response function from a NANOCLAW_STUB_SCRIPT value.
 *
 * - A JSON array of strings is consumed one entry per call (the last entry
 *   repeats), so a smoke scenario can script a multi-turn exchange.
 * - Any other (non-JSON-array) value is returned verbatim for every call.
 *
 * Each response is the agent's *final text*; to produce a `messages_out` row it
 * must contain a `<message to="...">...</message>` block (see poll-loop.ts
 * `dispatchResultText`). An empty/unset script yields no output.
 */
export function makeScriptedResponder(script: string | undefined): (prompt: string) => string {
  if (script === undefined || script === '') return () => '';
  let sequence: string[] | undefined;
  try {
    const parsed: unknown = JSON.parse(script);
    if (Array.isArray(parsed) && parsed.every((entry) => typeof entry === 'string')) {
      sequence = parsed as string[];
    }
  } catch {
    // Not JSON — treat the whole value as a single literal response.
  }
  if (!sequence) return () => script;
  const responses = sequence;
  let index = 0;
  return () => responses[Math.min(index++, responses.length - 1)] ?? '';
}

// Deterministic, credential-free provider for smoke tests. Reads its scripted
// responses from NANOCLAW_STUB_SCRIPT and replays them through MockProvider's
// query machinery — so createProvider('stub'), called exactly as the container
// boot path calls it (no constructor args), yields a scripted agent that drives
// the real poll-loop → messages_out path with no model and no credentials.
// Distinct from 'mock' (a fixed-echo unit-test tool) on purpose: 'stub' is the
// scriptable smoke engine the L4 floor and the agentops smoke contract consume.
registerProvider('stub', (opts) => new MockProvider(opts, makeScriptedResponder(process.env.NANOCLAW_STUB_SCRIPT)));
