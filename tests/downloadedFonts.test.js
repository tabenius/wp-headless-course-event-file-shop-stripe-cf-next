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

const {
  getDownloadedFonts,
  upsertDownloadedFont,
  getAllFontFaceCss,
  parseFontWeightList,
} = await import("../src/lib/downloadedFonts.js");

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

  it("trims @font-face blocks to selected weights", () => {
    const fonts = [
      {
        fontFaceCss: [
          "@font-face{font-family:'Inter';font-weight:400;src:url(/inter-400.woff2)}",
          "@font-face{font-family:'Inter';font-weight:900;src:url(/inter-900.woff2)}",
        ].join("\n"),
      },
    ];
    const result = getAllFontFaceCss(fonts, { trimToWeights: [400, 700] });
    assert.ok(result.includes("inter-400.woff2"));
    assert.ok(!result.includes("inter-900.woff2"));
  });
});

describe("parseFontWeightList", () => {
  it("parses comma separated strings and dedupes", () => {
    assert.deepEqual(
      parseFontWeightList("300, 400, 400, 700"),
      [300, 400, 700],
    );
  });

  it("parses arrays and ignores invalid values", () => {
    assert.deepEqual(parseFontWeightList(["300", 0, "abc", "900"]), [300, 900]);
  });
});
