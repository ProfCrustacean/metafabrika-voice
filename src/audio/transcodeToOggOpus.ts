import { AudioPayload } from "../types.js";
import { runFfmpegConversion } from "./ffmpegConversion.js";

export interface TranscodedAudio {
  audio: AudioPayload;
  cleanup: () => Promise<void>;
}

export async function transcodeToOggOpus(
  inputStream: NodeJS.ReadableStream,
  ffmpegPath: string,
  timeoutMs: number,
): Promise<TranscodedAudio> {
  const audioBuffer = await runFfmpegConversion(
    inputStream,
    ffmpegPath,
    timeoutMs,
  );
  return {
    audio: audioBuffer,
    cleanup: async () => {},
  };
}
