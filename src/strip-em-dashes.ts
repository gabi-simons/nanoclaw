/**
 * Remove em dashes from user-facing agent text.
 *
 * The agent is also instructed not to use them (container/CLAUDE.md), but that
 * is best-effort — the model still emits them. This is the deterministic
 * guarantee applied on the outbound path, so no em dash ever reaches a user
 * regardless of provider or channel.
 *
 * The em dash (U+2014) and the visually identical horizontal bar (U+2015) are
 * deleted with nothing substituted: when the dash sat between spaces the spaces
 * collapse to one ("a — b" → "a b"); when it was tight against text nothing is
 * left ("a—b" → "ab"). En dashes (U+2013) are intentionally left alone — they
 * carry meaning in numeric ranges (e.g. "10–20").
 */
export function stripEmDashes(text: string): string {
  return text.replace(/[ \t]*[—―][ \t]*/g, (match) => (/[ \t]/.test(match) ? ' ' : ''));
}
