#!/usr/bin/env bun
import { execSync } from "child_process";
import { readFileSync } from "fs";

interface ConsoleLogResult {
  hasConsoleLog: boolean;
  filesWithLogs: Array<{
    file: string;
    lines: number[];
  }>;
}

function getStagedFiles(): string[] {
  try {
    const files = execSync("git diff --name-only --cached --diff-filter=ACM", {
      encoding: "utf-8",
    })
      .trim()
      .split("\n")
      .filter(Boolean);

    return files.filter(
      (file) =>
        file.endsWith(".ts")
        || file.endsWith(".tsx")
        || file.endsWith(".js")
        || file.endsWith(".jsx"),
    );
  } catch (error) {
    return [];
  }
}

function checkConsoleLogs(files: string[]): ConsoleLogResult {
  const result: ConsoleLogResult = {
    hasConsoleLog: false,
    filesWithLogs: [],
  };

  const excludedPatterns = [
    ".test.ts",
    ".test.tsx",
    ".spec.ts",
    ".spec.tsx",
    ".examples.ts",
    ".examples.tsx",
    "modules",
  ];

  const excludedPaths = ["src/lib/logger/", "scripts/", "plugins/"];

  for (const file of files) {
    // Skip files that match the excluded patterns
    if (excludedPatterns.some((pattern) => file.endsWith(pattern))) {
      continue;
    }

    // Skip files in the logger module
    if (
      excludedPaths.some((path) => file.startsWith(path) || file.includes(path))
    ) {
      continue;
    }
    try {
      const content = readFileSync(file, "utf-8");
      const lines = content.split("\n");
      const logLines: number[] = [];

      lines.forEach((line, index) => {
        const consoleLogRegex =
          /\bconsole\.(log|debug|trace|table|dir|group|groupEnd|time|timeEnd|count|clear|assert)\(/;

        if (consoleLogRegex.test(line)) {
          logLines.push(index + 1);
        }
      });

      if (logLines.length > 0) {
        result.hasConsoleLog = true;
        result.filesWithLogs.push({
          file,
          lines: logLines,
        });
      }
    } catch (error) {
      continue;
    }
  }

  return result;
}

function main() {
  const stagedFiles = getStagedFiles();

  if (stagedFiles.length === 0) {
    console.error("✅ No JS/TS files to check for console logs");
    process.exit(0);
  }

  console.error(
    `🔍 Checking ${stagedFiles.length} staged file(s) for console.log...`,
  );

  const { hasConsoleLog, filesWithLogs } = checkConsoleLogs(stagedFiles);

  if (!hasConsoleLog) {
    console.error("✅ No console.log statements found");
    process.exit(0);
  }

  console.error("\n❌ Error: Found console.log statements in staged files:");
  console.error("");

  filesWithLogs.forEach(({ file, lines }) => {
    console.error(`  📄 ${file}`);
    lines.slice(0, 5).forEach((line) => {
      console.error(`     Line ${line}: console.log found`);
    });
    if (lines.length > 5) {
      console.error(`     ... and ${lines.length - 5} more line(s)`);
    }
    console.error("");
  });

  console.error("💡 Allowed console methods:");
  console.error("  - console.error (for error logging)");
  console.error("  - console.warn (for warnings)");
  console.error("");
  console.error("🚫 Not allowed in commits:");
  console.error("  - console.log");
  console.error("  - console.debug");
  console.error("  - console.trace");
  console.error("  - console.table");
  console.error("  - console.dir");
  console.error("  - console.group*");
  console.error("  - console.time*");
  console.error("  - console.count");
  console.error("  - console.assert");
  console.error("  - console.clear");
  console.error("");
  console.error("🔧 To fix this:");
  console.error("  1. Remove or comment out console.log statements");
  console.error("  2. Use proper logging library (e.g., logger)");
  console.error("  3. Stage only the fixed files: git add <files>");
  console.error("");

  process.exit(1);
}

main();
