import fs from 'fs';
import os from 'os';
import path from 'path';

const APP_NAME = /** @type {string} */ ('slidecode');
const LEGACY_APP_NAME = /** @type {string} */ ('codestage');
const DEFAULT_BIND_HOST = '127.0.0.1';

const DEFAULT_LOCAL_ALLOWED_ORIGINS = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
];

function resolveHomeDir() {
    return process.env.HOME || os.homedir() || process.cwd();
}

function resolveXdgBaseDir(rawValue, fallbackPath, homeDir) {
    const value = typeof rawValue === 'string' ? rawValue.trim() : '';
    if (!value) return fallbackPath;
    if (path.isAbsolute(value)) return value;
    return path.resolve(homeDir, value);
}

function expandHomePrefix(rawPath, homeDir) {
    if (typeof rawPath !== 'string') return '';
    const value = rawPath.trim();
    if (!value) return '';
    if (value === '~') return homeDir;
    if (value.startsWith('~/') || value.startsWith('~\\')) {
        return path.join(homeDir, value.slice(2));
    }
    return value;
}

function resolvePathSetting(rawPath, fallbackPath, homeDir) {
    const expanded = expandHomePrefix(rawPath, homeDir);
    if (!expanded) return fallbackPath;
    if (path.isAbsolute(expanded)) return expanded;
    return path.resolve(homeDir, expanded);
}

function resolveOptionalPathSetting(rawPath, homeDir) {
    const expanded = expandHomePrefix(rawPath, homeDir);
    if (!expanded) return '';
    if (path.isAbsolute(expanded)) return expanded;
    return path.resolve(homeDir, expanded);
}

function resolveShellSetting(rawShell, fallbackShell, homeDir) {
    const expanded = expandHomePrefix(rawShell, homeDir);
    if (!expanded) return fallbackShell;
    return expanded;
}

function parsePort(rawPort, fallbackPort) {
    const parsed = Number.parseInt(rawPort, 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
        return fallbackPort;
    }
    return parsed;
}

function parsePositiveInteger(rawValue, fallbackValue) {
    const parsed = Number.parseInt(rawValue, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
        return fallbackValue;
    }
    return parsed;
}

function parseBoolean(rawValue, fallbackValue) {
    if (typeof rawValue === 'boolean') return rawValue;
    if (typeof rawValue !== 'string') return fallbackValue;

    const value = rawValue.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(value)) return true;
    if (['0', 'false', 'no', 'off'].includes(value)) return false;
    return fallbackValue;
}

function normalizeStringArray(values) {
    if (!Array.isArray(values)) return [];
    return values
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean);
}

function normalizeHost(rawValue, fallbackHost) {
    if (typeof rawValue !== 'string') return fallbackHost;
    const value = rawValue.trim();
    return value || fallbackHost;
}

function readJsonFile(filePath, fallbackValue) {
    try {
        if (!fs.existsSync(filePath)) return fallbackValue;
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw);
    } catch (err) {
        console.error(`Failed to parse config file: ${filePath}`);
        console.error(err);
        return fallbackValue;
    }
}

function migrateLegacyDirectory(fromDir, toDir) {
    if (APP_NAME === LEGACY_APP_NAME) return;
    if (fs.existsSync(toDir)) return;
    if (!fs.existsSync(fromDir)) return;

    try {
        fs.renameSync(fromDir, toDir);
    } catch (err) {
        console.error(`Failed to migrate directory from ${fromDir} to ${toDir}`);
        console.error(err);
    }
}

function migrateLegacyAppPaths(xdgConfigHome, xdgDataHome) {
    migrateLegacyDirectory(
        path.join(xdgConfigHome, LEGACY_APP_NAME),
        path.join(xdgConfigHome, APP_NAME),
    );
    migrateLegacyDirectory(
        path.join(xdgDataHome, LEGACY_APP_NAME),
        path.join(xdgDataHome, APP_NAME),
    );
}

function createDefaultConfigTemplate(defaultDecksDir, defaultTemplatesDir, defaultQuarantineDir) {
    return {
        decksDir: defaultDecksDir,
        templatesDir: defaultTemplatesDir,
        sharedTemplatesDir: '',
        quarantineDir: defaultQuarantineDir,
        terminal: {
            baseCwd: '~',
            shell: '',
            enabled: false,
            wsHost: DEFAULT_BIND_HOST,
            wsPort: 3001,
            allowedOrigins: [],
            maxConnections: 4,
            maxPayloadBytes: 65536,
            idleTimeoutMs: 900000,
        },
        api: {
            host: DEFAULT_BIND_HOST,
            port: 3000,
            allowedOrigins: [],
        },
    };
}

function ensureConfigFile(configFilePath, defaultDecksDir, defaultTemplatesDir, defaultQuarantineDir) {
    if (fs.existsSync(configFilePath)) return;
    fs.mkdirSync(path.dirname(configFilePath), { recursive: true });
    const template = createDefaultConfigTemplate(defaultDecksDir, defaultTemplatesDir, defaultQuarantineDir);
    fs.writeFileSync(configFilePath, `${JSON.stringify(template, null, 2)}\n`, 'utf-8');
}

