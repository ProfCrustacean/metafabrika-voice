#!/usr/bin/env node
/* global Blob, FormData, fetch */

import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, "fixtures", "sps-ru");
const DEFAULT_CREDENTIALS_FILE = join(
  __dirname,
  "..",
  "credentials",
  "integration.agent.env",
);
const DEFAULT_AUDIO = join(FIXTURE_DIR, "spontaneous-speech-ru-71087.mp3");

const MIME_BY_EXTENSION = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".webm": "audio/webm",
  ".m4a": "audio/x-m4a",
  ".mp4": "audio/mp4",
  ".aac": "audio/aac",
};

function loadEnvFromFile(envPath) {
  if (!existsSync(envPath)) {
    return;
  }

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separator = line.indexOf("=");
    if (separator <= 0) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function getEnv(name, fallback) {
  const value = process.env[name];
  if (value && value.trim()) {
    return value.trim();
  }
  return fallback;
}

function requiredEnv(name) {
  const value = getEnv(name);
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function baseUrl() {
  const value = requiredEnv("BASE_URL");
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function apiKey() {
  return requiredEnv("X_API_KEY");
}

function idempotencyPrefix() {
  return getEnv("IDEMPOTENCY_KEY_PREFIX", "integration-smoke");
}

function requestPrefix() {
  return getEnv("X_REQUEST_ID_PREFIX", "integration-client");
}

function parsePositiveInt(name, fallback) {
  const raw = getEnv(name, String(fallback));
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer, got: ${raw}`);
  }
  return parsed;
}

function detectMimeType(filePath) {
  const extension = extname(filePath).toLowerCase();
  return MIME_BY_EXTENSION[extension] || "application/octet-stream";
}

function buildRequestId(suffix) {
  return `${requestPrefix()}-${suffix}-${randomUUID()}`;
}

function buildIdempotencyKey(suffix) {
  return `${idempotencyPrefix()}-${suffix}`;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function shortJson(value) {
  return JSON.stringify(value, null, 2);
}

async function callTranscribe({ audioPath, idempotencyKey, requestId }) {
  const audio = readFileSync(audioPath);
  const mimeType = detectMimeType(audioPath);
  const form = new FormData();
  form.append("audio", new Blob([audio], { type: mimeType }), audioPath);

  const response = await fetch(`${baseUrl()}/v1/transcribe`, {
    method: "POST",
    headers: {
      "X-API-Key": apiKey(),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      ...(requestId ? { "X-Request-Id": requestId } : {}),
    },
    body: form,
  });

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Keep raw body text for debugging.
  }

  return {
    status: response.status,
    headers: {
      requestId: response.headers.get("x-request-id"),
      retryAfter: response.headers.get("retry-after"),
    },
    json,
    rawBody: text,
  };
}

function ensureSuccessResponse(result, contextLabel) {
  assert(
    result.status === 200,
    `${contextLabel}: expected 200, got ${result.status}`,
  );
  assert(
    result.json && typeof result.json === "object",
    `${contextLabel}: expected JSON body`,
  );
  assert(
    typeof result.json.text === "string",
    `${contextLabel}: expected body.text`,
  );
  assert(
    result.json.text.trim().length > 0,
    `${contextLabel}: expected non-empty body.text`,
  );

  const bodyRequestId =
    typeof result.json.requestId === "string" ? result.json.requestId : "";
  const headerRequestId = result.headers.requestId || "";
  assert(
    bodyRequestId || headerRequestId,
    `${contextLabel}: expected requestId in body or X-Request-Id header`,
  );

  if (bodyRequestId && headerRequestId) {
    assert(
      headerRequestId === bodyRequestId,
      `${contextLabel}: header/body requestId mismatch`,
    );
  }
}

function loadFixtureManifest() {
  const manifestPath = join(FIXTURE_DIR, "manifest.json");
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

async function runSingle() {
  const audioPath = getEnv("AUDIO_PATH", DEFAULT_AUDIO);
  const result = await callTranscribe({
    audioPath,
    idempotencyKey: buildIdempotencyKey(`single-${Date.now()}`),
    requestId: buildRequestId("single"),
  });

  ensureSuccessResponse(result, "single");

  console.log("single: PASS");
  console.log(
    shortJson({
      status: result.status,
      requestId: result.json.requestId || result.headers.requestId,
      text: result.json.text,
    }),
  );
}

async function runIdempotency() {
  const audioPath = getEnv("AUDIO_PATH", DEFAULT_AUDIO);
  const key = buildIdempotencyKey(`idempotency-${Date.now()}`);

  const first = await callTranscribe({
    audioPath,
    idempotencyKey: key,
    requestId: buildRequestId("idem-1"),
  });
  const second = await callTranscribe({
    audioPath,
    idempotencyKey: key,
    requestId: buildRequestId("idem-2"),
  });

  ensureSuccessResponse(first, "idempotency:first");
  ensureSuccessResponse(second, "idempotency:second");
  assert(
    first.json.text === second.json.text,
    "idempotency: expected replayed transcript text to match",
  );

  console.log("idempotency: PASS");
  console.log(
    shortJson({
      firstRequestId: first.json.requestId || first.headers.requestId,
      secondRequestId: second.json.requestId || second.headers.requestId,
      transcript: first.json.text,
    }),
  );
}

async function runLoad() {
  const audioPath = getEnv("AUDIO_PATH", DEFAULT_AUDIO);
  const concurrency = parsePositiveInt("LOAD_CONCURRENCY", 12);
  const duplicates = parsePositiveInt("LOAD_DUPLICATES", 3);

  const tasks = [];
  for (let i = 0; i < concurrency; i += 1) {
    const key = buildIdempotencyKey(`load-${Date.now()}-${i}`);
    for (let j = 0; j < duplicates; j += 1) {
      tasks.push(
        callTranscribe({
          audioPath,
          idempotencyKey: key,
          requestId: buildRequestId(`load-${i}-${j}`),
        }),
      );
    }
  }

  const results = await Promise.all(tasks);
  const failed = results.filter((entry) => entry.status !== 200);
  if (failed.length > 0) {
    throw new Error(
      `load: ${failed.length}/${results.length} requests failed; sample failure: ${shortJson(failed[0])}`,
    );
  }

  for (let index = 0; index < results.length; index += 1) {
    ensureSuccessResponse(results[index], `load:${index}`);
  }

  console.log("load: PASS");
  console.log(
    shortJson({
      requests: results.length,
      concurrency,
      duplicates,
    }),
  );
}

async function runFixtures() {
  const manifest = loadFixtureManifest();
  const samples = manifest.samples || [];
  assert(
    Array.isArray(samples) && samples.length > 0,
    "fixtures: manifest has no samples",
  );

  const outcomes = [];
  for (const sample of samples) {
    const audioPath = join(FIXTURE_DIR, sample.file);
    const result = await callTranscribe({
      audioPath,
      idempotencyKey: buildIdempotencyKey(
        `fixture-${sample.audioId}-${Date.now()}`,
      ),
      requestId: buildRequestId(`fixture-${sample.audioId}`),
    });

    ensureSuccessResponse(result, `fixtures:${sample.audioId}`);
    outcomes.push({
      audioId: sample.audioId,
      file: sample.file,
      requestId: result.json.requestId || result.headers.requestId,
      text: result.json.text,
    });
  }

  console.log("fixtures: PASS");
  console.log(
    shortJson({
      dataset: manifest.dataset,
      count: outcomes.length,
      sample: outcomes[0],
    }),
  );
}

async function main() {
  const customEnvFile = getEnv("INTEGRATION_ENV_FILE");
  loadEnvFromFile(customEnvFile || DEFAULT_CREDENTIALS_FILE);

  const mode = process.argv[2];
  if (!mode) {
    throw new Error(
      "Usage: node integration-package/smoke/run-smoke.mjs <single|idempotency|load|fixtures>",
    );
  }

  if (mode === "single") {
    await runSingle();
    return;
  }
  if (mode === "idempotency") {
    await runIdempotency();
    return;
  }
  if (mode === "load") {
    await runLoad();
    return;
  }
  if (mode === "fixtures") {
    await runFixtures();
    return;
  }

  throw new Error(`Unknown mode: ${mode}`);
}

main().catch((error) => {
  console.error("smoke runner failed");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
