import type { FontOption } from "./editorModel.js";

export interface LocalFontRecord {
  family: string;
  fullName?: string;
  postscriptName?: string;
  style?: string;
  blob?: () => Promise<Blob>;
}

type QueryLocalFonts = () => Promise<LocalFontRecord[]>;
type LocalFontWindow = Window & { queryLocalFonts?: QueryLocalFonts };
type QueryLocalFontPermission = () => Promise<PermissionState>;

export type LocalFontPermissionState = PermissionState | "unsupported";

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

function defaultLocalFontPermissionQuery(): QueryLocalFontPermission | undefined {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) return undefined;
  return async () => {
    const result = await navigator.permissions.query({
      name: "local-fonts",
    } as unknown as PermissionDescriptor);
    return result.state;
  };
}

export async function queryLocalFontPermissionState(
  query: QueryLocalFontPermission | undefined = defaultLocalFontPermissionQuery(),
): Promise<LocalFontPermissionState> {
  if (!query) return "unsupported";
  try {
    return await query();
  } catch {
    return "unsupported";
  }
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

function inferredFontWeight(record: LocalFontRecord): number {
  const name = `${record.style ?? ""} ${record.fullName ?? ""}`.toLocaleLowerCase();
  if (/thin|hairline/.test(name)) return 100;
  if (/extra[ -]?light|ultra[ -]?light/.test(name)) return 200;
  if (/light/.test(name)) return 300;
  if (/medium/.test(name)) return 500;
  if (/semi[ -]?bold|demi[ -]?bold/.test(name)) return 600;
  if (/extra[ -]?bold|ultra[ -]?bold/.test(name)) return 800;
  if (/black|heavy/.test(name)) return 900;
  if (/bold/.test(name)) return 700;
  return 400;
}

export function chooseDeviceFontRecord(
  records: readonly LocalFontRecord[],
  family: string,
  weight: number,
): LocalFontRecord | undefined {
  const normalizedFamily = family.trim().toLocaleLowerCase();
  return records
    .filter((record) => record.family.trim().toLocaleLowerCase() === normalizedFamily)
    .sort((left, right) => {
      const leftScore = Math.abs(inferredFontWeight(left) - weight);
      const rightScore = Math.abs(inferredFontWeight(right) - weight);
      if (leftScore !== rightScore) return leftScore - rightScore;
      return (left.fullName ?? left.style ?? "").localeCompare(
        right.fullName ?? right.style ?? "",
      );
    })[0];
}

export interface DeviceFontCatalog {
  options: FontOption[];
  records: LocalFontRecord[];
}

export async function queryDeviceFontCatalog(
  query: QueryLocalFonts | undefined =
    typeof window === "undefined"
      ? undefined
      : (window as LocalFontWindow).queryLocalFonts?.bind(window),
): Promise<DeviceFontCatalog> {
  if (!query) {
    throw new LocalFontAccessError(
      "unsupported",
      "This browser does not support installed font discovery.",
    );
  }

  try {
    const records = await query();
    return { options: createDeviceFontOptions(records), records };
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotAllowedError") {
      throw new LocalFontAccessError("denied", "Installed font access was not granted.");
    }
    throw new LocalFontAccessError("failed", "Installed fonts could not be loaded.");
  }
}

export async function queryDeviceFonts(
  query: QueryLocalFonts | undefined =
    typeof window === "undefined"
      ? undefined
      : (window as LocalFontWindow).queryLocalFonts?.bind(window),
): Promise<FontOption[]> {
  return (await queryDeviceFontCatalog(query)).options;
}
