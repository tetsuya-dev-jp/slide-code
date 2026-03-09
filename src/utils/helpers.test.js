import { describe, expect, test } from 'vitest';
import { formatCount, formatDate } from './helpers.js';

describe('helpers', () => {
  test('formatDate returns empty string for invalid values', () => {
    expect(formatDate('')).toBe('');
    expect(formatDate('not-a-date')).toBe('');
  });

  test('formatCount uses locale formatting and falls back for invalid values', () => {
    const locale = navigator.languages?.[0] || navigator.language || 'ja-JP';
    expect(formatCount(12345)).toBe(new Intl.NumberFormat(locale).format(12345));
    expect(formatCount('oops')).toBe('0');
  });
});
