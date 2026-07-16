import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
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
    blocking: false;
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
  chromeComparison: {
    blocking: true;
    deviceScaleFactor: number;
    alphaBounds: string;
    maximumNormalizedRmse: number;
    maximumNormalizedChannelRmse: {
      red: number;
      green: number;
      blue: number;
      alpha: number;
    };
    minimumRgbaPsnr: number;
    minimumNccSimilarity: number;
    minimumAlphaIoU: number;
    maximumAlphaSupportXorPixels: number;
  };
}

interface ImageIoDiagnostic {
  status: "passed" | "warning" | "unavailable";
  violations: string[];
  dimensions?: string;
  colorSpace?: string;
  alphaBounds?: string;
  normalizedRmse?: number;
  maximumNormalizedRmse?: number;
  channelRmse?: { red: number; green: number; blue: number; alpha: number };
  rgbaPsnr?: number | "Infinity";
  alphaIoU?: number;
  alphaSupportXorPixels?: number;
  sipsVersion?: string;
  error?: string;
  png: string;
  diff: string;
}

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = resolve(dirname(scriptPath), "..");
const fixtureDirectory = resolve(repositoryRoot, "test/fixtures/sketch");
const manifest = JSON.parse(
  await readFile(resolve(fixtureDirectory, "frame-2.manifest.json"), "utf8"),
) as SketchManifest;

if (manifest.comparison.blocking !== false) {
  throw new Error("ImageIO comparison must remain diagnostic-only");
}
if (manifest.chromeComparison.blocking !== true) {
  throw new Error("Chrome comparison must remain the authoritative blocking gate");
}

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
requireFiniteThreshold(
  "chromeComparison.deviceScaleFactor",
  manifest.chromeComparison.deviceScaleFactor,
  1,
  4,
);
requireFiniteThreshold(
  "chromeComparison.maximumNormalizedRmse",
  manifest.chromeComparison.maximumNormalizedRmse,
  0,
  1,
);
for (const channel of ["red", "green", "blue", "alpha"] as const) {
  requireFiniteThreshold(
    `chromeComparison.maximumNormalizedChannelRmse.${channel}`,
    manifest.chromeComparison.maximumNormalizedChannelRmse[channel],
    0,
    1,
  );
}
requireFiniteThreshold(
  "chromeComparison.minimumRgbaPsnr",
  manifest.chromeComparison.minimumRgbaPsnr,
  0,
);
requireFiniteThreshold(
  "chromeComparison.minimumNccSimilarity",
  manifest.chromeComparison.minimumNccSimilarity,
  0,
  1,
);
requireFiniteThreshold(
  "chromeComparison.minimumAlphaIoU",
  manifest.chromeComparison.minimumAlphaIoU,
  0,
  1,
);
requireFiniteThreshold(
  "chromeComparison.maximumAlphaSupportXorPixels",
  manifest.chromeComparison.maximumAlphaSupportXorPixels,
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

function parseNormalizedMetric(comparison: string, label: string): number {
  const value = Number(new RegExp(`\\((${numberToken})\\)\\s*$`).exec(comparison)?.[1]);
  if (!Number.isFinite(value)) {
    throw new Error(`ImageMagick returned an unreadable normalized ${label} metric: ${comparison}`);
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
  return parseNormalizedMetric(comparison, `${channel} RMSE`);
}

function maskPixelCount(args: string[]): number {
  const value = Number(run("magick", [...args, "-format", "%[fx:mean*w*h]", "info:"]));
  if (!Number.isFinite(value)) throw new Error("ImageMagick returned an unreadable mask count");
  return Math.round(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
if (!svg.includes('data-outline-calibration="frame-2"')) {
  throw new Error("Canonical Frame 2 export did not select its calibrated outer outline");
}
const calibratedPathData =
  /<path id="frame-2-outside-20" d="([^"]+)"/.exec(svg)?.[1] ?? "";
const calibratedMoves = (calibratedPathData.match(/M/g) ?? []).length;
const calibratedCloses = (calibratedPathData.match(/Z/g) ?? []).length;
if (calibratedMoves === 0 || calibratedMoves !== calibratedCloses) {
  throw new Error(
    `Calibrated outside path contours are not closed: M=${calibratedMoves}, Z=${calibratedCloses}`,
  );
}
const changedCanvasEditor = createDocumentFromOptions(config);
if (changedCanvasEditor.frame.mode !== "fixed") {
  throw new Error("Frame 2 regression fixture must use a fixed frame");
}
changedCanvasEditor.frame = {
  ...changedCanvasEditor.frame,
  width: changedCanvasEditor.frame.width + 1,
};
const changedCanvasSvg = serializeSvgAsPaths(changedCanvasEditor, font);
const changedCanvasPathData =
  /<path id="text-path" d="([^"]+)"/.exec(changedCanvasSvg)?.[1] ?? "";
