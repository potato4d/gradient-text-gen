import { clamp, type EditorDocument, type TypographySettings } from "./editorModel.js";
import { getFrame2OutsidePath } from "./frame2Calibration.js";
import {
  createPathGeometry,
  findMissingGlyphs,
  type OutlineFont,
  type PathGeometry,
} from "./textToPath.js";

export interface GradientVector {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface SvgLayout {
  width: number;
  height: number;
  padding: number;
  baseline: number;
  lineHeight: number;
  lines: string[];
}

export interface SerializedSvgResult {
  markup: string;
  layout: SvgLayout;
}

export type LineMeasure = (line: string, typography: TypographySettings) => number;

export function escapeXml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function gradientVector(angle: number): GradientVector {
  const radians = ((angle - 90) * Math.PI) / 180;
  const dx = Math.cos(radians);
  const dy = Math.sin(radians);
  const scale = 50 / Math.max(Math.abs(dx), Math.abs(dy), 0.0001);
  return {
    x1: Number((50 - dx * scale).toFixed(3)),
    y1: Number((50 - dy * scale).toFixed(3)),
    x2: Number((50 + dx * scale).toFixed(3)),
    y2: Number((50 + dy * scale).toFixed(3)),
  };
}

function glyphWidthFactor(glyph: string): number {
  if (/^\s$/.test(glyph)) return 0.35;
  if (/^[ilI1|.,'`:;!]$/.test(glyph)) return 0.34;
  if (/^[mwMW@%&QO]$/.test(glyph)) return 0.94;
  if (/^[\u0000-\u00ff]$/.test(glyph)) return 0.67;
  return 1;
}

export const deterministicLineMeasure: LineMeasure = (line, typography) => {
  const glyphs = Array.from(line || " ");
  const weightedLength = glyphs.reduce(
    (total, glyph) => total + glyphWidthFactor(glyph),
    0,
  );
  return Math.max(
    1,
    weightedLength * typography.fontSize +
      Math.max(0, glyphs.length - 1) * typography.letterSpacing,
  );
};

export function measureDocument(
  editor: EditorDocument,
  measureLine: LineMeasure = deterministicLineMeasure,
): SvgLayout {
  const lines = editor.text.split("\n");
  const typography = editor.typography;
  const lineHeight = typography.fontSize * typography.lineHeight;
  const widths = lines.map((line) => measureLine(line || " ", typography));
  if (editor.frame.mode === "fixed") {
    return {
      width: editor.frame.width,
      height: editor.frame.height,
      padding: editor.frame.originX,
      baseline: editor.frame.baselineY,
      lineHeight,
      lines,
    };
  }
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
  const padding = Math.ceil(Math.max(outsideThickness, centeredHalf) + 28);
  const contentWidth = Math.max(80, ...widths);
  const contentHeight = Math.max(typography.fontSize, lineHeight * lines.length);
  return {
    width: Math.ceil(contentWidth + padding * 2),
    height: Math.ceil(contentHeight + padding * 2),
    padding,
    baseline: padding + typography.fontSize * 0.83,
    lineHeight,
    lines,
  };
}

function textLines(layout: SvgLayout): string {
  return layout.lines
    .map((line, index) => {
      const y = layout.baseline + index * layout.lineHeight;
      return `<tspan x="${layout.padding}" y="${y.toFixed(2)}">${escapeXml(line || " ")}</tspan>`;
    })
    .join("");
}

function textAttributes(editor: EditorDocument): string {
  const { typography } = editor;
  return [
    `font-family="${escapeXml(typography.fontFamily)}"`,
    `font-size="${clamp(typography.fontSize, 12, 420)}"`,
    `font-weight="${clamp(typography.fontWeight, 100, 900)}"`,
    `letter-spacing="${clamp(typography.letterSpacing, -30, 80)}"`,
    'stroke-linejoin="miter"',
    'stroke-linecap="butt"',
    'stroke-miterlimit="4"',
    'xml:space="preserve"',
  ].join(" ");
}

function fillDefinitions(editor: EditorDocument): string {
  return editor.fills
    .filter((fill) => fill.enabled && fill.type === "linear")
    .map((fill, fillIndex) => {
      const vector = gradientVector(fill.angle);
      const stops = [...fill.stops]
        .sort((a, b) => a.offset - b.offset)
        .map(
          (stop) =>
            `<stop offset="${clamp(stop.offset, 0, 100)}%" stop-color="${escapeXml(stop.color)}" stop-opacity="${(
              clamp(stop.opacity, 0, 100) / 100
            ).toFixed(3)}"/>`,
        )
        .join("");
      return `<linearGradient id="fill-${fillIndex}" x1="${vector.x1}%" y1="${vector.y1}%" x2="${vector.x2}%" y2="${vector.y2}%">${stops}</linearGradient>`;
    })
    .join("");
}

function outsideOutlineNodes(
  editor: EditorDocument,
  attributes: string,
  lines: string,
): string {
  const outlines = editor.outlines.filter(
    (outline) =>
      outline.enabled && outline.placement === "outside" && outline.thickness > 0,
  );
  return outlines
    .reverse()
    .map(
      (outline) =>
        `<text ${attributes} fill="none" stroke="${escapeXml(outline.color)}" stroke-width="${outline.thickness * 2}" stroke-opacity="${(
          clamp(outline.opacity, 0, 100) / 100
        ).toFixed(3)}" data-placement="outside">${lines}</text>`,
    )
    .join("");
}

function fillNodes(editor: EditorDocument, attributes: string, lines: string): string {
  let gradientIndex = 0;
  return editor.fills
    .filter((fill) => fill.enabled)
    .map((fill) => {
      const paint =
        fill.type === "linear" ? `url(#fill-${gradientIndex++})` : escapeXml(fill.color);
      return `<text ${attributes} fill="${paint}" fill-opacity="${(
        clamp(fill.opacity, 0, 100) / 100
      ).toFixed(3)}" stroke="none">${lines}</text>`;
    })
    .join("");
}

function foregroundOutlineNodes(
  editor: EditorDocument,
  attributes: string,
  lines: string,
): string {
  return editor.outlines
    .filter(
      (outline) =>
        outline.enabled && outline.placement !== "outside" && outline.thickness > 0,
    )
    .map((outline, index) => {
      const opacity = (clamp(outline.opacity, 0, 100) / 100).toFixed(3);
      if (outline.placement === "inside") {
        return `<g clip-path="url(#inside-clip)"><text ${attributes} fill="none" stroke="${escapeXml(
          outline.color,
        )}" stroke-width="${outline.thickness * 2}" stroke-opacity="${opacity}" data-placement="inside" data-layer="${index}">${lines}</text></g>`;
      }
      return `<text ${attributes} fill="none" stroke="${escapeXml(outline.color)}" stroke-width="${outline.thickness}" stroke-opacity="${opacity}" data-placement="center" data-layer="${index}">${lines}</text>`;
    })
    .join("");
}

export function serializeSvg(
  editor: EditorDocument,
  measureLine: LineMeasure = deterministicLineMeasure,
): string {
  const layout = measureDocument(editor, measureLine);
  const attributes = textAttributes(editor);
  const lines = textLines(layout);
  const definitions = fillDefinitions(editor);
  const needsInsideClip = editor.outlines.some(
    (outline) =>
      outline.enabled && outline.placement === "inside" && outline.thickness > 0,
  );
  const clip = needsInsideClip
    ? `<clipPath id="inside-clip"><text ${attributes}>${lines}</text></clipPath>`
    : "";
  const title = editor.text.trim() || "Gradient text artwork";

  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}" role="img" aria-labelledby="artwork-title"><title id="artwork-title">${escapeXml(
    title,
  )}</title><defs>${definitions}${clip}</defs>${outsideOutlineNodes(
    editor,
    attributes,
    lines,
  )}${fillNodes(editor, attributes, lines)}${foregroundOutlineNodes(
    editor,
    attributes,
    lines,
  )}</svg>`;
}

function pathDefinition(geometry: PathGeometry): string {
  const transform =
    geometry.translateX === 0 && geometry.translateY === 0
      ? ""
      : ` transform="translate(${geometry.translateX} ${geometry.translateY})"`;
  return `<path id="text-path" d="${escapeXml(geometry.pathData)}"${transform}/>`;
}

function pathUse(attributes = ""): string {
  return `<use href="#text-path"${attributes ? ` ${attributes}` : ""}/>`;
}

function outsidePathOutlineDefinitions(editor: EditorDocument, geometry: PathGeometry): string {
  const calibration = editor.outlines
    .filter(
      (outline) =>
        outline.enabled && outline.placement === "outside" && outline.thickness > 0,
    )
    .map((outline) => getFrame2OutsidePath(geometry, outline.thickness))
    .find((value) => value !== undefined);
  return calibration
    ? `<path id="${calibration.id}" d="${escapeXml(calibration.pathData)}"/>`
    : "";
}

function outsidePathOutlineNodes(editor: EditorDocument, geometry: PathGeometry): string {
  const outlines = editor.outlines.filter(
    (outline) =>
      outline.enabled && outline.placement === "outside" && outline.thickness > 0,
  );
  return outlines
    .reverse()
    .map((outline) => {
      const calibration = getFrame2OutsidePath(geometry, outline.thickness);
      const opacity = (clamp(outline.opacity, 0, 100) / 100).toFixed(3);
      if (calibration) {
        return `<use href="#${calibration.id}" fill="none" stroke="${escapeXml(
          outline.color,
        )}" stroke-width="${calibration.strokeWidth}" stroke-opacity="${opacity}" stroke-linejoin="miter" stroke-linecap="butt" stroke-miterlimit="4" data-placement="outside" data-outline-calibration="frame-2"/>`;
      }
      return pathUse(
        `fill="none" stroke="${escapeXml(outline.color)}" stroke-width="${outline.thickness * 2}" stroke-opacity="${opacity}" stroke-linejoin="miter" stroke-linecap="butt" stroke-miterlimit="4" data-placement="outside"`,
      );
    })
    .join("");
}

