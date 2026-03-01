import { MultipartFile } from "@fastify/multipart";
import { FastifyRequest } from "fastify";
import {
  NoSpeechDetectedError,
  UpstreamProviderError,
  UpstreamTimeoutError,
} from "../providers/providerErrors.js";
import { AppError } from "../types.js";

export function mapProviderError(error: unknown): AppError | null {
  if (error instanceof NoSpeechDetectedError) {
    return new AppError(
      "no_speech_detected",
      422,
      "No speech detected in audio.",
    );
  }

  if (error instanceof UpstreamTimeoutError) {
    return new AppError("upstream_timeout", 504, "Speech provider timed out.");
  }

  if (error instanceof UpstreamProviderError) {
    return new AppError(
      "upstream_error",
      502,
      "Speech provider request failed.",
      error.details,
    );
  }

  if (error instanceof AppError) {
    return error;
  }

  return null;
}

export async function readAudioFileOrThrow(
  request: FastifyRequest,
): Promise<MultipartFile> {
  const file = await request.file();

  if (!file || file.fieldname !== "audio") {
    throw new AppError(
      "missing_file",
      400,
      "Audio file is required in form field 'audio'.",
    );
  }

  return file;
}

export function assertUploadNotTruncated(file: MultipartFile): void {
  if (
    (file.file as NodeJS.ReadableStream & { truncated?: boolean }).truncated
  ) {
    throw new AppError(
      "payload_too_large",
      413,
      "Uploaded payload exceeds size limits.",
    );
  }
}

export function createInFlightSlotAcquirer(maxInFlightTranscriptions: number) {
  let inFlight = 0;

  return function acquireInFlightSlot(): () => void {
    if (maxInFlightTranscriptions <= 0) {
      return () => {};
    }

    if (inFlight >= maxInFlightTranscriptions) {
      throw new AppError(
        "service_busy",
        503,
        "Service is temporarily busy. Please retry shortly.",
      );
    }

    inFlight += 1;
    let released = false;

    return () => {
      if (released) {
        return;
      }

      released = true;
      inFlight = Math.max(0, inFlight - 1);
    };
  };
}
