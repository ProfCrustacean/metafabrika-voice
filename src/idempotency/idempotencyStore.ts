import { isRetryableError } from "../errors/errorContract.js";
import { ErrorCode } from "../types.js";
import {
  IdempotencyBeginResult,
  IdempotencyEntry,
  IdempotencyStoreOptions,
  StoredOutcome,
  createInFlightEntry,
  toOutcome,
  toStoredError,
} from "./idempotencyTypes.js";

export type {
  IdempotencyBeginResult,
  IdempotencyOutcome,
  IdempotencyStoreOptions,
} from "./idempotencyTypes.js";

const CACHEABLE_NON_RETRYABLE_ERROR_CODES = new Set<ErrorCode>([
  "audio_too_long",
  "corrupted_audio",
  "no_speech_detected",
  "upstream_error",
]);

function shouldCacheError(code: ErrorCode): boolean {
  return CACHEABLE_NON_RETRYABLE_ERROR_CODES.has(code);
}

export class IdempotencyStore {
  private readonly entries = new Map<string, IdempotencyEntry>();
  private readonly ttlMs: number;
  private readonly cleanupIntervalOps: number;
  private readonly maxEntries: number;
  private opsSinceCleanup = 0;

  constructor(options: IdempotencyStoreOptions) {
    this.ttlMs = options.ttlMs;
    this.cleanupIntervalOps = options.cleanupIntervalOps ?? 200;
    this.maxEntries = options.maxEntries ?? 5_000;
  }

  begin(scopeKey: string, fingerprint: string): IdempotencyBeginResult {
    const now = Date.now();
    this.cleanupExpired(now);
    const existing = this.entries.get(scopeKey);

    if (!existing) {
      return this.createExecuteResult(scopeKey, fingerprint);
    }

    if (existing.kind === "cached" && now >= existing.expiresAt) {
      this.entries.delete(scopeKey);
      return this.createExecuteResult(scopeKey, fingerprint);
    }

    if (existing.fingerprint !== fingerprint) {
      return { kind: "conflict" };
    }

    if (existing.kind === "in_flight") {
      return {
        kind: "wait",
        waitForOutcome: async () => toOutcome(await existing.promise),
      };
    }

    return { kind: "replay", outcome: toOutcome(existing.outcome) };
  }

  private createExecuteResult(
    scopeKey: string,
    fingerprint: string,
  ): IdempotencyBeginResult {
    this.evictOldestCachedEntries();
    const trackEntry = this.entries.size < this.maxEntries;
    const inFlight = createInFlightEntry(fingerprint);
    if (trackEntry) {
      this.entries.set(scopeKey, inFlight);
    }

    let settled = false;
    return {
      kind: "execute",
      finishSuccess: (text) => {
        if (settled) {
          return;
        }
        settled = true;

        const outcome: StoredOutcome = { kind: "success", text };
        if (trackEntry) {
          this.entries.set(scopeKey, {
            kind: "cached",
            fingerprint,
            expiresAt: Date.now() + this.ttlMs,
            outcome,
          });
        }
        inFlight.resolve(outcome);
      },
      finishError: (error) => {
        if (settled) {
          return;
        }
        settled = true;

        const outcome: StoredOutcome = {
          kind: "error",
          error: toStoredError(error),
        };
        const retryable = isRetryableError(error.code, error.details);
        if (!trackEntry || retryable || !shouldCacheError(error.code)) {
          this.entries.delete(scopeKey);
        } else {
          this.entries.set(scopeKey, {
            kind: "cached",
            fingerprint,
            expiresAt: Date.now() + this.ttlMs,
            outcome,
          });
        }
        inFlight.resolve(outcome);
      },
    };
  }

  private evictOldestCachedEntries(): void {
    if (this.entries.size < this.maxEntries) {
      return;
    }

    for (const [scopeKey, entry] of this.entries.entries()) {
      if (entry.kind !== "cached") {
        continue;
      }

      this.entries.delete(scopeKey);
      if (this.entries.size < this.maxEntries) {
        return;
      }
    }
  }

  private cleanupExpired(now: number): void {
    this.opsSinceCleanup += 1;
    if (this.opsSinceCleanup < this.cleanupIntervalOps) {
      return;
    }

    this.opsSinceCleanup = 0;
    for (const [scopeKey, entry] of this.entries.entries()) {
      if (entry.kind === "cached" && entry.expiresAt <= now) {
        this.entries.delete(scopeKey);
      }
    }
  }
}
