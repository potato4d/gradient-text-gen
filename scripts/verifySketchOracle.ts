import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createDocumentFromOptions, parseConfig } from "../src/cli.js";
import { createInitialDocument } from "../src/editorModel.js";
import { serializeSvgAsPaths } from "../src/svg.js";
import {
  getOutlineFontFamily,
  getOutlineFontWeight,
  parseOutlineFont,
} from "../src/textToPath.js";

interface SketchManifest {
  sourceSvg: { file: string; sha256: string; width: number; height: number };
  oraclePng: {
    file: string;
    sha256: string;
    width: number;
    height: number;
    alphaBounds: string;
  };
  font: { family: string; weight: number; sha256: string };
  comparison: { maximumNormalizedRmse: number };
}

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = resolve(dirname(scriptPath), "..");
const fixtureDirectory = resolve(repositoryRoot, "test/fixtures/sketch");
const manifest = JSON.parse(
  await readFile(resolve(fixtureDirectory, "frame-2.manifest.json"), "utf8"),
) as SketchManifest;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function requireHash(label: string, bytes: Uint8Array, expected: string): void {
  const actual = sha256(bytes);
  if (actual !== expected) {
    throw new Error(`${label} SHA-256 mismatch: expected ${expected}, received ${actual}`);
  }
}

function run(command: string, args: string[], acceptedStatuses = [0]): string {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error) throw result.error;
  if (!acceptedStatuses.includes(result.status ?? -1)) {
    throw new Error(
      `${command} failed (${result.status ?? "unknown"}): ${result.stderr || result.stdout}`,
    );
  }
  return `${result.stderr ?? ""}${result.stdout ?? ""}`.trim();
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

const sourceSvgPath = resolve(fixtureDirectory, manifest.sourceSvg.file);
const oraclePngPath = resolve(fixtureDirectory, manifest.oraclePng.file);
const configPath = resolve(fixtureDirectory, "frame-2.config.json");
const sourceSvgBytes = await readFile(sourceSvgPath);
const oraclePngBytes = await readFile(oraclePngPath);
requireHash("Sketch source SVG", sourceSvgBytes, manifest.sourceSvg.sha256);
requireHash("Sketch PNG oracle", oraclePngBytes, manifest.oraclePng.sha256);

const defaultFontPath = resolve(homedir(), "Library/Fonts/DelaSukoGothicOne-R.otf");
const fontPath = resolve(process.env.GRADIENT_TEXT_GEN_REFERENCE_FONT ?? defaultFontPath);
if (!existsSync(fontPath)) {
  throw new Error(
    `Reference font not found. Set GRADIENT_TEXT_GEN_REFERENCE_FONT to DelaSukoGothicOne-R.otf.`,
  );
}

const fontBytes = await readFile(fontPath);
requireHash("DelaSuko reference font", fontBytes, manifest.font.sha256);
const font = parseOutlineFont(toArrayBuffer(fontBytes));
if (getOutlineFontFamily(font) !== manifest.font.family) {
  throw new Error(`Unexpected reference font family: ${getOutlineFontFamily(font)}`);
}
if (getOutlineFontWeight(font) !== manifest.font.weight) {
  throw new Error(`Unexpected reference font weight: ${getOutlineFontWeight(font)}`);
}

const config = parseConfig(JSON.parse(await readFile(configPath, "utf8")) as unknown);
const editor = createDocumentFromOptions(config);
const svg = serializeSvgAsPaths(editor, font);
const webPresetSvg = serializeSvgAsPaths(createInitialDocument(), font);
const repeatedWebPresetSvg = serializeSvgAsPaths(createInitialDocument(), font);
if (svg !== webPresetSvg || webPresetSvg !== repeatedWebPresetSvg) {
  throw new Error("Equivalent web preset, CLI config, and repeated exports are not byte-identical");
}
if (svg.endsWith("\n")) {
  throw new Error("Canonical SVG bytes must not include a trailing newline");
}
const pathData = /<path id="text-path" d="([^"]+)"/.exec(svg)?.[1] ?? "";
const moves = (pathData.match(/M/g) ?? []).length;
const closes = (pathData.match(/Z/g) ?? []).length;
if (moves === 0 || moves !== closes) {
  throw new Error(`Outlined path contours are not closed: M=${moves}, Z=${closes}`);
}

const requestedOutputDirectory = process.env.GRADIENT_TEXT_GEN_VISUAL_OUTPUT_DIR;
const outputDirectory = requestedOutputDirectory
  ? resolve(requestedOutputDirectory)
  : await mkdtemp(resolve(tmpdir(), "gradient-text-gen-sketch-"));
await mkdir(outputDirectory, { recursive: true });
const actualSvgPath = resolve(outputDirectory, "frame-2.actual.svg");
const actualPngPath = resolve(outputDirectory, "frame-2.actual@2x.png");
const diffPngPath = resolve(outputDirectory, "frame-2.diff.png");
await writeFile(actualSvgPath, svg, "utf8");

run("sips", [
  "-s",
  "format",
  "png",
  "--resampleHeightWidth",
  String(manifest.oraclePng.height),
  String(manifest.oraclePng.width),
  actualSvgPath,
  "--out",
  actualPngPath,
]);

const dimensions = run("magick", ["identify", "-format", "%wx%h", actualPngPath]);
const expectedDimensions = `${manifest.oraclePng.width}x${manifest.oraclePng.height}`;
if (dimensions !== expectedDimensions) {
  throw new Error(`Raster dimensions differ: expected ${expectedDimensions}, received ${dimensions}`);
}

const alphaBounds = run("magick", [
  actualPngPath,
  "-alpha",
  "extract",
  "-threshold",
  "0",
  "-format",
  "%@",
  "info:",
]);
if (alphaBounds !== manifest.oraclePng.alphaBounds) {
  throw new Error(
    `Raster alpha bounds differ: expected ${manifest.oraclePng.alphaBounds}, received ${alphaBounds}`,
  );
}

const comparison = run(
  "magick",
  [
    "compare",
    "-channel",
    "RGBA",
    "-metric",
    "RMSE",
    oraclePngPath,
    actualPngPath,
    diffPngPath,
  ],
  [0, 1],
);
const normalizedRmse = Number(/\((\d+(?:\.\d+)?)\)/.exec(comparison)?.[1]);
if (!Number.isFinite(normalizedRmse)) {
  throw new Error(`ImageMagick returned an unreadable RMSE metric: ${comparison}`);
}
if (normalizedRmse > manifest.comparison.maximumNormalizedRmse) {
  throw new Error(
    `Sketch oracle RMSE ${normalizedRmse} exceeds ${manifest.comparison.maximumNormalizedRmse}. Diff: ${diffPngPath}`,
  );
}

process.stdout.write(
  `${JSON.stringify(
    {
      status: "passed",
      dimensions,
      alphaBounds,
      normalizedRmse,
      maximumNormalizedRmse: manifest.comparison.maximumNormalizedRmse,
      canonicalBytes: Buffer.byteLength(svg),
      webCliByteIdentical: true,
      svg: actualSvgPath,
      png: actualPngPath,
      diff: diffPngPath,
    },
    null,
    2,
  )}\n`,
);