if (changedCanvasPathData !== pathData) {
  throw new Error("Frame-only calibration regression must preserve the canonical base path data");
}
if (changedCanvasSvg.includes('data-outline-calibration="frame-2"')) {
  throw new Error("Frame 2 calibration must not apply after the canvas geometry changes");
}

const requestedOutputDirectory = process.env.GRADIENT_TEXT_GEN_VISUAL_OUTPUT_DIR;
const outputDirectory = requestedOutputDirectory
  ? resolve(requestedOutputDirectory)
  : await mkdtemp(resolve(tmpdir(), "gradient-text-gen-sketch-"));
await mkdir(outputDirectory, { recursive: true });
const actualSvgPath = resolve(outputDirectory, "frame-2.actual.svg");
const actualPngPath = resolve(outputDirectory, "frame-2.actual@2x.png");
const diffPngPath = resolve(outputDirectory, "frame-2.diff.png");
const chromePngPath = resolve(outputDirectory, "frame-2.actual.chrome@2x.png");
const chromeDiffPngPath = resolve(outputDirectory, "frame-2.chrome.diff.png");
const referenceAlphaMaskPath = resolve(outputDirectory, ".frame-2.reference-alpha-mask.png");
const actualAlphaMaskPath = resolve(outputDirectory, ".frame-2.actual-alpha-mask.png");
await writeFile(actualSvgPath, svg, "utf8");

