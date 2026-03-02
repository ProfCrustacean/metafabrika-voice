import { vi } from "vitest";
import { buildApp } from "../../src/app.js";
import { RuntimeConfig, AppError } from "../../src/types.js";
import { SttProvider } from "../../src/providers/SttProvider.js";
import {
  ProbeDurationSecondsFn,
  TranscodeFn,
} from "../../src/routes/transcribe.js";
import { FfmpegReadinessResult } from "../../src/utils/ffmpegReadiness.js";

export const BASE_CONFIG: RuntimeConfig = {
  port: 8080,
  host: "0.0.0.0",
  trustProxy: false,
  logLevel: "info",
  serviceApiKeys: {
    showroom_a: "test-api-key",
    showroom_b: "test-api-key-b",
  },
  adminApiKey: "test-admin-key",
  yandexApiKey: "unused-in-route-tests",
  yandexSttTimeoutMs: 15_000,
  maxUploadBytes: 1_048_576,
  yandexSttEndpoint: "https://example.test/stt",
  ffmpegPath: "ffmpeg",
  ffprobePath: "ffprobe",
  ffmpegTimeoutMs: 15_000,
  maxAudioSeconds: 29,
  rateLimitWindowMs: 60_000,
  rateLimitMaxRequests: 60,
  maxInFlightTranscriptions: 10,
};

export interface CreateTestAppOptions {
  config?: Partial<RuntimeConfig>;
  provider?: SttProvider;
  transcode?: TranscodeFn;
  probeDurationSeconds?: ProbeDurationSecondsFn;
  idempotencyTtlMs?: number;
  readinessCheck?: () => Promise<FfmpegReadinessResult>;
}

export function buildMockTranscodeResult() {
  return {
    audio: new Uint8Array(Buffer.from("converted-audio")),
    cleanup: async () => {},
  };
}

export async function createTestApp(options?: CreateTestAppOptions) {
  const provider =
    options?.provider ||
    ({
      name: "yandex",
      transcribe: vi.fn().mockResolvedValue({ text: "поставь мойку у окна" }),
    } satisfies SttProvider);

  const transcode =
    options?.transcode ||
    (vi.fn(async (inputAudio: NodeJS.ReadableStream) => {
      let hitLimit = false;
      inputAudio.once("limit", () => {
        hitLimit = true;
      });

      let size = 0;
      for await (const chunk of inputAudio) {
        size += Buffer.isBuffer(chunk)
          ? chunk.length
          : Buffer.byteLength(String(chunk));
      }

      const truncated = (
        inputAudio as NodeJS.ReadableStream & { truncated?: boolean }
      ).truncated;
      if (hitLimit || truncated) {
        throw new AppError(
          "payload_too_large",
          413,
          "Uploaded payload exceeds size limits.",
        );
      }

      if (size === 0) {
        throw new AppError("empty_audio", 422, "Uploaded audio file is empty.");
      }

      return buildMockTranscodeResult();
    }) as TranscodeFn);

  const app = await buildApp({
    config: {
      ...BASE_CONFIG,
      ...(options?.config || {}),
    },
    provider,
    transcode,
    probeDurationSeconds:
      options?.probeDurationSeconds ||
      (vi.fn().mockResolvedValue(1) as ProbeDurationSecondsFn),
    idempotencyTtlMs: options?.idempotencyTtlMs,
    readinessCheck: options?.readinessCheck,
    logger: false,
  });

  return { app, provider, transcode };
}
