export class UpstreamTimeoutError extends Error {
  constructor(message = "Upstream speech provider timed out.") {
    super(message);
    this.name = "UpstreamTimeoutError";
  }
}

export class UpstreamProviderError extends Error {
  public readonly statusCode?: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    message = "Upstream speech provider failed.",
    statusCode?: number,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "UpstreamProviderError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class NoSpeechDetectedError extends Error {
  constructor(message = "No speech detected in audio.") {
    super(message);
    this.name = "NoSpeechDetectedError";
  }
}
