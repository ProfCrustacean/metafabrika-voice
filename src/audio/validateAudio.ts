import { AppError, SUPPORTED_AUDIO_MIME_TYPES } from "../types.js";

export function validateAudioMimeType(mimeType: string | undefined): void {
  const normalized = mimeType?.split(";")[0]?.trim().toLowerCase();
  if (!normalized || !SUPPORTED_AUDIO_MIME_TYPES.has(normalized)) {
    throw new AppError("unsupported_format", 415, "Unsupported audio format.", {
      supportedMimeTypes: [...SUPPORTED_AUDIO_MIME_TYPES],
    });
  }
}
