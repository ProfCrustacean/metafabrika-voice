import {
  NoSpeechDetectedError,
  UpstreamProviderError,
  UpstreamTimeoutError,
} from "./providerErrors.js";
import {
  SttProvider,
  SttTranscribeInput,
  SttTranscribeResult,
} from "./SttProvider.js";

interface YandexSttProviderOptions {
  apiKey: string;
  endpoint: string;
  timeoutMs: number;
}

interface YandexRecognizeResponse {
  result?: string;
  error_code?: string;
  error_message?: string;
}

export class YandexSttProvider implements SttProvider {
  public readonly name = "yandex";
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly timeoutMs: number;

  constructor(options: YandexSttProviderOptions) {
    this.apiKey = options.apiKey;
    this.endpoint = options.endpoint;
    this.timeoutMs = options.timeoutMs;
  }

  async transcribe(input: SttTranscribeInput): Promise<SttTranscribeResult> {
    const endpoint = new URL(this.endpoint);
    endpoint.searchParams.set("lang", input.language);
    endpoint.searchParams.set("format", input.format);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const body: BodyInit =
        input.audio instanceof ReadableStream
          ? input.audio
          : new Blob([new Uint8Array(input.audio)], {
              type: "audio/ogg;codecs=opus",
            });

      const requestInit: RequestInit & { duplex?: "half" } = {
        method: "POST",
        headers: {
          Authorization: `Api-Key ${this.apiKey}`,
          "Content-Type": "audio/ogg;codecs=opus",
          "X-Request-Id": input.requestId,
        },
        body,
        signal: controller.signal,
      };

      if (body instanceof ReadableStream) {
        requestInit.duplex = "half";
      }

      const response = await fetch(endpoint, requestInit);

      const bodyText = await response.text();
      const parsed = this.parseResponse(bodyText);

      if (!parsed) {
        throw new UpstreamProviderError(
          "Yandex STT returned an invalid response.",
          response.status,
        );
      }

      if (!response.ok) {
        throw new UpstreamProviderError(
          "Yandex STT request failed.",
          response.status,
          {
            providerStatus: response.status,
            providerErrorCode: parsed.error_code,
          },
        );
      }

      if (parsed?.error_code) {
        throw new UpstreamProviderError(
          parsed.error_message || "Yandex returned an API error.",
          response.status,
          {
            providerStatus: response.status,
            providerErrorCode: parsed.error_code,
          },
        );
      }

      const transcript = parsed?.result?.trim() || "";
      if (!transcript) {
        throw new NoSpeechDetectedError();
      }

      return { text: transcript };
    } catch (error) {
      if (
        error instanceof NoSpeechDetectedError ||
        error instanceof UpstreamProviderError
      ) {
        throw error;
      }

      if (error instanceof DOMException && error.name === "AbortError") {
        throw new UpstreamTimeoutError();
      }

      throw new UpstreamProviderError("Failed to reach Yandex STT provider.");
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseResponse(body: string): YandexRecognizeResponse | null {
    if (!body) {
      return null;
    }

    try {
      return JSON.parse(body) as YandexRecognizeResponse;
    } catch {
      return null;
    }
  }
}
