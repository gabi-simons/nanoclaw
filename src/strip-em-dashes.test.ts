import { describe, expect, it } from 'vitest';

import { stripEmDashes } from './strip-em-dashes.js';

describe('stripEmDashes', () => {
  it('collapses a spaced em dash to a single space', () => {
    expect(stripEmDashes('be concise — every word counts')).toBe('be concise every word counts');
  });

  it('leaves nothing when the em dash is tight against text', () => {
    expect(stripEmDashes('low—level')).toBe('lowlevel');
  });

  it('handles a one-sided space', () => {
    expect(stripEmDashes('a —b')).toBe('a b');
    expect(stripEmDashes('a— b')).toBe('a b');
  });

  it('strips every occurrence in a string', () => {
    expect(stripEmDashes('one — two — three')).toBe('one two three');
  });

  it('also strips the horizontal bar (U+2015)', () => {
    expect(stripEmDashes('a ― b')).toBe('a b');
  });

  it('leaves en dashes (numeric ranges) untouched', () => {
    expect(stripEmDashes('pages 10–20')).toBe('pages 10–20');
  });

  it('leaves hyphens untouched', () => {
    expect(stripEmDashes('well-known co-op')).toBe('well-known co-op');
  });

  it('is a no-op for text with no em dashes', () => {
    expect(stripEmDashes('plain text, nothing special')).toBe('plain text, nothing special');
  });

  it('does not pull text across newlines', () => {
    expect(stripEmDashes('first line\nsecond line')).toBe('first line\nsecond line');
  });
});
