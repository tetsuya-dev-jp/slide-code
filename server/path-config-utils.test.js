import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  normalizeRequestedPath,
  resolvePathWithinBase,
  resolveSystemPath,
  sanitizeConfigValue,
  toPosixRelative,
} from './path-config-utils.js';

const tempDirs = [];

afterEach(() => {
  while (tempDirs.length) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

function createTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codestage-test-'));
  tempDirs.push(dir);
  return dir;
}

describe('path-config-utils', () => {
  test('normalizeRequestedPath rejects traversal', () => {
    expect(normalizeRequestedPath('foo/bar')).toBe('foo/bar');
    expect(() => normalizeRequestedPath('../secret')).toThrow('invalid-path');
  });

  test('resolvePathWithinBase keeps paths inside the base directory', () => {
    const baseDir = createTempDir();
    const childDir = path.join(baseDir, 'slides');
    fs.mkdirSync(childDir);

    expect(resolvePathWithinBase(baseDir, 'slides')).toBe(childDir);
    expect(() => resolvePathWithinBase(baseDir, 'missing')).toThrow('path-not-found');
  });

  test('resolveSystemPath expands home-relative paths', () => {
    const homeDir = createTempDir();
    const nestedDir = path.join(homeDir, 'workspace');
    fs.mkdirSync(nestedDir);

    expect(resolveSystemPath('~/workspace', homeDir)).toBe(nestedDir);
    expect(toPosixRelative(homeDir, nestedDir)).toBe('workspace');
  });

  test('sanitizeConfigValue trims strings and supports empty values when allowed', () => {
    expect(sanitizeConfigValue('  /tmp/demo  ')).toBe('/tmp/demo');
    expect(sanitizeConfigValue('  ', { allowEmpty: true })).toBe('');
  });
});
