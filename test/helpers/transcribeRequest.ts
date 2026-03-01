import { FastifyInstance } from "fastify";
import { buildMultipart } from "./buildMultipart.js";
import { BASE_CONFIG } from "./createTestApp.js";

interface AudioMultipartOptions {
  fieldName?: string;
  filename?: string;
  contentType?: string;
  data?: Buffer;
}

export function buildAudioMultipart(
  options: AudioMultipartOptions = {},
): ReturnType<typeof buildMultipart> {
  return buildMultipart([
    {
      name: options.fieldName || "audio",
      filename: options.filename || "voice.webm",
      contentType: options.contentType || "audio/webm",
      data: options.data || Buffer.from("ok"),
    },
  ]);
}

interface PostTranscribeOptions {
  app: FastifyInstance;
  multipart?: ReturnType<typeof buildMultipart>;
  apiKey?: string | null;
  headers?: Record<string, string>;
}

export async function postTranscribe(options: PostTranscribeOptions) {
  const multipart = options.multipart || buildAudioMultipart();
  const apiKey =
    options.apiKey === undefined
      ? BASE_CONFIG.serviceApiKeys.showroom_a
      : options.apiKey;

  const headers: Record<string, string> = {
    "content-type": multipart.contentType,
    ...(options.headers || {}),
  };

  if (apiKey !== null) {
    headers["x-api-key"] = apiKey;
  }

  return options.app.inject({
    method: "POST",
    url: "/v1/transcribe",
    headers,
    payload: multipart.payload,
  });
}
