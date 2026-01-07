# Engine (Headless)

This package provides a headless Engine runtime with a typed IPC surface and a
programmatic API for tests.

## Run headless

```bash
npm install
npm run engine:headless
```

Environment variables:
- `PRIME_DB_PATH` (default: `prime-cli.db`)
- `PRIME_ARTIFACTS_DIR` (default: `artifacts/`)
- `PRIME_LOG_LEVEL` (default: `info`)

The engine expects prompts in `docs/prompts/` and the workflow schema in
`packages/core/src/dsl/schema.json`.

Cancellation emits `RUN_FINISHED` with `status: "canceled"`.

## Tests

```bash
npm run test:engine
```
