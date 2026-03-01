import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { RuntimeConfig } from "./types.js";
import { registerErrorHandler } from "./middleware/errorHandler.js";
import {
  ProbeDurationSecondsFn,
  registerTranscribeRoute,
  TranscodeFn,
} from "./routes/transcribe.js";
import { SttProvider } from "./providers/SttProvider.js";
import { buildRequestId } from "./utils/requestId.js";
import { createIpRateLimitGuard } from "./middleware/rateLimit.js";
import {
  createFfmpegReadinessCheck,
  FfmpegReadinessResult,
} from "./utils/ffmpegReadiness.js";
import { buildLoggerOptions } from "./utils/loggerConfig.js";
import { ApiKeyRegistry } from "./auth/apiKeyRegistry.js";
import { ApiUsageMetrics } from "./metrics/apiUsageMetrics.js";
import { registerAdminRoutes } from "./routes/admin.js";

interface BuildAppOptions {
  config: RuntimeConfig;
  provider: SttProvider;
  transcode?: TranscodeFn;
  probeDurationSeconds?: ProbeDurationSecondsFn;
  readinessCheck?: () => Promise<FfmpegReadinessResult>;
  logger?: boolean;
}

export async function buildApp(options: BuildAppOptions) {
  const apiKeyRegistry = new ApiKeyRegistry(options.config.serviceApiKeys);
  const apiUsageMetrics = new ApiUsageMetrics();
  const readinessCheck =
    options.readinessCheck ||
    createFfmpegReadinessCheck(
      options.config.ffmpegPath,
      options.config.ffprobePath,
      options.config.ffmpegTimeoutMs,
    );

  const app = Fastify({
    logger: options.logger
      ? buildLoggerOptions(options.config.logLevel)
      : false,
    disableRequestLogging: true,
    trustProxy: options.config.trustProxy,
    genReqId: (req) => buildRequestId(req.headers["x-request-id"]),
  });

  await app.register(cors, {
    origin: "*",
    methods: ["POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-API-Key"],
  });

  await app.register(multipart, {
    limits: {
      files: 1,
      fileSize: options.config.maxUploadBytes,
    },
  });

  app.addHook(
    "onRequest",
    createIpRateLimitGuard({
      windowMs: options.config.rateLimitWindowMs,
      maxRequests: options.config.rateLimitMaxRequests,
    }),
  );

  app.addHook("onRequest", async (request) => {
    if (request.url === "/v1/transcribe") {
      request.startedAtNs = process.hrtime.bigint();
    }
  });

  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("x-request-id", request.id);

    if (request.url === "/v1/transcribe" && request.apiClientId) {
      const startedAtNs = request.startedAtNs;
      const elapsedMs =
        startedAtNs !== undefined
          ? Number(process.hrtime.bigint() - startedAtNs) / 1_000_000
          : 0;

      apiUsageMetrics.record(request.apiClientId, reply.statusCode, elapsedMs);
    }

    return payload;
  });

  app.addHook("onResponse", async (request, reply) => {
    if (request.url !== "/v1/transcribe") {
      return;
    }

    const startedAtNs = request.startedAtNs;
    const latencyMs =
      startedAtNs !== undefined
        ? Number(process.hrtime.bigint() - startedAtNs) / 1_000_000
        : 0;

    const logPayload = {
      requestId: request.id,
      clientId: request.apiClientId || "unknown",
      statusCode: reply.statusCode,
      latencyMs: Number(latencyMs.toFixed(2)),
      ...(request.appErrorCode ? { errorCode: request.appErrorCode } : {}),
    };

    if (reply.statusCode >= 500) {
      app.log.error(logPayload, "Transcribe request failed");
      return;
    }

    if (reply.statusCode >= 400) {
      app.log.warn(logPayload, "Transcribe request rejected");
      return;
    }

    app.log.info(logPayload, "Transcribe request completed");
  });

  registerErrorHandler(app);

  await registerTranscribeRoute(app, {
    provider: options.provider,
    apiKeyRegistry,
    ffmpegPath: options.config.ffmpegPath,
    ffprobePath: options.config.ffprobePath,
    ffmpegTimeoutMs: options.config.ffmpegTimeoutMs,
    maxAudioSeconds: options.config.maxAudioSeconds,
    maxInFlightTranscriptions: options.config.maxInFlightTranscriptions,
    transcode: options.transcode,
    probeDurationSeconds: options.probeDurationSeconds,
  });

  await registerAdminRoutes(app, {
    adminApiKey: options.config.adminApiKey,
    apiKeyRegistry,
    apiUsageMetrics,
  });

  app.options("/v1/transcribe", async (_request, reply) => {
    reply.status(204).send();
  });
  app.get("/health", async () => ({ status: "ok" }));
  app.get("/ready", async (_request, reply) => {
    const dependencies = await readinessCheck();
    const checks = {
      ffmpeg: dependencies.ffmpeg.ok ? "ok" : "error",
      ffprobe: dependencies.ffprobe.ok ? "ok" : "error",
    };
    if (!dependencies.ok) {
      const details: Record<string, string> = {};
      if (!dependencies.ffmpeg.ok) {
        details.ffmpeg = dependencies.ffmpeg.message || "ffmpeg check failed";
      }
      if (!dependencies.ffprobe.ok) {
        details.ffprobe =
          dependencies.ffprobe.message || "ffprobe check failed";
      }
      reply.status(503).send({ status: "not_ready", checks, details });
      return;
    }
    reply.status(200).send({ status: "ready", checks });
  });

  return app;
}
