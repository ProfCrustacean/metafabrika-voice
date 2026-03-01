import { describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/createTestApp.js";
import {
  buildAudioMultipart,
  postTranscribe,
} from "../helpers/transcribeRequest.js";

describe("POST /v1/transcribe auth", () => {
  it("accepts multiple configured client keys", async () => {
    const { app } = await createTestApp();
    const multipart = buildAudioMultipart();

    const response = await postTranscribe({
      app,
      multipart,
      apiKey: "test-api-key-b",
    });

    expect(response.statusCode).toBe(200);

    await app.close();
  });

  it("returns 401 for missing API key", async () => {
    const { app } = await createTestApp();
    const multipart = buildAudioMultipart();

    const response = await postTranscribe({
      app,
      multipart,
      apiKey: null,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("missing_api_key");

    await app.close();
  });

  it("returns 401 for invalid API key", async () => {
    const { app } = await createTestApp();
    const multipart = buildAudioMultipart();

    const response = await postTranscribe({
      app,
      multipart,
      apiKey: "wrong-key",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("invalid_api_key");

    await app.close();
  });
});
