import { FastifyRequest } from "fastify";
import { AppError } from "../types.js";

interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
}

interface RateWindowEntry {
  count: number;
  resetAt: number;
}

function shouldSkipRateLimit(request: FastifyRequest): boolean {
  if (request.method === "OPTIONS") {
    return true;
  }
  return request.url === "/health" || request.url === "/ready";
}

export function createIpRateLimitGuard(options: RateLimiterOptions) {
  const windows = new Map<string, RateWindowEntry>();
  let requestsSinceCleanup = 0;

  return async function ipRateLimitGuard(
    request: FastifyRequest,
  ): Promise<void> {
    if (shouldSkipRateLimit(request)) {
      return;
    }

    const clientId = request.ip || "unknown";
    const now = Date.now();
    const current = windows.get(clientId);

    if (!current || now >= current.resetAt) {
      windows.set(clientId, {
        count: 1,
        resetAt: now + options.windowMs,
      });
    } else if (current.count >= options.maxRequests) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((current.resetAt - now) / 1000),
      );
      throw new AppError(
        "rate_limited",
        429,
        "Too many requests. Please retry shortly.",
        {
          retryAfterSeconds,
        },
      );
    } else {
      current.count += 1;
    }

    requestsSinceCleanup += 1;
    if (requestsSinceCleanup >= 100) {
      requestsSinceCleanup = 0;
      for (const [key, window] of windows.entries()) {
        if (window.resetAt <= now) {
          windows.delete(key);
        }
      }
    }
  };
}
