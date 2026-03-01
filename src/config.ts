import dotenv from "dotenv";
import { RuntimeConfig } from "./types.js";

dotenv.config();

function required(name: string, value: string | undefined): string {
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function parseNumber(
  name: string,
  value: string | undefined,
  fallback: number,
): number {
  if (value === undefined || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid positive number for ${name}: ${value}`);
  }
  return parsed;
}

function parseNonNegativeNumber(
  name: string,
  value: string | undefined,
  fallback: number,
): number {
  if (value === undefined || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid non-negative number for ${name}: ${value}`);
  }
  return parsed;
}

function parseBoolean(
  name: string,
  value: string | undefined,
  fallback: boolean,
): boolean {
  if (value === undefined || value === "") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error(`Invalid boolean value for ${name}: ${value}`);
}

function parseServiceApiKeys(): Record<string, string> {
  const multi = process.env.SERVICE_API_KEYS?.trim();
  if (multi) {
    const entries = multi
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

    const parsed: Record<string, string> = {};
    for (const entry of entries) {
      const separatorIndex = entry.indexOf(":");
      if (separatorIndex <= 0 || separatorIndex === entry.length - 1) {
        throw new Error(
          `Invalid SERVICE_API_KEYS entry: "${entry}". Expected "clientId:apiKey".`,
        );
      }

      const clientId = entry.slice(0, separatorIndex).trim();
      const apiKey = entry.slice(separatorIndex + 1).trim();
      if (!clientId || !apiKey) {
        throw new Error(
          `Invalid SERVICE_API_KEYS entry: "${entry}". Expected non-empty clientId and apiKey.`,
        );
      }

      if (parsed[clientId]) {
        throw new Error(
          `Duplicate clientId in SERVICE_API_KEYS: "${clientId}".`,
        );
      }

      parsed[clientId] = apiKey;
    }

    if (!Object.keys(parsed).length) {
      throw new Error("SERVICE_API_KEYS must contain at least one entry.");
    }

    return parsed;
  }

  const single = process.env.SERVICE_API_KEY?.trim();
  if (single) {
    return { default: single };
  }

  throw new Error(
    "Missing required environment variable: SERVICE_API_KEYS (or legacy SERVICE_API_KEY).",
  );
}

export function loadConfig(): RuntimeConfig {
  return {
    port: parseNumber("PORT", process.env.PORT, 8080),
    host: process.env.HOST?.trim() || "0.0.0.0",
    trustProxy: parseBoolean("TRUST_PROXY", process.env.TRUST_PROXY, false),
    logLevel: process.env.LOG_LEVEL?.trim() || "info",
    serviceApiKeys: parseServiceApiKeys(),
    adminApiKey: process.env.ADMIN_API_KEY?.trim() || undefined,
    yandexApiKey: required("YANDEX_API_KEY", process.env.YANDEX_API_KEY),
    yandexSttTimeoutMs: parseNumber(
      "YANDEX_STT_TIMEOUT_MS",
      process.env.YANDEX_STT_TIMEOUT_MS,
      15_000,
    ),
    maxUploadBytes: parseNumber(
      "MAX_UPLOAD_BYTES",
      process.env.MAX_UPLOAD_BYTES,
      1_048_576,
    ),
    yandexSttEndpoint:
      process.env.YANDEX_STT_ENDPOINT?.trim() ||
      "https://stt.api.cloud.yandex.net/speech/v1/stt:recognize",
    ffmpegPath: process.env.FFMPEG_PATH?.trim() || "ffmpeg",
    ffprobePath: process.env.FFPROBE_PATH?.trim() || "ffprobe",
    ffmpegTimeoutMs: parseNumber(
      "FFMPEG_TIMEOUT_MS",
      process.env.FFMPEG_TIMEOUT_MS,
      15_000,
    ),
    maxAudioSeconds: parseNumber(
      "MAX_AUDIO_SECONDS",
      process.env.MAX_AUDIO_SECONDS,
      29,
    ),
    rateLimitWindowMs: parseNumber(
      "RATE_LIMIT_WINDOW_MS",
      process.env.RATE_LIMIT_WINDOW_MS,
      60_000,
    ),
    rateLimitMaxRequests: parseNumber(
      "RATE_LIMIT_MAX_REQUESTS",
      process.env.RATE_LIMIT_MAX_REQUESTS,
      60,
    ),
    maxInFlightTranscriptions: parseNonNegativeNumber(
      "MAX_IN_FLIGHT_TRANSCRIPTIONS",
      process.env.MAX_IN_FLIGHT_TRANSCRIPTIONS,
      10,
    ),
  };
}
