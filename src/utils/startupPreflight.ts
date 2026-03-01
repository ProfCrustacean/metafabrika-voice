import { spawn } from "node:child_process";

interface BinaryCheckResult {
  ok: boolean;
  message?: string;
}

interface RunStartupPreflightOptions {
  ffmpegPath: string;
  ffprobePath: string;
  timeoutMs: number;
}

function checkBinaryVersion(
  binaryPath: string,
  binaryName: string,
  timeoutMs: number,
): Promise<BinaryCheckResult> {
  return new Promise((resolve) => {
    let timedOut = false;

    const child = spawn(binaryPath, ["-version"], {
      stdio: ["ignore", "ignore", "pipe"],
    });

    const stderrChunks: Buffer[] = [];
    child.stderr.on("data", (chunk) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    const finish = (result: BinaryCheckResult): void => {
      clearTimeout(timeout);
      resolve(result);
    };

    child.once("error", () => {
      finish({
        ok: false,
        message: `${binaryName} binary not found or not executable.`,
      });
    });

    child.once("close", (code) => {
      if (timedOut) {
        finish({
          ok: false,
          message: `${binaryName} check timed out after ${timeoutMs}ms.`,
        });
        return;
      }

      if (code === 0) {
        finish({ ok: true });
        return;
      }

      const reason = Buffer.concat(stderrChunks).toString("utf-8").trim();
      finish({
        ok: false,
        message:
          reason || `${binaryName} exited with code ${code ?? "unknown"}.`,
      });
    });
  });
}

export async function runStartupPreflight(
  options: RunStartupPreflightOptions,
): Promise<void> {
  const [ffmpeg, ffprobe] = await Promise.all([
    checkBinaryVersion(options.ffmpegPath, "ffmpeg", options.timeoutMs),
    checkBinaryVersion(options.ffprobePath, "ffprobe", options.timeoutMs),
  ]);

  const failures: string[] = [];
  if (!ffmpeg.ok) {
    failures.push(`ffmpeg: ${ffmpeg.message || "unknown failure"}`);
  }
  if (!ffprobe.ok) {
    failures.push(`ffprobe: ${ffprobe.message || "unknown failure"}`);
  }

  if (!failures.length) {
    return;
  }

  throw new Error(`Startup dependency check failed. ${failures.join(" ")}`);
}
