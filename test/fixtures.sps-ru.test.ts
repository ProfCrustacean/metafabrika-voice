import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

interface FixtureSample {
  audioId: number;
  file: string;
  durationMs: number;
  split: string;
  votes: number;
  prompt: string;
  referenceTranscription: string;
  sourceCorpus: string;
  bytes: number;
}

interface FixtureManifest {
  dataset: string;
  language: string;
  samples: FixtureSample[];
}

function readFixtureManifest(): FixtureManifest {
  const testDir = dirname(fileURLToPath(import.meta.url));
  const manifestPath = join(testDir, "fixtures", "sps-ru", "manifest.json");
  return JSON.parse(readFileSync(manifestPath, "utf-8")) as FixtureManifest;
}

describe("sps-ru fixture set", () => {
  it("contains short clips suitable for stage-1 STT checks", () => {
    const manifest = readFixtureManifest();

    expect(manifest.dataset).toBe("sps-corpus-2.0-2025-12-05-ru");
    expect(manifest.language).toBe("ru");
    expect(manifest.samples.length).toBeGreaterThanOrEqual(10);

    const testDir = dirname(fileURLToPath(import.meta.url));
    const fixturesDir = join(testDir, "fixtures", "sps-ru");

    for (const sample of manifest.samples) {
      expect(sample.durationMs).toBeLessThanOrEqual(29_000);
      expect(sample.durationMs).toBeGreaterThan(0);
      expect(sample.referenceTranscription.length).toBeGreaterThan(0);
      expect(sample.file.endsWith(".mp3")).toBe(true);
      expect(existsSync(join(fixturesDir, sample.file))).toBe(true);
    }
  });
});
