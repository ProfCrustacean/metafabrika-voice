# Metafabrika Voice Integration Package

This package is a complete handoff for integrating browser push-to-talk with the current `/v1/transcribe` API.

It includes:

- Current API behavior and response contract
- Stable error-code and retry rules for frontend logic
- Idempotency guidance for double-click and retry scenarios
- Smoke scripts that can validate real integration behavior
- Sample audio files used by repository smoke/load tests
- Credential templates (without secrets) for client and server setup

## Package Contents

1. `01-service-behavior.md`
   - End-to-end behavior in plain language
   - What happens on success and failure
   - CORS, request IDs, and limits
2. `02-api-contract.md`
   - Request and response contract
   - Full error-code table with retry behavior
3. `03-idempotency-and-retries.md`
   - How to use `Idempotency-Key` from frontend push-to-talk
   - Recommended retry policy by error type
4. `04-smoke-tests.md`
   - How to run quick validation and fixture-based load tests
5. `05-credentials.md`
   - Which credentials are needed
   - Where to place them and how to rotate
6. `smoke/`
   - `run-smoke.mjs`: executable smoke/idempotency/load test runner
   - `fixtures/sps-ru/`: sample MP3 files + manifest used for smoke
7. `credentials/`
   - `client.env.template`
   - `server.env.template`
   - `client.env.sandbox`
   - `integration.agent.env` (actual integration credentials file)

## Quick Start

1. Use `credentials/integration.agent.env` as the default source file for the external coding agent.
2. Keep `credentials/client.env.template` as fallback template for future key rotation.
3. Ensure target service is reachable and has matching API keys.
4. Run a single-call smoke check:

```bash
node integration-package/smoke/run-smoke.mjs single
```

5. Run idempotency check:

```bash
node integration-package/smoke/run-smoke.mjs idempotency
```

6. Run fixture batch and load/coalescing checks:

```bash
node integration-package/smoke/run-smoke.mjs fixtures
node integration-package/smoke/run-smoke.mjs load
```

## Notes

- This package never stores production secrets.
- Use `client.env.sandbox` only for local testing.
- Production credentials must be injected through your secure channel.
