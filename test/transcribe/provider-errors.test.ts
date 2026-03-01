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
    expect(response.json().error.code).toBe("upstream_timeout");

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
    expect(response.json().error.code).toBe("upstream_error");

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
    expect(response.json().error.code).toBe("no_speech_detected");

    await app.close();
  });
});
