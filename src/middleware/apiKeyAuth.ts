import { FastifyRequest } from "fastify";
import { ApiKeyRegistry } from "../auth/apiKeyRegistry.js";
import { AppError } from "../types.js";

function readApiKey(value: string | string[] | undefined): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  if (!value.length) {
    return null;
  }

  return value[0];
}

export function apiKeyAuth(apiKeyRegistry: ApiKeyRegistry) {
  return async function verifyApiKey(request: FastifyRequest): Promise<void> {
    const rawKey = readApiKey(request.headers["x-api-key"]);

    if (!rawKey || !rawKey.trim()) {
      throw new AppError("missing_api_key", 401, "Missing X-API-Key header.");
    }

    const authResult = apiKeyRegistry.authenticate(rawKey);
    if (!authResult.ok) {
      throw new AppError(
        "invalid_api_key",
        401,
        "Invalid or disabled API key.",
      );
    }

    request.apiClientId = authResult.clientId;
  };
}
