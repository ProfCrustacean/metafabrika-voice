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

## VM Deploy Access

- SSH alias: `metafabrika-voice-vm` (configured in `~/.ssh/config`)
- VM login: `artem@158.160.198.31`
- SSH key path on local machine: `~/.ssh/metafabrika_voice_artem`
- Repo path on VM: `/home/artem/metafabrika-voice`
- Service manager on VM: `systemd` service `metafabrika-voice.service`

### Standard VM Update Flow

1. `ssh metafabrika-voice-vm`
2. `cd /home/artem/metafabrika-voice`
3. `git fetch --all --prune`
4. `git checkout codex/stage1-stt-mvp && git pull --ff-only origin codex/stage1-stt-mvp`
5. `npm ci && npm run build`
6. `sudo systemctl restart metafabrika-voice.service`
7. `curl -sS http://127.0.0.1:8080/ready`

### Safety

- Never print private key contents.
- Never commit SSH keys or `.env` secrets.

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
- Integration handoff package: `integration-package/00-README.md`
- Repo map: `docs/REPO_MAP.md`
