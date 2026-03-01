import { describe, expect, it } from "vitest";
import { runStartupPreflight } from "../src/utils/startupPreflight.js";

describe("runStartupPreflight", () => {
  it("passes when required binaries are available", async () => {
    await expect(
      runStartupPreflight({
        ffmpegPath: "ffmpeg",
        ffprobePath: "ffprobe",
        timeoutMs: 2_000,
      }),
    ).resolves.toBeUndefined();
  });

  it("fails when ffmpeg is missing", async () => {
    await expect(
      runStartupPreflight({
        ffmpegPath: "missing-ffmpeg-binary-for-test",
        ffprobePath: process.execPath,
        timeoutMs: 2_000,
      }),
    ).rejects.toThrow(/ffmpeg/);
  });

  it("fails when ffprobe is missing", async () => {
    await expect(
      runStartupPreflight({
        ffmpegPath: process.execPath,
        ffprobePath: "missing-ffprobe-binary-for-test",
        timeoutMs: 2_000,
      }),
    ).rejects.toThrow(/ffprobe/);
  });
});
