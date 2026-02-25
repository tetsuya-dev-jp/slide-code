/**
 * Terminal WebSocket Server
 * Spawns a PTY process and bridges it to the browser via WebSocket
 */
import { WebSocketServer } from 'ws';
import pty from 'node-pty';
import os from 'os';

const PORT = 3001;
const shell = os.platform() === 'win32' ? 'powershell.exe' : (process.env.SHELL || '/bin/bash');

const wss = new WebSocketServer({ port: PORT });

console.log(`Terminal server listening on ws://localhost:${PORT}`);

wss.on('connection', (ws) => {
    console.log('Client connected — spawning PTY');

    const ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: process.env.HOME || process.cwd(),
        env: { ...process.env, TERM: 'xterm-256color' },
    });

    // PTY → Browser
    ptyProcess.onData((data) => {
        try {
            ws.send(JSON.stringify({ type: 'output', data }));
        } catch (_) { /* client disconnected */ }
    });

    // Browser → PTY
    ws.on('message', (raw) => {
        try {
            const msg = JSON.parse(raw.toString());
            switch (msg.type) {
                case 'input':
                    ptyProcess.write(msg.data);
                    break;
                case 'resize':
                    ptyProcess.resize(
                        Math.max(msg.cols, 1),
                        Math.max(msg.rows, 1),
                    );
                    break;
            }
        } catch (_) { /* ignore malformed messages */ }
    });

    // Cleanup
    ws.on('close', () => {
        console.log('Client disconnected — killing PTY');
        ptyProcess.kill();
    });

    ptyProcess.onExit(() => {
        ws.close();
    });
});
