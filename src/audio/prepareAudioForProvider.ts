import { AppError } from "../types.js";
import { TranscodedAudio } from "./transcodeToOggOpus.js";
import { Readable } from "node:stream";

export interface PrepareAudioForProviderInput {
  inputAudio: Buffer;
  mimeType: string | undefined;
  ffmpegPath: string;
  timeoutMs: number;
  transcode: (
    inputAudio: NodeJS.ReadableStream,
    ffmpegPath: string,
    timeoutMs: number,
  ) => Promise<TranscodedAudio>;
}

function parseCodecs(rawMimeType: string): string[] {
  const params = rawMimeType.split(";").slice(1);
  for (const param of params) {
    const [rawKey, rawValue] = param.split("=", 2);
    if (!rawKey || !rawValue) {
      continue;
    }
    const key = rawKey.trim().toLowerCase();
    if (key !== "codecs" && key !== "codec") {
      continue;
    }
    return rawValue
      .split(",")
      .map((value) => value.trim().replace(/"/g, "").toLowerCase())
      .filter(Boolean);
  }
  return [];
}

function normalizeBaseMimeType(mimeType: string | undefined): string {
  return mimeType?.split(";")[0]?.trim().toLowerCase() || "";
}

function hasExplicitOpusCodec(mimeType: string | undefined): boolean {
  if (!mimeType) {
    return false;
  }

  const normalized = mimeType.toLowerCase();
  if (!normalized.startsWith("audio/ogg")) {
    return false;
  }

  const codecs = parseCodecs(normalized);
  return codecs.includes("opus");
}

function looksLikeOggOpus(audio: Buffer): boolean {
  if (audio.length < 12) {
    return false;
  }

  if (audio.subarray(0, 4).toString("utf8") !== "OggS") {
    return false;
  }

  return audio.includes(Buffer.from("OpusHead"));
}

export async function prepareAudioForProvider(
  input: PrepareAudioForProviderInput,
): Promise<TranscodedAudio> {
  if (!input.inputAudio.length) {
    throw new AppError("empty_audio", 422, "Uploaded audio file is empty.");
  }

  const normalizedMimeType = normalizeBaseMimeType(input.mimeType);
  if (normalizedMimeType !== "audio/ogg") {
    return input.transcode(
      Readable.from(input.inputAudio),
      input.ffmpegPath,
      input.timeoutMs,
    );
  }

  if (
    !hasExplicitOpusCodec(input.mimeType) &&
    !looksLikeOggOpus(input.inputAudio)
  ) {
    return input.transcode(
      Readable.from(input.inputAudio),
      input.ffmpegPath,
      input.timeoutMs,
    );
  }

  return {
    audio: new Uint8Array(input.inputAudio),
    cleanup: async () => {},
  };
}
