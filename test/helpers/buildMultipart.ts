export interface MultipartPart {
  name: string;
  data: Buffer | string;
  filename?: string;
  contentType?: string;
}

export function buildMultipart(parts: MultipartPart[]): {
  payload: Buffer;
  contentType: string;
} {
  const boundary = "----codex-test-boundary";
  const chunks: Buffer[] = [];

  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));

    const disposition = part.filename
      ? `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\n`
      : `Content-Disposition: form-data; name="${part.name}"\r\n`;
    chunks.push(Buffer.from(disposition));

    if (part.filename) {
      chunks.push(
        Buffer.from(
          `Content-Type: ${part.contentType || "application/octet-stream"}\r\n`,
        ),
      );
    }

    chunks.push(Buffer.from("\r\n"));
    chunks.push(
      typeof part.data === "string" ? Buffer.from(part.data) : part.data,
    );
    chunks.push(Buffer.from("\r\n"));
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`));

  return {
    payload: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}
