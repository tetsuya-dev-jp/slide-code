import { afterEach, describe, expect, test, vi } from 'vitest';
import { getStoredItem, setStoredItem } from './storage.js';

const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');

afterEach(() => {
  if (originalDescriptor) {
    Object.defineProperty(window, 'localStorage', originalDescriptor);
  }
});

describe('storage helpers', () => {
  test('return safe fallbacks when localStorage access throws', () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });

    expect(getStoredItem('x')).toBeNull();
    expect(setStoredItem('x', '1')).toBe(false);
  });

  test('read and write through browser storage when available', () => {
    const storage = {
      getItem: vi.fn(() => 'saved-value'),
      setItem: vi.fn(),
    };
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: storage,
    });

    expect(getStoredItem('theme')).toBe('saved-value');
    expect(setStoredItem('theme', 'dark')).toBe(true);
    expect(storage.getItem).toHaveBeenCalledWith('theme');
    expect(storage.setItem).toHaveBeenCalledWith('theme', 'dark');
  });
});
