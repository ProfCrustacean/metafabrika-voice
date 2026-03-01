import { afterEach, describe, expect, it, vi } from "vitest";
import { YandexSttProvider } from "../src/providers/YandexSttProvider.js";
import {
  NoSpeechDetectedError,
  UpstreamProviderError,
  UpstreamTimeoutError,
} from "../src/providers/providerErrors.js";

const INPUT = {
  audio: Buffer.from("ogg-audio"),
  format: "oggopus" as const,
  language: "ru-RU",
  requestId: "req_test",
};

describe("YandexSttProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns transcript text on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ result: "поставь мойку у окна" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new YandexSttProvider({
      apiKey: "test-yandex-key",
      endpoint: "https://example.test/stt",
      timeoutMs: 5_000,
    });

    const result = await provider.transcribe(INPUT);

    expect(result.text).toBe("поставь мойку у окна");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, config] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("lang=ru-RU");
    expect(String(url)).toContain("format=oggopus");
    expect(config.headers.Authorization).toBe("Api-Key test-yandex-key");
  });

  it("throws NoSpeechDetectedError for empty transcript", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ result: "" }), { status: 200 }),
        ),
    );

    const provider = new YandexSttProvider({
      apiKey: "test-yandex-key",
      endpoint: "https://example.test/stt",
      timeoutMs: 5_000,
    });

    await expect(provider.transcribe(INPUT)).rejects.toBeInstanceOf(
      NoSpeechDetectedError,
    );
  });

  it("throws UpstreamProviderError for non-200 responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error_code: "bad_request" }), {
          status: 500,
        }),
      ),
    );

    const provider = new YandexSttProvider({
      apiKey: "test-yandex-key",
      endpoint: "https://example.test/stt",
      timeoutMs: 5_000,
    });

    await expect(provider.transcribe(INPUT)).rejects.toMatchObject({
      name: "UpstreamProviderError",
      details: {
        providerStatus: 500,
        providerErrorCode: "bad_request",
      },
    });
  });

  it("throws UpstreamProviderError when response payload is invalid", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("not-json", { status: 200 })),
    );

    const provider = new YandexSttProvider({
      apiKey: "test-yandex-key",
      endpoint: "https://example.test/stt",
      timeoutMs: 5_000,
    });

    await expect(provider.transcribe(INPUT)).rejects.toBeInstanceOf(
      UpstreamProviderError,
    );
  });

  it("throws UpstreamTimeoutError when fetch aborts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("Aborted", "AbortError")),
    );

    const provider = new YandexSttProvider({
      apiKey: "test-yandex-key",
      endpoint: "https://example.test/stt",
      timeoutMs: 1,
    });

    await expect(provider.transcribe(INPUT)).rejects.toBeInstanceOf(
      UpstreamTimeoutError,
    );
  });
});
