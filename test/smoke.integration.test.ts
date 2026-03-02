import { createServer, IncomingMessage, Server } from "node:http";
import { spawnSync } from "node:child_process";
import { describe, expect, it, beforeAll, afterAll, beforeEach } from "vitest";
import { buildApp } from "../src/app.js";
import { RuntimeConfig } from "../src/types.js";
import { YandexSttProvider } from "../src/providers/YandexSttProvider.js";
import { buildMultipart } from "./helpers/buildMultipart.js";

const RUN_SMOKE_TESTS = process.env.RUN_SMOKE_TESTS === "1";
const describeIfEnabled = RUN_SMOKE_TESTS ? describe : describe.skip;
const SMOKE_SHARED_KEY = "smoke-shared-key";

interface UpstreamRequestRecord {
  url: string;
  authorization: string;
  contentType: string;
  bodyBytes: number;
}

function buildWavSilence(sampleRate: number, seconds: number): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const totalSamples = Math.floor(sampleRate * seconds);
  const dataSize = totalSamples * numChannels * (bitsPerSample / 8);
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);

  const buffer = Buffer.alloc(44 + dataSize);
  let offset = 0;

  buffer.write("RIFF", offset);
  offset += 4;
  buffer.writeUInt32LE(36 + dataSize, offset);
  offset += 4;
  buffer.write("WAVE", offset);
  offset += 4;
  buffer.write("fmt ", offset);
  offset += 4;
  buffer.writeUInt32LE(16, offset);
  offset += 4;
  buffer.writeUInt16LE(1, offset);
  offset += 2;
  buffer.writeUInt16LE(numChannels, offset);
  offset += 2;
  buffer.writeUInt32LE(sampleRate, offset);
  offset += 4;
  buffer.writeUInt32LE(byteRate, offset);
  offset += 4;
  buffer.writeUInt16LE(blockAlign, offset);
  offset += 2;
  buffer.writeUInt16LE(bitsPerSample, offset);
  offset += 2;
  buffer.write("data", offset);
  offset += 4;
  buffer.writeUInt32LE(dataSize, offset);

  return buffer;
}

function convertWavToOggOpus(wavAudio: Buffer): Buffer {
  const result = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "wav",
      "-i",
      "pipe:0",
      "-ac",
      "1",
      "-ar",
      "48000",
      "-c:a",
      "libopus",
      "-f",
      "ogg",
      "pipe:1",
    ],
    { input: wavAudio, maxBuffer: 10 * 1024 * 1024 },
  );

  if (result.status !== 0 || !result.stdout || result.stdout.length === 0) {
    throw new Error("Failed to build OGG Opus smoke fixture.");
  }

  return Buffer.from(result.stdout);
}

async function readBodyBytes(request: IncomingMessage): Promise<number> {
  let bytes = 0;
  for await (const chunk of request) {
    bytes += Buffer.isBuffer(chunk)
      ? chunk.length
      : Buffer.byteLength(String(chunk));
  }
  return bytes;
}

