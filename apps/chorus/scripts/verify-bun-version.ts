/**
 * verify-bun-version.ts
 *
 * Enforces that the active Bun runtime exactly matches the version pinned in
 * package.json ("packageManager": "bun@<version>"). Run with bun; zero deps so
 * it works inside eas-build-pre-install before node_modules exists.
 *
 * Usage:
 *   bun ./scripts/verify-bun-version.ts            (verify only, exit 1 on mismatch)
 *   bun ./scripts/verify-bun-version.ts --ensure   (on CI/EAS: install pinned bun on mismatch, then verify)
 */

interface ParsedSemver {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

type RangeOperator = "^" | "~" | ">=" | "<=" | ">" | "<" | undefined;

const ROOT_PACKAGE_JSON = new URL("../package.json", import.meta.url).pathname;

const pkg = JSON.parse(await Bun.file(ROOT_PACKAGE_JSON).text()) as {
  packageManager?: string;
  engines?: { bun?: string; };
};

function fail(message: string): never {
  console.error(`[bun-version] FAIL: ${message}`);
  process.exit(1);
}

function parseSemver(version: string): ParsedSemver | null {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version);
  if (match === null) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function cmpSemver(a: ParsedSemver, b: ParsedSemver): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

function checkSegment(version: string, segment: string): boolean {
  if (segment === "*" || segment === "") return true;
  const match = /^(\^|~|>=|<=|>|<)?\s*(\d+\.\d+\.\d+)$/.exec(segment);
  if (match === null) {
    return fail(`unsupported engines.bun range segment: "${segment}"`);
  }
  const operator = match[1] as RangeOperator;
  const base = parseSemver(match[2]);
  const v = parseSemver(version);
  if (base === null || v === null) {
    return fail(`unparseable semver in check: "${version}" vs "${match[2]}"`);
  }
  const c = cmpSemver(v, base);
  switch (operator) {
    case undefined:
      return c === 0;
    case "^":
      return c >= 0 && v.major === base.major;
    case "~":
      return c >= 0 && v.major === base.major && v.minor === base.minor;
    case ">=":
      return c >= 0;
    case "<=":
      return c <= 0;
    case ">":
      return c > 0;
    case "<":
      return c < 0;
  }
}

function satisfies(version: string, range: string): boolean {
  return range.split("||").some((part) => checkSegment(version, part.trim()));
}

function activeBunVersion(): string | null {
  const result = Bun.spawnSync(["bun", "--version"], { stdout: "pipe" });
  if (result.exitCode !== 0) return null;
  return new TextDecoder().decode(result.stdout).trim().replace(/^v/, "");
}

const pinned = typeof pkg.packageManager === "string" ? pkg.packageManager : "";
if (!/^bun@\d+\.\d+\.\d+$/.test(pinned)) {
  fail(
    'package.json "packageManager" must be an exact pin: "bun@<x.y.z>" (no ranges)',
  );
}
const expected = pinned.slice("bun@".length);

const ensure = process.argv.includes("--ensure");
const isCI = process.env.EAS_BUILD === "true" || process.env.CI === "true";

let actual = activeBunVersion();

if (actual !== expected && ensure && isCI) {
  console.log(
    `[bun-version] mismatch (found ${actual ?? "none"}), installing ${pinned} via npm`,
  );
  const install = Bun.spawnSync(["npm", "install", "--global", pinned], {
    stdout: "inherit",
    stderr: "inherit",
  });
  if (install.exitCode !== 0) fail(`failed to install ${pinned} via npm`);
  actual = activeBunVersion();
}

if (actual === null) {
  fail(
    `bun not found on PATH. Required: ${pinned}. Install with: bun upgrade --to ${expected}`,
  );
}

if (actual !== expected) {
  fail(
    [
      "Bun version mismatch. Build aborted.",
      `  package.json requires: ${expected}  (packageManager: ${pinned})`,
      `  active bun runtime:  ${actual}`,
      `  fix: bun upgrade --to ${expected}`,
    ].join("\n"),
  );
}

const enginesRange = pkg.engines?.bun;
if (enginesRange !== undefined && !satisfies(actual, enginesRange)) {
  fail(
    `bun ${actual} does not satisfy package.json engines.bun "${enginesRange}"`,
  );
}

console.log(`[bun-version] OK: bun ${actual} matches ${pinned}`);
