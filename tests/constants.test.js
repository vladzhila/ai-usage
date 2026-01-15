import { describe, expect, test } from 'bun:test';
import {
  CHATGPT_SESSION_WINDOW_MS,
  CLAUDE_SESSION_WINDOW_MS,
  CHATGPT_SESSION_LIMIT,
  CLAUDE_SESSION_LIMIT,
  STORAGE_KEYS,
  THRESHOLD_WARNING,
  THRESHOLD_DANGER,
  createDefaultUsageData,
  getWeekStart,
} from '../src/lib/constants.js';

describe('Constants', () => {
  test('session windows are correct durations', () => {
    expect(CHATGPT_SESSION_WINDOW_MS).toBe(3 * 60 * 60 * 1000); // 3 hours
    expect(CLAUDE_SESSION_WINDOW_MS).toBe(5 * 60 * 60 * 1000); // 5 hours
  });

  test('session limits are reasonable values', () => {
    expect(CHATGPT_SESSION_LIMIT).toBe(150);
    expect(CLAUDE_SESSION_LIMIT).toBe(45);
  });

  test('storage keys are defined', () => {
    expect(STORAGE_KEYS.CHATGPT).toBe('chatgpt');
    expect(STORAGE_KEYS.CLAUDE).toBe('claude');
    expect(STORAGE_KEYS.OPENAI_API).toBe('openaiApi');
    expect(STORAGE_KEYS.ANTHROPIC_API).toBe('anthropicApi');
  });

  test('thresholds are correct percentages', () => {
    expect(THRESHOLD_WARNING).toBe(0.5);
    expect(THRESHOLD_DANGER).toBe(0.8);
  });
});

describe('getWeekStart', () => {
  test('returns a timestamp', () => {
    const weekStart = getWeekStart();
    expect(typeof weekStart).toBe('number');
    expect(weekStart).toBeGreaterThan(0);
  });

  test('returns start of week (Monday 00:00)', () => {
    const weekStart = getWeekStart();
    const date = new Date(weekStart);

    // Should be Monday (day 1) or Sunday adjusted to previous Monday
    const day = date.getDay();
    expect(day).toBe(1); // Monday

    // Should be midnight
    expect(date.getHours()).toBe(0);
    expect(date.getMinutes()).toBe(0);
    expect(date.getSeconds()).toBe(0);
  });

  test('returns same value when called multiple times in same week', () => {
    const weekStart1 = getWeekStart();
    const weekStart2 = getWeekStart();
    expect(weekStart1).toBe(weekStart2);
  });
});

describe('createDefaultUsageData', () => {
  test('returns object with all service keys', () => {
    const data = createDefaultUsageData();

    expect(data).toHaveProperty('chatgpt');
    expect(data).toHaveProperty('claude');
    expect(data).toHaveProperty('openaiApi');
    expect(data).toHaveProperty('anthropicApi');
  });

  test('chatgpt has correct structure', () => {
    const data = createDefaultUsageData();
    const chatgpt = data.chatgpt;

    expect(chatgpt.session).toHaveProperty('count', 0);
    expect(chatgpt.session).toHaveProperty('limit', CHATGPT_SESSION_LIMIT);
    expect(chatgpt.session).toHaveProperty('windowStart');
    expect(typeof chatgpt.session.windowStart).toBe('number');

    expect(chatgpt.weekly).toHaveProperty('count', 0);
    expect(chatgpt.weekly).toHaveProperty('weekStart');
  });

  test('claude has correct structure', () => {
    const data = createDefaultUsageData();
    const claude = data.claude;

    expect(claude.session).toHaveProperty('count', 0);
    expect(claude.session).toHaveProperty('limit', CLAUDE_SESSION_LIMIT);
    expect(claude.session).toHaveProperty('windowStart');

    expect(claude.weekly).toHaveProperty('count', 0);
    expect(claude.weekly).toHaveProperty('weekStart');
  });

  test('api services have correct structure', () => {
    const data = createDefaultUsageData();

    expect(data.openaiApi).toHaveProperty('spend', 0);
    expect(data.openaiApi).toHaveProperty('updatedAt', null);

    expect(data.anthropicApi).toHaveProperty('spend', 0);
    expect(data.anthropicApi).toHaveProperty('updatedAt', null);
  });

  test('returns fresh data each call', () => {
    const data1 = createDefaultUsageData();
    const data2 = createDefaultUsageData();

    // Should be different object references
    expect(data1).not.toBe(data2);
    expect(data1.chatgpt).not.toBe(data2.chatgpt);
  });
});
