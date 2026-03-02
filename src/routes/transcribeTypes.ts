import { TranscodedAudio } from "../audio/transcodeToOggOpus.js";

export type TranscodeFn = (
  inputAudio: NodeJS.ReadableStream,
  ffmpegPath: string,
  timeoutMs: number,
) => Promise<TranscodedAudio>;

export type ProbeDurationSecondsFn = (
  audio: Buffer,
  ffprobePath: string,
  timeoutMs: number,
) => Promise<number>;
