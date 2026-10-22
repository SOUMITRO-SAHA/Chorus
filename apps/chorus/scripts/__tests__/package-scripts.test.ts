import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

interface PackageManifest {
  packageManager: string;
  engines: { bun: string; };
  devDependencies: Record<string, string>;
  scripts: Record<string, string>;
}

interface DprintConfig {
  plugins: string[];
  excludes: string[];
  exec: {
    commands: Array<{
      command: string;
      exts: string[];
      cacheKeyFiles?: string[];
    }>;
  };
}

const manifest = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as PackageManifest;
const scriptsTsconfig = JSON.parse(
  readFileSync(new URL("../../tsconfig.scripts.json", import.meta.url), "utf8"),
) as { compilerOptions: { types: string[]; }; include: string[]; };
const dprintConfig = JSON.parse(
  readFileSync(new URL("../../../dprint.json", import.meta.url), "utf8"),
) as DprintConfig;

describe("mobile and web package scripts", () => {
  test("the project pins the Bun version used by its checks", () => {
    expect(manifest.packageManager).toBe("bun@1.4.3");
    expect(manifest.engines.bun).toBe("1.4.3");
    expect(manifest.devDependencies["@types/bun"]).toBe("1.4.3");
    expect(scriptsTsconfig.compilerOptions.types).toEqual(["bun", "node"]);
    expect(scriptsTsconfig.include).toEqual(["scripts/**/*.ts"]);
  });

  test("script types are checked through Bun", () => {
    expect(manifest.scripts["typecheck:scripts"]).toBe(
      "bun check -p tsconfig.scripts.json",
    );
    expect(manifest.scripts.build).toContain("bun check -b");
  });

  test("the imported helper tests have a package command", () => {
    expect(manifest.scripts["test:scripts"]).toBe(
      "bun test ./scripts/__tests__",
    );
  });

  test("dprint is pinned and exposed as format and format-check commands", () => {
    expect(manifest.devDependencies.dprint).toBe("0.64.1");
    expect(manifest.scripts.format).toBe("dprint fmt");
    expect(manifest.scripts["format:check"]).toBe("dprint check");
    expect(dprintConfig.plugins).toContain("npm:@dprint/typescript@0.96.1");
    expect(dprintConfig.plugins).toContain(
      "npm:@dprint/exec@0.8.0/plugin.json@9d6234ea05810c775f388c2a4cce82b9116b69294b65e0e1e9d64f1446283ef3",
    );
    expect(dprintConfig.exec.commands).toContainEqual(
      expect.objectContaining({
        command: "rustfmt --edition 2024",
        exts: ["rs"],
      }),
    );
    expect(dprintConfig.excludes).toContain("app/src/components/ui/**");
    expect(dprintConfig.excludes).toContain("**/Cargo.lock");
  });

  test("pre-commit runs the Bun checks and console logger guard", () => {
    const hookPath = new URL("../../../.githooks/pre-commit", import.meta.url);
    expect(existsSync(hookPath)).toBe(true);
    if (!existsSync(hookPath)) return;

    const preCommit = manifest.scripts["pre-commit"];
    expect(preCommit).toContain("scripts/verify-bun-version.ts");
    expect(preCommit).toContain("format:check");
    expect(preCommit).toContain("bun check -b");
    expect(preCommit).toContain("typecheck:scripts");
    expect(preCommit).toContain("test:scripts");
    expect(preCommit).toContain("scripts/console-log-check.ts");
    expect(readFileSync(hookPath, "utf8")).toContain("bun run pre-commit");
  });

  test("Android wireless workflows use the Chorus Tauri commands", () => {
    expect(manifest.scripts["android:wireless"]).toBe(
      "bun ./scripts/android-wireless-connect.ts",
    );
    expect(manifest.scripts["android:wireless:menu"]).toBe(
      "bun ./scripts/android-wireless-connect.ts --menu",
    );
    expect(manifest.scripts["android:wireless:start"]).toBe(
      "tauri android dev --force-ip-prompt",
    );
    expect(manifest.scripts["android:wireless:run"]).toContain(
      "&& bun run android:wireless:start",
    );
  });

  test("iOS helpers target Tauri and Chorus instead of copied app identities", () => {
    expect(manifest.scripts.ios).toBe("tauri ios dev");
    expect(manifest.scripts["ios:device:list"]).toBe(
      "bash ./scripts/ios-device-helper.sh list",
    );
    expect(manifest.scripts["ios:deploy"]).toBe(
      "bash ./scripts/ios-device-helper.sh deploy",
    );
    expect(manifest.scripts["ios:auto:log"]).toContain(
      "com.soumitrasaha.chorus",
    );
    expect(JSON.stringify(manifest.scripts)).not.toMatch(/expo|maximize/i);
  });

  test("the web preview binds locally", () => {
    expect(manifest.scripts.web).toBe("vite --host 127.0.0.1");
  });
});
