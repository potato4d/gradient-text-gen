# Command-Line Interface

## Development Usage

Run the TypeScript source directly:

```bash
npm run cli -- --text "Gradient" --output gradient.svg
```

Build the installable command and run it:

```bash
npm run build:cli
node dist-cli/cli.js --help
```

The package exposes the `gradient-text-gen` binary when installed or linked through npm.

## Common Examples

Generate with the device-independent starter settings and different text:

```bash
gradient-text-gen --text "ライゼオル" --output artwork.svg
```

Create a custom two-stop gradient and two outside outlines:

```bash
gradient-text-gen \
  --text "Gradient" \
  --font modern-gothic \
  --size 180 \
  --stop "#6F78FF@0" \
  --stop "#F4FF77@100" \
  --angle 135 \
  --outline "#000000@6:outside" \
  --outline "#FFFFFF@10:outside" \
  --output gradient.svg
```

Generate text without any outline and print SVG to standard output:

```bash
gradient-text-gen --text "Clean" --fill "#6F78FF" --no-outline
```

List valid font IDs:

```bash
gradient-text-gen --list-fonts
```

Use an installed or custom CSS font-family declaration without adding it to the curated list:

```bash
gradient-text-gen \
  --text "Local type" \
  --font-family "'Avenir Next', sans-serif" \
  --output local-type.svg
```

`--font` and `--font-family` are mutually exclusive. Font files are not embedded; the selected family must be available wherever the SVG is rendered.

Convert text to portable SVG paths with an explicit font file:

```bash
gradient-text-gen \
  --text "Portable type" \
  --text-to-path "./fonts/Brand-Regular.otf" \
  --output portable-type.svg
```

Outlined export supports OTF, TTF, and WOFF input. It fails when the font file is invalid or lacks a required glyph. The font file path and binary are never included in the SVG, so the same file bytes and editor settings produce the same output regardless of the input path.

Outlined geometry is determined by the exact font-file bytes. A family name or CSS weight alone does not identify the selected outline face. When the parsed file reports a different weight, its embedded weight is authoritative for path output.

## Argument Formats

Gradient stops use:

```text
#RRGGBB@offset[:opacity]
```

Outlines use:

```text
#RRGGBB@size[:outside|center|inside[:opacity]]
```

Both options are repeatable. At least two stops are required when overriding the gradient, and at most twelve outlines are accepted.

For `outside`, size is the absolute distance from the glyph edge. For example, `#FFFFFF@20:outside` produces 20 px of outside coverage and is serialized as a 40 px centered stroke behind the base fill.

## JSON Configuration

Use `--config settings.json` with a partial configuration object:

```json
{
  "text": "Config driven",
  "fontFamily": "'Avenir Next', sans-serif",
  "textToPath": "./fonts/Brand-Regular.otf",
  "weight": 400,
  "size": 155,
  "tracking": 0,
  "lineHeight": 1,
  "angle": 180,
  "fillOpacity": 100,
  "stops": ["#E9F62A@0", "#FFF5A0@26.5679633", "#F1BC15@100"],
  "outlines": ["#000000@12:outside", "#FFFFFF@20:outside"]
}
```

JSON configuration also accepts a deterministic frame:

```json
{
  "frame": {
    "mode": "fixed",
    "width": 874,
    "height": 310,
    "originX": 44.995,
    "baselineY": 234.835,
    "glyphOffsets": [{ "x": 0, "y": 0 }]
  }
}
```

Use `{ "frame": { "mode": "fit" } }` for content-derived bounds. The CLI uses `fit` by default and preserves a fixed artboard only when the config explicitly supplies one. Optional per-glyph offsets are intended for deterministic import/reference calibration, not font shaping.

Command-line options override config values. The resulting SVG contains no timestamps, random identifiers, comments, or operation history.

SVG file and standard-output modes emit the serializer's canonical UTF-8 bytes without adding or removing whitespace at end of file.
