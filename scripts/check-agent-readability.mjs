import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";

const rootDir = process.cwd();
const configPath = path.join(rootDir, "agent-readability.config.json");

async function fileExists(relPath) {
  try {
    await stat(path.join(rootDir, relPath));
    return true;
  } catch {
    return false;
  }
}

async function countLines(relPath) {
  const content = await readFile(path.join(rootDir, relPath), "utf8");
  if (content.length === 0) {
    return 0;
  }

  return content.split(/\r?\n/).length;
}

async function findLineViolations(lineRules, ignorePatterns) {
  const violations = [];

  for (const rule of lineRules) {
    const matchingFiles = await fg(rule.pattern, {
      cwd: rootDir,
      onlyFiles: true,
      dot: true,
      unique: true,
      ignore: ignorePatterns,
    });

    for (const relPath of matchingFiles) {
      const lines = await countLines(relPath);
      if (lines > rule.maxLines) {
        violations.push({
          file: relPath,
          lines,
          maxLines: rule.maxLines,
          pattern: rule.pattern,
        });
      }
    }
  }

  return violations;
}

async function findMissingRequired(requiredFiles) {
  const missing = [];
  for (const relPath of requiredFiles) {
    const exists = await fileExists(relPath);
    if (!exists) {
      missing.push(relPath);
    }
  }
  return missing;
}

function printFailureReport(missingRequired, lineViolations) {
  console.error("Agent readability check failed.\n");

  if (missingRequired.length) {
    console.error("Missing required files:");
    for (const relPath of missingRequired) {
      console.error(`  - ${relPath}`);
    }
    console.error("");
  }

  if (lineViolations.length) {
    console.error("Files exceeding line limits:");
    for (const violation of lineViolations) {
      console.error(
        `  - ${violation.file}: ${violation.lines} lines (max ${violation.maxLines}, rule ${violation.pattern})`,
      );
    }
    console.error("");
  }
}

async function main() {
  const configRaw = await readFile(configPath, "utf8");
  const config = JSON.parse(configRaw);

  const requiredFiles = config.requiredFiles || [];
  const ignorePatterns = config.ignorePatterns || [];
  const lineRules = config.lineRules || [];

  const [missingRequired, lineViolations] = await Promise.all([
    findMissingRequired(requiredFiles),
    findLineViolations(lineRules, ignorePatterns),
  ]);

  if (!missingRequired.length && !lineViolations.length) {
    console.log("Agent readability check passed.");
    return;
  }

  printFailureReport(missingRequired, lineViolations);
  process.exit(1);
}

main().catch((error) => {
  console.error("Agent readability check failed to run.");
  console.error(error);
  process.exit(1);
});
