import { readFileSync } from "node:fs";
import { parsePluginPackage } from "@openbrf/plugin-sdk";
import { describe, expect, it } from "vitest";

/**
 * Every key the plugin renders is in both locale files.
 *
 * The package check already holds the two files to the same set of keys. This
 * holds the set to what the manifest, the view and the action name, because a
 * key missing from both is rendered as the key and no other check sees it.
 */

const read = (path: string): Record<string, string> =>
  JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
const sv = read("locales/sv.json");
const en = read("locales/en.json");

const parsed = parsePluginPackage(
  JSON.parse(readFileSync("package.json", "utf8")),
);
if (!parsed.ok) {
  throw new Error("package.json is not a valid plugin manifest.");
}
const { openbrf: manifest } = parsed.value;

function manifestKeys(): string[] {
  const keys = manifest.view === undefined ? [] : [manifest.view.titleKey];
  for (const field of manifest.settingsSchema?.fields ?? []) {
    keys.push(field.labelKey);
    if (field.hintKey !== undefined) {
      keys.push(field.hintKey);
    }
    if (field.type === "select") {
      keys.push(...field.options.map((option) => option.labelKey));
    }
  }
  return keys;
}

/** The keys a source file names in a `t("...")` call or a `...Key: "..."` field. */
function sourceKeys(path: string): string[] {
  const source = readFileSync(path, "utf8");
  return [
    ...source.matchAll(/\bt\(\s*"([^"]+)"/g),
    ...source.matchAll(/\b\w*Key:\s*"([^"]+)"/g),
  ].map((match) => match[1] ?? "");
}

/** A key i18next pluralises is stored as one key per plural form. */
function stored(locale: Record<string, string>, key: string): boolean {
  return key in locale || (`${key}_one` in locale && `${key}_other` in locale);
}

describe("the locale files", () => {
  const named = [
    ...manifestKeys(),
    ...sourceKeys("src/View.tsx"),
    ...sourceKeys("src/server.ts"),
    // The view builds these from the grouping it shows.
    "settings.grouping.address",
    "settings.grouping.floor",
  ];

  it.each([
    ["sv", sv],
    ["en", en],
  ])("hold every key the plugin names, in %s", (_, locale) => {
    expect(named.filter((key) => !stored(locale, key))).toEqual([]);
  });

  it("hold no key the plugin never names", () => {
    const base = (key: string) => key.replace(/_(one|other)$/, "");
    expect(Object.keys(sv).filter((key) => !named.includes(base(key)))).toEqual(
      [],
    );
  });

  it("leave no value empty", () => {
    for (const locale of [sv, en]) {
      expect(
        Object.entries(locale).filter(([, value]) => value.trim() === ""),
      ).toEqual([]);
    }
  });
});
