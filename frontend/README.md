# Papyrus (TS + React + Arco)

## Stack

- TypeScript
- React 19.x
- Arco Design React (`@arco-design/web-react`)
- Vite

## React 19 adapter

This project uses React 19 and **must** include Arco's adapter before importing Arco components:

```ts
import '@arco-design/web-react/es/_util/react-19-adapter';
```

See: `frontend/src/main.tsx`.

## Local development

Install dependencies:

```bash
cd frontend
npm i
```

Start dev server:

```bash
npm run dev
```

Default URL: http://127.0.0.1:5173

## Backend API

The Fastify backend serves REST APIs under `/api/*` (default `http://127.0.0.1:8000`).

During development Vite proxies `/api` to the backend (see `frontend/vite.config.js`).
Data is stored in SQLite (`$HOME/PapyrusData/papyrus.db`).
