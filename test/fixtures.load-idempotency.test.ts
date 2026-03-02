import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { RuntimeConfig } from "../src/types.js";
import { SttProvider } from "../src/providers/SttProvider.js";
import { buildMultipart } from "./helpers/buildMultipart.js";

interface FixtureSample {
  audioId: number;
  file: string;
}

interface FixtureManifest {
  samples: FixtureSample[];
}

interface FixtureAudio {
  audioId: number;
  file: string;
  data: Buffer;
}

function loadFixtureAudios(): FixtureAudio[] {
  const testDir = dirname(fileURLToPath(import.meta.url));
  const fixturesDir = join(testDir, "fixtures", "sps-ru");
  const manifestPath = join(fixturesDir, "manifest.json");
  const manifest = JSON.parse(
    readFileSync(manifestPath, "utf8"),
  ) as FixtureManifest;

  return manifest.samples.map((sample) => ({
    audioId: sample.audioId,
    file: sample.file,
    data: readFileSync(join(fixturesDir, sample.file)),
  }));
}

function ensureBinary(binaryName: string): void {
  if (spawnSync(binaryName, ["-version"], { stdio: "ignore" }).status !== 0) {
    throw new Error(
      `${binaryName} is required for fixture audio integration tests.`,
    );
  }
}

describe("fixture audio idempotency and load integration", () => {
  const fixtureAudios = loadFixtureAudios();
  const provider = {
    name: "fixture-provider",
    transcribe: vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { text: "fixture-transcript" };
    }),
  } satisfies SttProvider;
  let app: Awaited<ReturnType<typeof buildApp>>;

  async function sendTranscribeRequest(
    audio: FixtureAudio,
    idempotencyKey: string,
  ) {
    const multipart = buildMultipart([
      {
        name: "audio",
        filename: audio.file,
        contentType: "audio/mpeg",
        data: audio.data,
      },
    ]);

    return app.inject({
      method: "POST",
      url: "/v1/transcribe",
      headers: {
        "x-api-key": "fixture-service-key",
        "idempotency-key": idempotencyKey,
        "content-type": multipart.contentType,
      },
      payload: multipart.payload,
    });
  }

  beforeAll(async () => {
    ensureBinary("ffmpeg");
    ensureBinary("ffprobe");

    const config: RuntimeConfig = {
      port: 8080,
      host: "0.0.0.0",
      trustProxy: false,
      logLevel: "info",
      serviceApiKeys: { fixture_client: "fixture-service-key" },
      adminApiKey: "fixture-admin-key",
      yandexApiKey: "unused",
      yandexSttTimeoutMs: 15_000,
      maxUploadBytes: 1_048_576,
      yandexSttEndpoint: "https://example.test/stt",
      ffmpegPath: "ffmpeg",
      ffprobePath: "ffprobe",
      ffmpegTimeoutMs: 15_000,
      maxAudioSeconds: 29,
      rateLimitWindowMs: 60_000,
      rateLimitMaxRequests: 10_000,
      maxInFlightTranscriptions: 64,
    };

    app = await buildApp({
      config,
      provider,
      logger: false,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("accepts every fixture audio sample", async () => {
    provider.transcribe.mockClear();

    for (const audio of fixtureAudios) {
      const response = await sendTranscribeRequest(
        audio,
        `fixture-base-${audio.audioId}`,
      );
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        text: "fixture-transcript",
        requestId: response.headers["x-request-id"],
      });
    }

    expect(provider.transcribe).toHaveBeenCalledTimes(fixtureAudios.length);
  });

  it("replays idempotent duplicates for all fixture audios", async () => {
    provider.transcribe.mockClear();

    for (const audio of fixtureAudios) {
      const key = `fixture-replay-${audio.audioId}`;
      const first = await sendTranscribeRequest(audio, key);
      const second = await sendTranscribeRequest(audio, key);

      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);
      expect(first.json().text).toBe("fixture-transcript");
      expect(second.json().text).toBe("fixture-transcript");
      expect(first.json().requestId).toBe(first.headers["x-request-id"]);
      expect(second.json().requestId).toBe(second.headers["x-request-id"]);
    }

    expect(provider.transcribe).toHaveBeenCalledTimes(fixtureAudios.length);
  });

  it("coalesces high-load duplicate traffic across all fixture audios", async () => {
    provider.transcribe.mockClear();

    const responses = await Promise.all(
      fixtureAudios.flatMap((audio) => {
        const key = `fixture-load-${audio.audioId}`;
        return [
          sendTranscribeRequest(audio, key),
          sendTranscribeRequest(audio, key),
          sendTranscribeRequest(audio, key),
        ];
      }),
    );

    for (const response of responses) {
      expect(response.statusCode).toBe(200);
      expect(response.json().text).toBe("fixture-transcript");
      expect(response.json().requestId).toBe(response.headers["x-request-id"]);
    }

    expect(provider.transcribe).toHaveBeenCalledTimes(fixtureAudios.length);
  });
});
