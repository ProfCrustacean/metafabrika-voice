# RU Speech Fixture Set (Short Clips)

Small Russian audio fixture set for local STT checks.

## Source

- Dataset archive provided locally by the team:
  - `/Users/ian/Downloads/sps-corpus-2.0-2025-12-05-ru.tar`
- Extracted subset:
  - 12 clips (`5-16s` each)
  - All clips are below the service hard limit (`29s`).

## Files

- Audio: `spontaneous-speech-ru-*.mp3`
- Metadata: `manifest.json` (duration, prompt, reference transcription)

## Intended Use

- Smoke checks for real end-to-end transcribe calls.
- Latency spot checks across multiple real Russian utterances.
- Non-blocking manual evaluation (recognition may differ from reference punctuation/wording).

## Notes

- Keep this set small and stable; add only short clips relevant for product flow.
- Verify redistribution/licensing requirements before sharing outside your team.
