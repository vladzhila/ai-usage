import { describe, expect, test } from 'bun:test';
import {
  formatTimeRemaining,
  formatUpdatedAt,
  getTimeUntilReset,
} from '../src/lib/storage.js';
import { STORAGE_KEYS, CHATGPT_SESSION_WINDOW_MS, CLAUDE_SESSION_WINDOW_MS } from '../src/lib/constants.js';

describe('formatTimeRemaining', () => {
  test('formats hours and minutes correctly', () => {
    const twoHours = 2 * 60 * 60 * 1000;
    const fourteenMinutes = 14 * 60 * 1000;

    expect(formatTimeRemaining(twoHours + fourteenMinutes)).toBe('2h 14m');
  });

  test('formats hours only when no minutes', () => {
    const threeHours = 3 * 60 * 60 * 1000;
    expect(formatTimeRemaining(threeHours)).toBe('3h 0m');
  });

  test('formats minutes only when less than hour', () => {
    const fortyFiveMinutes = 45 * 60 * 1000;
    expect(formatTimeRemaining(fortyFiveMinutes)).toBe('45m');
  });

  test('returns "now" for zero or negative', () => {
    expect(formatTimeRemaining(0)).toBe('now');
    expect(formatTimeRemaining(-1000)).toBe('now');
  });

  test('handles edge case of 1 minute', () => {
    const oneMinute = 60 * 1000;
    expect(formatTimeRemaining(oneMinute)).toBe('1m');
  });

  test('handles edge case of 1 hour', () => {
    const oneHour = 60 * 60 * 1000;
    expect(formatTimeRemaining(oneHour)).toBe('1h 0m');
  });
});

describe('formatUpdatedAt', () => {
  test('returns "never" for null or undefined', () => {
    expect(formatUpdatedAt(null)).toBe('never');
    expect(formatUpdatedAt(undefined)).toBe('never');
  });

  test('returns "just now" for recent timestamps', () => {
    const now = Date.now();
    expect(formatUpdatedAt(now)).toBe('just now');
    expect(formatUpdatedAt(now - 30 * 1000)).toBe('just now'); // 30 seconds ago
  });

  test('formats minutes ago correctly', () => {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    expect(formatUpdatedAt(fiveMinutesAgo)).toBe('5m ago');
  });

  test('formats hours ago correctly', () => {
    const threeHoursAgo = Date.now() - 3 * 60 * 60 * 1000;
    expect(formatUpdatedAt(threeHoursAgo)).toBe('3h ago');
  });

  test('formats days ago correctly', () => {
    const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
    expect(formatUpdatedAt(twoDaysAgo)).toBe('2d ago');
  });

  test('handles edge case of exactly 24 hours', () => {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    expect(formatUpdatedAt(oneDayAgo)).toBe('1d ago');
  });
});

describe('getTimeUntilReset', () => {
  test('calculates remaining time for chatgpt', () => {
    const windowStart = Date.now() - (1 * 60 * 60 * 1000); // 1 hour ago
    const remaining = getTimeUntilReset(STORAGE_KEYS.CHATGPT, windowStart);

    // Should be ~2 hours remaining (3h window - 1h elapsed)
    const expectedRemaining = CHATGPT_SESSION_WINDOW_MS - (1 * 60 * 60 * 1000);
    expect(remaining).toBeCloseTo(expectedRemaining, -3); // Within 1 second
  });

  test('calculates remaining time for claude', () => {
    const windowStart = Date.now() - (2 * 60 * 60 * 1000); // 2 hours ago
    const remaining = getTimeUntilReset(STORAGE_KEYS.CLAUDE, windowStart);

    // Should be ~3 hours remaining (5h window - 2h elapsed)
    const expectedRemaining = CLAUDE_SESSION_WINDOW_MS - (2 * 60 * 60 * 1000);
    expect(remaining).toBeCloseTo(expectedRemaining, -3);
  });

  test('returns 0 when window expired', () => {
    const windowStart = Date.now() - (10 * 60 * 60 * 1000); // 10 hours ago
    const remaining = getTimeUntilReset(STORAGE_KEYS.CHATGPT, windowStart);

    expect(remaining).toBe(0);
  });

  test('returns full window time when just started', () => {
    const windowStart = Date.now();
    const remaining = getTimeUntilReset(STORAGE_KEYS.CHATGPT, windowStart);

    expect(remaining).toBeCloseTo(CHATGPT_SESSION_WINDOW_MS, -3);
  });
});