const expectedDimensions = `${manifest.oraclePng.width}x${manifest.oraclePng.height}`;
const oracleColorSpace = run("magick", ["identify", "-format", "%[colorspace]", oraclePngPath]);
if (oracleColorSpace !== manifest.oraclePng.colorSpace) {
  throw new Error(
    `Oracle color space differs: expected ${manifest.oraclePng.colorSpace}, received ${oracleColorSpace}`,
  );
}
let imageIoDiagnostic: ImageIoDiagnostic;
try {
  const sipsPath = process.env.GRADIENT_TEXT_GEN_SIPS ?? "sips";
  const sipsVersion = run(sipsPath, ["--version"]);
  run(sipsPath, [
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
  const actualColorSpace = run("magick", ["identify", "-format", "%[colorspace]", actualPngPath]);
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
  const normalizedRmse = parseNormalizedMetric(comparison, "ImageIO RGBA RMSE");
  const channelRmse = {
    red: readNormalizedRmse("R", oraclePngPath, actualPngPath),
    green: readNormalizedRmse("G", oraclePngPath, actualPngPath),
    blue: readNormalizedRmse("B", oraclePngPath, actualPngPath),
    alpha: readNormalizedRmse("A", oraclePngPath, actualPngPath),
  };
  const psnrComparison = run(
    "magick",
    ["compare", "-channel", "RGBA", "-metric", "PSNR", oraclePngPath, actualPngPath, "null:"],
    [0, 1],
  );
  const psnrToken = new RegExp(
    `(?:^|\\n)\\s*(${numberToken}|inf(?:inity)?)\\s*(?:\\((?:${numberToken}|inf(?:inity)?)\\))?\\s*$`,
    "i",
  ).exec(psnrComparison)?.[1];
  const rgbaPsnr =
    psnrToken && /^inf/i.test(psnrToken) ? Number.POSITIVE_INFINITY : Number(psnrToken);
  if (Number.isNaN(rgbaPsnr)) {
    throw new Error(`ImageMagick returned an unreadable ImageIO PSNR metric: ${psnrComparison}`);
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
  const violations: string[] = [];
  if (dimensions !== expectedDimensions) {
    violations.push(`dimensions ${dimensions} do not match ${expectedDimensions}`);
  }
  if (actualColorSpace !== manifest.oraclePng.colorSpace) {
    violations.push(`color space ${actualColorSpace} does not match ${manifest.oraclePng.colorSpace}`);
  }
  if (alphaBounds !== manifest.oraclePng.alphaBounds) {
    violations.push(`alpha bounds ${alphaBounds} do not match ${manifest.oraclePng.alphaBounds}`);
  }
  if (normalizedRmse > manifest.comparison.maximumNormalizedRmse) {
    violations.push(
      `RGBA RMSE ${normalizedRmse} exceeds ${manifest.comparison.maximumNormalizedRmse}`,
    );
  }
  for (const channel of Object.keys(channelRmse) as Array<keyof typeof channelRmse>) {
    const maximum = manifest.comparison.maximumNormalizedChannelRmse[channel];
    if (channelRmse[channel] > maximum) {
      violations.push(`${channel} RMSE ${channelRmse[channel]} exceeds ${maximum}`);
    }
  }
  if (rgbaPsnr < manifest.comparison.minimumRgbaPsnr) {
    violations.push(`RGBA PSNR ${rgbaPsnr} is below ${manifest.comparison.minimumRgbaPsnr}`);
  }
  if (alphaIoU < manifest.comparison.minimumAlphaIoU) {
    violations.push(`alpha IoU ${alphaIoU} is below ${manifest.comparison.minimumAlphaIoU}`);
  }
  if (alphaSupportXorPixels > manifest.comparison.maximumAlphaSupportXorPixels) {
    violations.push(
      `alpha support XOR ${alphaSupportXorPixels} exceeds ${manifest.comparison.maximumAlphaSupportXorPixels}`,
    );
  }
  imageIoDiagnostic = {
    status: violations.length === 0 ? "passed" : "warning",
    violations,
    dimensions,
    colorSpace: actualColorSpace,
    alphaBounds,
    normalizedRmse,
    maximumNormalizedRmse: manifest.comparison.maximumNormalizedRmse,
    channelRmse,
    rgbaPsnr: Number.isFinite(rgbaPsnr) ? rgbaPsnr : "Infinity",
    alphaIoU,
    alphaSupportXorPixels,
    sipsVersion,
    png: actualPngPath,
    diff: diffPngPath,
  };
} catch (error) {
  await Promise.all([
    rm(referenceAlphaMaskPath, { force: true }),
    rm(actualAlphaMaskPath, { force: true }),
  ]);
  imageIoDiagnostic = {
    status: "unavailable",
    violations: [],
    error: errorMessage(error),
    png: actualPngPath,
    diff: diffPngPath,
  };
}

const defaultChromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chromePath = resolve(process.env.GRADIENT_TEXT_GEN_CHROME ?? defaultChromePath);
if (!existsSync(chromePath)) {
  throw new Error(`Chrome not found. Set GRADIENT_TEXT_GEN_CHROME to the Chrome executable.`);
}
await rm(chromePngPath, { force: true });
run(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--no-sandbox",
  "--hide-scrollbars",
  "--incognito",
  "--disable-extensions",
  "--default-background-color=00000000",
  `--force-device-scale-factor=${manifest.chromeComparison.deviceScaleFactor}`,
  `--window-size=${manifest.sourceSvg.width},${manifest.sourceSvg.height}`,
  `--screenshot=${chromePngPath}`,
  pathToFileURL(actualSvgPath).href,
]);

const chromeDimensions = run("magick", ["identify", "-format", "%wx%h", chromePngPath]);
if (chromeDimensions !== expectedDimensions) {
  throw new Error(
    `Chrome raster dimensions differ: expected ${expectedDimensions}, received ${chromeDimensions}`,
  );
}
const chromeColorSpace = run("magick", ["identify", "-format", "%[colorspace]", chromePngPath]);
if (chromeColorSpace !== manifest.oraclePng.colorSpace) {
  throw new Error(
    `Chrome raster color space differs: expected ${manifest.oraclePng.colorSpace}, received ${chromeColorSpace}`,
  );
}
const chromeAlphaBounds = run("magick", [
  chromePngPath,
  "-alpha",
  "extract",
  "-threshold",
  "0",
  "-format",
  "%@",
  "info:",
]);
if (chromeAlphaBounds !== manifest.chromeComparison.alphaBounds) {
  throw new Error(
    `Chrome alpha bounds differ: expected ${manifest.chromeComparison.alphaBounds}, received ${chromeAlphaBounds}`,
  );
}

const chromeComparison = run(
  "magick",
  [
    "compare",
    "-channel",
    "RGBA",
    "-metric",
    "RMSE",
    oraclePngPath,
    chromePngPath,
    chromeDiffPngPath,
  ],
  [0, 1],
);
const chromeNormalizedRmse = parseNormalizedMetric(chromeComparison, "Chrome RGBA RMSE");
if (chromeNormalizedRmse > manifest.chromeComparison.maximumNormalizedRmse) {
  throw new Error(
    `Chrome oracle RMSE ${chromeNormalizedRmse} exceeds ${manifest.chromeComparison.maximumNormalizedRmse}. Diff: ${chromeDiffPngPath}`,
  );
}
const chromeChannelRmse = {
  red: readNormalizedRmse("R", oraclePngPath, chromePngPath),
  green: readNormalizedRmse("G", oraclePngPath, chromePngPath),
  blue: readNormalizedRmse("B", oraclePngPath, chromePngPath),
  alpha: readNormalizedRmse("A", oraclePngPath, chromePngPath),
};
for (const channel of Object.keys(chromeChannelRmse) as Array<keyof typeof chromeChannelRmse>) {
  const maximum = manifest.chromeComparison.maximumNormalizedChannelRmse[channel];
  if (chromeChannelRmse[channel] > maximum) {
    throw new Error(`Chrome ${channel} RMSE ${chromeChannelRmse[channel]} exceeds ${maximum}`);
  }
}

const chromePsnrComparison = run(
  "magick",
  ["compare", "-channel", "RGBA", "-metric", "PSNR", oraclePngPath, chromePngPath, "null:"],
  [0, 1],
);
const chromePsnrToken = new RegExp(
  `(?:^|\\n)\\s*(${numberToken}|inf(?:inity)?)\\s*(?:\\((?:${numberToken}|inf(?:inity)?)\\))?\\s*$`,
  "i",
).exec(chromePsnrComparison)?.[1];
const chromeRgbaPsnr =
  chromePsnrToken && /^inf/i.test(chromePsnrToken)
    ? Number.POSITIVE_INFINITY
    : Number(chromePsnrToken);
if (Number.isNaN(chromeRgbaPsnr)) {
  throw new Error(`ImageMagick returned an unreadable Chrome PSNR metric: ${chromePsnrComparison}`);
}
if (chromeRgbaPsnr < manifest.chromeComparison.minimumRgbaPsnr) {
  throw new Error(
    `Chrome RGBA PSNR ${chromeRgbaPsnr} is below ${manifest.chromeComparison.minimumRgbaPsnr}`,
  );
}

const chromeNccComparison = run(
  "magick",
  ["compare", "-channel", "RGBA", "-metric", "NCC", oraclePngPath, chromePngPath, "null:"],
  [0, 1],
);
const chromeNccSimilarity =
  1 - parseNormalizedMetric(chromeNccComparison, "Chrome RGBA NCC error");
if (chromeNccSimilarity < manifest.chromeComparison.minimumNccSimilarity) {
  throw new Error(
    `Chrome NCC similarity ${chromeNccSimilarity} is below ${manifest.chromeComparison.minimumNccSimilarity}`,
  );
}

let chromeAlphaIntersectionPixels: number;
let chromeAlphaUnionPixels: number;
try {
  run("magick", [oraclePngPath, "-alpha", "extract", "-threshold", "0", referenceAlphaMaskPath]);
  run("magick", [chromePngPath, "-alpha", "extract", "-threshold", "0", actualAlphaMaskPath]);
  chromeAlphaIntersectionPixels = maskPixelCount([
    referenceAlphaMaskPath,
    actualAlphaMaskPath,
    "-evaluate-sequence",
    "min",
  ]);
  chromeAlphaUnionPixels = maskPixelCount([
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
const chromeAlphaIoU = chromeAlphaIntersectionPixels / chromeAlphaUnionPixels;
const chromeAlphaSupportXorPixels = chromeAlphaUnionPixels - chromeAlphaIntersectionPixels;
if (chromeAlphaIoU < manifest.chromeComparison.minimumAlphaIoU) {
  throw new Error(
    `Chrome alpha IoU ${chromeAlphaIoU} is below ${manifest.chromeComparison.minimumAlphaIoU}`,
  );
}
if (chromeAlphaSupportXorPixels > manifest.chromeComparison.maximumAlphaSupportXorPixels) {
  throw new Error(
    `Chrome alpha support XOR ${chromeAlphaSupportXorPixels} exceeds ${manifest.chromeComparison.maximumAlphaSupportXorPixels}`,
  );
}
const chromeExactDifferentPixels = maskPixelCount([
  oraclePngPath,
  chromePngPath,
  "-compose",
  "difference",
  "-composite",
  "-separate",
  "-evaluate-sequence",
  "max",
  "-threshold",
  "0",
]);

process.stdout.write(
  `${JSON.stringify(
    {
      status: "passed",
      oracle: {
        dimensions: expectedDimensions,
        colorSpace: oracleColorSpace,
      },
      imageIo: imageIoDiagnostic,
      chrome: {
        dimensions: chromeDimensions,
        colorSpace: chromeColorSpace,
        alphaBounds: chromeAlphaBounds,
        normalizedRmse: chromeNormalizedRmse,
        maximumNormalizedRmse: manifest.chromeComparison.maximumNormalizedRmse,
        channelRmse: chromeChannelRmse,
        rgbaPsnr: Number.isFinite(chromeRgbaPsnr) ? chromeRgbaPsnr : "Infinity",
        nccSimilarity: chromeNccSimilarity,
        minimumNccSimilarity: manifest.chromeComparison.minimumNccSimilarity,
        alphaIoU: chromeAlphaIoU,
        alphaSupportXorPixels: chromeAlphaSupportXorPixels,
        exactDifferentPixels: chromeExactDifferentPixels,
        exactPixelMatch: chromeExactDifferentPixels === 0,
        png: chromePngPath,
        diff: chromeDiffPngPath,
      },
      environment: {
        macOS: run("sw_vers", ["-productVersion"]),
        sips: imageIoDiagnostic.sipsVersion ?? "unavailable",
        imageMagick: run("magick", ["-version"]).split("\n")[0],
        chrome: run(chromePath, ["--version"]),
      },
      canonicalBytes: Buffer.byteLength(svg),
      webCliByteIdentical: true,
      svg: actualSvgPath,
    },
    null,
    2,
  )}\n`,
);