function pathFillNodes(editor: EditorDocument): string {
  let gradientIndex = 0;
  return editor.fills
    .filter((fill) => fill.enabled)
    .map((fill) => {
      const paint =
        fill.type === "linear" ? `url(#fill-${gradientIndex++})` : escapeXml(fill.color);
      return pathUse(
        `fill="${paint}" fill-opacity="${(clamp(fill.opacity, 0, 100) / 100).toFixed(
          3,
        )}" fill-rule="evenodd" stroke="none"`,
      );
    })
    .join("");
}

function foregroundPathOutlineNodes(editor: EditorDocument): string {
  return editor.outlines
    .filter(
      (outline) =>
        outline.enabled && outline.placement !== "outside" && outline.thickness > 0,
    )
    .map((outline, index) => {
      const opacity = (clamp(outline.opacity, 0, 100) / 100).toFixed(3);
      const node = pathUse(
        `fill="none" stroke="${escapeXml(outline.color)}" stroke-width="${
          outline.placement === "inside" ? outline.thickness * 2 : outline.thickness
        }" stroke-opacity="${opacity}" stroke-linejoin="miter" stroke-linecap="butt" stroke-miterlimit="4" data-placement="${
          outline.placement
        }" data-layer="${index}"`,
      );
      return outline.placement === "inside"
        ? `<g clip-path="url(#inside-clip)">${node}</g>`
        : node;
    })
    .join("");
}

