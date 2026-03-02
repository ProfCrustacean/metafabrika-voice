# 01. Service Behavior (Current)

## Core Job

The service accepts one uploaded audio file and returns a Russian transcript.

- Endpoint: `POST /v1/transcribe`
- Input: `multipart/form-data` with file field `audio`
- Output on success: transcript text and request ID

## Request Lifecycle

1. Request gets a `requestId`.
   - If client sends `X-Request-Id`, server uses it.
   - Otherwise server creates one.
2. API key auth is checked (`X-API-Key`).
3. Rate limit is checked by caller IP.
4. Multipart upload and `audio` field are validated.
5. Optional idempotency dedupe is applied when `Idempotency-Key` is present.
6. MIME type is validated.
7. Service checks in-flight capacity (`MAX_IN_FLIGHT_TRANSCRIPTIONS`).
8. Audio duration is probed via `ffprobe`.
9. Audio is converted to OGG Opus when needed (or fast-path bypass for valid OGG Opus).
10. Audio is sent to upstream STT provider.
11. Service returns transcript with `requestId`.

## Always-Available Tracing

The same request ID is available in both places:

- Response header: `X-Request-Id`
- JSON body:
  - success: `requestId`
  - error: `requestId`

## Idempotency Behavior

Scope key is:

- `apiClientId + Idempotency-Key`

Fingerprint is:

- `sha256(normalized MIME + audio bytes)`

Behavior for same scope key:

- Same fingerprint, first call still running: duplicate waits and receives same final result
- Same fingerprint, previous success: replay cached success
- Same fingerprint, previous cached expensive non-retryable processing error: replay cached error
- Same fingerprint, previous retryable error: no replay cache, new attempt runs
- Different fingerprint: `409 idempotency_conflict`

Replay TTL:

- 10 minutes (single-VM in-memory store)

## Limits and Operational Defaults

- Max upload size: `MAX_UPLOAD_BYTES` (default `1,048,576` bytes)
- Max audio duration: `MAX_AUDIO_SECONDS` (default `29` seconds)
- Upstream timeout: `YANDEX_STT_TIMEOUT_MS` (default `15,000` ms)
- ffmpeg timeout: `FFMPEG_TIMEOUT_MS` (default `15,000` ms)
- In-flight cap: `MAX_IN_FLIGHT_TRANSCRIPTIONS` (default `10`, `0` disables cap)

## CORS Behavior

For browser integration:

- Allowed methods: `POST`, `OPTIONS`
- Allowed headers: `Content-Type`, `X-API-Key`, `Idempotency-Key`, `X-Request-Id`
- Exposed response headers: `X-Request-Id`, `Retry-After`

## Health and Admin Endpoints

Operational:

- `GET /health`
- `GET /ready`

Admin (enabled only when `ADMIN_API_KEY` is configured):

- `GET /admin/metrics`
- `GET /admin/keys`
- `POST /admin/keys/:clientId/revoke`
- `POST /admin/keys/:clientId/restore`
