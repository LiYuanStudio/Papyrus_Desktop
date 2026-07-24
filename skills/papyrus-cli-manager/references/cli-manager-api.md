# CLI Manager API Reference

## Endpoints

- `GET /api/cli/status`
- `POST /api/cli/install`
- `POST /api/cli/update`
- `POST /api/cli/run`

## MCP tools

- `cli_status`
- `cli_install`
- `cli_run`

## Environment passed to managed CLI

- `PAPYRUS_API_URL`
- `PAPYRUS_MCP_URL`
- `PAPYRUS_AUTH_TOKEN`

## Install location

Windows: `%LOCALAPPDATA%\Papyrus\cli\`

The CLI is application tooling and must not be installed into the user learning data directory.
