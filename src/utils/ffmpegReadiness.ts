import { spawn } from "node:child_process";

interface BinaryCheckResult {
  ok: boolean;
  message?: string;
}

export interface FfmpegReadinessResult {
  ok: boolean;
  ffmpeg: BinaryCheckResult;
  ffprobe: BinaryCheckResult;
}

async function runBinaryCheck(
  binaryPath: string,
  binaryName: string,
  timeoutMs: number,
): Promise<BinaryCheckResult> {
  return new Promise((resolve) => {
    let timedOut = false;

    const process = spawn(binaryPath, ["-version"], {
      stdio: ["ignore", "ignore", "pipe"],
    });

    const errorChunks: Buffer[] = [];
    process.stderr.on("data", (chunk) => {
      errorChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      process.kill("SIGKILL");
    }, timeoutMs);

    const finish = (result: BinaryCheckResult): void => {
      clearTimeout(timeout);
      resolve(result);
    };

    process.once("error", () => {
      finish({
        ok: false,
        message: `${binaryName} binary not found or not executable`,
      });
    });

    process.once("close", (code) => {
      if (timedOut) {
        finish({
          ok: false,
          message: `${binaryName} readiness check timed out after ${timeoutMs}ms`,
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
        message:
          reason || `${binaryName} exited with code ${code ?? "unknown"}`,
      });
    });
  });
}

export function createFfmpegReadinessCheck(
  ffmpegPath: string,
  ffprobePath: string,
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

    const [ffmpeg, ffprobe] = await Promise.all([
      runBinaryCheck(ffmpegPath, "ffmpeg", timeoutMs),
      runBinaryCheck(ffprobePath, "ffprobe", timeoutMs),
    ]);
    const result = {
      ok: ffmpeg.ok && ffprobe.ok,
      ffmpeg,
      ffprobe,
    };

    cached = {
      expiresAt: now + cacheMs,
      result,
    };
    return result;
  };
}
