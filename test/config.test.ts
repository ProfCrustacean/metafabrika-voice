import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const MANAGED_ENV_KEYS = [
  "PORT",
  "HOST",
  "TRUST_PROXY",
  "LOG_LEVEL",
  "SERVICE_API_KEY",
  "SERVICE_API_KEYS",
  "ADMIN_API_KEY",
  "YANDEX_API_KEY",
  "YANDEX_STT_TIMEOUT_MS",
  "MAX_UPLOAD_BYTES",
  "YANDEX_STT_ENDPOINT",
  "FFMPEG_PATH",
  "FFPROBE_PATH",
  "FFMPEG_TIMEOUT_MS",
  "MAX_AUDIO_SECONDS",
  "RATE_LIMIT_WINDOW_MS",
  "RATE_LIMIT_MAX_REQUESTS",
  "MAX_IN_FLIGHT_TRANSCRIPTIONS",
];

function applyBaseEnv(extra: Record<string, string> = {}): void {
  for (const key of MANAGED_ENV_KEYS) {
    delete process.env[key];
  }

  Object.assign(process.env, {
    SERVICE_API_KEYS:
      "showroom_a:test-service-key,showroom_b:test-service-key-b",
    ADMIN_API_KEY: "test-admin-key",
    YANDEX_API_KEY: "test-yandex-key",
    ...extra,
  });
}

describe("loadConfig", () => {
  it("parses SERVICE_API_KEYS into per-client map", () => {
    applyBaseEnv();
    const config = loadConfig();
    expect(config.serviceApiKeys).toEqual({
      showroom_a: "test-service-key",
      showroom_b: "test-service-key-b",
    });
    expect(config.adminApiKey).toBe("test-admin-key");
    expect(config.ffprobePath).toBe("ffprobe");
  });

  it("supports legacy SERVICE_API_KEY fallback", () => {
    applyBaseEnv({
      SERVICE_API_KEYS: "",
      SERVICE_API_KEY: "legacy-key",
    });
    const config = loadConfig();
    expect(config.serviceApiKeys).toEqual({ default: "legacy-key" });
  });

  it("rejects malformed SERVICE_API_KEYS entries", () => {
    applyBaseEnv({
      SERVICE_API_KEYS: "broken-entry-without-separator",
    });
    expect(() => loadConfig()).toThrow(/Invalid SERVICE_API_KEYS entry/);
  });

  it("uses default MAX_AUDIO_SECONDS=29 when unset", () => {
    applyBaseEnv();
    const config = loadConfig();
    expect(config.maxAudioSeconds).toBe(29);
  });

  it("accepts MAX_IN_FLIGHT_TRANSCRIPTIONS=0", () => {
    applyBaseEnv({
      MAX_IN_FLIGHT_TRANSCRIPTIONS: "0",
    });

    const config = loadConfig();
    expect(config.maxInFlightTranscriptions).toBe(0);
  });

  it("rejects negative MAX_IN_FLIGHT_TRANSCRIPTIONS", () => {
    applyBaseEnv({
      MAX_IN_FLIGHT_TRANSCRIPTIONS: "-1",
    });

    expect(() => loadConfig()).toThrow(
      /Invalid non-negative number for MAX_IN_FLIGHT_TRANSCRIPTIONS/,
    );
  });

  it("rejects non-positive MAX_AUDIO_SECONDS", () => {
    applyBaseEnv({
      MAX_AUDIO_SECONDS: "0",
    });

    expect(() => loadConfig()).toThrow(
      /Invalid positive number for MAX_AUDIO_SECONDS/,
    );
  });
});
