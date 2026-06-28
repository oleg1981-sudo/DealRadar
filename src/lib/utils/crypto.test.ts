import { describe, it, expect } from 'vitest';
import { generateUnsubscribeToken, verifyUnsubscribeToken, timingSafeEqualStr } from './crypto';

describe('unsubscribe tokens', () => {
  it('verifies a freshly generated token', () => {
    const tok = generateUnsubscribeToken('User@Example.com', 'kelkoo:123');
    expect(verifyUnsubscribeToken('User@Example.com', 'kelkoo:123', tok)).toBe(true);
  });

  it('is email-case-insensitive (signup lowercases)', () => {
    const tok = generateUnsubscribeToken('user@example.com', 'kelkoo:123');
    expect(verifyUnsubscribeToken('USER@EXAMPLE.COM', 'kelkoo:123', tok)).toBe(true);
  });

  it('rejects a tampered productId', () => {
    const tok = generateUnsubscribeToken('user@example.com', 'kelkoo:123');
    expect(verifyUnsubscribeToken('user@example.com', 'kelkoo:999', tok)).toBe(false);
  });

  it('rejects an empty or malformed token (fails closed)', () => {
    expect(verifyUnsubscribeToken('user@example.com', 'kelkoo:123', '')).toBe(false);
    expect(verifyUnsubscribeToken('user@example.com', 'kelkoo:123', 'not-hex')).toBe(false);
  });
});

describe('timingSafeEqualStr', () => {
  it('returns true for identical strings', () => {
    expect(timingSafeEqualStr('Bearer secret', 'Bearer secret')).toBe(true);
  });

  it('returns false for different strings of equal length', () => {
    expect(timingSafeEqualStr('Bearer secre1', 'Bearer secre2')).toBe(false);
  });

  it('returns false for different lengths', () => {
    expect(timingSafeEqualStr('short', 'longer-string')).toBe(false);
  });

  it('returns false for non-string inputs', () => {
    // @ts-expect-error intentionally passing wrong types
    expect(timingSafeEqualStr(undefined, 'x')).toBe(false);
  });
});
