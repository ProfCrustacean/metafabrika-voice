import { spawn } from "node:child_process";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { AppError } from "../types.js";

export async function runFfmpegConversion(
  inputStream: NodeJS.ReadableStream,
  ffmpegPath: string,
  timeoutMs: number,
): Promise<Uint8Array> {
  return new Promise<Uint8Array>((resolve, reject) => {
    let timedOut = false;
    let inputBytes = 0;
    let hitLimit = false;
    let settled = false;
    let pipelineError: Error | null = null;

    const ffmpeg = spawn(
      ffmpegPath,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        "pipe:0",
        "-ac",
        "1",
        "-ar",
        "48000",
        "-c:a",
        "libopus",
        "-f",
        "ogg",
        "pipe:1",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );

    inputStream.once("limit", () => {
      hitLimit = true;
      ffmpeg.kill("SIGKILL");
    });

    const inputCounter = new Transform({
      transform(chunk, _encoding, callback) {
        const asBuffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        inputBytes += asBuffer.length;
        callback(null, asBuffer);
      },
    });

    const outputChunks: Buffer[] = [];
    ffmpeg.stdout.on("data", (chunk) => {
      outputChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    const stderrChunks: Buffer[] = [];
    ffmpeg.stderr.on("data", (chunk) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      ffmpeg.kill("SIGKILL");
    }, timeoutMs);

    const finish = (error: AppError | null): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      if (error) {
        reject(error);
        return;
      }
      const output = Buffer.concat(outputChunks);
      if (output.length <= 0) {
        reject(
          new AppError(
            "corrupted_audio",
            422,
            "Audio is corrupted or cannot be decoded.",
          ),
        );
        return;
      }
      resolve(new Uint8Array(output));
    };

    void pipeline(inputStream, inputCounter, ffmpeg.stdin).catch((error) => {
      pipelineError =
        error instanceof Error ? error : new Error(String(error ?? ""));
    });

    ffmpeg.once("error", () => {
      finish(
        new AppError(
          "internal_error",
          500,
          "ffmpeg is not available on server.",
        ),
      );
    });

    ffmpeg.once("close", (code) => {
      const truncated = (
        inputStream as NodeJS.ReadableStream & { truncated?: boolean }
      ).truncated;

      if (hitLimit || truncated) {
        finish(
          new AppError(
            "payload_too_large",
            413,
            "Uploaded payload exceeds size limits.",
          ),
        );
        return;
      }

      if (inputBytes <= 0) {
        finish(
          new AppError("empty_audio", 422, "Uploaded audio file is empty."),
        );
        return;
      }

      if (timedOut) {
        finish(
          new AppError("corrupted_audio", 422, "Audio conversion timed out.", {
            timeoutMs,
          }),
        );
        return;
      }

      if (code === 0) {
        finish(null);
        return;
      }

      const reason = Buffer.concat(stderrChunks).toString("utf-8").trim();
      finish(
        new AppError(
          "corrupted_audio",
          422,
          "Audio is corrupted or cannot be decoded.",
          {
            reason,
            ...(pipelineError ? { pipelineError: pipelineError.message } : {}),
          },
        ),
      );
    });
  });
}
