import { FastifyInstance, FastifyRequest } from "fastify";
import { ApiKeyRegistry } from "../auth/apiKeyRegistry.js";
import { ApiUsageMetrics } from "../metrics/apiUsageMetrics.js";
import { AppError } from "../types.js";

interface RegisterAdminRoutesOptions {
  adminApiKey?: string;
  apiKeyRegistry: ApiKeyRegistry;
  apiUsageMetrics: ApiUsageMetrics;
}

function readHeader(
  value: string | string[] | undefined,
  headerName: string,
): string {
  if (!value) {
    throw new AppError("missing_api_key", 401, `Missing ${headerName} header.`);
  }

  if (typeof value === "string") {
    return value.trim();
  }

  return value[0]?.trim() || "";
}

function adminAuth(expectedAdminKey: string) {
  return async function verifyAdminKey(request: FastifyRequest): Promise<void> {
    const provided = readHeader(
      request.headers["x-admin-api-key"],
      "X-Admin-API-Key",
    );
    if (!provided) {
      throw new AppError(
        "missing_api_key",
        401,
        "Missing X-Admin-API-Key header.",
      );
    }

    if (provided !== expectedAdminKey) {
      throw new AppError("invalid_api_key", 401, "Invalid admin API key.");
    }
  };
}

export async function registerAdminRoutes(
  app: FastifyInstance,
  options: RegisterAdminRoutesOptions,
): Promise<void> {
  if (!options.adminApiKey) {
    return;
  }

  const preHandler = adminAuth(options.adminApiKey);

  app.get("/admin/metrics", { preHandler }, async () => {
    return options.apiUsageMetrics.snapshot(
      options.apiKeyRegistry.listClients(),
    );
  });

  app.get("/admin/keys", { preHandler }, async () => {
    return { clients: options.apiKeyRegistry.listClients() };
  });

  app.post<{ Params: { clientId: string } }>(
    "/admin/keys/:clientId/revoke",
    { preHandler },
    async (request) => {
      const { clientId } = request.params;
      if (!options.apiKeyRegistry.revoke(clientId)) {
        throw new AppError("not_found", 404, "Unknown clientId.");
      }

      return { clientId, enabled: false };
    },
  );

  app.post<{ Params: { clientId: string } }>(
    "/admin/keys/:clientId/restore",
    { preHandler },
    async (request) => {
      const { clientId } = request.params;
      if (!options.apiKeyRegistry.restore(clientId)) {
        throw new AppError("not_found", 404, "Unknown clientId.");
      }

      return { clientId, enabled: true };
    },
  );
}
