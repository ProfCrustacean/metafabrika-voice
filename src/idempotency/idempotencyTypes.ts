import { AppError, ErrorCode } from "../types.js";

interface StoredAppError {
  code: ErrorCode;
  statusCode: number;
  message: string;
  details?: Record<string, unknown>;
}

export type StoredOutcome =
  | { kind: "success"; text: string }
  | { kind: "error"; error: StoredAppError };

export interface InFlightEntry {
  kind: "in_flight";
  fingerprint: string;
  promise: Promise<StoredOutcome>;
  resolve: (outcome: StoredOutcome) => void;
}

export interface CachedEntry {
  kind: "cached";
  fingerprint: string;
  expiresAt: number;
  outcome: StoredOutcome;
}

export type IdempotencyEntry = InFlightEntry | CachedEntry;

export type IdempotencyOutcome =
  | { ok: true; text: string }
  | { ok: false; error: AppError };

export type IdempotencyBeginResult =
  | {
      kind: "execute";
      finishSuccess: (text: string) => void;
      finishError: (error: AppError) => void;
    }
  | {
      kind: "wait";
      waitForOutcome: () => Promise<IdempotencyOutcome>;
    }
  | {
      kind: "replay";
      outcome: IdempotencyOutcome;
    }
  | { kind: "conflict" };

export interface IdempotencyStoreOptions {
  ttlMs: number;
  cleanupIntervalOps?: number;
  maxEntries?: number;
}

export function toStoredError(error: AppError): StoredAppError {
  return {
    code: error.code,
    statusCode: error.statusCode,
    message: error.message,
    details: error.details,
  };
}

export function toOutcome(stored: StoredOutcome): IdempotencyOutcome {
  if (stored.kind === "success") {
    return { ok: true, text: stored.text };
  }

  return {
    ok: false,
    error: new AppError(
      stored.error.code,
      stored.error.statusCode,
      stored.error.message,
      stored.error.details,
    ),
  };
}

export function createInFlightEntry(fingerprint: string): InFlightEntry {
  let resolve: (outcome: StoredOutcome) => void = () => {};
  const promise = new Promise<StoredOutcome>((resolver) => {
    resolve = resolver;
  });
  return { kind: "in_flight", fingerprint, promise, resolve };
}
