import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
    colorSpace: string;
    alphaBounds: string;
  };
  font: { family: string; weight: number; sha256: string };
  comparison: {
    maximumNormalizedRmse: number;
    maximumNormalizedChannelRmse: {
      red: number;
      green: number;
      blue: number;
      alpha: number;
    };
    minimumRgbaPsnr: number;
    minimumAlphaIoU: number;
    maximumAlphaSupportXorPixels: number;
  };
}

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = resolve(dirname(scriptPath), "..");
const fixtureDirectory = resolve(repositoryRoot, "test/fixtures/sketch");
const manifest = JSON.parse(
  await readFile(resolve(fixtureDirectory, "frame-2.manifest.json"), "utf8"),
) as SketchManifest;

function requireFiniteThreshold(
  label: string,
  value: number,
  minimum: number,
  maximum = Number.POSITIVE_INFINITY,
  integer = false,
): void {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum ||
    (integer && !Number.isInteger(value))
  ) {
    throw new Error(
      `${label} must be ${integer ? "an integer" : "a finite number"} between ${minimum} and ${maximum}`,
    );
  }
}

requireFiniteThreshold(
  "comparison.maximumNormalizedRmse",
  manifest.comparison.maximumNormalizedRmse,
  0,
  1,
);
for (const channel of ["red", "green", "blue", "alpha"] as const) {
  requireFiniteThreshold(
    `comparison.maximumNormalizedChannelRmse.${channel}`,
    manifest.comparison.maximumNormalizedChannelRmse[channel],
    0,
    1,
  );
}
requireFiniteThreshold("comparison.minimumRgbaPsnr", manifest.comparison.minimumRgbaPsnr, 0);
requireFiniteThreshold("comparison.minimumAlphaIoU", manifest.comparison.minimumAlphaIoU, 0, 1);
requireFiniteThreshold(
  "comparison.maximumAlphaSupportXorPixels",
  manifest.comparison.maximumAlphaSupportXorPixels,
  0,
  manifest.oraclePng.width * manifest.oraclePng.height,
  true,
);

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

const numberToken = String.raw`[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?`;

function parseNormalizedRmse(comparison: string, label: string): number {
  const value = Number(new RegExp(`\\((${numberToken})\\)\\s*$`).exec(comparison)?.[1]);
  if (!Number.isFinite(value)) {
    throw new Error(`ImageMagick returned an unreadable ${label} RMSE metric: ${comparison}`);
  }
  return value;
}

function readNormalizedRmse(
  channel: "R" | "G" | "B" | "A",
  expected: string,
  actual: string,
): number {
  const comparison = run(
    "magick",
    ["compare", "-channel", channel, "-metric", "RMSE", expected, actual, "null:"],
    [0, 1],
  );
  return parseNormalizedRmse(comparison, channel);
}

