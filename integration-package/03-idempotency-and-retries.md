# 03. Idempotency and Retry Guide (Frontend Push-to-Talk)

## Why This Matters

Push-to-talk UIs naturally create duplicates:

- user double-clicks submit
- mobile network retries
- browser retries after transient failure

`Idempotency-Key` prevents duplicate STT processing for the same user attempt.

## Frontend Rules

1. Generate a fresh key per user speech attempt.
2. Reuse the same key only for retries of that same attempt.
3. Never reuse the same key for a different audio clip.
4. Send your trace ID in `X-Request-Id` so client and server logs match.

Recommended key format:

- `<threadId>:<messageDraftId>:<attemptId>`

## Retry Policy

Use machine fields from error response:

- `error.retryable`
- optional `error.retryAfterSeconds`

Algorithm:

1. If `retryable === false`, stop and show user actionable message.
2. If `retryable === true` and `retryAfterSeconds` exists, wait that many seconds.
3. Retry with the same `Idempotency-Key`.
4. Keep max retry count in UI (for example 2-3 retries).

## Empty Audio vs No Speech

Treat these separately in UX:

- `empty_audio`: no payload or zero-byte recording, ask user to re-record
- `no_speech_detected`: audio arrived, but no speech recognized, ask user to speak more clearly

## Expected Duplicate Behavior

Same key + same audio:

- duplicate calls should return same result
- expensive duplicate processing should be avoided

Same key + different audio:

- service returns `idempotency_conflict` (409)
- client should create a new key and send as a fresh attempt

Retry after transient errors:

- retryable errors are not replay-cached
- same key can trigger a new processing attempt
