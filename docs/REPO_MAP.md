# Repo Map

## Scope

- In scope: browser audio upload -> Russian transcript JSON.
- Out of scope: kitchen design logic, UI, text-to-speech.

## Top-Level Layout

```text
.
├─ src/
│  ├─ app.ts, server.ts
│  ├─ routes/
│  ├─ middleware/
│  ├─ errors/
│  ├─ idempotency/
│  ├─ auth/
│  ├─ audio/
│  ├─ metrics/
│  ├─ providers/
│  └─ utils/
├─ test/
│  ├─ transcribe/
│  ├─ helpers/
│  ├─ fixtures/
│  ├─ yandex.provider.test.ts
│  └─ smoke.integration.test.ts
├─ docs/
│  ├─ stt-service.md
│  └─ REPO_MAP.md
├─ integration-package/
│  ├─ 00-README.md
│  ├─ 01-service-behavior.md
│  ├─ 02-api-contract.md
│  ├─ 03-idempotency-and-retries.md
│  ├─ 04-smoke-tests.md
│  ├─ 05-credentials.md
│  ├─ smoke/
│  └─ credentials/
├─ scripts/
│  ├─ check-agent-readability.mjs
│  └─ check-docs-sync.mjs
├─ .github/
│  ├─ workflows/ci.yml
│  └─ pull_request_template.md
├─ AGENTS.md
├─ package.json
└─ agent-readability.config.json
```

## Runtime Flow

1. `src/server.ts`: loads config, runs startup dependency preflight, builds provider, starts service.
2. `src/app.ts`: registers plugins, hooks, routes, health/readiness endpoints.
3. `src/routes/transcribe.ts`: handles `POST /v1/transcribe`.
4. `src/middleware/apiKeyAuth.ts` + `src/auth/apiKeyRegistry.ts`: per-location key auth and key revoke state.
5. `src/routes/transcribeHelpers.ts` + `src/idempotency/idempotencyStore.ts`: route helper logic (slot limits, mapping, idempotency replay, file checks).
6. `src/audio/*` + `src/providers/*`: upload checks, duration probe, conversion, and upstream STT call.
7. `src/routes/admin.ts` + `src/metrics/apiUsageMetrics.ts`: admin metrics and key-control endpoints.
8. `src/middleware/errorHandler.ts` + `src/app.ts` hooks: structured request/error logging without sensitive payloads.

## Edit Guide

| Task                          | Start Here                             | Then Check                                                                                                                                                    |
| ----------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API behavior and payloads     | `src/routes/transcribe.ts`             | `src/routes/transcribeHelpers.ts`, `src/types.ts`, `docs/stt-service.md`                                                                                      |
| Retry/dedupe behavior         | `src/idempotency/idempotencyStore.ts`  | `src/routes/transcribe.ts`, `src/routes/transcribeHelpers.ts`, `test/transcribe/idempotency.test.ts`                                                          |
| Auth, rate limits, error JSON | `src/middleware/`                      | `src/auth/apiKeyRegistry.ts`, `src/app.ts` (`trustProxy`), `test/transcribe/platform.test.ts`                                                                 |
| Location key controls/metrics | `src/routes/admin.ts`                  | `src/metrics/apiUsageMetrics.ts`, `test/transcribe/admin.test.ts`                                                                                             |
| Audio conversion pipeline     | `src/audio/prepareAudioForProvider.ts` | `src/audio/probeAudioDurationSeconds.ts`, `src/audio/transcodeToOggOpus.ts`, `src/audio/ffmpegConversion.ts`, `src/audio/audioFileUtils.ts`, validation tests |
| STT backend/provider swap     | `src/providers/SttProvider.ts`         | `src/providers/YandexSttProvider.ts`, provider tests                                                                                                          |
| Env/config changes            | `src/config.ts`                        | `.env.example`, `docs/stt-service.md`                                                                                                                         |
| Integrator handoff package    | `integration-package/00-README.md`     | `integration-package/02-api-contract.md`, `integration-package/04-smoke-tests.md`, `integration-package/smoke/run-smoke.mjs`                                  |
| CI/quality policy             | `.github/workflows/ci.yml`             | `package.json`, `scripts/check-*.mjs`                                                                                                                         |

## Tests

- Route tests by concern: `test/transcribe/`
- Config parsing tests: `test/config.test.ts`
- Provider unit tests: `test/yandex.provider.test.ts`
- Smoke path (ffmpeg + mocked upstream): `test/smoke.integration.test.ts`
- Short RU real-audio fixture set: `test/fixtures/sps-ru/` (`manifest.json` + mp3 files)

## Quality Gates

- `npm run check:agent-readability`
- `npm run check:docs-sync`
- `npm run lint`
- `npm run format:check`
- `npm run build`
- `npm test`
- `npm run test:smoke`
