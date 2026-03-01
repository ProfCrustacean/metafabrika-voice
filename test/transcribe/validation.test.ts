import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../src/types.js";
import { SttProvider } from "../../src/providers/SttProvider.js";
import {
  ProbeDurationSecondsFn,
  TranscodeFn,
} from "../../src/routes/transcribe.js";
import { buildMultipart } from "../helpers/buildMultipart.js";
import {
  buildMockTranscodeResult,
  createTestApp,
} from "../helpers/createTestApp.js";
import {
  buildAudioMultipart,
  postTranscribe,
} from "../helpers/transcribeRequest.js";

describe("POST /v1/transcribe validation", () => {
  it("returns transcribed text for valid audio", async () => {
    const provider = {
      name: "yandex",
      transcribe: vi.fn().mockResolvedValue({ text: "поставь мойку у окна" }),
    } satisfies SttProvider;
    const transcode = vi.fn(async () =>
      buildMockTranscodeResult(),
    ) as TranscodeFn;
    const { app } = await createTestApp({ provider, transcode });

    const multipart = buildAudioMultipart({
      data: Buffer.from("fake-audio"),
    });

    const response = await postTranscribe({
      app,
      multipart,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-request-id"]).toBeTruthy();
    expect(response.json()).toEqual({
      text: "поставь мойку у окна",
    });
    expect(response.json()).not.toHaveProperty("language");
    expect(response.json()).not.toHaveProperty("provider");
    expect(response.json()).not.toHaveProperty("requestId");
    expect(transcode).toHaveBeenCalledTimes(1);
    expect(provider.transcribe).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it("bypasses transcode for audio/ogg with opus codec", async () => {
    const provider = {
      name: "yandex",
      transcribe: vi.fn().mockResolvedValue({ text: "прямая обработка" }),
    } satisfies SttProvider;
    const transcode = vi.fn(async () =>
      buildMockTranscodeResult(),
    ) as TranscodeFn;
    const { app } = await createTestApp({ provider, transcode });

    const multipart = buildAudioMultipart({
      filename: "voice.ogg",
      contentType: "audio/ogg; codecs=opus",
      data: Buffer.concat([
        Buffer.from("OggS"),
        Buffer.alloc(24),
        Buffer.from("OpusHead"),
        Buffer.alloc(16),
      ]),
    });

    const response = await postTranscribe({
      app,
      multipart,
    });

    expect(response.statusCode).toBe(200);
    expect(transcode).not.toHaveBeenCalled();
    expect(provider.transcribe).toHaveBeenCalledTimes(1);
    expect(provider.transcribe).toHaveBeenCalledWith(
      expect.objectContaining({
        format: "oggopus",
        audio: expect.any(Uint8Array),
      }),
    );

    await app.close();
  });

  it("keeps transcode path for audio/ogg without explicit opus codec", async () => {
    const provider = {
      name: "yandex",
      transcribe: vi.fn().mockResolvedValue({ text: "через ffmpeg" }),
    } satisfies SttProvider;
    const transcode = vi.fn(async () =>
      buildMockTranscodeResult(),
    ) as TranscodeFn;
    const { app } = await createTestApp({ provider, transcode });

    const multipart = buildAudioMultipart({
      filename: "voice.ogg",
      contentType: "audio/ogg",
      data: Buffer.from("ogg-without-codecs-parameter"),
    });

    const response = await postTranscribe({
      app,
      multipart,
    });

    expect(response.statusCode).toBe(200);
    expect(transcode).toHaveBeenCalledTimes(1);
    expect(provider.transcribe).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it("returns 400 when audio file is missing", async () => {
    const { app } = await createTestApp();
    const multipart = buildMultipart([
      { name: "note", data: "no file included" },
    ]);

    const response = await postTranscribe({
      app,
      multipart,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("missing_file");

    await app.close();
  });

  it("returns 422 when audio file is empty", async () => {
    const { app } = await createTestApp();
    const multipart = buildAudioMultipart({
      data: Buffer.alloc(0),
    });

    const response = await postTranscribe({
      app,
      multipart,
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe("empty_audio");

    await app.close();
  });

  it("returns 415 for unsupported format", async () => {
    const { app } = await createTestApp();
    const multipart = buildAudioMultipart({
      filename: "manual.pdf",
      contentType: "application/pdf",
      data: Buffer.from("%PDF"),
    });

    const response = await postTranscribe({
      app,
      multipart,
    });

    expect(response.statusCode).toBe(415);
    expect(response.json().error.code).toBe("unsupported_format");

    await app.close();
  });

  it("returns 422 for corrupted audio", async () => {
    const transcode = vi.fn(async () => {
      throw new AppError("corrupted_audio", 422, "Corrupted audio.");
    }) as TranscodeFn;
    const { app } = await createTestApp({ transcode });
    const multipart = buildAudioMultipart({
      data: Buffer.from("not-really-audio"),
    });

    const response = await postTranscribe({
      app,
      multipart,
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe("corrupted_audio");

    await app.close();
  });

  it("returns 422 when audio duration exceeds maxAudioSeconds", async () => {
    const provider = {
      name: "yandex",
      transcribe: vi.fn().mockResolvedValue({ text: "не должно вызываться" }),
    } satisfies SttProvider;
    const transcode = vi.fn(async () =>
      buildMockTranscodeResult(),
    ) as TranscodeFn;
    const probeDurationSeconds = vi
      .fn()
      .mockResolvedValue(29.1) as ProbeDurationSecondsFn;
    const { app } = await createTestApp({
      provider,
      transcode,
      probeDurationSeconds,
      config: { maxAudioSeconds: 29 },
    });
    const multipart = buildAudioMultipart({
      data: Buffer.from("fake-audio"),
    });

    const response = await postTranscribe({
      app,
      multipart,
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe("audio_too_long");
    expect(provider.transcribe).not.toHaveBeenCalled();
    expect(transcode).not.toHaveBeenCalled();

    await app.close();
  });

  it("accepts audio when duration equals maxAudioSeconds", async () => {
    const provider = {
      name: "yandex",
      transcribe: vi.fn().mockResolvedValue({ text: "допустимая длина" }),
    } satisfies SttProvider;
    const probeDurationSeconds = vi
      .fn()
      .mockResolvedValue(29) as ProbeDurationSecondsFn;
    const { app } = await createTestApp({
      provider,
      probeDurationSeconds,
      config: { maxAudioSeconds: 29 },
    });
    const multipart = buildAudioMultipart({
      data: Buffer.from("fake-audio"),
    });

    const response = await postTranscribe({
      app,
      multipart,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ text: "допустимая длина" });
    expect(provider.transcribe).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it("returns 413 for oversized upload", async () => {
    const { app } = await createTestApp({
      config: {
        maxUploadBytes: 8,
      },
    });
    const multipart = buildAudioMultipart({
      data: Buffer.from("this-payload-is-too-large"),
    });

    const response = await postTranscribe({
      app,
      multipart,
    });

    expect(response.statusCode).toBe(413);
    expect(response.json().error.code).toBe("payload_too_large");

    await app.close();
  });

  it("returns 400 for malformed request body", async () => {
    const { app } = await createTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/v1/transcribe",
      headers: {
        "x-api-key": "test-api-key",
        "content-type": "application/json",
      },
      payload: JSON.stringify({ audio: "base64-not-supported" }),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("malformed_request");

    await app.close();
  });
});
