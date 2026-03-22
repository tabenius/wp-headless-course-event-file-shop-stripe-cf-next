import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";

let readResponse = null;
const mockRead = mock.fn(async () => readResponse);
const mockWrite = mock.fn(async () => true);

mock.module("../src/lib/cloudflareKv.js", {
  namedExports: {
    readCloudflareKvJson: mockRead,
    writeCloudflareKvJson: mockWrite,
  },
});

const { normalizeCatalog, isVariableFont } = await import(
  "../src/lib/googleFontsCatalog.js"
);

describe("normalizeCatalog", () => {
  it("normalizes Google Fonts API response", () => {
    const raw = {
      items: [
        {
          family: "Inter",
          category: "sans-serif",
          axes: [{ tag: "wght" }],
          variants: ["regular"],
        },
        {
          family: "Lora",
          category: "serif",
          axes: [],
          variants: ["regular", "700"],
        },
      ],
    };
    const result = normalizeCatalog(raw);
    assert.equal(result.fonts.length, 2);
    assert.equal(result.fonts[0].family, "Inter");
  });

  it("normalizes snapshot format (already normalized)", () => {
    const snapshot = {
      fonts: [
        { family: "Inter", category: "sans-serif", axes: [], variants: [] },
      ],
    };
    const result = normalizeCatalog(snapshot);
    assert.equal(result.fonts[0].family, "Inter");
  });
});

describe("isVariableFont", () => {
  it("returns true when axes contains wght", () => {
    assert.equal(isVariableFont([{ tag: "wght" }]), true);
  });
  it("returns false when axes is empty", () => {
    assert.equal(isVariableFont([]), false);
  });
  it("returns false when axes is undefined", () => {
    assert.equal(isVariableFont(undefined), false);
  });
});
