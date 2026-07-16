import assert from "node:assert/strict";
import test from "node:test";
import opentype from "opentype.js";
import {
  MAX_OUTLINES,
  FONT_OPTIONS,
  createInitialDocument,
  createOutline,
  createReferenceDocument,
  normalizeHex,
} from "./editorModel.js";
import { FRAME_2_OUTSIDE_20_PATH, getFrame2OutsidePath } from "./frame2Calibration.js";
import { escapeXml, gradientVector, serializeSvg, serializeSvgAsPaths } from "./svg.js";
import { closeOpenContours, createPathGeometry } from "./textToPath.js";

function createOutlineFixtureFont() {
  const notdef = new opentype.Glyph({
    name: ".notdef",
    advanceWidth: 600,
    path: new opentype.Path(),
  });
  const space = new opentype.Glyph({
    name: "space",
    unicode: 32,
    advanceWidth: 300,
    path: new opentype.Path(),
  });
  const aPath = new opentype.Path();
  aPath.moveTo(40, 0);
  aPath.lineTo(300, 700);
  aPath.lineTo(560, 0);
  aPath.lineTo(430, 0);
  aPath.lineTo(360, 210);
  aPath.lineTo(240, 210);
  aPath.lineTo(170, 0);
  aPath.close();
  const bPath = new opentype.Path();
  bPath.moveTo(40, 0);
  bPath.lineTo(40, 700);
  bPath.lineTo(500, 700);
  bPath.lineTo(560, 350);
  bPath.lineTo(500, 0);
  bPath.close();

  return new opentype.Font({
    familyName: "Fixture Sans",
    styleName: "Regular",
    unitsPerEm: 1000,
    ascender: 800,
    descender: -200,
    glyphs: [
      notdef,
      space,
      new opentype.Glyph({ name: "A", unicode: 65, advanceWidth: 620, path: aPath }),
      new opentype.Glyph({ name: "B", unicode: 66, advanceWidth: 640, path: bPath }),
    ],
  });
}

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
  const svg = serializeSvg(createReferenceDocument());

  assert.match(svg, /width="\d+" height="\d+" viewBox="0 0 \d+ \d+"/);
  assert.match(svg, /stop-color="#E9F62A"/);
  assert.match(svg, /stop-color="#FFF5A0"/);
  assert.match(svg, /offset="26\.5679633%"/);
  assert.match(svg, /stroke="#FFFFFF" stroke-width="40"/);
  assert.match(svg, /stroke="#000000" stroke-width="24"/);
  assert.match(svg, /font-family="&apos;DelaSuko Gothic One&apos;/);
  assert.match(svg, /width="874" height="310" viewBox="0 0 874 310"/);
  assert.match(svg, /stroke-linejoin="miter"/);
  assert.doesNotMatch(svg, /<rect/);
  assert.doesNotMatch(svg, /<!--/);
});

test("starts with a portable system font while keeping DelaSuko reference-only", () => {
  const editor = createInitialDocument();
  const reference = createReferenceDocument();

  assert.equal(editor.typography.fontId, "japanese-sans");
  assert.doesNotMatch(editor.typography.fontFamily, /DelaSuko/i);
  assert.deepEqual(editor.frame, { mode: "fit" });
  assert.equal(FONT_OPTIONS.some((font) => /DelaSuko/i.test(font.family)), false);
  assert.match(reference.typography.fontFamily, /DelaSuko Gothic One/);
  assert.equal(reference.frame.mode, "fixed");
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

test("serializes deterministic portable paths without font dependencies", () => {
  const first = createInitialDocument();
  const second = createInitialDocument();
  first.text = "AB\nA";
  second.text = "AB\nA";
  first.typography.letterSpacing = 7;
  second.typography.letterSpacing = 7;
  first.outlines = [
    { ...createOutline(0), placement: "outside" },
    { ...createOutline(1), placement: "center" },
    { ...createOutline(2), placement: "inside" },
  ];
  second.outlines = first.outlines.map((outline) => ({
    ...outline,
    id: `${outline.id}-different`,
  }));

  const firstSvg = serializeSvgAsPaths(first, createOutlineFixtureFont());
  const secondSvg = serializeSvgAsPaths(second, createOutlineFixtureFont());
  assert.equal(firstSvg, secondSvg);
  assert.match(firstSvg, /data-text-as-path="true"/);
  assert.match(firstSvg, /<path id="text-path" d="M/);
  assert.match(firstSvg, /<use href="#text-path"/);
  assert.match(firstSvg, /data-placement="outside"/);
  assert.match(firstSvg, /data-placement="center"/);
  assert.match(firstSvg, /data-placement="inside"/);
  assert.doesNotMatch(firstSvg, /<text|<tspan|font-family=/);
  assert.doesNotMatch(firstSvg, /NaN|Infinity/);
  assert.doesNotMatch(firstSvg, /(?:^|[\s,(])-0(?:\.0+)?(?=[\s,)"LMCQZ]|$)/);
});

test("closes every OpenType contour before applying SVG strokes", () => {
  const source = new opentype.Path();
  source.moveTo(0, 0);
  source.lineTo(20, 0);
  source.lineTo(20, 20);
  source.moveTo(5, 5);
  source.lineTo(10, 5);
  source.lineTo(10, 10);

  const closed = closeOpenContours(source);
  assert.equal(closed.commands.filter((command) => command.type === "M").length, 2);
  assert.equal(closed.commands.filter((command) => command.type === "Z").length, 2);
});

test("keeps the Frame 2 outline calibration closed and scoped to its exact preset", () => {
  const moves = (FRAME_2_OUTSIDE_20_PATH.pathData.match(/M/g) ?? []).length;
  const closes = (FRAME_2_OUTSIDE_20_PATH.pathData.match(/Z/g) ?? []).length;

  assert.ok(moves > 0);
  assert.equal(moves, closes);
  assert.equal(FRAME_2_OUTSIDE_20_PATH.strokeWidth, 20);
  const unrelatedGeometry = {
    pathData: "M0 0Z",
    width: 874,
    height: 310,
    padding: 0,
    translateX: 0,
    translateY: 0,
  };
  assert.equal(getFrame2OutsidePath(unrelatedGeometry, 20), undefined);
  assert.equal(getFrame2OutsidePath(unrelatedGeometry, 12), undefined);
});

test("uses actual font metrics instead of reserving a full font size below the baseline", () => {
  const editor = createInitialDocument();
  editor.frame = { mode: "fit" };
  editor.text = "A";
  editor.outlines = [];
  const geometry = createPathGeometry(editor, createOutlineFixtureFont());

  assert.ok(geometry.height < editor.typography.fontSize * 2);
  assert.equal((geometry.pathData.match(/M/g) ?? []).length, (geometry.pathData.match(/Z/g) ?? []).length);
});

test("rejects path export when the font is missing a glyph", () => {
  const editor = createInitialDocument();
  editor.text = "AC";
  assert.throws(
    () => serializeSvgAsPaths(editor, createOutlineFixtureFont()),
    /selected font is missing: C/,
  );
});
