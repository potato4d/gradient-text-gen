import assert from "node:assert/strict";
import test from "node:test";
import { resolveAutomaticSvgOutput } from "./exportPolicy.js";

const liveTextSvg = '<svg><text font-family="sans-serif">Type</text></svg>';
const outlinedSvg = '<svg><path id="text-path" d="M0 0Z" /></svg>';

test("automatically prefers outlined SVG whenever font conversion succeeds", () => {
  const output = resolveAutomaticSvgOutput(liveTextSvg, outlinedSvg, true);

  assert.equal(output.previewMarkup, outlinedSvg);
  assert.equal(output.exportMarkup, outlinedSvg);
  assert.equal(output.isOutlined, true);
  assert.doesNotMatch(output.exportMarkup, /<text/);
});

test("never silently falls back to text after a font source is ready", () => {
  const output = resolveAutomaticSvgOutput(liveTextSvg, null, true);

  assert.equal(output.previewMarkup, "");
  assert.equal(output.exportMarkup, null);
  assert.equal(output.isOutlined, false);
});

test("keeps live text only while no readable font source is available", () => {
  const output = resolveAutomaticSvgOutput(liveTextSvg, null, false);

  assert.equal(output.previewMarkup, liveTextSvg);
  assert.equal(output.exportMarkup, liveTextSvg);
  assert.equal(output.isOutlined, false);
});
