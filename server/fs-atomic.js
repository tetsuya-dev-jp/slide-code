import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

function randomSuffix() {
    if (typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return crypto.randomBytes(8).toString('hex');
}

function uniqueSiblingPath(targetPath, suffix) {
    const dir = path.dirname(targetPath);
    const base = path.basename(targetPath);
    return path.join(dir, `.${base}.${process.pid}.${Date.now()}.${randomSuffix()}.${suffix}`);
}

export function writeFileAtomic(filePath, data, encoding) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tempPath = uniqueSiblingPath(filePath, 'tmp');

    try {
        if (typeof encoding === 'string') {
            const writeEncoding = /** @type {BufferEncoding} */ (encoding);
            fs.writeFileSync(tempPath, data, { encoding: writeEncoding });
        } else {
            fs.writeFileSync(tempPath, data);
        }
        fs.renameSync(tempPath, filePath);
    } catch (err) {
        fs.rmSync(tempPath, { force: true });
        throw err;
    }
}

export function writeJsonAtomic(filePath, value) {
    writeFileAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

export function replaceDirectoryAtomic(targetDir, buildTempDir) {
    const parentDir = path.dirname(targetDir);
    fs.mkdirSync(parentDir, { recursive: true });

    const tempDir = uniqueSiblingPath(targetDir, 'tmp-dir');
    const backupDir = uniqueSiblingPath(targetDir, 'bak-dir');

    let backupCreated = false;
    let promoted = false;

    try {
        buildTempDir(tempDir);

        if (fs.existsSync(targetDir)) {
            fs.renameSync(targetDir, backupDir);
            backupCreated = true;
        }

        fs.renameSync(tempDir, targetDir);
        promoted = true;

        if (backupCreated) {
            fs.rmSync(backupDir, { recursive: true, force: true });
        }
    } catch (err) {
        if (promoted && fs.existsSync(targetDir)) {
            fs.rmSync(targetDir, { recursive: true, force: true });
        }

        if (backupCreated && fs.existsSync(backupDir) && !fs.existsSync(targetDir)) {
            fs.renameSync(backupDir, targetDir);
        }

        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }

        throw err;
    }
}
