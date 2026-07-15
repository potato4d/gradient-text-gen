#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  FONT_OPTIONS,
  MAX_OUTLINES,
  createInitialDocument,
  createOutline,
  createStop,
  normalizeHex,
  type EditorDocument,
  type OutlineLayer,
  type OutlinePlacement,
} from "./editorModel.js";
import { serializeSvg, serializeSvgAsPaths } from "./svg.js";
import { parseOutlineFont } from "./textToPath.js";

export const CLI_VERSION = "0.1.0";

export interface CliConfig {
  text?: string;
  font?: string;
  fontFamily?: string;
  textToPath?: string;
  weight?: number;
  size?: number;
  tracking?: number;
  lineHeight?: number;
  angle?: number;
  fill?: string;
  fillOpacity?: number;
  stops?: string[];
  outlines?: string[];
  noOutline?: boolean;
}

export interface CliOptions extends CliConfig {
  config?: string;
  output?: string;
  help?: boolean;
  version?: boolean;
  listFonts?: boolean;
}

export const CLI_USAGE = `Gradient Text Generator CLI

Usage:
  gradient-text-gen [options]

Options:
  --text <value>                 Artwork text. Newlines are supported.
  --font <id>                    Font id from --list-fonts.
  --font-family <CSS value>      Installed or custom CSS font-family value.
  --text-to-path <font-file>     Convert text to paths using an OTF, TTF, or WOFF file.
  --weight <100-900>             Font weight.
  --size <12-420>                Font size in pixels.
  --tracking <-30-80>            Letter spacing in pixels.
  --line-height <0.5-3>          Line-height multiplier.
  --fill <hex>                   Use a solid fill color.
  --fill-opacity <0-100>         Fill layer opacity.
  --stop <hex@offset[:opacity]>  Gradient stop. Repeat for multiple stops.
  --angle <degrees>              Linear gradient angle.
  --outline <spec>               Repeatable color@size[:placement[:opacity]].
  --no-outline                   Remove every outline.
  --config <file.json>           Load the same options from a JSON file.
  --output <file.svg>            Write a file instead of stdout.
  --list-fonts                   Print the available font ids.
  --version                      Print the CLI version.
  --help                         Show this help.

Examples:
  gradient-text-gen --text "Hello" --output hello.svg
  gradient-text-gen --text "Glow" --stop "#6F78FF@0" --stop "#F4FF77@100" \\
    --outline "#000000@6:outside" --outline "#FFFFFF@4:outside" --output glow.svg
`;

function parseNumber(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be a finite number.`);
  return parsed;
}

function assertRange(value: number | undefined, min: number, max: number, name: string): void {
  if (value !== undefined && (value < min || value > max)) {
    throw new Error(`${name} must be between ${min} and ${max}.`);
  }
}

function parseColor(value: string, name: string): string {
  if (!/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(value)) {
    throw new Error(`${name} must be a three- or six-digit hexadecimal color.`);
  }
  return normalizeHex(value);
}

export function parseStopArgument(value: string) {
  const match = /^(#[0-9a-f]{3}(?:[0-9a-f]{3})?)@(-?\d+(?:\.\d+)?)(?::(-?\d+(?:\.\d+)?))?$/i.exec(
    value,
  );
  if (!match) {
    throw new Error(`Invalid stop "${value}". Use #RRGGBB@offset[:opacity].`);
  }
  const offset = Number(match[2]);
  const opacity = match[3] === undefined ? 100 : Number(match[3]);
  assertRange(offset, 0, 100, "Stop offset");
  assertRange(opacity, 0, 100, "Stop opacity");
  return createStop(parseColor(match[1], "Stop color"), offset, opacity);
}

