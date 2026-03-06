import fs from 'fs';
import path from 'path';
import { writeJsonAtomic } from './fs-atomic.js';

export function normalizeRequestedPath(rawPath) {
    if (typeof rawPath !== 'string') return '';
    const trimmed = rawPath.trim().replace(/\\/g, '/');
    if (!trimmed) return '';

    const compact = trimmed.replace(/^\/+/, '');
    const segments = compact.split('/').filter(Boolean);
    if (segments.some(segment => segment === '..')) {
        throw new Error('invalid-path');
    }

    return segments.join('/');
}

export function toPosixRelative(baseDir, targetDir) {
    const relative = path.relative(baseDir, targetDir);
    if (!relative || relative === '.') return '';
    return relative.split(path.sep).join('/');
}

export function resolvePathWithinBase(baseDir, rawPath) {
    const normalizedPath = normalizeRequestedPath(rawPath);
    const resolved = normalizedPath
        ? path.resolve(baseDir, ...normalizedPath.split('/'))
        : baseDir;

    const relative = path.relative(baseDir, resolved);
    const escapesBase = relative.startsWith('..') || path.isAbsolute(relative);
    if (escapesBase) {
        throw new Error('path-outside-base');
    }

    if (!fs.existsSync(resolved)) {
        throw new Error('path-not-found');
    }

    if (!fs.statSync(resolved).isDirectory()) {
        throw new Error('not-a-directory');
    }

    return resolved;
}

export function resolveSystemPath(rawPath, homeDir) {
    const requested = typeof rawPath === 'string' ? rawPath.trim() : '';
    if (!requested) return homeDir;

    let expanded = requested;
    if (requested === '~') {
        expanded = homeDir;
    } else if (requested.startsWith('~/') || requested.startsWith('~\\')) {
        expanded = path.join(homeDir, requested.slice(2));
    } else if (!path.isAbsolute(requested)) {
        expanded = path.resolve(homeDir, requested);
    }

    const resolved = path.resolve(expanded);
    if (!fs.existsSync(resolved)) {
        throw new Error('path-not-found');
    }
    if (!fs.statSync(resolved).isDirectory()) {
        throw new Error('not-a-directory');
    }
    return resolved;
}

export function readRawConfigFile(configFilePath) {
    try {
        if (!fs.existsSync(configFilePath)) return {};
        const raw = fs.readFileSync(configFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

export function writeRawConfigFile(configFilePath, config) {
    fs.mkdirSync(path.dirname(configFilePath), { recursive: true });
    writeJsonAtomic(configFilePath, config);
}

export function sanitizeConfigValue(value, { allowEmpty = false } = {}) {
    if (typeof value !== 'string') return '';
    const normalized = value.trim();
    if (!allowEmpty && !normalized) return '';
    return normalized;
}
