import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";

// Mock s3upload so its @/lib imports don't cause resolution errors
mock.module("../src/lib/s3upload.js", {
  namedExports: {
    putBucketObject: mock.fn(async () => {}),
    headBucketObject: mock.fn(async () => {}),
  },
});

const { familyToSlug, buildFontFaceCss } = await import(
  "../src/lib/fontDownload.js"
);

describe("familyToSlug", () => {
  it("converts family name to slug", () => {
    assert.equal(familyToSlug("Inter"), "inter");
    assert.equal(familyToSlug("Playfair Display"), "playfair-display");
    assert.equal(familyToSlug("DM Sans"), "dm-sans");
    assert.equal(familyToSlug("IBM Plex Sans"), "ibm-plex-sans");
  });
  it("strips non-alphanumeric characters", () => {
    assert.equal(familyToSlug("Font (Test)!"), "font-test");
  });
});

describe("buildFontFaceCss", () => {
  it("builds variable @font-face block", () => {
    const css = buildFontFaceCss(
      "Inter",
      "inter",
      true,
      [100, 900],
      [
        {
          r2Url: "https://r2.example.com/fonts/inter/inter-variable.woff2",
          unicodeRange: null,
        },
      ],
    );
    assert.ok(css.includes("font-family: 'Inter'"));
    assert.ok(css.includes("font-weight: 100 900"));
    assert.ok(css.includes("inter-variable.woff2"));
    assert.ok(css.includes("font-display: swap"));
  });

  it("builds non-variable @font-face block per weight", () => {
    const css = buildFontFaceCss("Lora", "lora", false, null, [
      {
        r2Url: "https://r2.example.com/fonts/lora/400.woff2",
        weight: 400,
        unicodeRange: null,
      },
      {
        r2Url: "https://r2.example.com/fonts/lora/700.woff2",
        weight: 700,
        unicodeRange: null,
      },
    ]);
    assert.ok(css.includes("font-weight: 400"));
    assert.ok(css.includes("font-weight: 700"));
    assert.ok(css.includes("400.woff2"));
    assert.ok(css.includes("700.woff2"));
  });
});
