import { AppError } from "../types.js";

export async function readUploadToBuffer(
  inputStream: NodeJS.ReadableStream,
): Promise<Buffer> {
  let hitLimit = false;
  inputStream.once("limit", () => {
    hitLimit = true;
  });

  const chunks: Buffer[] = [];
  for await (const chunk of inputStream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const truncated = (
    inputStream as NodeJS.ReadableStream & { truncated?: boolean }
  ).truncated;
  if (hitLimit || truncated) {
    throw new AppError(
      "payload_too_large",
      413,
      "Uploaded payload exceeds size limits.",
    );
  }

  return Buffer.concat(chunks);
}
