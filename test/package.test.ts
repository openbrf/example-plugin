import { readFileSync } from "node:fs";
import { parsePluginPackage } from "@openbrf/plugin-sdk";
import { readThemeArchive } from "@openbrf/theme-tools";
import { describe, expect, it } from "vitest";
import { packTarball, tarballProblems } from "../scripts/check-package.mjs";

const packageJson: unknown = JSON.parse(readFileSync("package.json", "utf8"));

describe("the packed package", () => {
  const bytes = new Uint8Array(packTarball());

  it("passes the checks the catalog runs before it lists a plugin", () => {
    expect(tarballProblems(bytes)).toEqual([]);
  });

  it("holds the built entries and the locales, and none of the sources or tests", () => {
    const files = [...readThemeArchive(bytes).keys()];

    expect(files).toEqual(
      expect.arrayContaining([
        "package.json",
        "LICENSE",
        "README.md",
        "dist/server.cjs",
        "dist/remoteEntry.js",
        "locales/sv.json",
        "locales/en.json",
      ]),
    );
    expect(
      files.filter((file) => /^(src|test|scripts|node_modules)\//.test(file)),
    ).toEqual([]);
  });
});

describe("the manifest", () => {
  const parsed = parsePluginPackage(packageJson);

  it("is one an instance accepts", () => {
    expect(parsed.ok).toBe(true);
  });

  it("does not claim the OAuth protected resource, which would keep a connector from installing", () => {
    expect(
      parsed.ok && parsed.value.openbrf.oauthProtectedResource,
    ).toBeFalsy();
  });

  it("declares no runtime dependencies, only the host packages it shares as peers", () => {
    const manifest = packageJson as Record<string, unknown>;
    expect(manifest.dependencies).toBeUndefined();
    expect(Object.keys(manifest.peerDependencies as object).sort()).toEqual([
      "@nestjs/common",
      "zod",
    ]);
  });
});
