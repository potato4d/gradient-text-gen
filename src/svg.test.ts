import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_OUTLINES,
  createInitialDocument,
  createOutline,
  normalizeHex,
} from "./editorModel.js";
import { escapeXml, gradientVector, serializeSvg } from "./svg.js";

test("normalizes supported hexadecimal colors", () => {
  assert.equal(normalizeHex("#abc"), "#AABBCC");
  assert.equal(normalizeHex("#12ef90"), "#12EF90");
  assert.equal(normalizeHex("broken", "#123456"), "#123456");
});

test("escapes XML-sensitive artwork text", () => {
  assert.equal(escapeXml(`A & <B> "C" 'D'`), "A &amp; &lt;B&gt; &quot;C&quot; &apos;D&apos;");
});

test("maps a 180 degree gradient from top to bottom", () => {
  assert.deepEqual(gradientVector(180), { x1: 50, y1: 0, x2: 50, y2: 100 });
});

test("serializes the reference preset with deterministic gradient and outline geometry", () => {
  const svg = serializeSvg(createInitialDocument());

  assert.match(svg, /width="\d+" height="\d+" viewBox="0 0 \d+ \d+"/);
  assert.match(svg, /stop-color="#E9F62A"/);
  assert.match(svg, /stop-color="#FFF5A0"/);
  assert.match(svg, /stroke="#FFFFFF" stroke-width="20"/);
  assert.match(svg, /stroke="#050505" stroke-width="12"/);
  assert.match(svg, /font-family="&apos;Arial Black&apos;/);
  assert.doesNotMatch(svg, /<rect/);
  assert.doesNotMatch(svg, /<!--/);
});

test("equivalent settings serialize to byte-identical final SVG content", () => {
  const first = createInitialDocument();
  const second = createInitialDocument();

  assert.notEqual(first.fills[0].id, second.fills[0].id);
  assert.notEqual(first.outlines[0].id, second.outlines[0].id);
  assert.equal(serializeSvg(first), serializeSvg(second));
  assert.equal(serializeSvg(first), serializeSvg(first));
});

test("supports zero outlines and at least ten outline layers", () => {
  const withoutOutlines = createInitialDocument();
  withoutOutlines.outlines = [];
  assert.doesNotMatch(serializeSvg(withoutOutlines), /data-placement=/);

  const manyOutlines = createInitialDocument();
  manyOutlines.outlines = Array.from({ length: MAX_OUTLINES }, (_, index) => createOutline(index));
  const svg = serializeSvg(manyOutlines);
  assert.equal((svg.match(/data-placement="outside"/g) ?? []).length, MAX_OUTLINES);
  assert.ok(MAX_OUTLINES >= 10);
});

test("serializes center and true clipped inside placements", () => {
  const editor = createInitialDocument();
  editor.outlines = [
    { ...createOutline(0), placement: "center", thickness: 7 },
    { ...createOutline(1), placement: "inside", thickness: 9 },
  ];
  const svg = serializeSvg(editor);

  assert.match(svg, /<clipPath id="inside-clip">/);
  assert.match(svg, /stroke-width="7"[^>]+data-placement="center"/);
  assert.match(svg, /stroke-width="18"[^>]+data-placement="inside"/);
});

test("preserves Japanese and escaped symbols in exported text", () => {
  const editor = createInitialDocument();
  editor.text = "ライゼオル & <光>";
  const svg = serializeSvg(editor);

  assert.match(svg, /ライゼオル &amp; &lt;光&gt;/);
  assert.doesNotMatch(svg, /ライゼオル & <光>/);
});
