import assert from "node:assert/strict";
import test from "node:test";
import {
  createDocumentFromOptions,
  parseCliArgs,
  parseConfig,
  parseOutlineArgument,
  parseStopArgument,
} from "./cli.js";
import { MAX_OUTLINES } from "./editorModel.js";
import { serializeSvg } from "./svg.js";

test("parses repeatable gradient and outline options", () => {
  const options = parseCliArgs([
    "--text",
    "CLI",
    "--stop",
    "#123@0",
    "--stop",
    "#ABCDEF@100:75",
    "--outline",
    "#000@6:outside",
    "--outline",
    "#fff@4:inside:80",
  ]);
  assert.equal(options.text, "CLI");
  assert.deepEqual(options.stops, ["#123@0", "#ABCDEF@100:75"]);
  assert.deepEqual(options.outlines, ["#000@6:outside", "#fff@4:inside:80"]);
});

test("normalizes stop and outline specifications", () => {
  const stop = parseStopArgument("#abc@25:70");
  assert.deepEqual(
    { color: stop.color, offset: stop.offset, opacity: stop.opacity },
    { color: "#AABBCC", offset: 25, opacity: 70 },
  );
  const outline = parseOutlineArgument("#123456@8:center:55");
  assert.deepEqual(
    {
      color: outline.color,
      thickness: outline.thickness,
      placement: outline.placement,
      opacity: outline.opacity,
    },
    { color: "#123456", thickness: 8, placement: "center", opacity: 55 },
  );
});

test("accepts documented JSON config fields", () => {
  assert.deepEqual(
    parseConfig({
      text: "Config",
      font: "monospace",
      size: 120,
      stops: ["#000@0", "#fff@100"],
      outlines: [],
    }),
    {
      text: "Config",
      font: "monospace",
      weight: undefined,
      size: 120,
      tracking: undefined,
      lineHeight: undefined,
      angle: undefined,
      fill: undefined,
      fillOpacity: undefined,
      stops: ["#000@0", "#fff@100"],
      outlines: [],
      noOutline: undefined,
    },
  );
});

test("CLI and web serializer settings remain deterministic", () => {
  const options = {
    text: "Deterministic",
    font: "modern-gothic",
    stops: ["#6F78FF@0", "#F4FF77@100"],
    outlines: ["#000000@6:outside", "#FFFFFF@4:outside"],
  };
  const first = createDocumentFromOptions(options);
  const second = createDocumentFromOptions(options);
  assert.notEqual(first.fills[0].id, second.fills[0].id);
  assert.equal(serializeSvg(first), serializeSvg(second));
});

test("supports the full outline limit and rejects overflow", () => {
  const outlines = Array.from(
    { length: MAX_OUTLINES },
    (_, index) => `#000000@${index + 1}:outside`,
  );
  assert.equal(createDocumentFromOptions({ outlines }).outlines.length, MAX_OUTLINES);
  assert.throws(
    () => createDocumentFromOptions({ outlines: [...outlines, "#FFFFFF@1:inside"] }),
    /At most 12 outlines/,
  );
});