function maskPixelCount(args: string[]): number {
  const value = Number(run("magick", [...args, "-format", "%[fx:mean*w*h]", "info:"]));
  if (!Number.isFinite(value)) throw new Error("ImageMagick returned an unreadable mask count");
  return Math.round(value);
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
const referenceAlphaMaskPath = resolve(outputDirectory, ".frame-2.reference-alpha-mask.png");
const actualAlphaMaskPath = resolve(outputDirectory, ".frame-2.actual-alpha-mask.png");
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

const oracleColorSpace = run("magick", ["identify", "-format", "%[colorspace]", oraclePngPath]);
const actualColorSpace = run("magick", ["identify", "-format", "%[colorspace]", actualPngPath]);
if (oracleColorSpace !== manifest.oraclePng.colorSpace) {
  throw new Error(
    `Oracle color space differs: expected ${manifest.oraclePng.colorSpace}, received ${oracleColorSpace}`,
  );
}
if (actualColorSpace !== manifest.oraclePng.colorSpace) {
  throw new Error(
    `Raster color space differs: expected ${manifest.oraclePng.colorSpace}, received ${actualColorSpace}`,
  );
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
const normalizedRmse = parseNormalizedRmse(comparison, "RGBA");
if (normalizedRmse > manifest.comparison.maximumNormalizedRmse) {
  throw new Error(
    `Sketch oracle RMSE ${normalizedRmse} exceeds ${manifest.comparison.maximumNormalizedRmse}. Diff: ${diffPngPath}`,
  );
}

const channelRmse = {
  red: readNormalizedRmse("R", oraclePngPath, actualPngPath),
  green: readNormalizedRmse("G", oraclePngPath, actualPngPath),
  blue: readNormalizedRmse("B", oraclePngPath, actualPngPath),
  alpha: readNormalizedRmse("A", oraclePngPath, actualPngPath),
};
for (const channel of Object.keys(channelRmse) as Array<keyof typeof channelRmse>) {
  const maximum = manifest.comparison.maximumNormalizedChannelRmse[channel];
  if (channelRmse[channel] > maximum) {
    throw new Error(`${channel} RMSE ${channelRmse[channel]} exceeds ${maximum}`);
  }
}

const psnrComparison = run(
  "magick",
  ["compare", "-channel", "RGBA", "-metric", "PSNR", oraclePngPath, actualPngPath, "null:"],
  [0, 1],
);
const psnrToken = new RegExp(
  `(?:^|\\n)\\s*(${numberToken}|inf(?:inity)?)\\s*(?:\\((?:${numberToken}|inf(?:inity)?)\\))?\\s*$`,
  "i",
).exec(psnrComparison)?.[1];
const rgbaPsnr = psnrToken && /^inf/i.test(psnrToken) ? Number.POSITIVE_INFINITY : Number(psnrToken);
if (Number.isNaN(rgbaPsnr)) {
  throw new Error(`ImageMagick returned an unreadable PSNR metric: ${psnrComparison}`);
}
if (rgbaPsnr < manifest.comparison.minimumRgbaPsnr) {
  throw new Error(`RGBA PSNR ${rgbaPsnr} is below ${manifest.comparison.minimumRgbaPsnr}`);
}

let alphaIntersectionPixels: number;
let alphaUnionPixels: number;
try {
  run("magick", [oraclePngPath, "-alpha", "extract", "-threshold", "0", referenceAlphaMaskPath]);
  run("magick", [actualPngPath, "-alpha", "extract", "-threshold", "0", actualAlphaMaskPath]);
  alphaIntersectionPixels = maskPixelCount([
    referenceAlphaMaskPath,
    actualAlphaMaskPath,
    "-evaluate-sequence",
    "min",
  ]);
  alphaUnionPixels = maskPixelCount([
    referenceAlphaMaskPath,
    actualAlphaMaskPath,
    "-evaluate-sequence",
    "max",
  ]);
} finally {
  await Promise.all([
    rm(referenceAlphaMaskPath, { force: true }),
    rm(actualAlphaMaskPath, { force: true }),
  ]);
}
const alphaIoU = alphaIntersectionPixels / alphaUnionPixels;
const alphaSupportXorPixels = alphaUnionPixels - alphaIntersectionPixels;
if (alphaIoU < manifest.comparison.minimumAlphaIoU) {
  throw new Error(`Alpha IoU ${alphaIoU} is below ${manifest.comparison.minimumAlphaIoU}`);
}
if (alphaSupportXorPixels > manifest.comparison.maximumAlphaSupportXorPixels) {
  throw new Error(
    `Alpha support XOR ${alphaSupportXorPixels} exceeds ${manifest.comparison.maximumAlphaSupportXorPixels}`,
  );
}

process.stdout.write(
  `${JSON.stringify(
    {
      status: "passed",
      dimensions,
      colorSpace: actualColorSpace,
      alphaBounds,
      normalizedRmse,
      maximumNormalizedRmse: manifest.comparison.maximumNormalizedRmse,
      channelRmse,
      rgbaPsnr: Number.isFinite(rgbaPsnr) ? rgbaPsnr : "Infinity",
      alphaIoU,
      alphaSupportXorPixels,
      environment: {
        macOS: run("sw_vers", ["-productVersion"]),
        sips: run("sips", ["--version"]),
        imageMagick: run("magick", ["-version"]).split("\n")[0],
      },
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
