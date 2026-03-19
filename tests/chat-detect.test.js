import { it } from "node:test";
import assert from "node:assert/strict";
import { detectLanguage } from "../src/lib/chat/detect.js";

it("detects Swedish by diacritics", () =>
  assert.equal(detectLanguage("Är det möjligt?"), "Swedish"));
it("detects Spanish by diacritics", () =>
  assert.equal(detectLanguage("¿Cómo estás?"), "Spanish"));
it("defaults to English", () =>
  assert.equal(detectLanguage("Hello world"), "English"));
it("detects Swedish by keyword", () =>
  assert.equal(detectLanguage("vad är det som händer"), "Swedish"));
it("detects Spanish by keyword", () =>
  assert.equal(detectLanguage("no lo sé en absoluto"), "Spanish"));
