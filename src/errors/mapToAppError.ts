import { AppError } from "../types.js";

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

export function mapToAppError(error: unknown): AppError {
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

  return new AppError("internal_error", 500, "Internal server error.", {
    retryAfterSeconds: 1,
  });
}
