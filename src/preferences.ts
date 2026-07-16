import {
  MAX_OUTLINES,
  type EditorDocument,
  type FillLayer,
  type GradientStop,
  type OutlineLayer,
  type TypographySettings,
} from "./editorModel.js";

export const WORKSPACE_STORAGE_KEY = "gradient-text-gen:workspace:v1";

export type PreviewBackground = "transparent" | "light" | "dark";

export interface StoredWorkspace {
  version: 1;
  editor: EditorDocument;
  background: PreviewBackground;
  zoom: number;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isNumberInRange = (value: unknown, min: number, max: number): value is number =>
  isFiniteNumber(value) && value >= min && value <= max;

const isHexColor = (value: unknown): value is string =>
  typeof value === "string" && /^#[0-9A-F]{6}$/i.test(value);

const isGradientStop = (value: unknown): value is GradientStop =>
  isRecord(value) &&
  typeof value.id === "string" &&
  isHexColor(value.color) &&
  isNumberInRange(value.offset, 0, 100) &&
  isNumberInRange(value.opacity, 0, 100);

const isFillLayer = (value: unknown): value is FillLayer =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.enabled === "boolean" &&
  typeof value.name === "string" &&
  (value.type === "linear" || value.type === "solid") &&
  isHexColor(value.color) &&
  isNumberInRange(value.opacity, 0, 100) &&
  isNumberInRange(value.angle, 0, 360) &&
  Array.isArray(value.stops) &&
  value.stops.every(isGradientStop);

const isOutlineLayer = (value: unknown): value is OutlineLayer =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.enabled === "boolean" &&
  typeof value.name === "string" &&
  isHexColor(value.color) &&
  isNumberInRange(value.thickness, 0, 64) &&
  isNumberInRange(value.opacity, 0, 100) &&
  (value.placement === "outside" ||
    value.placement === "center" ||
    value.placement === "inside");

const isTypography = (value: unknown): value is TypographySettings =>
  isRecord(value) &&
  typeof value.fontId === "string" &&
  typeof value.fontFamily === "string" &&
  isNumberInRange(value.fontWeight, 100, 900) &&
  isNumberInRange(value.fontSize, 24, 320) &&
  isNumberInRange(value.letterSpacing, -20, 40) &&
  isNumberInRange(value.lineHeight, 0.7, 1.8) &&
  (value.align === "left" || value.align === "center" || value.align === "right");

const parseEditorDocument = (value: unknown): EditorDocument | null => {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    typeof value.text !== "string" ||
    value.text.length > 160 ||
    !isTypography(value.typography) ||
    !Array.isArray(value.fills) ||
    !value.fills.every(isFillLayer) ||
    !Array.isArray(value.outlines) ||
    value.outlines.length > MAX_OUTLINES ||
    !value.outlines.every(isOutlineLayer)
  ) {
    return null;
  }

  return {
    version: 1,
    text: value.text,
    typography: value.typography,
    fills: value.fills,
    outlines: value.outlines.map((outline) => ({
      ...outline,
      name: outline.name.replace(/^Outline (\d+)$/, "Border $1"),
    })),
    frame: { mode: "fit" },
  };
};

export function parseStoredWorkspace(raw: string | null): StoredWorkspace | null {
  if (!raw) return null;

  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== 1) return null;
    const editor = parseEditorDocument(value.editor);
    if (!editor) return null;
    if (
      value.background !== "transparent" &&
      value.background !== "light" &&
      value.background !== "dark"
    ) {
      return null;
    }
    if (!isFiniteNumber(value.zoom) || value.zoom < 60 || value.zoom > 160) return null;

    return {
      version: 1,
      editor,
      background: value.background,
      zoom: value.zoom,
    };
  } catch {
    return null;
  }
}

export function loadStoredWorkspace(
  storage?: StorageLike,
): StoredWorkspace | null {
  try {
    const target = storage ?? (typeof window === "undefined" ? undefined : window.localStorage);
    return target ? parseStoredWorkspace(target.getItem(WORKSPACE_STORAGE_KEY)) : null;
  } catch {
    return null;
  }
}

export function saveStoredWorkspace(
  workspace: StoredWorkspace,
  storage?: StorageLike,
): boolean {
  try {
    const target = storage ?? (typeof window === "undefined" ? undefined : window.localStorage);
    if (!target) return false;
    target.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));
    return true;
  } catch {
    return false;
  }
}
