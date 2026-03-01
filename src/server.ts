import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { YandexSttProvider } from "./providers/YandexSttProvider.js";
import { runStartupPreflight } from "./utils/startupPreflight.js";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function startServer(): Promise<void> {
  let app: Awaited<ReturnType<typeof buildApp>> | null = null;
  try {
    const config = loadConfig();

    await runStartupPreflight({
      ffmpegPath: config.ffmpegPath,
      ffprobePath: config.ffprobePath,
      timeoutMs: config.ffmpegTimeoutMs,
    });

    const provider = new YandexSttProvider({
      apiKey: config.yandexApiKey,
      endpoint: config.yandexSttEndpoint,
      timeoutMs: config.yandexSttTimeoutMs,
    });

    app = await buildApp({
      config,
      provider,
      logger: true,
    });

    await app.listen({ port: config.port, host: config.host });
  } catch (error) {
    if (app) {
      app.log.error(
        { startupError: toErrorMessage(error) },
        "Failed to start STT service",
      );
    } else {
      console.error(`Failed to start STT service: ${toErrorMessage(error)}`);
    }
    process.exit(1);
  }
}

void startServer();