function defaultShellForPlatform() {
    if (process.platform === 'win32') {
        return process.env.ComSpec || 'powershell.exe';
    }
    return process.env.SHELL || '/bin/bash';
}

function deriveAllowedOrigins(envValue, configValue) {
    const envOrigins = typeof envValue === 'string'
        ? envValue.split(',').map(origin => origin.trim()).filter(Boolean)
        : [];

    const configOrigins = normalizeStringArray(configValue);
    const hasExplicit = envOrigins.length > 0 || configOrigins.length > 0;
    return {
        values: envOrigins.length > 0
            ? envOrigins
            : (configOrigins.length > 0 ? configOrigins : DEFAULT_LOCAL_ALLOWED_ORIGINS),
        hasExplicit,
    };
}

export function loadRuntimeConfig() {
    const homeDir = resolveHomeDir();
    const xdgConfigHome = resolveXdgBaseDir(process.env.XDG_CONFIG_HOME, path.join(homeDir, '.config'), homeDir);
    const xdgDataHome = resolveXdgBaseDir(process.env.XDG_DATA_HOME, path.join(homeDir, '.local', 'share'), homeDir);

    migrateLegacyAppPaths(xdgConfigHome, xdgDataHome);

    const configDir = path.join(xdgConfigHome, APP_NAME);
    const configFilePath = path.join(configDir, 'config.json');
    const defaultDecksDir = path.join(xdgDataHome, APP_NAME, 'decks');
    const defaultTemplatesDir = path.join(xdgDataHome, APP_NAME, 'templates');
    const defaultQuarantineDir = path.join(xdgDataHome, APP_NAME, 'quarantine');
    ensureConfigFile(configFilePath, defaultDecksDir, defaultTemplatesDir, defaultQuarantineDir);

    const rawConfig = readJsonFile(configFilePath, {});
    const config = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};
    const configTerminal = config.terminal && typeof config.terminal === 'object' ? config.terminal : {};
    const configApi = config.api && typeof config.api === 'object' ? config.api : {};

    const decksDir = resolvePathSetting(
        process.env.DECKS_DIR || config.decksDir,
        defaultDecksDir,
        homeDir,
    );

    const templatesDir = resolvePathSetting(
        process.env.TEMPLATES_DIR || config.templatesDir,
        defaultTemplatesDir,
        homeDir,
    );

    const sharedTemplatesDir = resolveOptionalPathSetting(
        process.env.SHARED_TEMPLATES_DIR || config.sharedTemplatesDir,
        homeDir,
    );

    const quarantineDir = resolvePathSetting(
        process.env.QUARANTINE_DIR || config.quarantineDir,
        defaultQuarantineDir,
        homeDir,
    );

    const baseCwd = resolvePathSetting(
        process.env.TERMINAL_CWD || configTerminal.baseCwd,
        homeDir,
        homeDir,
    );

    const shell = resolveShellSetting(
        process.env.TERMINAL_SHELL || configTerminal.shell,
        defaultShellForPlatform(),
        homeDir,
    );

    const terminalEnabledFallback = false;
    const terminalEnabled = parseBoolean(
        process.env.TERMINAL_ENABLED,
        parseBoolean(configTerminal.enabled, terminalEnabledFallback),
    );

    const apiHost = normalizeHost(
        process.env.API_HOST || configApi.host,
        DEFAULT_BIND_HOST,
    );

    const wsHost = normalizeHost(
        process.env.TERMINAL_WS_HOST || configTerminal.wsHost,
        DEFAULT_BIND_HOST,
    );

    const wsPort = parsePort(
        process.env.TERMINAL_WS_PORT || configTerminal.wsPort,
        3001,
    );

    const apiPort = parsePort(
        process.env.API_PORT || configApi.port,
        3000,
    );

    const origins = deriveAllowedOrigins(
        process.env.TERMINAL_WS_ALLOWED_ORIGINS,
        configTerminal.allowedOrigins,
    );

    const apiOrigins = deriveAllowedOrigins(
        process.env.API_ALLOWED_ORIGINS,
        configApi.allowedOrigins,
    );

    const maxConnections = parsePositiveInteger(
        process.env.TERMINAL_MAX_CONNECTIONS || configTerminal.maxConnections,
        4,
    );

    const maxPayloadBytes = parsePositiveInteger(
        process.env.TERMINAL_MAX_PAYLOAD_BYTES || configTerminal.maxPayloadBytes,
        65536,
    );

    const idleTimeoutMs = parsePositiveInteger(
        process.env.TERMINAL_IDLE_TIMEOUT_MS || configTerminal.idleTimeoutMs,
        900000,
    );

    return {
        homeDir,
        xdgConfigHome,
        xdgDataHome,
        configFilePath,
        decksDir,
        templatesDir,
        sharedTemplatesDir,
        quarantineDir,
        apiHost,
        apiPort,
        apiAllowedOrigins: apiOrigins.values,
        apiHasExplicitOriginConfig: apiOrigins.hasExplicit,
        terminal: {
            shell,
            baseCwd,
            enabled: terminalEnabled,
            wsHost,
            wsPort,
            allowedOrigins: origins.values,
            hasExplicitOriginConfig: origins.hasExplicit,
            maxConnections,
            maxPayloadBytes,
            idleTimeoutMs,
        },
    };
}
