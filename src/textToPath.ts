import * as opentypeModule from "opentype.js";
import type { Font } from "opentype.js";
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
  const outsideThickness = editor.outlines
    .filter((outline) => outline.enabled && outline.placement === "outside")
    .reduce((total, outline) => total + clamp(outline.thickness, 0, 80), 0);
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

export function findMissingGlyphs(editor: EditorDocument, font: OutlineFont): string[] {
  return [...new Set(Array.from(editor.text).filter((glyph) => !/^\s$/u.test(glyph) && !font.hasChar(glyph)))];
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
  let maxAdvance = 1;

  lines.forEach((line, lineIndex) => {
    const glyphs = font.stringToGlyphs(line || " ");
    const baseline = lineIndex * lineHeight;
    let x = 0;

    glyphs.forEach((glyph, glyphIndex) => {
      combinedPath.extend(glyph.getPath(x, baseline, fontSize, {}, font));
      x += finiteOr(glyph.advanceWidth, unitsPerEm) * scale;
      const nextGlyph = glyphs[glyphIndex + 1];
      if (nextGlyph) {
        let kerning = 0;
        try {
          kerning = finiteOr(font.getKerningValue(glyph, nextGlyph), 0);
        } catch {
          kerning = 0;
        }
        x += kerning * scale;
        x += typography.letterSpacing;
      }
    });
    maxAdvance = Math.max(maxAdvance, x);
  });

  let minX = 0;
  let minY = -ascender;
  let maxX = maxAdvance;
  let maxY = Math.max(fontSize, (lines.length - 1) * lineHeight - descender);
  if (combinedPath.commands.length > 0) {
    const bounds = combinedPath.getBoundingBox();
    minX = Math.min(minX, bounds.x1);
    minY = Math.min(minY, bounds.y1);
    maxX = Math.max(maxX, bounds.x2);
    maxY = Math.max(maxY, bounds.y2);
  }

  const padding = pathPadding(editor);
  return {
    pathData: combinedPath.toPathData(3),
    width: Math.ceil(maxX - minX + padding * 2),
    height: Math.ceil(maxY - minY + padding * 2),
    padding,
    translateX: compactNumber(padding - minX),
    translateY: compactNumber(padding - minY),
    missingGlyphs: findMissingGlyphs(editor, font),
  };
}
