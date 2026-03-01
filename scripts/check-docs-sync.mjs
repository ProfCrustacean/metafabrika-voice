import { execSync } from "node:child_process";

const DOCS_FILES = new Set(["docs/REPO_MAP.md", "AGENTS.md"]);
const WATCHED_EXACT = new Set([
  "package.json",
  "tsconfig.json",
  "agent-readability.config.json",
  "eslint.config.js",
]);
const WATCHED_PREFIXES = [
  "src/",
  "test/",
  "scripts/",
  "docs/stt-service.md",
  ".github/workflows/",
];

function run(command) {
  return execSync(command, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function parseLines(output) {
  if (!output) {
    return [];
  }

  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function getDiffRange() {
  const baseRef = process.env.DOCS_SYNC_BASE_REF;

  if (baseRef) {
    return `origin/${baseRef}...HEAD`;
  }

  return process.env.DOCS_SYNC_RANGE || null;
}

function readFilesFromRange(range) {
  const output = run(`git diff --name-only --diff-filter=ACMR ${range}`);
  return parseLines(output);
}

function readLocalChangedFiles() {
  const changed = new Set();

  try {
    const unstaged = run("git diff --name-only --diff-filter=ACMR HEAD");
    for (const filePath of parseLines(unstaged)) {
      changed.add(filePath);
    }
  } catch {
    // Initial repository state with no HEAD commit.
  }

  try {
    const staged = run("git diff --cached --name-only --diff-filter=ACMR");
    for (const filePath of parseLines(staged)) {
      changed.add(filePath);
    }
  } catch {
    // Keep best-effort behavior for local usage.
  }

  try {
    const untracked = run("git ls-files --others --exclude-standard");
    for (const filePath of parseLines(untracked)) {
      changed.add(filePath);
    }
  } catch {
    // Keep best-effort behavior for local usage.
  }

  return [...changed];
}

function readChangedFiles(range) {
  if (!range) {
    return readLocalChangedFiles();
  }

  try {
    return readFilesFromRange(range);
  } catch (error) {
    if (process.env.DOCS_SYNC_BASE_REF) {
      throw error;
    }
    console.log(
      "Docs sync check: custom DOCS_SYNC_RANGE could not be resolved; falling back to local working tree diff.",
    );
    return readLocalChangedFiles();
  }
}

function isWatchedFile(filePath) {
  if (WATCHED_EXACT.has(filePath)) {
    return true;
  }

  for (const prefix of WATCHED_PREFIXES) {
    if (filePath.startsWith(prefix)) {
      return true;
    }
  }

  return false;
}

function checkDocsSync(changedFiles) {
  const watchedChanges = changedFiles.filter(isWatchedFile);
  const docsUpdated = changedFiles.some((filePath) => DOCS_FILES.has(filePath));

  if (!watchedChanges.length || docsUpdated) {
    console.log("Docs sync check passed.");
    return;
  }

  console.error("Docs sync check failed.\n");
  console.error(
    "Code/structure files changed, but docs map/playbook were not updated.",
  );
  console.error("Update at least one of:");
  console.error("  - docs/REPO_MAP.md");
  console.error("  - AGENTS.md");
  console.error("");
  console.error("Watched files changed in this diff:");
  for (const filePath of watchedChanges) {
    console.error(`  - ${filePath}`);
  }

  process.exit(1);
}

function main() {
  const range = getDiffRange();
  const changedFiles = readChangedFiles(range);
  checkDocsSync(changedFiles);
}

try {
  main();
} catch (error) {
  console.error("Docs sync check failed to run.");
  console.error(error);
  process.exit(1);
}
