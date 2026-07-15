import { clamp } from "./editorModel.js";

export function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function gradientVector(angle) {
  const radians = ((Number(angle) - 90) * Math.PI) / 180;
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

function approximateLineWidth(line, typography) {
  const glyphs = Array.from(line || " ");
  const weightedLength = glyphs.reduce((total, glyph) => {
    return total + (/^[\u0000-\u00ff]$/.test(glyph) ? 0.64 : 1);
  }, 0);
  return Math.max(1, weightedLength * typography.fontSize + (glyphs.length - 1) * typography.letterSpacing);
}

export function measureDocument(editor, measureLine) {
  const lines = editor.text.split("\n");
  const typography = editor.typography;
  const lineHeight = typography.fontSize * typography.lineHeight;
  const widths = lines.map((line) => {
    if (measureLine) return measureLine(line || " ", typography);
    return approximateLineWidth(line, typography);
  });
  const outsideThickness = editor.outlines
    .filter((outline) => outline.enabled && outline.placement === "outside")
    .reduce((total, outline) => total + clamp(outline.thickness, 0, 80), 0);
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

function textLines(layout) {
  return layout.lines
    .map((line, index) => {
      const y = layout.baseline + index * layout.lineHeight;
      return `<tspan x="${layout.padding}" y="${y.toFixed(2)}">${escapeXml(line || " ")}</tspan>`;
    })
    .join("");
}

function textAttributes(editor) {
  const { typography } = editor;
  return [
    `font-family="${escapeXml(typography.fontFamily)}"`,
    `font-size="${clamp(typography.fontSize, 12, 420)}"`,
    `font-weight="${clamp(typography.fontWeight, 100, 900)}"`,
    `letter-spacing="${clamp(typography.letterSpacing, -30, 80)}"`,
    'stroke-linejoin="round"',
    'stroke-linecap="round"',
    'xml:space="preserve"',
  ].join(" ");
}

function fillDefinitions(editor) {
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

function outsideOutlineNodes(editor, layout, attributes, lines) {
  const outlines = editor.outlines.filter(
    (outline) => outline.enabled && outline.placement === "outside" && outline.thickness > 0,
  );
  const cumulative = outlines.map((_, index) =>
    outlines.slice(0, index + 1).reduce((total, outline) => total + Number(outline.thickness), 0),
  );
  return outlines
    .map((outline, index) => ({ outline, strokeWidth: cumulative[index] * 2 }))
    .reverse()
    .map(
      ({ outline, strokeWidth }) =>
        `<text ${attributes} fill="none" stroke="${escapeXml(outline.color)}" stroke-width="${strokeWidth}" stroke-opacity="${(
          clamp(outline.opacity, 0, 100) / 100
        ).toFixed(3)}" data-placement="outside">${lines}</text>`,
    )
    .join("");
}

function fillNodes(editor, attributes, lines) {
  let gradientIndex = 0;
  return editor.fills
    .filter((fill) => fill.enabled)
    .map((fill) => {
      const paint = fill.type === "linear" ? `url(#fill-${gradientIndex++})` : escapeXml(fill.color);
      return `<text ${attributes} fill="${paint}" fill-opacity="${(
        clamp(fill.opacity, 0, 100) / 100
      ).toFixed(3)}" stroke="none">${lines}</text>`;
    })
    .join("");
}

function foregroundOutlineNodes(editor, attributes, lines) {
  return editor.outlines
    .filter(
      (outline) =>
        outline.enabled && outline.placement !== "outside" && Number(outline.thickness) > 0,
    )
    .map((outline, index) => {
      const opacity = (clamp(outline.opacity, 0, 100) / 100).toFixed(3);
      if (outline.placement === "inside") {
        return `<g clip-path="url(#inside-clip)"><text ${attributes} fill="none" stroke="${escapeXml(
          outline.color,
        )}" stroke-width="${Number(outline.thickness) * 2}" stroke-opacity="${opacity}" data-placement="inside" data-layer="${index}">${lines}</text></g>`;
      }
      return `<text ${attributes} fill="none" stroke="${escapeXml(outline.color)}" stroke-width="${Number(
        outline.thickness,
      )}" stroke-opacity="${opacity}" data-placement="center" data-layer="${index}">${lines}</text>`;
    })
    .join("");
}

export function serializeSvg(editor, measureLine) {
  const layout = measureDocument(editor, measureLine);
  const attributes = textAttributes(editor);
  const lines = textLines(layout);
  const definitions = fillDefinitions(editor);
  const needsInsideClip = editor.outlines.some(
    (outline) => outline.enabled && outline.placement === "inside" && outline.thickness > 0,
  );
  const clip = needsInsideClip
    ? `<clipPath id="inside-clip"><text ${attributes}>${lines}</text></clipPath>`
    : "";
  const title = editor.text.trim() || "Gradient text artwork";

  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}" role="img" aria-labelledby="artwork-title"><title id="artwork-title">${escapeXml(
    title,
  )}</title><defs>${definitions}${clip}</defs>${outsideOutlineNodes(
    editor,
    layout,
    attributes,
    lines,
  )}${fillNodes(editor, attributes, lines)}${foregroundOutlineNodes(
    editor,
    attributes,
    lines,
  )}</svg>`;
}

export function browserMeasureLine(line, typography) {
  if (typeof document === "undefined") return undefined;
  const canvas = browserMeasureLine.canvas ?? document.createElement("canvas");
  browserMeasureLine.canvas = canvas;
  const context = canvas.getContext("2d");
  context.font = `${typography.fontWeight} ${typography.fontSize}px ${typography.fontFamily}`;
  return Math.max(
    1,
    context.measureText(line).width + Math.max(0, Array.from(line).length - 1) * typography.letterSpacing,
  );
}
