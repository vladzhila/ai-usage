import { describe, expect, test } from 'bun:test';

// Test popup utility functions (duplicated from popup.js for testing)
const THRESHOLD_WARNING = 0.5;
const THRESHOLD_DANGER = 0.8;

function formatTimeRemaining(ms) {
  if (ms <= 0) {
    return 'now';
  }
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function formatUpdatedAt(timestamp) {
  if (!timestamp) {
    return 'never';
  }
  const diff = Date.now() - timestamp;
  const hours = Math.floor(diff / (60 * 60 * 1000));
  const minutes = Math.floor(diff / (60 * 1000));

  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }
  if (hours > 0) {
    return `${hours}h ago`;
  }
  if (minutes > 0) {
    return `${minutes}m ago`;
  }
  return 'just now';
}

function getStatus(percentage) {
  if (percentage >= THRESHOLD_DANGER) {
    return 'danger';
  }
  if (percentage >= THRESHOLD_WARNING) {
    return 'warning';
  }
  return 'ok';
}

function getUsagePercent(used, limit) {
  if (limit <= 0) {
    return 0;
  }
  const ratio = used / limit;
  const percent = Math.round(ratio * 100);
  return Math.min(100, percent);
}

describe('Popup - formatTimeRemaining', () => {
  test('formats hours and minutes', () => {
    expect(formatTimeRemaining(2 * 60 * 60 * 1000 + 30 * 60 * 1000)).toBe('2h 30m');
  });

  test('formats minutes only', () => {
    expect(formatTimeRemaining(45 * 60 * 1000)).toBe('45m');
  });

  test('returns "now" for zero', () => {
    expect(formatTimeRemaining(0)).toBe('now');
  });
});

describe('Popup - formatUpdatedAt', () => {
  test('returns "never" for null', () => {
    expect(formatUpdatedAt(null)).toBe('never');
  });

  test('returns "just now" for recent', () => {
    expect(formatUpdatedAt(Date.now())).toBe('just now');
  });

  test('formats hours ago', () => {
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    expect(formatUpdatedAt(twoHoursAgo)).toBe('2h ago');
  });
});

describe('Popup - getStatus', () => {
  test('returns "ok" for low usage', () => {
    expect(getStatus(0)).toBe('ok');
    expect(getStatus(0.25)).toBe('ok');
    expect(getStatus(0.49)).toBe('ok');
  });

  test('returns "warning" for medium usage', () => {
    expect(getStatus(0.5)).toBe('warning');
    expect(getStatus(0.65)).toBe('warning');
    expect(getStatus(0.79)).toBe('warning');
  });

  test('returns "danger" for high usage', () => {
    expect(getStatus(0.8)).toBe('danger');
    expect(getStatus(0.9)).toBe('danger');
    expect(getStatus(1.0)).toBe('danger');
  });

  test('returns "danger" for over 100%', () => {
    expect(getStatus(1.5)).toBe('danger');
  });
});

describe('Popup - getUsagePercent', () => {
  test('returns zero when limit is zero', () => {
    expect(getUsagePercent(10, 0)).toBe(0);
  });

  test('rounds to nearest whole percent', () => {
    expect(getUsagePercent(1, 3)).toBe(33);
    expect(getUsagePercent(2, 3)).toBe(67);
  });

  test('caps usage at 100%', () => {
    expect(getUsagePercent(200, 100)).toBe(100);
  });
});
