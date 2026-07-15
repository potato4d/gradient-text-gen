import assert from "node:assert/strict";
import test from "node:test";
import {
  LocalFontAccessError,
  createDeviceFontOptions,
  queryDeviceFonts,
  quoteCssFontFamily,
  unquoteCssFontFamily,
} from "./localFonts.js";

test("deduplicates and sorts installed font families", () => {
  const options = createDeviceFontOptions([
    { family: "Zed Sans", fullName: "Zed Sans Bold" },
    { family: "alpha Serif", fullName: "alpha Serif Regular" },
    { family: "Zed Sans", fullName: "Zed Sans Regular" },
    { family: "  " },
  ]);

  assert.deepEqual(
    options.map(({ id, label, family }) => ({ id, label, family })),
    [
      { id: "device:alpha serif", label: "alpha Serif", family: "'alpha Serif'" },
      { id: "device:zed sans", label: "Zed Sans", family: "'Zed Sans'" },
    ],
  );
});

test("quotes and restores CSS font family names", () => {
  const family = String.raw`Maker's \\ Display`;
  const quoted = quoteCssFontFamily(family);
  assert.equal(quoted, String.raw`'Maker\'s \\\\ Display'`);
  assert.equal(unquoteCssFontFamily(quoted), family);
});

test("reports unsupported installed font discovery", async () => {
  await assert.rejects(
    queryDeviceFonts(undefined),
    (error: unknown) => error instanceof LocalFontAccessError && error.reason === "unsupported",
  );
});
