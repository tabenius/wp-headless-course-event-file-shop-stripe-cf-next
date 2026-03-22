import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Mutable state captured by the mock functions
let readResponse = null;
let writeResponse = true;

const mockRead = mock.fn(async () => readResponse);
const mockWrite = mock.fn(async () => writeResponse);

mock.module("../src/lib/cloudflareKv.js", {
  namedExports: {
    readCloudflareKvJson: mockRead,
    writeCloudflareKvJson: mockWrite,
  },
});

const { getDownloadedFonts, upsertDownloadedFont, getAllFontFaceCss } =
  await import("../src/lib/downloadedFonts.js");

describe("getDownloadedFonts", () => {
  beforeEach(() => {
    mockRead.mock.resetCalls();
    mockWrite.mock.resetCalls();
    readResponse = null;
  });

  it("returns [] when KV is empty", async () => {
    readResponse = null;
    assert.deepEqual(await getDownloadedFonts(), []);
  });

  it("returns stored array", async () => {
    const stored = [
      {
        family: "Inter",
        slug: "inter",
        isVariable: true,
        weightRange: [100, 900],
        fontFaceCss: "@font-face{}",
      },
    ];
    readResponse = stored;
    assert.deepEqual(await getDownloadedFonts(), stored);
  });
});

describe("upsertDownloadedFont", () => {
  beforeEach(() => {
    mockRead.mock.resetCalls();
    mockWrite.mock.resetCalls();
    readResponse = [];
  });

  it("inserts a new font record", async () => {
    readResponse = [];
    const record = {
      family: "Inter",
      slug: "inter",
      isVariable: true,
      weightRange: [100, 900],
      fontFaceCss: "@font-face{}",
    };
    await upsertDownloadedFont(record);
    const writtenData = mockWrite.mock.calls[0].arguments[1];
    assert.equal(writtenData.length, 1);
    assert.equal(writtenData[0].family, "Inter");
  });

  it("replaces existing record by family", async () => {
    readResponse = [
      {
        family: "Inter",
        slug: "inter",
        isVariable: false,
        weights: [400],
        fontFaceCss: "old",
      },
    ];
    const updated = {
      family: "Inter",
      slug: "inter",
      isVariable: true,
      weightRange: [100, 900],
      fontFaceCss: "new",
    };
    await upsertDownloadedFont(updated);
    const writtenData = mockWrite.mock.calls[0].arguments[1];
    assert.equal(writtenData.length, 1);
    assert.equal(writtenData[0].fontFaceCss, "new");
  });
});

describe("getAllFontFaceCss", () => {
  it("concatenates fontFaceCss from all records", () => {
    const fonts = [
      { fontFaceCss: "@font-face{font-family:'Inter'}" },
      { fontFaceCss: "@font-face{font-family:'Lora'}" },
    ];
    const result = getAllFontFaceCss(fonts);
    assert.ok(result.includes("Inter"));
    assert.ok(result.includes("Lora"));
  });

  it("returns empty string for empty array", () => {
    assert.equal(getAllFontFaceCss([]), "");
  });
});