export function parseOutlineArgument(value: string, index = 0): OutlineLayer {
  const match = /^(#[0-9a-f]{3}(?:[0-9a-f]{3})?)@(-?\d+(?:\.\d+)?)(?::(outside|center|inside))?(?::(-?\d+(?:\.\d+)?))?$/i.exec(
    value,
  );
  if (!match) {
    throw new Error(
      `Invalid outline "${value}". Use #RRGGBB@size[:outside|center|inside[:opacity]].`,
    );
  }
  const thickness = Number(match[2]);
  const placement = (match[3]?.toLowerCase() ?? "outside") as OutlinePlacement;
  const opacity = match[4] === undefined ? 100 : Number(match[4]);
  assertRange(thickness, 0, 80, "Outline size");
  assertRange(opacity, 0, 100, "Outline opacity");
  return {
    ...createOutline(index),
    color: parseColor(match[1], "Outline color"),
    thickness,
    placement,
    opacity,
  };
}

export function parseCliArgs(args: string[]): CliOptions {
  const { values } = parseArgs({
    args,
    strict: true,
    allowPositionals: false,
    options: {
      text: { type: "string" },
      font: { type: "string" },
      "font-family": { type: "string" },
      "text-to-path": { type: "string" },
      weight: { type: "string" },
      size: { type: "string" },
      tracking: { type: "string" },
      "line-height": { type: "string" },
      fill: { type: "string" },
      "fill-opacity": { type: "string" },
      stop: { type: "string", multiple: true },
      angle: { type: "string" },
      outline: { type: "string", multiple: true },
      "no-outline": { type: "boolean" },
      config: { type: "string" },
      output: { type: "string", short: "o" },
      "list-fonts": { type: "boolean" },
      version: { type: "boolean", short: "v" },
      help: { type: "boolean", short: "h" },
    },
  });

  return {
    text: values.text,
    font: values.font,
    fontFamily: values["font-family"],
    textToPath: values["text-to-path"],
    weight: parseNumber(values.weight, "--weight"),
    size: parseNumber(values.size, "--size"),
    tracking: parseNumber(values.tracking, "--tracking"),
    lineHeight: parseNumber(values["line-height"], "--line-height"),
    fill: values.fill,
    fillOpacity: parseNumber(values["fill-opacity"], "--fill-opacity"),
    stops: values.stop,
    angle: parseNumber(values.angle, "--angle"),
    outlines: values.outline,
    noOutline: values["no-outline"],
    config: values.config,
    output: values.output,
    listFonts: values["list-fonts"],
    version: values.version,
    help: values.help,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`Config field "${key}" must be a string.`);
  return value;
}

function readOptionalNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Config field "${key}" must be a finite number.`);
  }
  return value;
}

function readOptionalStringArray(
  record: Record<string, unknown>,
  key: string,
): string[] | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`Config field "${key}" must be an array of strings.`);
  }
  return value;
}

export function parseConfig(value: unknown): CliConfig {
  if (!isRecord(value)) throw new Error("The config root must be a JSON object.");
  const noOutline = value.noOutline;
  if (noOutline !== undefined && typeof noOutline !== "boolean") {
    throw new Error('Config field "noOutline" must be a boolean.');
  }
  return {
    text: readOptionalString(value, "text"),
    font: readOptionalString(value, "font"),
    fontFamily: readOptionalString(value, "fontFamily"),
    textToPath: readOptionalString(value, "textToPath"),
    weight: readOptionalNumber(value, "weight"),
    size: readOptionalNumber(value, "size"),
    tracking: readOptionalNumber(value, "tracking"),
    lineHeight: readOptionalNumber(value, "lineHeight"),
    angle: readOptionalNumber(value, "angle"),
    fill: readOptionalString(value, "fill"),
    fillOpacity: readOptionalNumber(value, "fillOpacity"),
    stops: readOptionalStringArray(value, "stops"),
    outlines: readOptionalStringArray(value, "outlines"),
    noOutline,
  };
}

export function createDocumentFromOptions(options: CliConfig): EditorDocument {
  assertRange(options.weight, 100, 900, "Font weight");
  assertRange(options.size, 12, 420, "Font size");
  assertRange(options.tracking, -30, 80, "Tracking");
  assertRange(options.lineHeight, 0.5, 3, "Line height");
  assertRange(options.fillOpacity, 0, 100, "Fill opacity");

  const editor = createInitialDocument();
  if (options.text !== undefined) editor.text = options.text;
  if (options.font !== undefined && options.fontFamily !== undefined) {
    throw new Error("Use either --font or --font-family, not both.");
  }
  if (options.font !== undefined) {
    const font = FONT_OPTIONS.find((option) => option.id === options.font);
    if (!font) {
      throw new Error(`Unknown font "${options.font}". Use --list-fonts to see valid ids.`);
    }
    editor.typography.fontId = font.id;
    editor.typography.fontFamily = font.family;
  }
  if (options.fontFamily !== undefined) {
    const family = options.fontFamily.trim();
    if (!family) throw new Error("Font family cannot be empty.");
    editor.typography.fontId = "custom";
    editor.typography.fontFamily = family;
  }
  if (options.weight !== undefined) editor.typography.fontWeight = options.weight;
  if (options.size !== undefined) editor.typography.fontSize = options.size;
  if (options.tracking !== undefined) editor.typography.letterSpacing = options.tracking;
  if (options.lineHeight !== undefined) editor.typography.lineHeight = options.lineHeight;

  const fill = editor.fills[0];
  if (options.fill !== undefined) {
    fill.type = "solid";
    fill.color = parseColor(options.fill, "Fill color");
  }
  if (options.stops !== undefined) {
    if (options.stops.length < 2) throw new Error("A gradient requires at least two --stop values.");
    fill.type = "linear";
    fill.stops = options.stops.map(parseStopArgument);
  }
  if (options.angle !== undefined) fill.angle = ((options.angle % 360) + 360) % 360;
  if (options.fillOpacity !== undefined) fill.opacity = options.fillOpacity;

  if (options.outlines !== undefined) {
    if (options.outlines.length > MAX_OUTLINES) {
      throw new Error(`At most ${MAX_OUTLINES} outlines are supported.`);
    }
    editor.outlines = options.outlines.map(parseOutlineArgument);
  } else if (options.noOutline) {
    editor.outlines = [];
  }

  return editor;
}

async function loadConfig(path: string): Promise<CliConfig> {
  const source = await readFile(resolve(path), "utf8");
  return parseConfig(JSON.parse(source) as unknown);
}

export async function runCli(args = process.argv.slice(2)): Promise<void> {
  const cli = parseCliArgs(args);
  if (cli.help) {
    process.stdout.write(CLI_USAGE);
    return;
  }
  if (cli.version) {
    process.stdout.write(`${CLI_VERSION}\n`);
    return;
  }
  if (cli.listFonts) {
    process.stdout.write(FONT_OPTIONS.map((font) => `${font.id}\t${font.label}\n`).join(""));
    return;
  }

  const config = cli.config ? await loadConfig(cli.config) : {};
  const options: CliConfig = {
    ...config,
    ...Object.fromEntries(
      Object.entries(cli).filter(
        ([key, value]) =>
          !["config", "output", "help", "version", "listFonts"].includes(key) &&
          value !== undefined,
      ),
    ),
  };
  const editor = createDocumentFromOptions(options);
  let svg: string;
  if (options.textToPath) {
    const source = await readFile(resolve(options.textToPath));
    const buffer = source.buffer.slice(
      source.byteOffset,
      source.byteOffset + source.byteLength,
    ) as ArrayBuffer;
    svg = serializeSvgAsPaths(editor, parseOutlineFont(buffer));
  } else {
    svg = serializeSvg(editor);
  }

  if (cli.output) {
    const output = resolve(cli.output);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, `${svg}\n`, "utf8");
    process.stderr.write(`Wrote ${output}\n`);
    return;
  }
  process.stdout.write(`${svg}\n`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  runCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`gradient-text-gen: ${message}\n`);
    process.exitCode = 1;
  });
}
