export const MAX_OUTLINES = 12;

export type FillType = "linear" | "solid";
export type OutlinePlacement = "outside" | "center" | "inside";
export type TextAlignment = "left" | "center" | "right";
export interface GlyphOffset {
  x: number;
  y: number;
}
export type SvgFrame =
  | { mode: "fit" }
  | {
      mode: "fixed";
      width: number;
      height: number;
      originX: number;
      baselineY: number;
      glyphOffsets?: GlyphOffset[];
    };

export interface FontOption {
  id: string;
  label: string;
  family: string;
}

export interface GradientStop {
  id: string;
  color: string;
  offset: number;
  opacity: number;
}

export interface FillLayer {
  id: string;
  enabled: boolean;
  name: string;
  type: FillType;
  color: string;
  opacity: number;
  angle: number;
  stops: GradientStop[];
}

export interface OutlineLayer {
  id: string;
  enabled: boolean;
  name: string;
  color: string;
  thickness: number;
  opacity: number;
  placement: OutlinePlacement;
}

export interface TypographySettings {
  fontId: string;
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  letterSpacing: number;
  lineHeight: number;
  align: TextAlignment;
}

export interface EditorDocument {
  version: 1;
  text: string;
  typography: TypographySettings;
  fills: FillLayer[];
  outlines: OutlineLayer[];
  frame: SvgFrame;
}

export const DEFAULT_FONT_ID = "japanese-sans";
export const DEFAULT_FONT_FAMILY =
  "'Hiragino Sans', 'Yu Gothic', 'Noto Sans JP', sans-serif";
export const REFERENCE_FONT_ID = "reference:dela-suko";
export const REFERENCE_FONT_FAMILY = "'DelaSuko Gothic One', sans-serif";

export const FONT_OPTIONS: FontOption[] = [
  {
    id: DEFAULT_FONT_ID,
    label: "Japanese Sans",
    family: DEFAULT_FONT_FAMILY,
  },
  {
    id: "heavy-gothic",
    label: "Heavy Gothic",
    family: "'Arial Black', 'Hiragino Kaku Gothic ProN', 'Yu Gothic', sans-serif",
  },
  {
    id: "modern-gothic",
    label: "Modern Gothic",
    family: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif",
  },
  {
    id: "editorial-serif",
    label: "Editorial Serif",
    family: "Georgia, 'Times New Roman', 'Yu Mincho', serif",
  },
  {
    id: "condensed-impact",
    label: "Condensed Impact",
    family: "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif",
  },
  {
    id: "monospace",
    label: "Technical Mono",
    family: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  },
];

const uid = (prefix: string): string => {
  const value =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  return `${prefix}-${value}`;
};

export const createStop = (
  color = "#FFFFFF",
  offset = 50,
  opacity = 100,
): GradientStop => ({
  id: uid("stop"),
  color,
  offset,
  opacity,
});

export const createFill = (index = 0): FillLayer => ({
  id: uid("fill"),
  enabled: true,
  name: `Fill ${index + 1}`,
  type: index % 2 === 0 ? "linear" : "solid",
  color: index % 2 === 0 ? "#6F78FF" : "#FFFFFF",
  opacity: 100,
  angle: 135,
  stops: [createStop("#6F78FF", 0), createStop("#F4FF77", 100)],
});

export const createOutline = (index = 0): OutlineLayer => ({
  id: uid("outline"),
  enabled: true,
  name: `Outline ${index + 1}`,
  color: ["#111216", "#FFFFFF", "#6F78FF", "#F4FF77"][index % 4],
  thickness: Math.min(80, 12 + index * 8),
  opacity: 100,
  placement: "outside",
});

const REFERENCE_STOPS: ReadonlyArray<readonly [string, number]> = [
  ["#E9F62A", 0],
  ["#FFF5A0", 26.5679633],
  ["#EED991", 48.0359484],
  ["#F0C739", 60.5414117],
  ["#F1BC15", 100],
];

