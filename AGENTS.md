# AGENTS

## Fast Start

1. `npm install`
2. `cp .env.example .env`
3. Ensure `ffmpeg`/`ffprobe` are installed
4. `npm run check:all`

## Navigate by Task

- App bootstrap: `src/server.ts` -> `src/app.ts`
- Transcribe route behavior: `src/routes/transcribe.ts` -> `src/routes/transcribeHelpers.ts`
- Auth, rate limit, error mapping: `src/middleware/`
- Location key registry and revoke controls: `src/auth/apiKeyRegistry.ts` + `src/routes/admin.ts`
- Audio conversion: `src/audio/transcodeToOggOpus.ts` -> helpers in `src/audio/`
- Provider integration: `src/providers/SttProvider.ts` -> `src/providers/YandexSttProvider.ts`
- Route tests: `test/transcribe/`

## Guardrails

- Keep public API response shapes stable unless task explicitly changes contract.
- Keep one concern per file; extract helpers early.
- Respect line limits in `agent-readability.config.json`.
- Update `docs/REPO_MAP.md` or this file when structure/workflow changes.

## Finish Checklist

1. `npm run check:all`

## References

- Project overview: `README.md`
- API docs: `docs/stt-service.md`
- Repo map: `docs/REPO_MAP.md`
