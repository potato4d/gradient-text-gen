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

Generate the reference preset with different text:

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
  --outline "#FFFFFF@4:outside" \
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

## JSON Configuration

Use `--config settings.json` with a partial configuration object:

```json
{
  "text": "Config driven",
  "fontFamily": "'Avenir Next', sans-serif",
  "textToPath": "./fonts/Brand-Regular.otf",
  "weight": 900,
  "size": 164,
  "tracking": -4,
  "lineHeight": 0.95,
  "angle": 180,
  "fillOpacity": 100,
  "stops": ["#E9F62A@0", "#FFF5A0@27", "#F1BC15@100"],
  "outlines": ["#050505@6:outside", "#FFFFFF@4:outside"]
}
```

Command-line options override config values. The resulting SVG contains no timestamps, random identifiers, comments, or operation history.
