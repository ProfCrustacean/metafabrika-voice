import { spawn } from "node:child_process";
import { AppError } from "../types.js";

export async function probeAudioDurationSeconds(
  audio: Buffer,
  ffprobePath: string,
  timeoutMs: number,
): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    let timedOut = false;
    let settled = false;

    const ffprobe = spawn(
      ffprobePath,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-select_streams",
        "a:0",
        "-show_packets",
        "-show_entries",
        "packet=pts_time,duration_time",
        "-of",
        "csv=p=0",
        "-i",
        "pipe:0",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );

    const stdoutChunks: Buffer[] = [];
    ffprobe.stdout.on("data", (chunk) => {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    const stderrChunks: Buffer[] = [];
    ffprobe.stderr.on("data", (chunk) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      ffprobe.kill("SIGKILL");
    }, timeoutMs);

    const finish = (error: AppError | null, duration = 0): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      if (error) {
        reject(error);
        return;
      }
      resolve(duration);
    };

    ffprobe.once("error", () => {
      finish(
        new AppError(
          "internal_error",
          500,
          "ffprobe is not available on server.",
        ),
      );
    });

    ffprobe.once("close", (code) => {
      if (timedOut) {
        finish(
          new AppError(
            "corrupted_audio",
            422,
            "Audio duration probe timed out.",
          ),
        );
        return;
      }

      const reason = Buffer.concat(stderrChunks).toString("utf-8").trim();
      if (code !== 0) {
        finish(
          new AppError(
            "corrupted_audio",
            422,
            "Audio is corrupted or cannot be decoded.",
            reason ? { reason } : undefined,
          ),
        );
        return;
      }

      const packetsCsv = Buffer.concat(stdoutChunks).toString("utf-8").trim();
      const duration = parseDurationFromPacketsCsv(packetsCsv);
      if (!Number.isFinite(duration) || duration < 0) {
        finish(
          new AppError(
            "corrupted_audio",
            422,
            "Audio is corrupted or cannot be decoded.",
          ),
        );
        return;
      }

      finish(null, duration);
    });

    ffprobe.stdin.end(audio);
  });
}

function parseDurationFromPacketsCsv(packetsCsv: string): number {
  if (!packetsCsv) {
    return Number.NaN;
  }

  let maxDurationSeconds = Number.NaN;
  for (const line of packetsCsv.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const [rawPts, rawPacketDuration] = trimmed
      .split(",")
      .map((value) => value.trim());
    const pts = Number(rawPts);
    if (!Number.isFinite(pts)) {
      continue;
    }

    const packetDuration = Number(rawPacketDuration);
    const packetEnd = Number.isFinite(packetDuration)
      ? pts + packetDuration
      : pts;

    if (
      !Number.isFinite(maxDurationSeconds) ||
      packetEnd > maxDurationSeconds
    ) {
      maxDurationSeconds = packetEnd;
    }
  }

  return maxDurationSeconds;
}
