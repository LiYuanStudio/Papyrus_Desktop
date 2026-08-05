<p align="center">
  <img src="assets/icon.png" alt="Papyrus Desktop" width="180" />
</p>

<h1 align="center">Papyrus Desktop</h1>

---

**English** · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

> Papyrus Desktop **v2.0.0-beta.16** — TypeScript / Fastify backend, React 19 frontend, Electron 41 desktop shell.

![Version](https://img.shields.io/badge/version-v2.0.0--beta.16-blue)
![Node.js](https://img.shields.io/badge/Node.js-24-339933)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6)
![Fastify](https://img.shields.io/badge/Fastify-5-000000)
![React](https://img.shields.io/badge/React-19-61DAFB)
![Electron](https://img.shields.io/badge/Electron-41-47848F)
![License](https://img.shields.io/badge/License-MIT-yellow)
![AI-Assisted](https://img.shields.io/badge/Dev-AI--Assisted-blueviolet)
![Accessibility](https://img.shields.io/badge/a11y-WCAG%202.1%20AA%2FAAA-green)

**Papyrus** is a minimalist, keyboard-driven, AI-agent-powered spaced-repetition (SRS) review engine, designed for high-intensity memory drilling.

> *"Simplicity is the ultimate sophistication."*

---

## ✨ Highlights

- 🚀 **Flow-state interaction** — fully keyboard-driven; never touch the mouse during a review session.
- 🧠 **Proven scheduling** — built-in SM-2 spaced-repetition algorithm tunes the next review interval per card.
- 🤖 **AI agent** — OpenAI / Anthropic / Ollama, with tool-call approval flow (manual or auto-approve) and call history.
- 📝 **Notes + Obsidian import** — bring your existing vault, navigate via folder tree, tags, and a relation graph.
- 🕘 **Version history & rollback** — every note/card edit auto-saves a content-hashed version; rollback creates a forward version (no destructive history).
- 🔐 **Encrypted API keys at rest** — AES-GCM with a per-install master key, salt, and auth tag.
- 🛡️ **Hardened defaults** — auth token required for write APIs, SSRF guard for AI base URLs, rate limiting on the public surface, path-traversal protection (`dev`+`ino` containment).
- ♿ **Accessibility** — WCAG 2.1 AA across the app, with AAA-grade contrast options, screen-reader optimization, and reduced-motion modes.
- 🌐 **Modern stack** — Node.js + TypeScript (Fastify) backend, React 19 + Vite + Arco Design frontend, Electron 41 shell.
- 📦 **Local-first** — your data never leaves the machine unless you point an AI provider at the cloud.

---

## 📥 Download

Pre-built installers are published on the [Releases](https://github.com/PapyrusOR/Papyrus_Desktop/releases) page.

| Platform | Architecture | Formats |
| :--- | :--- | :--- |
| Windows | x64 | NSIS installer (`.exe`), Portable (`.exe`) |
| macOS | arm64 | DMG (`.dmg`), ZIP (`.zip`) |
| Linux | x64 | AppImage, DEB (`.deb`), TAR.GZ |

> ⚠️ `v2.0.0-beta.16` is a beta. The data schema is stable, but the UI and APIs may still evolve before `v2.0.0`.

---

## ⌨️ Keyboard Shortcuts (Flow Mode)

| Key | Action | Effect |
| :--- | :--- | :--- |
| **Space** | Reveal answer | Unrolls the scroll, showing the answer side |
| **1** | Forgot | Mark unfamiliar; the card returns soon |
| **2** | Hazy | Mark uncertain; the card returns later today |
| **3** | Aced | Memory rock-solid; interval doubles linearly |
| **Tab** | Navigate | Move focus between interactive elements |
| **Ctrl + K** | Search | Open the global search palette |

---

## 🚀 Quick Start (from source)

### Prerequisites

- **Node.js** 24+
- **npm** 11+

### Install

```bash
# postinstall cascades into frontend/ and backend/
npm install
```

### Run in dev mode

```bash
# Concurrently runs backend (Fastify, tsx watch) + frontend (Vite)
npm run dev

# Or, with the Electron shell on top
npm run electron:dev
```

- Frontend: <http://localhost:5173>
- Backend API: <http://127.0.0.1:8000>
- Health check: <http://127.0.0.1:8000/api/health>

### Build installers

```bash
npm run electron:build          # current platform
npm run electron:build:win      # Windows only
npm run electron:build:mac      # macOS only
npm run electron:build:linux    # Linux only
```

Installers are emitted to `dist-electron/`.

---

## 📥 Bulk Card Import

Prepare a UTF-8 `.txt` file in this format:

```text
Question or scenario A === Trigger or answer A

Question or scenario B === Trigger or answer B
```

> Cards within a group are separated by `===`. Leave a blank line between groups for readability.

---

## 🤖 AI Configuration

### 1. Configure a provider

Open the in-app **⚙️ Settings** sidebar and add an API key:

- **OpenAI** — get a key at <https://platform.openai.com/api-keys>
- **Anthropic** — get a key at <https://console.anthropic.com/>
- **Ollama** — runs locally, no API key needed
  ```bash
  # Install: https://ollama.ai
  ollama pull llama2
  ```

API keys are persisted **encrypted at rest** (AES-GCM with a per-install master key).

### 2. Pick a mode

- **Agent mode** — the model can invoke tools (add / edit / delete cards, search notes, …) under a tool-call approval flow.
- **Chat mode** — pure conversation, no side effects.

### 3. Tune

- **Temperature** — 0 to 2, higher is more random.
- **Max tokens** — cap on response length.
- **Tool approval** — `manual` (queue and review) or `auto` (allow-list driven).

---

## ♿ Accessibility

Papyrus aims to be usable by everyone:

- **Keyboard navigation** — full Tab traversal across every page.
- **Screen readers** — semantic ARIA labels, live regions for state changes.
- **Contrast** — AAA-grade palettes available under **Settings → Accessibility**.
- **Motion** — reduced-motion mode honors OS preference.

---

## 🛠️ Architecture

```
Papyrus/
├── backend/                  # Node.js + TypeScript (Fastify)
│   └── src/
│       ├── api/              # Fastify routes & server entry (server.ts)
│       ├── core/             # Cards, notes, SM-2, versioning, crypto
│       ├── db/               # SQLite (node:sqlite, WAL) + schema init
│       ├── ai/               # Provider abstraction, tool manager, LLM cache
│       ├── cli/              # Desktop CLI manager helpers
│       ├── mcp/              # MCP REST endpoints (notes / vault CRUD)
│       ├── integrations/     # Obsidian import, file watcher (chokidar)
│       └── utils/            # Shared utilities
├── frontend/                 # React 19 + TypeScript (Vite)
│   └── src/
│       ├── StartPage/        # Home (recent notes, review queue, solar terms)
│       ├── ScrollPage/       # Flashcard study (the "scroll")
│       ├── NotesPage/        # Notes management & graph view
│       ├── FilesPage/        # File library
│       ├── ExtensionsPage/   # Extension management
│       ├── SettingsPage/     # Settings, AI config, accessibility
│       ├── ChartsPage/       # Stats & progress charts
│       └── ChatPanel/        # AI chat panel
├── electron/                 # Main process + preload (Electron 41)
├── scripts/                  # build-electron.js, extract-changelog.js
├── e2e/                      # Playwright E2E tests
└── docs/                     # Project documentation
```

### Stack

- **Backend** — Node.js 24, TypeScript 5, Fastify 5, Jest
- **Frontend** — React 19, TypeScript 5, Vite, Arco Design, Tailwind CSS
- **Desktop** — Electron 41 + electron-builder
- **Algorithm** — SM-2 spaced repetition
- **Storage** — SQLite via `node:sqlite` (WAL), content-hashed versions
- **CI/CD** — GitHub Actions matrix (Windows x64, macOS arm64 + x64, Linux x64)

---

## 🔧 Development

### Backend

```bash
cd backend
npm run dev         # tsx watch — hot-reload Fastify
npm run build       # compile TypeScript to dist/
npm run typecheck   # tsc --noEmit
npm test            # Jest unit + integration
npm start           # run compiled dist/api/server.js
```

The backend listens on `127.0.0.1:8000` by default; override with `PAPYRUS_PORT`.
The standalone MCP endpoint uses `127.0.0.1:9200`; override with `PAPYRUS_MCP_PORT`
when running isolated development or test instances.

### Frontend

```bash
cd frontend
npm run dev         # Vite dev server (http://localhost:5173)
npm run build       # production build to dist/
npm run typecheck   # TypeScript type-checking
```

### Release flow

```bash
# 1. Move [Unreleased] entries in CHANGELOG.md under the new version

# 2. (optional) preview the section that will land in the GitHub Release
node scripts/extract-changelog.js v2.0.0

# 3. Commit
git add CHANGELOG.md
git commit -m "chore: release v2.0.0"

# 4. Tag & push — GitHub Actions builds all three platforms,
#    extracts the matching CHANGELOG section, and uploads installers.
git tag v2.0.0
git push origin main --tags
```

---

## 📁 Data Files

By default, user data lives under `paths.dataDir` (defaults to `$HOME/PapyrusData`, override with `PAPYRUS_DATA_DIR`):

- `papyrus.db` — SQLite database (WAL mode): cards, notes, providers, chat, versions, files, relations, extensions, progress, UI settings
- `backups/` — on-demand DB backups from `POST /api/backup`
- `logs/` — application logs
- Legacy JSON files (`data.json`, `ai_config.json`) may still exist for compatibility; AI config is migrated into the DB on startup
- Auth token for write APIs (Electron mode) via `PAPYRUS_AUTH_TOKEN` / generated local token

---

## ⚠️ Notes

1. **API costs** — OpenAI and Anthropic bill per use; set provider-side budgets.
2. **Local models** — Ollama is free but needs decent hardware.
3. **Network** — cloud providers need a stable connection.
4. **Privacy** — local models stay local; cloud providers see the prompts you send.
5. **Concurrency** — prefer a single app instance per data directory; SQLite WAL allows readers, but concurrent writers from multiple processes are not supported.

---

## 📚 Documentation

### User guides
- [Quick Start](docs/guides/QUICKSTART.md) — 5-minute onboarding
- [Accessibility settings](docs/guides/A11Y_SETTINGS.md)
- [Version info](docs/guides/VERSION.md)
- [Changelog](CHANGELOG.md) — synced into GitHub Releases

### Developer guides
- [Project structure](docs/PROJECT_STRUCTURE.md)
- [Environment requirements](docs/guides/ENVIRONMENT_REQUIREMENTS.md)
- [Accessibility development](docs/guides/ACCESSIBILITY_GUIDE.md)
- [UI design tokens](docs/guides/UI_TOKENS.md)
- [REST API reference](docs/API.md)
- [Extension development](docs/EXTENSIONS.md) and [extension template](examples/extension-template/)
- [Electron packaging](ELECTRON.md)
- [Dev environment](README-DEV.md)

### AI features
- [AI overview](docs/AI_README.md)

---

## 💡 A Word from the Author

Honestly, the birth of this project wasn't all that grand or visionary.

Why did I make it? One day I was drilling some AI material and downloaded Anki to memorize the key points. Right after install, the thing wanted to check for updates, the updates wanted to talk to a server, and I just could not get a connection through.

Gemini was sitting right there. So I told it to write me one. We tinkered, I patched, and I started using it.

I never planned to publish it. So why did I?

Yesterday I logged into a long-dormant account to give my girlfriend a star, and GitHub flagged me as a bot and wiped my activity. I was furious. I'm using AI; I'm not AI. To prove I'm not a bot, I cleaned up what I had on hand and put it up here.

End of small story. It's already the sixth day of the lunar new year, and dawn is creeping up. A grumbling student, sighing at three in the morning. Such is life.

There's a phrase I love: **Veritas vos liberabit** — "the truth shall set you free." May we all share in it. This is my first open-source project; please be kind.

Consider this my belated lunar new-year greeting.
**May the new year find you wielding the blade of knowledge — slicing through the void of night, charging straight into the dawn.**

---

## 📄 License

[MIT](LICENSE)

---

**Papyrus** — make learning smarter, make memory scientific.
