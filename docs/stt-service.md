# STT Service Documentation

## What This Service Does

This service accepts an uploaded audio recording from a browser, transcribes Russian speech (`ru-RU`) into text using Yandex Speech API, and returns the text in the same HTTP response.

It only handles speech-to-text. It does **not** do kitchen design logic, UI, or text-to-speech.

On startup, the service validates required dependencies (`ffmpeg` and `ffprobe`)
and fails fast if they are missing.

## API Endpoint

`POST /v1/transcribe`

Also supports:

`OPTIONS /v1/transcribe` for browser CORS preflight.

Operational endpoints:

- `GET /health` (basic liveness)
- `GET /ready` (readiness, includes `ffmpeg` dependency check)
- `GET /admin/metrics` (per-location usage metrics, admin key required)
- `GET /admin/keys` (list location key states, admin key required)
- `POST /admin/keys/:clientId/revoke` (disable one location key immediately)
- `POST /admin/keys/:clientId/restore` (re-enable location key)

Admin endpoints are enabled only when `ADMIN_API_KEY` is configured.

## Authentication

Send a location key in this header on every `POST` request:

`X-API-Key: <location-key>`

Use one key per location/device group. Keys can be revoked instantly through the
admin control endpoints.

## Request Format

- Content type: `multipart/form-data`
- Required file field: `audio`
- Language: fixed to Russian `ru-RU` in v1
- Hard server-side duration limit: `29` seconds (configurable via `MAX_AUDIO_SECONDS`)

Common browser-friendly input MIME types accepted:

- `audio/webm`
- `audio/ogg`
- `audio/wav`
- `audio/mpeg`
- `audio/mp4`
- `audio/x-m4a`
- `audio/aac`

The service converts accepted inputs to a Yandex-compatible OGG Opus stream before transcription.
For latency, `audio/ogg` uploads skip ffmpeg when they are confirmed as Ogg Opus
(via codec metadata or Ogg/Opus signature bytes), and otherwise fall back to conversion.

## Success Response

HTTP `200`

```json
{
  "text": "поставь мойку у окна"
}
```

## Error Response Format

All errors return JSON:

```json
{
  "error": {
    "code": "missing_file",
    "message": "Audio file is required in form field 'audio'.",
    "details": {}
  },
  "requestId": "req_01J..."
}
```

Main error codes:

- `missing_api_key` (`401`)
- `invalid_api_key` (`401`)
- `not_found` (`404`, admin key-control routes)
- `rate_limited` (`429`)
- `service_busy` (`503`)
- `malformed_request` (`400`)
- `missing_file` (`400`)
- `payload_too_large` (`413`)
- `empty_audio` (`422`)
- `audio_too_long` (`422`)
- `unsupported_format` (`415`)
- `corrupted_audio` (`422`)
- `no_speech_detected` (`422`)
- `upstream_error` (`502`)
- `upstream_timeout` (`504`)
- `internal_error` (`500`)

`payload_too_large` is detected during upload stream handling before audio
transcoding, so oversized payloads fail early without spending ffmpeg CPU.

`audio_too_long` is returned when measured clip duration exceeds `MAX_AUDIO_SECONDS`
(default `29`).

## CORS

Configured for browser apps on other domains:

- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Headers: Content-Type, X-API-Key`
- `Access-Control-Allow-Methods: POST, OPTIONS`

## Setup

1. `npm install`
2. `cp .env.example .env`
3. Fill required values in `.env`
4. `npm run check:all`
5. `npm run dev` for local development
6. `npm run build && npm run start` for production run

`npm run check:all` includes readability/doc-sync checks, lint/format/build/tests,
and smoke validation. `ffmpeg` and `ffprobe` must be installed.

## Environment Variables

- `PORT` (default `8080`)
- `HOST` (default `0.0.0.0`)
- `TRUST_PROXY` (default `false`; set `true` only when running behind a trusted reverse proxy)
- `LOG_LEVEL` (default `info`)
- `SERVICE_API_KEYS` (recommended; comma-separated `clientId:key` pairs, one per location)
- `SERVICE_API_KEY` (legacy fallback; mapped to one `default` client)
- `ADMIN_API_KEY` (recommended; required to use `/admin/*` control endpoints)
- `YANDEX_API_KEY` (required, used to call Yandex STT)
- `YANDEX_STT_TIMEOUT_MS` (default `15000`)
- `MAX_UPLOAD_BYTES` (default `1048576`)
- `YANDEX_STT_ENDPOINT` (default Yandex recognize endpoint)
- `FFMPEG_PATH` (default `ffmpeg`)
- `FFPROBE_PATH` (default `ffprobe`)
- `FFMPEG_TIMEOUT_MS` (default `15000`)
- `MAX_AUDIO_SECONDS` (default `29`)
- `RATE_LIMIT_WINDOW_MS` (default `60000`)
- `RATE_LIMIT_MAX_REQUESTS` (default `60`)
- `MAX_IN_FLIGHT_TRANSCRIPTIONS` (default `10`; set `0` to disable concurrency cap)

## Browser Audio Assumptions

- Typical browser recording components produce `audio/webm` or `audio/ogg`.
- Service supports those formats directly and also several common alternatives listed above.
- `ffmpeg` and `ffprobe` must be installed on the VPS (ffprobe is used for strict duration checks).

## Logging Policy

- Request logs are structured and include request ID, client ID, status code, error code (if any), and latency.
- API key headers are redacted in logs.
- Raw audio bytes and transcript text are not logged by default.
