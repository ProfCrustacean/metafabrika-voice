# Smoke Runner

Runner entrypoint:

- `run-smoke.mjs`

Supported modes:

- `single`
- `idempotency`
- `load`
- `fixtures`

Basic usage:

```bash
node integration-package/smoke/run-smoke.mjs single
```

The runner auto-loads `../credentials/integration.agent.env` by default.
Use `INTEGRATION_ENV_FILE=/path/to/file.env` to override.

Fixture samples are under:

- `fixtures/sps-ru/`
