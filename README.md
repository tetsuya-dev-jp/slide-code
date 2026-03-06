# SlideCode (`codestage`)

SlideCode is a local app for creating, editing, and presenting code-based slide decks.
It combines a Vite frontend with an Express-based local API so you can work with code, terminal output, and speaker notes in a single interface.

## Features

- Create, duplicate, import, and export decks
- Edit files and slides with a Monaco-based editor
- Switch code / shell / markdown panes in presentation mode
- Export as HTML, print preview, or ZIP
- Save and reuse local or shared templates
- Manage image assets with `asset://` references
- Quarantine broken decks and surface them in the dashboard

## Setup

Requirements:

- Node.js 18+
- `pnpm`

If `pnpm` is not installed yet, run `corepack enable` first.

```bash
corepack enable
pnpm install
pnpm dev
```

Then open `http://127.0.0.1:5173`.

`pnpm dev` starts both services:

- Vite frontend: `5173`
- Local API / terminal server: `3000` / `3001`

## Common Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start frontend and backend together |
| `pnpm dev:vite` | Start the frontend only |
| `pnpm dev:terminal` | Start the local API / terminal server only |
| `pnpm lint` | Run ESLint |
| `pnpm typecheck` | Run the TypeScript-based static checks |
| `pnpm test` | Run Vitest |
| `pnpm test:e2e` | Run Playwright E2E tests |
| `pnpm build` | Create a production build |
| `pnpm check` | Run lint, typecheck, unit tests, E2E, and build |
| `pnpm preview` | Serve `dist/` for bundle verification |

## Development Workflow

1. Create a deck from the dashboard
2. Edit files, slides, markdown, and assets in the editor
3. Open presentation mode to verify the result
4. Run `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm build`

On startup, the app automatically creates a sample deck named `sample-python-loop`.

## Config File And Storage Paths

The app generates its config file automatically on first launch.

- Config file: `$XDG_CONFIG_HOME/slidecode/config.json`
- Default config path: `~/.config/slidecode/config.json`
- Deck storage: `$XDG_DATA_HOME/slidecode/decks`
- Template storage: `$XDG_DATA_HOME/slidecode/templates`
- Quarantine storage: `$XDG_DATA_HOME/slidecode/quarantine`

You can also change these paths from the in-app App Settings dialog.

## Key Environment Variables

| Variable | Purpose |
| --- | --- |
| `DECKS_DIR` | Override the deck storage directory |
| `TEMPLATES_DIR` | Override the local template directory |
| `SHARED_TEMPLATES_DIR` | Set a shared template directory |
| `QUARANTINE_DIR` | Override the quarantine directory |
| `API_HOST` / `API_PORT` | Configure the local API bind address |
| `TERMINAL_ENABLED` | Enable the terminal WebSocket server |
| `TERMINAL_CWD` | Set the terminal base directory |
| `TERMINAL_SHELL` | Override the shell used for terminal sessions |
| `TERMINAL_WS_HOST` / `TERMINAL_WS_PORT` | Configure the terminal WebSocket bind address |
| `TERMINAL_WS_ALLOWED_ORIGINS` | Comma-separated allowlist for terminal WebSocket origins |
| `API_ALLOWED_ORIGINS` | Comma-separated allowlist for REST API origins |

## Testing And CI

The standard local verification flow is:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

GitHub Actions runs the same categories of checks:

- `lint`
- `typecheck`
- `vitest`
- `playwright`
- `vite build`

For E2E tests, Playwright automatically starts the local API and Vite dev server.

## About `pnpm preview`

`pnpm preview` serves `dist/` so you can verify the production bundle.
Because the app calls `/api` on the same origin, `pnpm preview` by itself is not a full runtime check for deck CRUD or terminal features.

For a complete manual check, use `pnpm dev`.

## Project Structure

- `src/`: Vite frontend
- `server/`: Express API, deck storage, and terminal WebSocket server
- `tests/e2e/`: Playwright scenarios
- `public/`: Static assets

Main routes:

- `/#/` dashboard
- `/#/deck/:id` presentation view
- `/#/deck/:id/edit` editor view

## Local-Only Notes

- The API and terminal server are intended to bind to localhost
- The terminal server is disabled by default; enable it only when needed with `TERMINAL_ENABLED=true`
- Unreadable decks are moved to quarantine and reported in the dashboard
- The project standardizes on `pnpm` as its package manager
