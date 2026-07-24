# CLAUDE.md
This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
Papyrus Desktop **v2.0.0-beta.12** — a minimalist, keyboard-driven, AI Agent-powered **spaced repetition (SRS) flashcard** desktop app. Built with an Electron shell wrapping a Fastify 5 backend and React 19 + Arco Design frontend.

## Commands

### Development
`.\start-dev.ps1`: Windows dev launcher with port/dep checks, Run backend (tsx watch :8000) + frontend (Vite :5173)

### Testing
| Command | Description |
|---------|-------------|
| `cd backend && npm test` | Run all Jest tests |
| `cd backend && npm run test:watch` | Watch mode |
| `cd backend && npx jest --testPathPattern=sm2` | Run a single test file |
| `npx playwright test` | E2E tests (from repo root) |

### Building
| Command | Description |
|---------|-------------|
| `npm run build:backend` | `cd backend && tsc` |
| `npm run build:frontend` | `cd frontend && vite build` |
| `npm run build:installer` | Full pipeline: sync-version + build:backend + build:frontend + electron-builder |
| `npm run electron:build:win` | Windows NSIS installer |
| `npm run electron:build:mac` | macOS DMG |
| `npm run bump:beta` | Bump version (also: patch, minor, major, release) |

### Type Checking
`cd backend && npm run typecheck`
`cd frontend && npm run typecheck`

## Architecture

### Monorepo Structure
```
backend/     — Fastify 5 Node.js server (ESM, TypeScript)
frontend/    — React 19 + Vite 8 + Tailwind 3.4 SPA
electron/    — Electron 41 main process + preload scripts
e2e/         — Playwright E2E tests
scripts/     — Build/release automation
```

### Backend (`backend/src/`)
- **`api/server.ts`** — Fastify entry point, registers all routes as plugins, CORS, rate limiting, auth
- **`api/routes/`** — Route modules as Fastify plugins. Key prefixes: `/api/cards`, `/api/notes`, `/api/review`, `/api/chat` (via `ai.ts` aggregate), `/api/progress`, `/api/search`, `/api/files`, `/api/extensions`, `/api/cli`, `/api/ui-settings`, plus `/api/backup` / `/api/export` / `/api/import` / `/api/data/reset` from `data.ts`
- **`core/`** — Pure business logic: `cards.ts`, `notes.ts`, `sm2.ts` (SM-2 algorithm), `versioning.ts`, `crypto.ts` (AES-GCM), `relations.ts`, `files.ts`
- **`ai/`** — AI agent system: `provider.ts` (multi-provider via OpenAI SDK), `tool-manager.ts`, `llm-cache.ts`, `tools/` (7 tool categories: cards, notes, relations, files, data, extensions, settings)
- **`db/database.ts`** — SQLite via `node:sqlite` (WAL mode). Tables: cards, notes, providers, provider_models, api_keys, note_versions, card_versions, files, relations, chat_sessions, chat_messages, extensions, daily_progress, ui_settings
- **`cli/`** — Desktop CLI manager helpers
- **`utils/`** — auth, logger, paths, proxy, client-id

### Frontend (`frontend/src/`)
- **`App.tsx`** — Root component, page routing + sidebar + chat panel
- **`api.ts`** — Unified REST client with auto auth token injection
- Pages: `StartPage/` (dashboard), `ScrollPage/` (flashcard review), `NotesPage/` (notes + relation graph), `ChartsPage/` (statistics), `FilesPage/` (file browser), `ExtensionsPage/`, `SettingsPage/`
- `ChatPanel/` — Collapsible AI chat with tool call UI
- `components/` — Shared: `MarkdownView`, `ToolCallCard`, `SmartTextArea`, `CardGroup`, `SceneryBackground`
- Locales in `locales/` (zh-CN, en-US, zh-TW, ja-JP), i18next
- Tailwind classes use `tw-` prefix

### AI Agent System
- **Chat mode**: pure conversation, no tool calls
- **Agent mode**: AI can call tools (cards/notes/files CRUD, data queries)
- Tool execution flow: user message → provider → tool_call → `tool-manager.ts` → execute → result back to AI
- Write operations require user approval (manual/auto mode)
- 30+ compatible providers (OpenAI, Anthropic, Ollama, DeepSeek, Gemini, etc.)

### Data Layer
- SQLite via `node:sqlite` (WAL mode). DB file: `$HOME/PapyrusData/papyrus.db` (override via `PAPYRUS_DATA_DIR`)
- On-demand backups via `POST /api/backup` → `backups/`
- API keys encrypted at rest with AES-256-GCM
- Content-addressed versioning for notes and cards
- Legacy `ai_config.json` is migrated into the DB on startup; cards/notes live in SQLite

## Key Conventions

- **ESM everywhere** — imports use `.js` extensions in backend (TypeScript ESM convention)
- **Strict TypeScript** — both packages have `strict: true`
- **No ESLint/Prettier** — only `.hintrc`
- **Import paths** in backend use `.js` suffix (e.g., `import { x } from './file.js'`)
- **Page components** named `*Page` (StartPage, ScrollPage, etc.)
- **Route modules** export Fastify plugins from `api/routes/`
- **Core logic** stays UI-independent in `core/`
- **AI tools** in `ai/tools/`, registered via registry pattern (read vs write classification)

## Environment Variables
| Variable | Default | Purpose |
|----------|---------|---------|
| `PAPYRUS_PORT` | 8000 | Backend listen port |
| `PAPYRUS_DATA_DIR` | `$HOME/PapyrusData` | User data directory |
| `PAPYRUS_AUTH_TOKEN` | — | API auth token (Electron mode) |
| `PAPYRUS_DEBUG` | — | Debug logging (set to "1") |
