import type { FontOption } from "./editorModel.js";

export interface LocalFontRecord {
  family: string;
  fullName?: string;
  postscriptName?: string;
  style?: string;
}

type QueryLocalFonts = () => Promise<LocalFontRecord[]>;
type LocalFontWindow = Window & { queryLocalFonts?: QueryLocalFonts };

export class LocalFontAccessError extends Error {
  constructor(
    public readonly reason: "unsupported" | "denied" | "failed",
    message: string,
  ) {
    super(message);
    this.name = "LocalFontAccessError";
  }
}

export function quoteCssFontFamily(family: string): string {
  const normalized = family.trim().replace(/[\u0000\r\n\f]/g, " ");
  if (!normalized) throw new Error("Font family cannot be empty.");
  return `'${normalized.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

export function unquoteCssFontFamily(family: string): string {
  const trimmed = family.trim();
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, "\\");
  }
  return trimmed;
}

export function createDeviceFontOptions(records: readonly LocalFontRecord[]): FontOption[] {
  const families = new Map<string, string>();
  for (const record of records) {
    const family = record.family.trim();
    if (!family) continue;
    const key = family.toLocaleLowerCase();
    if (!families.has(key)) families.set(key, family);
  }

  return [...families.values()]
    .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }))
    .map((family) => ({
      id: `device:${family.toLocaleLowerCase()}`,
      label: family,
      family: quoteCssFontFamily(family),
    }));
}

export async function queryDeviceFonts(
  query: QueryLocalFonts | undefined =
    typeof window === "undefined"
      ? undefined
      : (window as LocalFontWindow).queryLocalFonts?.bind(window),
): Promise<FontOption[]> {
  if (!query) {
    throw new LocalFontAccessError(
      "unsupported",
      "This browser does not support installed font discovery.",
    );
  }

  try {
    return createDeviceFontOptions(await query());
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotAllowedError") {
      throw new LocalFontAccessError("denied", "Installed font access was not granted.");
    }
    throw new LocalFontAccessError("failed", "Installed fonts could not be loaded.");
  }
}
