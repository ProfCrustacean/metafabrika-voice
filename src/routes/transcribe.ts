import { FastifyInstance } from "fastify";
import { ApiKeyRegistry } from "../auth/apiKeyRegistry.js";
import { apiKeyAuth } from "../middleware/apiKeyAuth.js";
import { readUploadToBuffer } from "../audio/audioFileUtils.js";
import { probeAudioDurationSeconds } from "../audio/probeAudioDurationSeconds.js";
import { validateAudioMimeType } from "../audio/validateAudio.js";
import { transcodeToOggOpus } from "../audio/transcodeToOggOpus.js";
import { prepareAudioForProvider } from "../audio/prepareAudioForProvider.js";
import { SttProvider } from "../providers/SttProvider.js";
import { AppError, TRANSCRIBE_LANGUAGE } from "../types.js";
import {
  IdempotencyBeginResult,
  IdempotencyStore,
} from "../idempotency/idempotencyStore.js";
import {
  assertUploadNotTruncated,
  buildIdempotencyFingerprint,
  createInFlightSlotAcquirer,
  normalizeToAppError,
  readOptionalHeader,
  readAudioFileOrThrow,
  sendIdempotencyOutcome,
  sendSuccessResponse,
} from "./transcribeHelpers.js";
import { ProbeDurationSecondsFn, TranscodeFn } from "./transcribeTypes.js";

export type { ProbeDurationSecondsFn, TranscodeFn } from "./transcribeTypes.js";

export interface RegisterTranscribeRouteOptions {
  provider: SttProvider;
  apiKeyRegistry: ApiKeyRegistry;
  ffmpegPath: string;
  ffprobePath: string;
  ffmpegTimeoutMs: number;
  maxAudioSeconds: number;
  maxInFlightTranscriptions: number;
  idempotencyTtlMs?: number;
  transcode?: TranscodeFn;
  probeDurationSeconds?: ProbeDurationSecondsFn;
}

const DEFAULT_IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;

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
  const idempotencyStore = new IdempotencyStore({
    ttlMs: options.idempotencyTtlMs ?? DEFAULT_IDEMPOTENCY_TTL_MS,
  });

  app.route({
    method: "POST",
    url: "/v1/transcribe",
    preHandler: apiKeyAuth(options.apiKeyRegistry),
    handler: async (request, reply) => {
      let releaseSlot = () => {};
      let cleanupAudio = async () => {};
      let idempotencyDecision: IdempotencyBeginResult | undefined;

      try {
        if (!request.isMultipart()) {
          throw new AppError(
            "malformed_request",
            400,
            "Content-Type must be multipart/form-data.",
          );
        }

        const file = await readAudioFileOrThrow(request);
        request.idempotencyKey = readOptionalHeader(
          request.headers["idempotency-key"],
        );

        const uploadedAudio = await readUploadToBuffer(file.file);
        assertUploadNotTruncated(file);
        if (!uploadedAudio.length) {
          throw new AppError(
            "empty_audio",
            422,
            "Uploaded audio file is empty.",
          );
        }

        if (request.idempotencyKey && request.apiClientId) {
          const scopeKey = `${request.apiClientId}:${request.idempotencyKey}`;
          const fingerprint = buildIdempotencyFingerprint(
            uploadedAudio,
            file.mimetype,
          );
          idempotencyDecision = idempotencyStore.begin(scopeKey, fingerprint);

          if (idempotencyDecision.kind === "conflict") {
            throw new AppError(
              "idempotency_conflict",
              409,
              "Idempotency key was reused with a different payload.",
            );
          }

          if (idempotencyDecision.kind === "replay") {
            sendIdempotencyOutcome(
              reply,
              request.id,
              idempotencyDecision.outcome,
            );
            return;
          }

          if (idempotencyDecision.kind === "wait") {
            const waitedOutcome = await idempotencyDecision.waitForOutcome();
            sendIdempotencyOutcome(reply, request.id, waitedOutcome);
            return;
          }
        }

        validateAudioMimeType(file.mimetype);

        releaseSlot = acquireInFlightSlot();

        const durationSeconds = await probeDurationSeconds(
          uploadedAudio,
          options.ffprobePath,
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

        if (idempotencyDecision?.kind === "execute") {
          idempotencyDecision.finishSuccess(result.text);
        }
        sendSuccessResponse(reply, result.text, request.id);
      } catch (error) {
        const appError = normalizeToAppError(error);
        if (idempotencyDecision?.kind === "execute") {
          idempotencyDecision.finishError(appError);
        }
        throw appError;
      } finally {
        await cleanupAudio();
        releaseSlot();
      }
    },
  });
}
