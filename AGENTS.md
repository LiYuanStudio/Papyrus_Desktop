# AGENTS.md

## Cursor Cloud specific instructions

### What this repo currently is

The code on `main` is the **legacy Python desktop build** of Papyrus, a
keyboard-driven spaced-repetition (SRS) flashcard study app built with
**tkinter**. Data is stored in local JSON files under `data/` (git-ignored).

> Note: `README.md` documents an *unreleased* v2.0.0 rewrite
> (TypeScript / Fastify / React / Electron). That code does **not** exist on
> `main` yet — ignore its Node/npm/Vite instructions when working on the
> current codebase.

### Runtime / dependencies

- Python 3 (CI pins 3.10; the cloud VM runs 3.12 and works fine — code is
  stdlib + `requests` only).
- The only pip dependency is `requests` (see `requirements.txt`); the update
  script installs it.
- `tkinter` is a **system** dependency (`python3-tk`, already installed in the
  VM snapshot). It is not a pip package, so it is intentionally **not** in the
  update script. If a future VM lacks it, install with
  `sudo apt-get install -y python3-tk`.

### Running the app (GUI)

- The GUI needs an X display. The cloud VM already provides one at `DISPLAY=:1`,
  so run: `DISPLAY=:1 python3 run.pyw` (launcher) — do not rely on `$DISPLAY`
  being pre-exported in every shell.
- `run.pyw` chdir's to the repo root, adds `src/` to `sys.path`, and executes
  `src/Papyrus.py`. The app auto-starts an in-process **MCP HTTP server** on
  `127.0.0.1:9100` (daemon thread; health check: `curl 127.0.0.1:9100/health`).

### Testing

- Run the suite with `python3 -m unittest discover -s tests` (uses stdlib
  `unittest`; `pytest` is not required/installed). Tests mock tkinter, so they
  run headless without a display.

### Gotchas

- On startup the app opens modal dialogs (AI Assistant / Settings) over the main
  window. When driving the UI, dismiss/handle those first, or interact via the
  top menu bar (`操作` = Operations → create card). The UI is mostly in Chinese.
- Card state persists in `data/Papyrusdata.json`. A reviewed card is scheduled
  ~1 day out, so it won't be "due" again the same day (main screen shows
  "今日任务已完成！"). For a fresh demo, delete `data/Papyrusdata.json` before
  launching (the `data/` dir is git-ignored and recreated automatically).
