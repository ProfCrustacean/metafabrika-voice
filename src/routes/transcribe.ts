import { FastifyInstance } from "fastify";
import { ApiKeyRegistry } from "../auth/apiKeyRegistry.js";
import { apiKeyAuth } from "../middleware/apiKeyAuth.js";
import { readUploadToBuffer } from "../audio/audioFileUtils.js";
import { probeAudioDurationSeconds } from "../audio/probeAudioDurationSeconds.js";
import { validateAudioMimeType } from "../audio/validateAudio.js";
import {
  TranscodedAudio,
  transcodeToOggOpus,
} from "../audio/transcodeToOggOpus.js";
import { prepareAudioForProvider } from "../audio/prepareAudioForProvider.js";
import { SttProvider } from "../providers/SttProvider.js";
import {
  AppError,
  SuccessResponseBody,
  TRANSCRIBE_LANGUAGE,
} from "../types.js";
import {
  assertUploadNotTruncated,
  createInFlightSlotAcquirer,
  mapProviderError,
  readAudioFileOrThrow,
} from "./transcribeHelpers.js";

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

export interface RegisterTranscribeRouteOptions {
  provider: SttProvider;
  apiKeyRegistry: ApiKeyRegistry;
  ffmpegPath: string;
  ffmpegTimeoutMs: number;
  maxAudioSeconds: number;
  maxInFlightTranscriptions: number;
  transcode?: TranscodeFn;
  probeDurationSeconds?: ProbeDurationSecondsFn;
}

export async function registerTranscribeRoute(
  app: FastifyInstance,
  options: RegisterTranscribeRouteOptions,
): Promise<void> {
  const transcode = options.transcode || transcodeToOggOpus;
  const probeDurationSeconds =
    options.probeDurationSeconds || probeAudioDurationSeconds;
  const acquireInFlightSlot = createInFlightSlotAcquirer(
    options.maxInFlightTranscriptions,
  );

  app.route({
    method: "POST",
    url: "/v1/transcribe",
    preHandler: apiKeyAuth(options.apiKeyRegistry),
    handler: async (request, reply) => {
      let releaseSlot = () => {};
      let cleanupAudio = async () => {};

      try {
        releaseSlot = acquireInFlightSlot();

        if (!request.isMultipart()) {
          throw new AppError(
            "malformed_request",
            400,
            "Content-Type must be multipart/form-data.",
          );
        }

        const file = await readAudioFileOrThrow(request);
        validateAudioMimeType(file.mimetype);
        assertUploadNotTruncated(file);

        const uploadedAudio = await readUploadToBuffer(file.file);
        if (!uploadedAudio.length) {
          throw new AppError(
            "empty_audio",
            422,
            "Uploaded audio file is empty.",
          );
        }

        const durationSeconds = await probeDurationSeconds(
          uploadedAudio,
          "ffprobe",
          options.ffmpegTimeoutMs,
        );
        if (durationSeconds > options.maxAudioSeconds) {
          throw new AppError(
            "audio_too_long",
            422,
            `Audio exceeds ${options.maxAudioSeconds} second limit.`,
            {
              maxAudioSeconds: options.maxAudioSeconds,
              durationSeconds: Number(durationSeconds.toFixed(3)),
            },
          );
        }

        const transcoded = await prepareAudioForProvider({
          inputAudio: uploadedAudio,
          mimeType: file.mimetype,
          ffmpegPath: options.ffmpegPath,
          timeoutMs: options.ffmpegTimeoutMs,
          transcode,
        });
        cleanupAudio = transcoded.cleanup;

        const result = await options.provider.transcribe({
          audio: transcoded.audio,
          format: "oggopus",
          language: TRANSCRIBE_LANGUAGE,
          requestId: request.id,
        });

        const payload: SuccessResponseBody = {
          text: result.text,
        };

        reply.status(200).send(payload);
      } catch (error) {
        const mapped = mapProviderError(error);
        throw mapped ?? error;
      } finally {
        await cleanupAudio();
        releaseSlot();
      }
    },
  });
}
