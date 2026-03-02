import { describe, expect, it, vi } from "vitest";
import { SttProvider } from "../../src/providers/SttProvider.js";
import {
  NoSpeechDetectedError,
  UpstreamProviderError,
  UpstreamTimeoutError,
} from "../../src/providers/providerErrors.js";
import { createTestApp } from "../helpers/createTestApp.js";
import {
  buildAudioMultipart,
  postTranscribe,
} from "../helpers/transcribeRequest.js";

describe("POST /v1/transcribe provider errors", () => {
  it("returns 504 when provider times out", async () => {
    const provider = {
      name: "yandex",
      transcribe: vi.fn(async () => {
        throw new UpstreamTimeoutError();
      }),
    } satisfies SttProvider;
    const { app } = await createTestApp({ provider });
    const multipart = buildAudioMultipart();

    const response = await postTranscribe({
      app,
      multipart,
    });

    expect(response.statusCode).toBe(504);
    expect(response.headers["retry-after"]).toBe("2");
    expect(response.json().error).toMatchObject({
      code: "upstream_timeout",
      retryable: true,
      retryAfterSeconds: 2,
    });

    await app.close();
  });

  it("returns 502 when provider fails", async () => {
    const provider = {
      name: "yandex",
      transcribe: vi.fn(async () => {
        throw new UpstreamProviderError("Provider failure");
      }),
    } satisfies SttProvider;
    const { app } = await createTestApp({ provider });
    const multipart = buildAudioMultipart();

    const response = await postTranscribe({
      app,
      multipart,
    });

    expect(response.statusCode).toBe(502);
    expect(response.headers["retry-after"]).toBe("2");
    expect(response.json().error).toMatchObject({
      code: "upstream_error",
      retryable: true,
      retryAfterSeconds: 2,
    });

    await app.close();
  });

  it("marks upstream_error as non-retryable for provider 4xx", async () => {
    const provider = {
      name: "yandex",
      transcribe: vi.fn(async () => {
        throw new UpstreamProviderError("Bad upstream request", 400, {
          providerStatus: 400,
          providerErrorCode: "bad_request",
        });
      }),
    } satisfies SttProvider;
    const { app } = await createTestApp({ provider });
    const multipart = buildAudioMultipart();

    const response = await postTranscribe({
      app,
      multipart,
    });

    expect(response.statusCode).toBe(502);
    expect(response.headers["retry-after"]).toBeUndefined();
    expect(response.json().error).toMatchObject({
      code: "upstream_error",
      retryable: false,
    });
    expect(response.json().error).not.toHaveProperty("retryAfterSeconds");

    await app.close();
  });

  it("returns 422 when no speech is detected", async () => {
    const provider = {
      name: "yandex",
      transcribe: vi.fn(async () => {
        throw new NoSpeechDetectedError();
      }),
    } satisfies SttProvider;
    const { app } = await createTestApp({ provider });
    const multipart = buildAudioMultipart();

    const response = await postTranscribe({
      app,
      multipart,
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().error).toMatchObject({
      code: "no_speech_detected",
      retryable: false,
    });

    await app.close();
  });
});
