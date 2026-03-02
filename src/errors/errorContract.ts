import { ErrorCode } from "../types.js";

const RETRYABLE_CODES = new Set<ErrorCode>([
  "rate_limited",
  "service_busy",
  "upstream_timeout",
  "internal_error",
]);

const DEFAULT_RETRY_AFTER_SECONDS: Partial<Record<ErrorCode, number>> = {
  service_busy: 1,
  upstream_error: 2,
  upstream_timeout: 2,
  internal_error: 1,
};

function readProviderStatus(details?: Record<string, unknown>): number | null {
  const rawStatus = details?.providerStatus;
  if (typeof rawStatus !== "number" || !Number.isFinite(rawStatus)) {
    return null;
  }
  return rawStatus;
}

export function isRetryableError(
  code: ErrorCode,
  details?: Record<string, unknown>,
): boolean {
  if (code !== "upstream_error") {
    return RETRYABLE_CODES.has(code);
  }

  const providerStatus = readProviderStatus(details);
  if (providerStatus === null) {
    return true;
  }

  if (providerStatus === 408 || providerStatus === 429) {
    return true;
  }

  return providerStatus >= 500;
}

export function getRetryAfterSeconds(
  code: ErrorCode,
  details?: Record<string, unknown>,
): number | undefined {
  if (!isRetryableError(code, details)) {
    return undefined;
  }

  const fromDetails = details?.retryAfterSeconds;
  if (
    typeof fromDetails === "number" &&
    Number.isFinite(fromDetails) &&
    fromDetails > 0
  ) {
    return Math.ceil(fromDetails);
  }

  const fallback = DEFAULT_RETRY_AFTER_SECONDS[code];
  if (fallback === undefined) {
    return undefined;
  }

  return Math.ceil(fallback);
}
