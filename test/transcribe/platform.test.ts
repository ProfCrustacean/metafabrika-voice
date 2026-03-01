import { describe, expect, it, vi } from "vitest";
import { TranscodeFn } from "../../src/routes/transcribe.js";
import {
  buildMockTranscodeResult,
  createTestApp,
} from "../helpers/createTestApp.js";
import {
  buildAudioMultipart,
  postTranscribe,
} from "../helpers/transcribeRequest.js";

describe("POST /v1/transcribe platform behavior", () => {
  it("returns 429 when request rate limit is exceeded (ignores spoofed x-forwarded-for)", async () => {
    const { app } = await createTestApp({
      config: {
        rateLimitMaxRequests: 1,
        rateLimitWindowMs: 60_000,
      },
    });
    const multipart = buildAudioMultipart();

    const first = await postTranscribe({
      app,
      multipart,
      headers: {
        "x-forwarded-for": "203.0.113.10",
      },
    });
    expect(first.statusCode).toBe(200);

    const second = await postTranscribe({
      app,
      multipart,
      headers: {
        // Header changes should not bypass limits.
        "x-forwarded-for": "198.51.100.23",
      },
    });

    expect(second.statusCode).toBe(429);
    expect(second.json().error.code).toBe("rate_limited");
    expect(second.headers["retry-after"]).toBeTruthy();

    await app.close();
  });

  it("uses forwarded client IP only when trustProxy is enabled", async () => {
    const { app } = await createTestApp({
      config: {
        trustProxy: true,
        rateLimitMaxRequests: 1,
        rateLimitWindowMs: 60_000,
      },
    });
    const multipart = buildAudioMultipart();

    const first = await postTranscribe({
      app,
      multipart,
      headers: {
        "x-forwarded-for": "203.0.113.10",
      },
    });
    expect(first.statusCode).toBe(200);

    const second = await postTranscribe({
      app,
      multipart,
      headers: {
        "x-forwarded-for": "198.51.100.23",
      },
    });
    expect(second.statusCode).toBe(200);

    const third = await postTranscribe({
      app,
      multipart,
      headers: {
        "x-forwarded-for": "203.0.113.10",
      },
    });
    expect(third.statusCode).toBe(429);
    expect(third.json().error.code).toBe("rate_limited");

    await app.close();
  });

  it("returns 503 when transcription concurrency limit is exceeded", async () => {
    const transcode = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
      return buildMockTranscodeResult();
    }) as TranscodeFn;
    const { app } = await createTestApp({
      config: {
        maxInFlightTranscriptions: 1,
      },
      transcode,
    });
    const multipart = buildAudioMultipart();

    const firstRequest = postTranscribe({
      app,
      multipart,
    });

    await new Promise((resolve) => setTimeout(resolve, 5));

    const secondResponse = await postTranscribe({
      app,
      multipart,
    });

    expect(secondResponse.statusCode).toBe(503);
    expect(secondResponse.json().error.code).toBe("service_busy");

    await firstRequest;
    await app.close();
  });

  it("disables concurrency cap when maxInFlightTranscriptions is set to 0", async () => {
    const transcode = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return buildMockTranscodeResult();
    }) as TranscodeFn;
    const { app } = await createTestApp({
      config: {
        maxInFlightTranscriptions: 0,
      },
      transcode,
    });
    const multipart = buildAudioMultipart();

    const responses = await Promise.all([
      postTranscribe({ app, multipart }),
      postTranscribe({ app, multipart }),
      postTranscribe({ app, multipart }),
    ]);

    expect(responses.map((response) => response.statusCode)).toEqual([
      200, 200, 200,
    ]);
    expect(transcode).toHaveBeenCalledTimes(3);

    await app.close();
  });

  it("handles CORS preflight for browser clients", async () => {
    const { app } = await createTestApp();

    const response = await app.inject({
      method: "OPTIONS",
      url: "/v1/transcribe",
      headers: {
        origin: "https://app.example.com",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type,x-api-key",
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("*");
    expect(response.headers["access-control-allow-headers"]).toContain(
      "X-API-Key",
    );

    await app.close();
  });

  it("returns ready when ffmpeg dependency check passes", async () => {
    const { app } = await createTestApp({
      readinessCheck: async () => ({ ok: true }),
    });

    const response = await app.inject({
      method: "GET",
      url: "/ready",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "ready",
      checks: { ffmpeg: "ok" },
    });

    await app.close();
  });

  it("returns not_ready when ffmpeg dependency check fails", async () => {
    const { app } = await createTestApp({
      readinessCheck: async () => ({
        ok: false,
        message: "ffmpeg binary not found",
      }),
    });

    const response = await app.inject({
      method: "GET",
      url: "/ready",
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      status: "not_ready",
      checks: { ffmpeg: "error" },
      details: { ffmpeg: "ffmpeg binary not found" },
    });

    await app.close();
  });
});
