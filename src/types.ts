export const SUPPORTED_AUDIO_MIME_TYPES = new Set<string>([
  "audio/webm",
  "audio/ogg",
  "audio/wav",
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
]);

export const TRANSCRIBE_LANGUAGE = "ru-RU";

export type AudioPayload = Uint8Array | ReadableStream<Uint8Array>;

export type ErrorCode =
  | "missing_api_key"
  | "invalid_api_key"
  | "not_found"
  | "rate_limited"
  | "service_busy"
  | "malformed_request"
  | "missing_file"
  | "payload_too_large"
  | "empty_audio"
  | "audio_too_long"
  | "unsupported_format"
  | "corrupted_audio"
  | "no_speech_detected"
  | "upstream_error"
  | "upstream_timeout"
  | "internal_error";

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    statusCode: number,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export interface ErrorResponseBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
  requestId: string;
}

export interface SuccessResponseBody {
  text: string;
}

export interface RuntimeConfig {
  port: number;
  host: string;
  trustProxy: boolean;
  logLevel: string;
  serviceApiKeys: Record<string, string>;
  adminApiKey?: string;
  yandexApiKey: string;
  yandexSttTimeoutMs: number;
  maxUploadBytes: number;
  yandexSttEndpoint: string;
  ffmpegPath: string;
  ffprobePath: string;
  ffmpegTimeoutMs: number;
  maxAudioSeconds: number;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  maxInFlightTranscriptions: number;
}