describeIfEnabled("smoke integration (optional)", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let server: Server;
  let endpoint = "";
  let baseConfig: RuntimeConfig;
  const captured: UpstreamRequestRecord[] = [];

  beforeEach(() => {
    captured.length = 0;
  });

  beforeAll(async () => {
    for (const binary of ["ffmpeg", "ffprobe"]) {
      if (spawnSync(binary, ["-version"], { stdio: "ignore" }).status !== 0) {
        throw new Error(
          `Smoke tests require ${binary}. Install ${binary} or run default tests without RUN_SMOKE_TESTS=1.`,
        );
      }
    }

    server = createServer(async (request, response) => {
      const url = request.url || "/";
      const authorization = request.headers.authorization || "";
      const contentType = request.headers["content-type"] || "";
      const bodyBytes = await readBodyBytes(request);

      captured.push({
        url,
        authorization: Array.isArray(authorization)
          ? authorization[0] || ""
          : authorization,
        contentType: Array.isArray(contentType)
          ? contentType[0] || ""
          : contentType,
        bodyBytes,
      });

      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ result: "тестовая команда" }));
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Unable to start local upstream test server.");
    }

    endpoint = `http://127.0.0.1:${address.port}/speech/v1/stt:recognize`;

    const config: RuntimeConfig = {
      port: 8080,
      host: "0.0.0.0",
      trustProxy: false,
      logLevel: "info",
      serviceApiKeys: {
        smoke_showroom: SMOKE_SHARED_KEY,
      },
      adminApiKey: "smoke-admin-key",
      yandexApiKey: "smoke-yandex-key",
      yandexSttTimeoutMs: 10_000,
      maxUploadBytes: 1_048_576,
      yandexSttEndpoint: endpoint,
      ffmpegPath: "ffmpeg",
      ffprobePath: "ffprobe",
      ffmpegTimeoutMs: 10_000,
      maxAudioSeconds: 29,
      rateLimitWindowMs: 60_000,
      rateLimitMaxRequests: 1_000,
      maxInFlightTranscriptions: 10,
    };
    baseConfig = config;

    app = await buildApp({
      config,
      provider: new YandexSttProvider({
        apiKey: config.yandexApiKey,
        endpoint: config.yandexSttEndpoint,
        timeoutMs: config.yandexSttTimeoutMs,
      }),
      logger: false,
    });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });

  it("runs ffmpeg conversion and hits provider contract path", async () => {
    const wavAudio = buildWavSilence(16_000, 1);
    const multipart = buildMultipart([
      {
        name: "audio",
        filename: "smoke.wav",
        contentType: "audio/wav",
        data: wavAudio,
      },
    ]);

    const response = await app.inject({
      method: "POST",
      url: "/v1/transcribe",
      headers: {
        "x-api-key": SMOKE_SHARED_KEY,
        "content-type": multipart.contentType,
      },
      payload: multipart.payload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      text: "тестовая команда",
      requestId: response.headers["x-request-id"],
    });
    expect(captured.length).toBe(1);
    expect(captured[0].url).toContain("/speech/v1/stt:recognize");
    expect(captured[0].url).toContain("lang=ru-RU");
    expect(captured[0].url).toContain("format=oggopus");
    expect(captured[0].authorization).toBe("Api-Key smoke-yandex-key");
    expect(captured[0].contentType).toContain("audio/ogg;codecs=opus");
    expect(captured[0].bodyBytes).toBeGreaterThan(0);
  });

  it("supports fast-path ogg opus without ffmpeg conversion", async () => {
    const bypassApp = await buildApp({
      config: {
        ...baseConfig,
        ffmpegPath: "ffmpeg-not-installed-for-this-test",
      },
      provider: new YandexSttProvider({
        apiKey: baseConfig.yandexApiKey,
        endpoint: baseConfig.yandexSttEndpoint,
        timeoutMs: baseConfig.yandexSttTimeoutMs,
      }),
      logger: false,
    });

    try {
      const multipart = buildMultipart([
        {
          name: "audio",
          filename: "direct.ogg",
          contentType: "audio/ogg; codecs=opus",
          data: convertWavToOggOpus(buildWavSilence(16_000, 1)),
        },
      ]);

      const response = await bypassApp.inject({
        method: "POST",
        url: "/v1/transcribe",
        headers: {
          "x-api-key": SMOKE_SHARED_KEY,
          "content-type": multipart.contentType,
        },
        payload: multipart.payload,
      });
      expect(response.statusCode).toBe(200);
      expect(captured.length).toBe(1);
      expect(captured[0].contentType).toContain("audio/ogg;codecs=opus");
      expect(captured[0].bodyBytes).toBeGreaterThan(0);
    } finally {
      await bypassApp.close();
    }
  });

  it("returns 413 for oversized payload before provider call", async () => {
    const largeWavAudio = buildWavSilence(16_000, 40);
    const multipart = buildMultipart([
      {
        name: "audio",
        filename: "too-large.wav",
        contentType: "audio/wav",
        data: largeWavAudio,
      },
    ]);

    const response = await app.inject({
      method: "POST",
      url: "/v1/transcribe",
      headers: {
        "x-api-key": SMOKE_SHARED_KEY,
        "content-type": multipart.contentType,
      },
      payload: multipart.payload,
    });
    expect(response.statusCode).toBe(413);
    expect(response.json().error.code).toBe("payload_too_large");
    expect(captured.length).toBe(0);
  });

  it("returns 422 for empty audio before provider call", async () => {
    const multipart = buildMultipart([
      {
        name: "audio",
        filename: "empty.webm",
        contentType: "audio/webm",
        data: Buffer.alloc(0),
      },
    ]);

    const response = await app.inject({
      method: "POST",
      url: "/v1/transcribe",
      headers: {
        "x-api-key": SMOKE_SHARED_KEY,
        "content-type": multipart.contentType,
      },
      payload: multipart.payload,
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe("empty_audio");
    expect(captured.length).toBe(0);
  });

  it("returns 422 for corrupted audio before provider call", async () => {
    const multipart = buildMultipart([
      {
        name: "audio",
        filename: "corrupted.webm",
        contentType: "audio/webm",
        data: Buffer.from("not-a-valid-audio-stream"),
      },
    ]);

    const response = await app.inject({
      method: "POST",
      url: "/v1/transcribe",
      headers: {
        "x-api-key": SMOKE_SHARED_KEY,
        "content-type": multipart.contentType,
      },
      payload: multipart.payload,
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe("corrupted_audio");
    expect(captured.length).toBe(0);
  });
});
