import { spawn } from "node:child_process";

export interface FfmpegReadinessResult {
  ok: boolean;
  message?: string;
}

async function runFfmpegCheck(
  ffmpegPath: string,
  timeoutMs: number,
): Promise<FfmpegReadinessResult> {
  return new Promise((resolve) => {
    let timedOut = false;

    const ffmpeg = spawn(ffmpegPath, ["-version"], {
      stdio: ["ignore", "ignore", "pipe"],
    });

    const errorChunks: Buffer[] = [];
    ffmpeg.stderr.on("data", (chunk) => {
      errorChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      ffmpeg.kill("SIGKILL");
    }, timeoutMs);

    const finish = (result: FfmpegReadinessResult): void => {
      clearTimeout(timeout);
      resolve(result);
    };

    ffmpeg.once("error", () => {
      finish({
        ok: false,
        message: "ffmpeg binary not found or not executable",
      });
    });

    ffmpeg.once("close", (code) => {
      if (timedOut) {
        finish({
          ok: false,
          message: `ffmpeg readiness check timed out after ${timeoutMs}ms`,
        });
        return;
      }

      if (code === 0) {
        finish({ ok: true });
        return;
      }

      const reason = Buffer.concat(errorChunks).toString("utf-8").trim();
      finish({
        ok: false,
        message: reason || `ffmpeg exited with code ${code ?? "unknown"}`,
      });
    });
  });
}

export function createFfmpegReadinessCheck(
  ffmpegPath: string,
  timeoutMs: number,
  cacheMs = 10_000,
) {
  let cached: { expiresAt: number; result: FfmpegReadinessResult } | null =
    null;

  return async function checkFfmpegReadiness(): Promise<FfmpegReadinessResult> {
    const now = Date.now();
    if (cached && now < cached.expiresAt) {
      return cached.result;
    }

    const result = await runFfmpegCheck(ffmpegPath, timeoutMs);
    cached = {
      expiresAt: now + cacheMs,
      result,
    };
    return result;
  };
}
