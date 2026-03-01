import { AudioPayload } from "../types.js";

export interface SttTranscribeInput {
  audio: AudioPayload;
  format: "oggopus";
  language: string;
  requestId: string;
}

export interface SttTranscribeResult {
  text: string;
}

export interface SttProvider {
  readonly name: string;
  transcribe(input: SttTranscribeInput): Promise<SttTranscribeResult>;
}
