import { randomUUID } from "node:crypto";

export function buildRequestId(
  rawHeader: string | string[] | undefined,
): string {
  if (typeof rawHeader === "string" && rawHeader.trim()) {
    return rawHeader.trim();
  }
  return `req_${randomUUID()}`;
}
