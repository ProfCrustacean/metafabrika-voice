# 04. Smoke Tests

## Included Assets

- Test runner: `smoke/run-smoke.mjs`
- Audio fixtures: `smoke/fixtures/sps-ru/*.mp3`
- Fixture manifest: `smoke/fixtures/sps-ru/manifest.json`

## Prerequisites

1. Node.js 20+
2. Reachable STT service URL
3. Valid API key accepted by that service
4. Optional: `X-Request-Id` prefix and `Idempotency-Key` prefix

## Environment Variables

Minimum required:

- `BASE_URL` (example: `https://voice.example.com`)
- `X_API_KEY`

Optional:

- `AUDIO_PATH`
- `IDEMPOTENCY_KEY_PREFIX` (default `integration-smoke`)
- `X_REQUEST_ID_PREFIX` (default `integration-client`)
- `LOAD_CONCURRENCY` (default `12`)
- `LOAD_DUPLICATES` (default `3`)
- `INTEGRATION_ENV_FILE` (optional override path; by default runner auto-loads `credentials/integration.agent.env`)

## Commands

If `integration-package/credentials/integration.agent.env` exists, you can run directly:

```bash
node integration-package/smoke/run-smoke.mjs single
```

Or provide variables explicitly:

Single call check:

```bash
BASE_URL="https://voice.example.com" \
X_API_KEY="..." \
node integration-package/smoke/run-smoke.mjs single
```

Idempotency replay check (same key + same payload):

```bash
BASE_URL="https://voice.example.com" \
X_API_KEY="..." \
node integration-package/smoke/run-smoke.mjs idempotency
```

Parallel duplicate load check (in-flight coalescing):

```bash
BASE_URL="https://voice.example.com" \
X_API_KEY="..." \
LOAD_CONCURRENCY=12 \
LOAD_DUPLICATES=3 \
node integration-package/smoke/run-smoke.mjs load
```

Fixture sweep (all included sample audios):

```bash
BASE_URL="https://voice.example.com" \
X_API_KEY="..." \
node integration-package/smoke/run-smoke.mjs fixtures
```

## Pass Criteria

- `single`: one `200` with non-empty `text` and request ID (body or `X-Request-Id` header)
- `idempotency`: both responses are `200`, both include request ID traceability, no request failures
- `load`: all duplicate requests for each key are `200`
- `fixtures`: every fixture returns `200` and request ID traceability

## Notes

- Smoke scripts are runtime checks for integration wiring and contract behavior.
- They are not full quality/performance benchmarks.
- The runner is backward compatible with legacy deployments where `requestId` is only in headers.
