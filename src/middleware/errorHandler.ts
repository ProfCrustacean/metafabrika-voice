import {
  FastifyBaseLogger,
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import { AppError, ErrorResponseBody } from "../types.js";
import {
  getRetryAfterSeconds,
  isRetryableError,
} from "../errors/errorContract.js";
import { mapToAppError } from "../errors/mapToAppError.js";

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

function maybeSetRetryAfter(
  reply: FastifyReply,
  retryAfterSeconds: number | undefined,
): void {
  if (retryAfterSeconds === undefined) {
    return;
  }

  reply.header("Retry-After", String(retryAfterSeconds));
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler(
    (error: unknown, request: FastifyRequest, reply: FastifyReply) => {
      const appError = mapToAppError(error);
      const requestId = request.id;
      request.appErrorCode = appError.code;

      logError(app.log, appError, requestId);
      const retryAfterSeconds = getRetryAfterSeconds(
        appError.code,
        appError.details,
      );
      const retryable = isRetryableError(appError.code, appError.details);

      const payload: ErrorResponseBody = {
        error: {
          code: appError.code,
          message: appError.message,
          retryable,
          ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
          ...(appError.details ? { details: appError.details } : {}),
        },
        requestId,
      };

      maybeSetRetryAfter(reply, retryAfterSeconds);
      reply.status(appError.statusCode).send(payload);
    },
  );
}
