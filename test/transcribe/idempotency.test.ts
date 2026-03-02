import { describe, expect, it, vi } from "vitest";
import { SttProvider } from "../../src/providers/SttProvider.js";
import {
  NoSpeechDetectedError,
  UpstreamTimeoutError,
} from "../../src/providers/providerErrors.js";
import { createTestApp } from "../helpers/createTestApp.js";
import {
  buildAudioMultipart,
  postTranscribe,
} from "../helpers/transcribeRequest.js";

describe("POST /v1/transcribe idempotency", () => {
  it("replays successful result for same key and same payload", async () => {
    const provider = {
      name: "yandex",
      transcribe: vi.fn().mockResolvedValue({ text: "повтори результат" }),
    } satisfies SttProvider;
    const { app } = await createTestApp({ provider });
    const multipart = buildAudioMultipart({
      data: Buffer.from("same-audio"),
    });

    const first = await postTranscribe({
      app,
      multipart,
      headers: { "idempotency-key": "k-replay" },
    });
    const second = await postTranscribe({
      app,
      multipart,
      headers: { "idempotency-key": "k-replay" },
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(provider.transcribe).toHaveBeenCalledTimes(1);
    expect(first.json().text).toBe("повтори результат");
    expect(second.json().text).toBe("повтори результат");
    expect(first.json().requestId).toBe(first.headers["x-request-id"]);
    expect(second.json().requestId).toBe(second.headers["x-request-id"]);

    await app.close();
  });

  it("coalesces in-flight duplicates for same key and payload", async () => {
    const provider = {
      name: "yandex",
      transcribe: vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        return { text: "одна обработка" };
      }),
    } satisfies SttProvider;
    const { app } = await createTestApp({ provider });
    const multipart = buildAudioMultipart({
      data: Buffer.from("parallel-audio"),
    });

    const [first, second] = await Promise.all([
      postTranscribe({
        app,
        multipart,
        headers: { "idempotency-key": "k-parallel" },
      }),
      postTranscribe({
        app,
        multipart,
        headers: { "idempotency-key": "k-parallel" },
      }),
    ]);

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(provider.transcribe).toHaveBeenCalledTimes(1);
    expect(first.json().text).toBe("одна обработка");
    expect(second.json().text).toBe("одна обработка");

    await app.close();
  });

  it("returns conflict for same key with different payload", async () => {
    const { app } = await createTestApp();

    const first = await postTranscribe({
      app,
      multipart: buildAudioMultipart({ data: Buffer.from("audio-a") }),
      headers: { "idempotency-key": "k-conflict" },
    });
    const second = await postTranscribe({
      app,
      multipart: buildAudioMultipart({ data: Buffer.from("audio-b") }),
      headers: { "idempotency-key": "k-conflict" },
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(409);
    expect(second.json().error).toMatchObject({
      code: "idempotency_conflict",
      retryable: false,
    });

    await app.close();
  });

  it("reprocesses same key after retryable error", async () => {
    const provider = {
      name: "yandex",
      transcribe: vi
        .fn()
        .mockRejectedValueOnce(new UpstreamTimeoutError())
        .mockResolvedValueOnce({ text: "после ретрая" }),
    } satisfies SttProvider;
    const { app } = await createTestApp({ provider });
    const multipart = buildAudioMultipart({
      data: Buffer.from("retryable-audio"),
    });

    const first = await postTranscribe({
      app,
      multipart,
      headers: { "idempotency-key": "k-retryable" },
    });
    const second = await postTranscribe({
      app,
      multipart,
      headers: { "idempotency-key": "k-retryable" },
    });

    expect(first.statusCode).toBe(504);
    expect(first.json().error).toMatchObject({
      code: "upstream_timeout",
      retryable: true,
      retryAfterSeconds: 2,
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().text).toBe("после ретрая");
    expect(provider.transcribe).toHaveBeenCalledTimes(2);

    await app.close();
  });

  it("does not cache cheap validation errors", async () => {
    const provider = {
      name: "yandex",
      transcribe: vi.fn().mockResolvedValue({ text: "после исправления" }),
    } satisfies SttProvider;
    const { app } = await createTestApp({ provider });
    const badMultipart = buildAudioMultipart({
      filename: "manual.pdf",
      contentType: "application/pdf",
      data: Buffer.from("%PDF-fake-content"),
    });
    const fixedMultipart = buildAudioMultipart({
      data: Buffer.from("valid-audio"),
    });

    const first = await postTranscribe({
      app,
      multipart: badMultipart,
      headers: { "idempotency-key": "k-unsupported" },
    });
    const second = await postTranscribe({
      app,
      multipart: fixedMultipart,
      headers: { "idempotency-key": "k-unsupported" },
    });

    expect(first.statusCode).toBe(415);
    expect(second.statusCode).toBe(200);
    expect(first.json().error).toMatchObject({
      code: "unsupported_format",
      retryable: false,
    });
    expect(second.json().text).toBe("после исправления");
    expect(provider.transcribe).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it("replays expensive non-retryable provider errors", async () => {
    const provider = {
      name: "yandex",
      transcribe: vi.fn(async () => {
        throw new NoSpeechDetectedError();
      }),
    } satisfies SttProvider;
    const { app } = await createTestApp({ provider });
    const multipart = buildAudioMultipart({
      data: Buffer.from("speech-like-audio"),
    });

    const first = await postTranscribe({
      app,
      multipart,
      headers: { "idempotency-key": "k-nospeech" },
    });
    const second = await postTranscribe({
      app,
      multipart,
      headers: { "idempotency-key": "k-nospeech" },
    });

    expect(first.statusCode).toBe(422);
    expect(second.statusCode).toBe(422);
    expect(first.json().error.code).toBe("no_speech_detected");
    expect(second.json().error.code).toBe("no_speech_detected");
    expect(provider.transcribe).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it("reprocesses when replay cache TTL expires", async () => {
    const provider = {
      name: "yandex",
      transcribe: vi
        .fn()
        .mockResolvedValueOnce({ text: "первый ответ" })
        .mockResolvedValueOnce({ text: "второй ответ" }),
    } satisfies SttProvider;
    const { app } = await createTestApp({ provider, idempotencyTtlMs: 30 });
    const multipart = buildAudioMultipart({
      data: Buffer.from("ttl-audio"),
    });

    const first = await postTranscribe({
      app,
      multipart,
      headers: { "idempotency-key": "k-ttl" },
    });
    await new Promise((resolve) => setTimeout(resolve, 60));
    const second = await postTranscribe({
      app,
      multipart,
      headers: { "idempotency-key": "k-ttl" },
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(first.json().text).toBe("первый ответ");
    expect(second.json().text).toBe("второй ответ");
    expect(provider.transcribe).toHaveBeenCalledTimes(2);

    await app.close();
  });
});
