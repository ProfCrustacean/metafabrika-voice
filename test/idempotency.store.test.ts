import { describe, expect, it } from "vitest";
import { IdempotencyStore } from "../src/idempotency/idempotencyStore.js";
import { AppError } from "../src/types.js";

describe("IdempotencyStore", () => {
  it("evicts oldest cached entries when maxEntries is reached", () => {
    const store = new IdempotencyStore({
      ttlMs: 60_000,
      maxEntries: 2,
    });

    const first = store.begin("client:key-1", "fp-1");
    expect(first.kind).toBe("execute");
    if (first.kind === "execute") {
      first.finishSuccess("result-1");
    }

    const second = store.begin("client:key-2", "fp-2");
    expect(second.kind).toBe("execute");
    if (second.kind === "execute") {
      second.finishSuccess("result-2");
    }

    const third = store.begin("client:key-3", "fp-3");
    expect(third.kind).toBe("execute");
    if (third.kind === "execute") {
      third.finishSuccess("result-3");
    }

    const replaySecond = store.begin("client:key-2", "fp-2");
    expect(replaySecond.kind).toBe("replay");

    const replayFirst = store.begin("client:key-1", "fp-1");
    expect(replayFirst.kind).toBe("execute");
  });

  it("falls back to untracked execution when store is full of in-flight entries", () => {
    const store = new IdempotencyStore({
      ttlMs: 60_000,
      maxEntries: 1,
    });

    const inFlight = store.begin("client:key-a", "fp-a");
    expect(inFlight.kind).toBe("execute");

    const untracked = store.begin("client:key-b", "fp-b");
    expect(untracked.kind).toBe("execute");

    if (untracked.kind === "execute") {
      untracked.finishSuccess("result-b");
    }

    const sameKeyAgain = store.begin("client:key-b", "fp-b");
    expect(sameKeyAgain.kind).toBe("execute");
  });

  it("keeps successful outcome if finishError is called after finishSuccess", () => {
    const store = new IdempotencyStore({
      ttlMs: 60_000,
    });

    const decision = store.begin("client:key", "fp");
    expect(decision.kind).toBe("execute");
    if (decision.kind !== "execute") {
      return;
    }

    decision.finishSuccess("stable-success");
    decision.finishError(
      new AppError("internal_error", 500, "late send failure", {
        retryAfterSeconds: 1,
      }),
    );

    const replay = store.begin("client:key", "fp");
    expect(replay.kind).toBe("replay");
    if (replay.kind !== "replay") {
      return;
    }

    expect(replay.outcome.ok).toBe(true);
    if (replay.outcome.ok) {
      expect(replay.outcome.text).toBe("stable-success");
    }
  });

  it("caches only expensive non-retryable errors", () => {
    const store = new IdempotencyStore({ ttlMs: 60_000 });

    const cheapError = store.begin("client:cheap", "fp-cheap");
    expect(cheapError.kind).toBe("execute");
    if (cheapError.kind === "execute") {
      cheapError.finishError(
        new AppError("unsupported_format", 415, "Unsupported format."),
      );
    }
    const cheapReplay = store.begin("client:cheap", "fp-cheap");
    expect(cheapReplay.kind).toBe("execute");

    const expensiveError = store.begin("client:expensive", "fp-expensive");
    expect(expensiveError.kind).toBe("execute");
    if (expensiveError.kind === "execute") {
      expensiveError.finishError(
        new AppError("no_speech_detected", 422, "No speech."),
      );
    }
    const expensiveReplay = store.begin("client:expensive", "fp-expensive");
    expect(expensiveReplay.kind).toBe("replay");
  });
});
