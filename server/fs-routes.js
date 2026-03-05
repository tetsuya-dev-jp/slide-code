import fs from 'fs';
import path from 'path';
import { resolvePathWithinBase, resolveSystemPath, toPosixRelative } from './path-config-utils.js';

export function registerFsRoutes(app, getRuntimeConfig) {
    app.get('/api/fs/dirs', (req, res) => {
        const requestedPath = Array.isArray(req.query.path)
            ? req.query.path[0]
            : req.query.path;

        try {
            const runtimeConfig = getRuntimeConfig();
            const baseCwd = fs.existsSync(runtimeConfig.terminal.baseCwd)
                ? runtimeConfig.terminal.baseCwd
                : runtimeConfig.homeDir;
            const currentDir = resolvePathWithinBase(baseCwd, requestedPath || '');
            const parentDir = currentDir === baseCwd ? null : path.dirname(currentDir);

            const directories = fs.readdirSync(currentDir, { withFileTypes: true })
                .filter(entry => entry.isDirectory())
                .map(entry => ({
                    name: entry.name,
                    path: toPosixRelative(baseCwd, path.join(currentDir, entry.name)),
                }))
                .sort((left, right) => left.name.localeCompare(right.name));

            res.json({
                currentPath: toPosixRelative(baseCwd, currentDir),
                parentPath: parentDir ? toPosixRelative(baseCwd, parentDir) : null,
                directories,
            });
        } catch (err) {
            if (['invalid-path', 'path-outside-base', 'path-not-found', 'not-a-directory'].includes(err.message)) {
                return res.status(400).json({ error: 'Invalid directory path' });
            }
            return res.status(500).json({ error: err.message });
        }
    });

    app.get('/api/fs/system-dirs', (req, res) => {
        const requestedPath = Array.isArray(req.query.path)
            ? req.query.path[0]
            : req.query.path;

        try {
            const runtimeConfig = getRuntimeConfig();
            const homeDir = runtimeConfig.homeDir || process.cwd();
            const currentDir = resolveSystemPath(requestedPath, homeDir);
            const rootDir = path.parse(currentDir).root;
            const parentDir = currentDir === rootDir ? null : path.dirname(currentDir);

            const directories = fs.readdirSync(currentDir, { withFileTypes: true })
                .filter(entry => entry.isDirectory())
                .map(entry => ({
                    name: entry.name,
                    path: path.join(currentDir, entry.name),
                }))
                .sort((left, right) => left.name.localeCompare(right.name));

            res.json({
                currentPath: currentDir,
                parentPath: parentDir,
                homePath: homeDir,
                directories,
            });
        } catch (err) {
            if (['path-not-found', 'not-a-directory'].includes(err.message)) {
                return res.status(400).json({ error: 'Invalid directory path' });
            }
            return res.status(500).json({ error: err.message });
        }
    });
}
