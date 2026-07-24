---
name: papyrus-cli-manager
description: Use when an AI agent, Skill, or plugin needs to operate Papyrus Desktop data or capabilities through the official Desktop CLI Manager, MCP tools, or managed CLI. Prefer this over direct PapyrusData reads/writes or manual global CLI installation.
---

# Papyrus CLI Manager

## Workflow

1. Check CLI availability through Desktop first:
   - Desktop API: `GET /api/cli/status`
   - MCP tool: `cli_status`
2. If the CLI is missing and the task requires CLI execution, ask Desktop to install it:
   - Desktop API: `POST /api/cli/install`
   - MCP tool: `cli_install`
3. Run commands through Desktop, not by modifying user data files:
   - Desktop API: `POST /api/cli/run` with `{ "args": ["..."] }`
   - MCP tool: `cli_run` with `{ "args": ["..."] }`
4. Use `--json` for every AI-facing CLI command.

## Safety rules

- Do not directly read or write `PapyrusData` for cards, notes, files, review state, settings, or extensions.
- Do not ask the user to install `@papyrus/cli` globally.
- Treat write operations as Desktop-controlled actions; use Desktop API / MCP / CLI official entries so existing auth and approval checks apply.
- If a command is unavailable, report the missing command and use the closest Desktop API or MCP tool only when it preserves the same safety model.

## Useful commands

- `papyrus status --json`
- `papyrus cards list --json`
- `papyrus cards add --q "..." --a "..." --json`
- `papyrus review next --json`
- `papyrus review rate <card-id> --grade 3 --json`
- `papyrus review stats --json`
- `papyrus files list --json`
- `papyrus ext list --json`
- `papyrus ext install ./plugin.zip --json`
- `papyrus mcp tools --json`
- `papyrus mcp call get_review_stats --json`

For API details, read `references/cli-manager-api.md` only when implementing or debugging integration code.