export const createReferenceFrame = (): SvgFrame => ({
  mode: "fixed",
  width: 874,
  height: 310,
  originX: 44.995,
  baselineY: 234.835,
  glyphOffsets: [
    { x: 0, y: 0 },
    { x: 0.125, y: 0.165 },
    { x: 0.125, y: 0.165 },
    { x: 0.125, y: 0.165 },
    { x: 0.125, y: 0.165 },
  ],
});

export const createReferenceDocument = (): EditorDocument => ({
  version: 1,
  text: "ライゼオル",
  typography: {
    fontId: REFERENCE_FONT_ID,
    fontFamily: REFERENCE_FONT_FAMILY,
    fontWeight: 400,
    fontSize: 155,
    letterSpacing: 0,
    lineHeight: 1,
    align: "left",
  },
  fills: [
    {
      id: uid("fill"),
      enabled: true,
      name: "Sunbeam",
      type: "linear",
      color: "#F1BC15",
      opacity: 100,
      angle: 180,
      stops: REFERENCE_STOPS.map(([color, offset]) => createStop(color, offset)),
    },
  ],
  outlines: [
    {
      id: uid("outline"),
      enabled: true,
      name: "Inner Ink",
      color: "#000000",
      thickness: 12,
      opacity: 100,
      placement: "outside",
    },
    {
      id: uid("outline"),
      enabled: true,
      name: "Outer Paper",
      color: "#FFFFFF",
      thickness: 20,
      opacity: 100,
      placement: "outside",
    },
  ],
  frame: createReferenceFrame(),
});

export const createInitialDocument = (): EditorDocument => {
  const editor = createReferenceDocument();
  editor.typography.fontId = DEFAULT_FONT_ID;
  editor.typography.fontFamily = DEFAULT_FONT_FAMILY;
  editor.frame = { mode: "fit" };
  return editor;
};

export const clamp = (value: number | string, min: number, max: number): number =>
  Math.min(max, Math.max(min, Number(value)));

export function normalizeHex(value: string, fallback = "#000000"): string {
  const normalized = value.trim().toUpperCase();
  if (/^#[0-9A-F]{6}$/.test(normalized)) return normalized;
  if (/^#[0-9A-F]{3}$/.test(normalized)) {
    return `#${normalized
      .slice(1)
      .split("")
      .map((character) => character.repeat(2))
      .join("")}`;
  }
  return fallback;
}

export function gradientCss(stops: GradientStop[], angle = 90): string {
  const list = [...stops]
    .sort((a, b) => a.offset - b.offset)
    .map(
      (stop) =>
        `${stop.color}${Math.round(clamp(stop.opacity, 0, 100) * 2.55)
          .toString(16)
          .padStart(2, "0")} ${clamp(stop.offset, 0, 100)}%`,
    )
    .join(", ");
  return `linear-gradient(${angle}deg, ${list})`;
}

export function swapById<T extends { id: string }>(
  items: T[],
  id: string,
  direction: -1 | 1,
): T[] {
  const index = items.findIndex((item) => item.id === id);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return items;
  const copy = [...items];
  [copy[index], copy[nextIndex]] = [copy[nextIndex], copy[index]];
  return copy;
}

export function insertStop(stops: GradientStop[]): {
  stop: GradientStop;
  stops: GradientStop[];
} {
  const ordered = [...stops].sort((a, b) => a.offset - b.offset);
  let left = ordered[0] ?? createStop("#FFFFFF", 0);
  let right = ordered[ordered.length - 1] ?? createStop("#000000", 100);
  let largestGap = -1;

  for (let index = 0; index < ordered.length - 1; index += 1) {
    const gap = ordered[index + 1].offset - ordered[index].offset;
    if (gap > largestGap) {
      largestGap = gap;
      left = ordered[index];
      right = ordered[index + 1];
    }
  }

  const offset = Math.round((left.offset + right.offset) / 2);
  const stop = createStop(left.color, offset, Math.round((left.opacity + right.opacity) / 2));
  return { stop, stops: [...stops, stop] };
}
