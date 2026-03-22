import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizePresets,
  validatePresetInput,
  applyAddPreset,
  applyRemovePreset,
} from "../src/lib/stylePresetsStore.js";

describe("normalizePresets", () => {
  it("returns empty arrays for null", () => {
    assert.deepEqual(normalizePresets(null), { cta: [], typography: [] });
  });

  it("returns empty arrays for missing keys", () => {
    assert.deepEqual(normalizePresets({}), { cta: [], typography: [] });
  });

  it("filters non-array cta to empty", () => {
    assert.deepEqual(normalizePresets({ cta: "bad", typography: [] }), { cta: [], typography: [] });
  });

  it("filters preset entries without id or name", () => {
    const raw = {
      cta: [
        { id: "abc", name: "Good", style: { bgColor: "primary" } },
        { id: "", name: "Bad", style: {} },
        { name: "NoId", style: {} },
      ],
      typography: [],
    };
    const result = normalizePresets(raw);
    assert.equal(result.cta.length, 1);
    assert.equal(result.cta[0].id, "abc");
  });
});

describe("validatePresetInput", () => {
  it("rejects missing type", () => {
    const err = validatePresetInput(null, "My preset", {});
    assert.equal(err, "type must be 'cta' or 'typography'");
  });

  it("rejects invalid type", () => {
    const err = validatePresetInput("button", "My preset", {});
    assert.equal(err, "type must be 'cta' or 'typography'");
  });

  it("rejects empty name", () => {
    const err = validatePresetInput("cta", "", {});
    assert.equal(err, "name is required");
  });

  it("rejects name over 80 chars", () => {
    const err = validatePresetInput("cta", "a".repeat(81), {});
    assert.equal(err, "name must be 80 characters or fewer");
  });

  it("rejects missing style", () => {
    const err = validatePresetInput("cta", "My preset", null);
    assert.equal(err, "style is required");
  });

  it("accepts valid cta input", () => {
    const err = validatePresetInput("cta", "My Dark", { bgColor: "primary" });
    assert.equal(err, null);
  });

  it("accepts valid typography input", () => {
    const err = validatePresetInput("typography", "Elegant Sofia", { fontDisplay: {} });
    assert.equal(err, null);
  });
});

describe("applyAddPreset", () => {
  it("appends to the correct array", () => {
    const presets = { cta: [], typography: [] };
    const result = applyAddPreset(presets, "cta", { id: "x1", name: "Dark", style: {} });
    assert.equal(result.cta.length, 1);
    assert.equal(result.cta[0].id, "x1");
    assert.equal(result.typography.length, 0);
  });

  it("appends to typography array", () => {
    const presets = { cta: [], typography: [] };
    const result = applyAddPreset(presets, "typography", { id: "y1", name: "Elegant", style: {} });
    assert.equal(result.typography.length, 1);
    assert.equal(result.cta.length, 0);
  });
});

describe("applyRemovePreset", () => {
  it("removes matching entry by id", () => {
    const presets = {
      cta: [{ id: "abc", name: "Dark", style: {} }],
      typography: [],
    };
    const result = applyRemovePreset(presets, "cta", "abc");
    assert.equal(result.cta.length, 0);
  });

  it("is idempotent — no error if id not found", () => {
    const presets = { cta: [], typography: [] };
    const result = applyRemovePreset(presets, "cta", "nonexistent");
    assert.deepEqual(result, { cta: [], typography: [] });
  });

  it("only removes from the specified type", () => {
    const presets = {
      cta: [{ id: "abc", name: "Dark", style: {} }],
      typography: [{ id: "abc", name: "Shared id", style: {} }],
    };
    const result = applyRemovePreset(presets, "cta", "abc");
    assert.equal(result.cta.length, 0);
    assert.equal(result.typography.length, 1); // untouched
  });
});
