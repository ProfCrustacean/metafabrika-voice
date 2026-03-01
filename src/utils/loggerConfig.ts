export function buildLoggerOptions(logLevel: string) {
  return {
    level: logLevel,
    redact: {
      paths: [
        "req.headers.x-api-key",
        "req.headers.x-admin-api-key",
        "req.headers.authorization",
      ],
      censor: "[redacted]",
    },
  };
}
