import { describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/createTestApp.js";
import {
  buildAudioMultipart,
  postTranscribe,
} from "../helpers/transcribeRequest.js";

function adminHeaders(adminApiKey = "test-admin-key") {
  return { "x-admin-api-key": adminApiKey };
}

describe("admin key controls and metrics", () => {
  it("tracks usage metrics per client key", async () => {
    const { app } = await createTestApp();
    const multipart = buildAudioMultipart();

    const a = await postTranscribe({
      app,
      multipart,
      apiKey: "test-api-key",
    });
    const b = await postTranscribe({
      app,
      multipart,
      apiKey: "test-api-key-b",
    });

    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);

    const metricsResponse = await app.inject({
      method: "GET",
      url: "/admin/metrics",
      headers: adminHeaders(),
    });

    expect(metricsResponse.statusCode).toBe(200);
    const metrics = metricsResponse.json() as {
      totals: { requests: number };
      clients: Array<{
        clientId: string;
        requests: number;
        successes: number;
      }>;
    };
    expect(metrics.totals.requests).toBe(2);

    const byClient = new Map<string, (typeof metrics.clients)[number]>(
      metrics.clients.map((entry) => [entry.clientId, entry]),
    );

    expect(byClient.get("showroom_a")?.requests).toBe(1);
    expect(byClient.get("showroom_a")?.successes).toBe(1);
    expect(byClient.get("showroom_b")?.requests).toBe(1);
    expect(byClient.get("showroom_b")?.successes).toBe(1);

    await app.close();
  });

  it("can revoke and restore a single client key", async () => {
    const { app } = await createTestApp();
    const multipart = buildAudioMultipart();

    const revokeResponse = await app.inject({
      method: "POST",
      url: "/admin/keys/showroom_a/revoke",
      headers: adminHeaders(),
    });
    expect(revokeResponse.statusCode).toBe(200);
    expect(revokeResponse.json()).toEqual({
      clientId: "showroom_a",
      enabled: false,
    });

    const blocked = await postTranscribe({
      app,
      multipart,
      apiKey: "test-api-key",
    });
    expect(blocked.statusCode).toBe(401);
    expect(blocked.json().error.code).toBe("invalid_api_key");

    const stillAllowed = await postTranscribe({
      app,
      multipart,
      apiKey: "test-api-key-b",
    });
    expect(stillAllowed.statusCode).toBe(200);

    const restoreResponse = await app.inject({
      method: "POST",
      url: "/admin/keys/showroom_a/restore",
      headers: adminHeaders(),
    });
    expect(restoreResponse.statusCode).toBe(200);
    expect(restoreResponse.json()).toEqual({
      clientId: "showroom_a",
      enabled: true,
    });

    const allowedAgain = await postTranscribe({
      app,
      multipart,
      apiKey: "test-api-key",
    });
    expect(allowedAgain.statusCode).toBe(200);

    await app.close();
  });

  it("requires admin key for admin endpoints", async () => {
    const { app } = await createTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/admin/metrics",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("missing_api_key");

    await app.close();
  });

  it("returns 404 for unknown client revoke target", async () => {
    const { app } = await createTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/admin/keys/unknown-showroom/revoke",
      headers: adminHeaders(),
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("not_found");

    await app.close();
  });
});
