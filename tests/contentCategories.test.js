import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveDigitalProductCategories,
  extractCategoryNames,
  inferDigitalFileHeuristicCategories,
  toCategorySlugs,
} from "../src/lib/contentCategories.js";

test("extractCategoryNames reads GraphQL edges/nodes and de-duplicates", () => {
  const names = extractCategoryNames(
    { edges: [{ node: { name: "Book" } }, { node: { name: "Audio" } }] },
    { nodes: [{ name: "book" }, { name: "Course" }] },
    "  Event  ",
  );
  assert.deepEqual(names, ["Book", "Audio", "Course", "Event"]);
});

test("toCategorySlugs normalizes mixed names", () => {
  const slugs = toCategorySlugs(["Digital file", "Böckér", "Audio", "Audio"]);
  assert.deepEqual(slugs, ["digital-file", "bocker", "audio"]);
});

test("inferDigitalFileHeuristicCategories uses extension and mime type", () => {
  const names = inferDigitalFileHeuristicCategories({
    fileUrl: "https://example.com/files/startguide.pdf?download=1",
    mimeType: "application/pdf",
  });
  assert.deepEqual(names, ["Document", "PDF"]);
});

test("deriveDigitalProductCategories infers digital file categories", () => {
  const result = deriveDigitalProductCategories({
    type: "digital_file",
    fileUrl: "https://example.com/audio/lesson.mp3",
  });
  assert.equal(result.categories.includes("Digital file"), true);
  assert.equal(result.categories.includes("Download"), true);
  assert.equal(result.categories.includes("Audio"), true);
  assert.equal(result.categorySlugs.includes("audio"), true);
});

test("deriveDigitalProductCategories infers digital course defaults", () => {
  const result = deriveDigitalProductCategories({ type: "digital_course" });
  assert.deepEqual(result.categories, ["Digital course", "Course"]);
  assert.deepEqual(result.categorySlugs, ["digital-course", "course"]);
});