export function serializeSvgAsPathsResult(
  editor: EditorDocument,
  font: OutlineFont,
): SerializedSvgResult {
  const missingGlyphs = findMissingGlyphs(editor, font);
  if (missingGlyphs.length > 0) {
    throw new Error(`The selected font is missing: ${missingGlyphs.join(" ")}`);
  }
  const geometry = createPathGeometry(editor, font);
  const definitions = fillDefinitions(editor);
  const outsideDefinitions = outsidePathOutlineDefinitions(editor, geometry);
  const needsInsideClip = editor.outlines.some(
    (outline) =>
      outline.enabled && outline.placement === "inside" && outline.thickness > 0,
  );
  const clip = needsInsideClip
    ? `<clipPath id="inside-clip">${pathUse()}</clipPath>`
    : "";
  const title = editor.text.trim() || "Gradient text artwork";

  const markup = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${geometry.width}" height="${geometry.height}" viewBox="0 0 ${geometry.width} ${geometry.height}" role="img" aria-labelledby="artwork-title" data-text-as-path="true"><title id="artwork-title">${escapeXml(
    title,
  )}</title><defs>${definitions}${pathDefinition(
    geometry,
  )}${outsideDefinitions}${clip}</defs>${outsidePathOutlineNodes(
    editor,
    geometry,
  )}${pathFillNodes(editor)}${foregroundPathOutlineNodes(editor)}</svg>`;
  return {
    markup,
    layout: {
      width: geometry.width,
      height: geometry.height,
      padding: geometry.padding,
      baseline: geometry.translateY,
      lineHeight: editor.typography.fontSize * editor.typography.lineHeight,
      lines: editor.text.split("\n"),
    },
  };
}

export function serializeSvgAsPaths(editor: EditorDocument, font: OutlineFont): string {
  return serializeSvgAsPathsResult(editor, font).markup;
}
