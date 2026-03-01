import {
  FastifyBaseLogger,
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import { AppError, ErrorResponseBody } from "../types.js";

interface RawErrorShape {
  code?: string;
  statusCode?: number;
  message?: string;
}

function extractErrorShape(error: unknown): RawErrorShape {
  if (typeof error !== "object" || error === null) {
    return {};
  }
  return error as RawErrorShape;
}

function mapToAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  const { code, statusCode, message } = extractErrorShape(error);
  const normalizedMessage = (message || "").toLowerCase();

  if (
    statusCode === 413 ||
    normalizedMessage.includes("too large") ||
    normalizedMessage.includes("content length exceeded") ||
    code === "FST_REQ_FILE_TOO_LARGE" ||
    code === "FST_FILES_LIMIT" ||
    code === "FST_PARTS_LIMIT" ||
    code === "FST_FIELDS_LIMIT"
  ) {
    return new AppError(
      "payload_too_large",
      413,
      "Uploaded payload exceeds size limits.",
    );
  }

  if (
    (statusCode === 400 &&
      (normalizedMessage.includes("multipart") ||
        normalizedMessage.includes("form-data") ||
        normalizedMessage.includes("boundary"))) ||
    code === "FST_INVALID_MULTIPART_CONTENT_TYPE" ||
    (typeof code === "string" && code.startsWith("FST_MULTIPART"))
  ) {
    return new AppError(
      "malformed_request",
      400,
      "Malformed multipart request.",
    );
  }

  if (error instanceof SyntaxError) {
    return new AppError("malformed_request", 400, "Malformed request body.");
  }

  return new AppError("internal_error", 500, "Internal server error.");
}

function logError(
  logger: FastifyBaseLogger,
  appError: AppError,
  requestId: string,
): void {
  if (appError.statusCode >= 500) {
    logger.error(
      {
        requestId,
        errorCode: appError.code,
        statusCode: appError.statusCode,
      },
      "Unhandled service error",
    );
  }
}

function maybeSetRetryAfter(reply: FastifyReply, appError: AppError): void {
  if (appError.code !== "rate_limited") {
    return;
  }

  const retryAfterSeconds = appError.details?.retryAfterSeconds;
  if (
    typeof retryAfterSeconds === "number" &&
    Number.isFinite(retryAfterSeconds) &&
    retryAfterSeconds > 0
  ) {
    reply.header("Retry-After", String(Math.ceil(retryAfterSeconds)));
  }
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler(
    (error: unknown, request: FastifyRequest, reply: FastifyReply) => {
      const appError = mapToAppError(error);
      const requestId = request.id;
      request.appErrorCode = appError.code;

      logError(app.log, appError, requestId);

      const payload: ErrorResponseBody = {
        error: {
          code: appError.code,
          message: appError.message,
          ...(appError.details ? { details: appError.details } : {}),
        },
        requestId,
      };

      maybeSetRetryAfter(reply, appError);
      reply.status(appError.statusCode).send(payload);
    },
  );
}
