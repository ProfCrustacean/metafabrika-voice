# API Эндпойнты и примеры

## Базовый URL

Пример production URL сейчас:

`http://158.160.198.31:8080`

## 1) POST /v1/transcribe

### Назначение

Принять аудиофайл и вернуть распознанный русский текст.

### Заголовки

- `X-API-Key: <location_key>`
- `Content-Type: multipart/form-data`

### Тело

- поле `audio` (файл)

### Пример запроса (cURL)

```bash
curl -X POST "http://158.160.198.31:8080/v1/transcribe" \
  -H "X-API-Key: <location_key>" \
  -F "audio=@./sample.mp3;type=audio/mpeg"
```

### Пример успешного ответа

`200 OK`

```json
{
  "text": "поменяй правое на левое"
}
```

### Формат ошибки (единый)

```json
{
  "error": {
    "code": "missing_file",
    "message": "Audio file is required in form field 'audio'."
  },
  "requestId": "req_..."
}
```

`details` добавляется только для части ошибок, где нужны дополнительные поля
(например, лимиты/технические причины).

### Частые коды ошибок

- `401 missing_api_key`
- `401 invalid_api_key`
- `400 malformed_request`
- `400 missing_file`
- `413 payload_too_large`
- `422 empty_audio`
- `422 audio_too_long`
- `415 unsupported_format`
- `422 corrupted_audio`
- `422 no_speech_detected`
- `429 rate_limited`
- `503 service_busy`
- `502 upstream_error`
- `504 upstream_timeout`
- `500 internal_error`

## 2) OPTIONS /v1/transcribe

Для браузерного preflight.

Ожидаемое поведение:

- `204 No Content`
- CORS открыт для `*` (stage 1)

## 3) GET /health

Быстрый liveness-чек.

### Пример

```bash
curl "http://158.160.198.31:8080/health"
```

Ответ:

```json
{ "status": "ok" }
```

## 4) GET /ready

Readiness-чек (включая проверки `ffmpeg` и `ffprobe`).

### Пример

```bash
curl "http://158.160.198.31:8080/ready"
```

Ответ при готовности:

```json
{
  "status": "ready",
  "checks": { "ffmpeg": "ok", "ffprobe": "ok" }
}
```

## 5) Админ-эндпойнты (опционально, если задан ADMIN_API_KEY)

Эти эндпойнты нужны для операционного контроля rollout.

### 5.1 GET /admin/metrics

```bash
curl "http://158.160.198.31:8080/admin/metrics" \
  -H "X-Admin-API-Key: <admin_key>"
```

Возвращает агрегированные метрики и срез по `clientId`.

### 5.2 GET /admin/keys

```bash
curl "http://158.160.198.31:8080/admin/keys" \
  -H "X-Admin-API-Key: <admin_key>"
```

Возвращает список клиентских ключей и их состояние (`enabled`).

### 5.3 POST /admin/keys/:clientId/revoke

```bash
curl -X POST "http://158.160.198.31:8080/admin/keys/location-main/revoke" \
  -H "X-Admin-API-Key: <admin_key>"
```

Отключает ключ конкретной локации.

### 5.4 POST /admin/keys/:clientId/restore

```bash
curl -X POST "http://158.160.198.31:8080/admin/keys/location-main/restore" \
  -H "X-Admin-API-Key: <admin_key>"
```

Включает ключ обратно.

## 6) Минимальный пример вызова из фронта

```js
async function transcribeAudio(blob, apiKey) {
  const form = new FormData();
  form.append("audio", blob, "voice.webm");

  const res = await fetch("http://158.160.198.31:8080/v1/transcribe", {
    method: "POST",
    headers: { "X-API-Key": apiKey },
    body: form,
  });

  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.error?.code || "stt_error");
  }

  return body.text;
}
```
