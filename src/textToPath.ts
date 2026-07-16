import * as opentypeModule from "opentype.js";
import type { Font, Path, PathCommand } from "opentype.js";
import { clamp, type EditorDocument } from "./editorModel.js";

type OpenTypeModule = typeof import("opentype.js");
const moduleWithDefault = opentypeModule as OpenTypeModule & { default?: OpenTypeModule };
const opentype: OpenTypeModule = moduleWithDefault.default ?? opentypeModule;

export type OutlineFont = Font;

export interface PathGeometry {
  pathData: string;
  width: number;
  height: number;
  padding: number;
  translateX: number;
  translateY: number;
  missingGlyphs: string[];
}

function finiteOr(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function compactNumber(value: number): number {
  return Number(value.toFixed(3));
}

function pathPadding(editor: EditorDocument): number {
  const outsideThickness = Math.max(
    0,
    ...editor.outlines
      .filter((outline) => outline.enabled && outline.placement === "outside")
      .map((outline) => clamp(outline.thickness, 0, 80)),
  );
  const centeredHalf = Math.max(
    0,
    ...editor.outlines
      .filter((outline) => outline.enabled && outline.placement === "center")
      .map((outline) => clamp(outline.thickness, 0, 80) / 2),
  );
  return Math.ceil(Math.max(outsideThickness, centeredHalf) + 28);
}

export function parseOutlineFont(buffer: ArrayBuffer): OutlineFont {
  return opentype.parse(buffer);
}

export function getOutlineFontFamily(font: OutlineFont): string {
  return font.getEnglishName("fontFamily") || font.getEnglishName("fullName") || "Uploaded font";
}

export function getOutlineFontWeight(font: OutlineFont): number {
  const tables = font.tables as unknown as { os2?: { usWeightClass?: number } };
  const weight = finiteOr(tables.os2?.usWeightClass, 400);
  return clamp(Math.round(weight / 100) * 100, 100, 900);
}

export function findMissingGlyphs(editor: EditorDocument, font: OutlineFont): string[] {
  return [...new Set(Array.from(editor.text).filter((glyph) => !/^\s$/u.test(glyph) && !font.hasChar(glyph)))];
}

function appendCommand(path: Path, command: PathCommand): void {
  switch (command.type) {
    case "M":
      path.moveTo(command.x, command.y);
      break;
    case "L":
      path.lineTo(command.x, command.y);
      break;
    case "C":
      path.bezierCurveTo(
        command.x1,
        command.y1,
        command.x2,
        command.y2,
        command.x,
        command.y,
      );
      break;
    case "Q":
      path.quadraticCurveTo(command.x1, command.y1, command.x, command.y);
      break;
    case "Z":
      path.closePath();
      break;
  }
}

export function closeOpenContours(source: Path): Path {
  const closed = new opentype.Path();
  let contourOpen = false;

  source.commands.forEach((command) => {
    if (command.type === "M") {
      if (contourOpen) closed.closePath();
      contourOpen = true;
      appendCommand(closed, command);
      return;
    }
    if (command.type === "Z") {
      if (contourOpen) closed.closePath();
      contourOpen = false;
      return;
    }
    appendCommand(closed, command);
  });

  if (contourOpen) closed.closePath();
  return closed;
}

function kerningValue(font: OutlineFont, left: ReturnType<OutlineFont["charToGlyph"]>, right: ReturnType<OutlineFont["charToGlyph"]>): number {
  try {
    return finiteOr(font.getKerningValue(left, right), 0);
  } catch {
    return 0;
  }
}

export function createPathGeometry(editor: EditorDocument, font: OutlineFont): PathGeometry {
  const combinedPath = new opentype.Path();
  const { typography } = editor;
  const fontSize = clamp(typography.fontSize, 12, 420);
  const lineHeight = fontSize * typography.lineHeight;
  const unitsPerEm = finiteOr(font.unitsPerEm, 1000);
  const scale = fontSize / unitsPerEm;
  const ascender = finiteOr(font.ascender, unitsPerEm * 0.8) * scale;
  const descender = finiteOr(font.descender, -unitsPerEm * 0.2) * scale;
  const lines = editor.text.split("\n");
  const fixedOriginX = editor.frame.mode === "fixed" ? editor.frame.originX : 0;
  const fixedBaselineY = editor.frame.mode === "fixed" ? editor.frame.baselineY : 0;
  const lineLayouts = lines.map((line) => {
    const glyphs = font.stringToGlyphs(line || " ");
    let x = 0;
    glyphs.forEach((glyph, glyphIndex) => {
      x += finiteOr(glyph.advanceWidth, unitsPerEm) * scale;
      const nextGlyph = glyphs[glyphIndex + 1];
      if (nextGlyph) {
        x += kerningValue(font, glyph, nextGlyph) * scale;
        x += typography.letterSpacing;
      }
    });
    return { glyphs, advance: x };
  });
  const maxAdvance = Math.max(1, ...lineLayouts.map((line) => line.advance));

  lineLayouts.forEach(({ glyphs, advance }, lineIndex) => {
    const baseline = fixedBaselineY + lineIndex * lineHeight;
    const lineOrigin =
      typography.align === "center"
        ? (maxAdvance - advance) / 2
        : typography.align === "right"
          ? maxAdvance - advance
          : 0;
    let x = fixedOriginX + lineOrigin;

    glyphs.forEach((glyph, glyphIndex) => {
      const glyphOffset =
        editor.frame.mode === "fixed" ? editor.frame.glyphOffsets?.[glyphIndex] : undefined;
      combinedPath.extend(
        closeOpenContours(
          glyph.getPath(
            x + (glyphOffset?.x ?? 0),
            baseline + (glyphOffset?.y ?? 0),
            fontSize,
            {},
            font,
          ),
        ),
      );
      x += finiteOr(glyph.advanceWidth, unitsPerEm) * scale;
      const nextGlyph = glyphs[glyphIndex + 1];
      if (nextGlyph) {
        x += kerningValue(font, glyph, nextGlyph) * scale;
        x += typography.letterSpacing;
      }
    });
  });

  let minX = 0;
  let minY = -ascender;
  let maxX = maxAdvance;
  let maxY = (lines.length - 1) * lineHeight - descender;
  if (combinedPath.commands.length > 0) {
    const bounds = combinedPath.getBoundingBox();
    minX = Math.min(minX, bounds.x1);
    minY = Math.min(minY, bounds.y1);
    maxX = Math.max(maxX, bounds.x2);
    maxY = Math.max(maxY, bounds.y2);
  }

  if (editor.frame.mode === "fixed") {
    return {
      pathData: combinedPath.toPathData(6),
      width: editor.frame.width,
      height: editor.frame.height,
      padding: 0,
      translateX: 0,
      translateY: 0,
      missingGlyphs: findMissingGlyphs(editor, font),
    };
  }

  const padding = pathPadding(editor);
  return {
    pathData: combinedPath.toPathData(6),
    width: Math.ceil(maxX - minX + padding * 2),
    height: Math.ceil(maxY - minY + padding * 2),
    padding,
    translateX: compactNumber(padding - minX),
    translateY: compactNumber(padding - minY),
    missingGlyphs: findMissingGlyphs(editor, font),
  };
}
