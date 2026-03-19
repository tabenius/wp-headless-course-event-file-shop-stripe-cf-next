import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const en = JSON.parse(fs.readFileSync("src/lib/i18n/en.json", "utf8"));
const sv = JSON.parse(fs.readFileSync("src/lib/i18n/sv.json", "utf8"));
const es = JSON.parse(fs.readFileSync("src/lib/i18n/es.json", "utf8"));

function flattenKeys(obj, prefix = "") {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return flattenKeys(value, path);
    }
    return [path];
  });
}

test("all locales include every English admin key", () => {
  const enAdminKeys = flattenKeys(en.admin);
  const localeSets = {
    sv: new Set(flattenKeys(sv.admin)),
    es: new Set(flattenKeys(es.admin)),
  };

  for (const [locale, keys] of Object.entries(localeSets)) {
    const missing = enAdminKeys.filter((key) => !keys.has(key));
    assert.deepEqual(
      missing,
      [],
      `Locale ${locale} is missing admin keys: ${missing.join(", ")}`,
    );
  }
});
