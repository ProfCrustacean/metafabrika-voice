# 05. Credentials and Configuration

## Files in `credentials/`

- `client.env.template`
  - template for frontend or API client integration tests
- `server.env.template`
  - template for service environment on backend side
- `client.env.sandbox`
  - safe local sample values for non-production smoke checks
- `integration.agent.env`
  - actual, ready-to-use integration credentials for the external coding agent

## Client-Side Required Values

- `BASE_URL`
- `X_API_KEY`

Optional but recommended:

- `IDEMPOTENCY_KEY_PREFIX`
- `X_REQUEST_ID_PREFIX`

## Server-Side Required Values

- `SERVICE_API_KEYS` (must include the key used by client)
- `YANDEX_API_KEY`

Recommended:

- `ADMIN_API_KEY`
- `RATE_LIMIT_*`
- `MAX_IN_FLIGHT_TRANSCRIPTIONS`

## Secure Handling Rules

- Do not commit real credentials into Git.
- Keep production credentials in secrets manager or deployment environment.
- Rotate `X-API-Key` and `ADMIN_API_KEY` if exposure is suspected.
- Keep `X-API-Key` scoped per location/client group.

## Integration Handshake Checklist

1. Backend provisions a location key in `SERVICE_API_KEYS`.
2. Client receives that key via secure channel.
3. Client sends `X-API-Key` on every request.
4. Client starts sending `Idempotency-Key` and `X-Request-Id`.
5. Run smoke checks from `04-smoke-tests.md` before production rollout.

## Operational Note

For this handoff, `integration.agent.env` is the primary single file to use.
Rotate values after third-party onboarding is complete.
The smoke runner auto-loads this file by default.
