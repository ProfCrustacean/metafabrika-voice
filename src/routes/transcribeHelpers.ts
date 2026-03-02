import { MultipartFile } from "@fastify/multipart";
import { FastifyReply, FastifyRequest } from "fastify";
import { createHash } from "node:crypto";
import {
  NoSpeechDetectedError,
  UpstreamProviderError,
  UpstreamTimeoutError,
} from "../providers/providerErrors.js";
import { AppError, SuccessResponseBody } from "../types.js";
import { IdempotencyOutcome } from "../idempotency/idempotencyStore.js";
import { mapToAppError } from "../errors/mapToAppError.js";

export function mapProviderError(error: unknown): AppError | null {
  if (error instanceof NoSpeechDetectedError) {
    return new AppError(
      "no_speech_detected",
      422,
      "No speech detected in audio.",
    );
  }

  if (error instanceof UpstreamTimeoutError) {
    return new AppError("upstream_timeout", 504, "Speech provider timed out.", {
      retryAfterSeconds: 2,
    });
  }

  if (error instanceof UpstreamProviderError) {
    return new AppError(
      "upstream_error",
      502,
      "Speech provider request failed.",
      {
        ...(error.details || {}),
        retryAfterSeconds: 2,
      },
    );
  }

  if (error instanceof AppError) {
    return error;
  }

  return null;
}

export function normalizeToAppError(error: unknown): AppError {
  const mapped = mapProviderError(error);
  if (mapped) {
    return mapped;
  }
  return mapToAppError(error);
}

export function readOptionalHeader(
  value: string | string[] | undefined,
): string | undefined {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized || undefined;
  }

  if (!value?.length) {
    return undefined;
  }

  const normalized = value[0]?.trim();
  return normalized || undefined;
}

function normalizeMimeType(mimeType: string | undefined): string {
  return mimeType?.split(";")[0]?.trim().toLowerCase() || "";
}

export function buildIdempotencyFingerprint(
  audio: Buffer,
  mimeType: string | undefined,
): string {
  const hash = createHash("sha256");
  hash.update(normalizeMimeType(mimeType));
  hash.update("\n");
  hash.update(audio);
  return hash.digest("hex");
}

export function sendSuccessResponse(
  reply: FastifyReply,
  text: string,
  requestId: string,
): void {
  const payload: SuccessResponseBody = { text, requestId };
  reply.status(200).send(payload);
}

export function sendIdempotencyOutcome(
  reply: FastifyReply,
  requestId: string,
  outcome: IdempotencyOutcome,
): void {
  if (outcome.ok) {
    sendSuccessResponse(reply, outcome.text, requestId);
    return;
  }

  throw outcome.error;
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
        { retryAfterSeconds: 1 },
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
