import assert from "node:assert/strict";
import test from "node:test";
import {
  GRADIENT_PRESETS,
  applyGradientPreset,
  createFill,
  createOutline,
  createReferenceDocument,
  matchesGradientPreset,
} from "./editorModel.js";

test("names newly added stroke layers as borders for the user interface", () => {
  assert.equal(createOutline(0).name, "Border 1");
  assert.equal(createOutline(11).name, "Border 12");
});

test("offers eight valid and uniquely named quick gradient presets", () => {
  assert.equal(GRADIENT_PRESETS.length, 8);
  assert.equal(new Set(GRADIENT_PRESETS.map((preset) => preset.id)).size, 8);
  assert.equal(new Set(GRADIENT_PRESETS.map((preset) => preset.name)).size, 8);

  for (const preset of GRADIENT_PRESETS) {
    assert.ok(preset.stops.length >= 2);
    assert.equal(preset.stops[0]?.offset, 0);
    assert.equal(preset.stops.at(-1)?.offset, 100);
    assert.deepEqual(
      preset.stops.map((stop) => stop.offset),
      [...preset.stops].map((stop) => stop.offset).sort((left, right) => left - right),
    );
    for (const stop of preset.stops) {
      assert.match(stop.color, /^#[0-9A-F]{6}$/);
      assert.ok(stop.opacity >= 0 && stop.opacity <= 100);
    }
  }
});

test("keeps the canonical Sunbeam values as the first quick preset", () => {
  const sunbeam = GRADIENT_PRESETS[0];
  assert.equal(sunbeam?.id, "sunbeam");
  assert.equal(sunbeam?.angle, 180);
  assert.deepEqual(
    sunbeam?.stops.map(({ color, offset }) => [color, offset]),
    [
      ["#E9F62A", 0],
      ["#FFF5A0", 26.5679633],
      ["#EED991", 48.0359484],
      ["#F0C739", 60.5414117],
      ["#F1BC15", 100],
    ],
  );

  const reference = createReferenceDocument();
  assert.equal(reference.fills[0]?.name, sunbeam?.name);
  assert.equal(reference.fills[0]?.angle, sunbeam?.angle);
});

test("applies a quick gradient without replacing layer-level settings", () => {
  const fill = { ...createFill(), enabled: false, opacity: 42, type: "solid" as const };
  const preset = GRADIENT_PRESETS[3];
  assert.ok(preset);

  const applied = applyGradientPreset(fill, preset);
  assert.equal(applied.id, fill.id);
  assert.equal(applied.enabled, false);
  assert.equal(applied.opacity, 42);
  assert.equal(applied.type, "linear");
  assert.equal(applied.name, preset.name);
  assert.equal(applied.angle, preset.angle);
  assert.deepEqual(
    applied.stops.map(({ color, offset, opacity }) => ({ color, offset, opacity })),
    preset.stops,
  );
  assert.equal(matchesGradientPreset(applied, preset), true);
  assert.equal(
    matchesGradientPreset(
      { ...applied, stops: applied.stops.map((stop, index) => (index === 0 ? { ...stop, color: "#FFFFFF" } : stop)) },
      preset,
    ),
    false,
  );
});
