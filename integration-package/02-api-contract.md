# 02. API Contract

## Endpoint

`POST /v1/transcribe`

## Required Headers

- `X-API-Key: <location key>`
- `Content-Type: multipart/form-data; boundary=...`

## Optional Headers

- `Idempotency-Key: <client-generated key>`
- `X-Request-Id: <client trace id>`

## Request Body

- Multipart field name: `audio`
- Supported MIME types:
  - `audio/webm`
  - `audio/ogg`
  - `audio/wav`
  - `audio/mpeg`
  - `audio/mp4`
  - `audio/x-m4a`
  - `audio/aac`

## Success Response

HTTP `200`

```json
{
  "text": "put the sink by the window",
  "requestId": "req_01J..."
}
```

Headers include:

- `X-Request-Id: <same requestId>`

## Error Response (Machine Contract)

All errors use this shape:

```json
{
  "error": {
    "code": "upstream_timeout",
    "message": "Speech provider timed out.",
    "retryable": true,
    "retryAfterSeconds": 2
  },
  "requestId": "req_01J..."
}
```

Notes:

- `retryAfterSeconds` is present only when guidance is available.
- If present, it matches response header `Retry-After` (rounded up to integer).

## Stable Error Codes

| Code                   | HTTP | Retryable   | Retry-After Behavior               | Typical Cause                          |
| ---------------------- | ---: | ----------- | ---------------------------------- | -------------------------------------- |
| `missing_api_key`      |  401 | No          | none                               | `X-API-Key` absent                     |
| `invalid_api_key`      |  401 | No          | none                               | key unknown or revoked                 |
| `not_found`            |  404 | No          | none                               | admin route entity missing             |
| `rate_limited`         |  429 | Yes         | dynamic from limiter window        | request burst from same IP             |
| `service_busy`         |  503 | Yes         | default `1` second                 | in-flight cap reached                  |
| `malformed_request`    |  400 | No          | none                               | broken multipart/body format           |
| `missing_file`         |  400 | No          | none                               | `audio` field missing                  |
| `payload_too_large`    |  413 | No          | none                               | file exceeds upload limit              |
| `empty_audio`          |  422 | No          | none                               | empty bytes uploaded                   |
| `audio_too_long`       |  422 | No          | none                               | duration exceeds `MAX_AUDIO_SECONDS`   |
| `unsupported_format`   |  415 | No          | none                               | MIME type not supported                |
| `corrupted_audio`      |  422 | No          | none                               | cannot decode/probe/convert            |
| `no_speech_detected`   |  422 | No          | none                               | speech not detected                    |
| `idempotency_conflict` |  409 | No          | none                               | same key reused with different payload |
| `upstream_error`       |  502 | Conditional | default `2` seconds when retryable | provider request failed                |
| `upstream_timeout`     |  504 | Yes         | default `2` seconds                | provider timeout                       |
| `internal_error`       |  500 | Yes         | default `1` second                 | unexpected server/runtime failure      |

### `upstream_error` Retry Rule

`upstream_error` is retryable when upstream status is:

- `408`
- `429`
- `>=500`
- unknown/missing status in provider details

Otherwise it is treated as non-retryable.
