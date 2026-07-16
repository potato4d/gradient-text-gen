# Architecture

## Technology

- Strict TypeScript for the application, shared document model, serializer, tests, Vite configuration, and CLI.
- React 19 for stateful UI composition.
- Vite 6 for local development and production builds.
- `lucide-react` for consistent interface icons, as required by the product brief.
- Native SVG for preview rendering and file export.
- A minimal Cloudflare-compatible worker for static delivery and single-page navigation fallback.

## State Model

The editor owns one serializable document object:

```text
document
├── text
├── typography: family, weight, size, lineHeight, letterSpacing
├── fills[]: id, enabled, type, opacity, angle, color, stops[]
├── outlines[]: id, enabled, color, width, opacity, placement
├── frame: fit or fixed width, height, origin, baseline, glyph calibration
└── preview: background, zoom
```

Every visible control updates this document. Preview markup and downloaded SVG markup are produced from the same state to avoid export drift.

The CLI starts with the same document preset, applies validated command-line or JSON overrides, and calls the same serializer. Transient IDs are never included in SVG output.

The reference preset starts on its pinned 874 × 310 artboard. Web text/font/typography edits and CLI geometry overrides switch to `fit` unless a fixed frame is explicitly selected, preventing ordinary long or multiline content from inheriting the Sketch calibration and clipping.

Installed font discovery is user-initiated because browsers require explicit permission. `localFonts.ts` converts Local Font Access results into deduplicated family options and safely quotes family names for CSS/SVG use. The editor always retains manual family-name entry as a capability and permission fallback.

Outlined export keeps parsed font data outside the serializable editor document. The browser may read bytes from an authorized `FontData.blob()` or a user-selected OTF, TTF, or WOFF file; the CLI requires an explicit file path. `textToPath.ts` lays out glyph paths with font metrics, kerning, tracking, alignment, and multiline baselines. It closes CFF contours before stroking, treats the parsed font file's weight as authoritative, and separates fit bounds from an optional fixed reference frame. The SVG stores the combined geometry once in `<defs>` and reuses it for every fill and outline layer.

## Rendering Strategy

- Measure the text in the browser to derive a padded SVG view box.
- Render the outermost outlines first as repeated SVG `<text>` elements.
- Treat each outside size as an absolute glyph-edge distance and render it as a doubled centered stroke behind the fill. Use native centered strokes for `center`, and clip doubled strokes to glyph shapes for `inside`.
- Use miter joins and butt caps so sharp corners match the Sketch reference.
- Render fill layers above outlines as repeated `<text>` elements with gradient or solid paint.
- Create one SVG `<linearGradient>` definition per enabled gradient fill.
- Use `paint-order: stroke fill` so wide strokes do not eat into the fill.
- Store all color values as six-digit hexadecimal strings and opacity as percentages in UI state.

## Export Strategy

- Serialize a standalone SVG string from the editor document.
- Generate stable paint and clip IDs from rendered array positions rather than transient editor IDs.
- Omit timestamps, random values, comments, and operation history so equivalent visible settings are byte-identical.
- Quantize generated glyph path coordinates to six decimal places. Fit frames use font metrics and glyph bounds; fixed frames preserve explicit dimensions and placement.
- Reject outlined export when any non-whitespace glyph is unavailable instead of silently substituting a different font.
- Include the selected CSS font-family value and typography attributes on every text node.
- Escape text content before serialization.
- Use a Blob URL for download and revoke it immediately afterward.
- Use the same serializer result for outlined preview, clipboard, download, CLI stdout, and CLI file output.
- Emit the serializer string as canonical UTF-8 bytes without appending a trailing newline.

## Component Boundaries

- `App`: editor state and responsive workspace orchestration.
- `PreviewStage`: live SVG, preview surface, zoom controls, and empty handling.
- `TextControls`: copy and typography controls.
- `LayerPanel`: fill and outline collections.
- `FillEditor`: solid/gradient type, angle, opacity, and stop editing.
- `ColorStopEditor`: stop rail, selected color values, add/remove controls.
- `OutlineEditor`: placement, width, opacity, and color controls.
- `ExportActions`: reset, clipboard, and SVG download actions.
- `cli.ts`: argument/config validation, document overrides, and file/stdout output.
- `editorModel.ts`: shared strict types and document factories.
- `localFonts.ts`: installed font discovery, deduplication, and CSS family quoting.
- `textToPath.ts`: local font parsing, missing-glyph validation, glyph layout, and deterministic path geometry.
- `svg.ts`: environment-independent deterministic layout and serialization.
- `worker/index.ts`: static asset delivery, security headers, and HTML navigation fallback for hosted previews.
- `build/sites-vite-plugin.ts`: deployment metadata propagation into the production bundle.

## Deployment Output

`npm run build` clears generated artifacts and produces three independent targets:

```text
dist/
├── .openai/hosting.json
├── client/                 # Browser assets
└── server/index.js         # Cloudflare-compatible worker entry
dist-cli/                   # Node.js CLI package output
```

The worker delegates static requests to the platform asset binding. Requests that accept HTML fall back to `index.html`, which keeps direct links and browser refreshes inside the React application.

## Testing Strategy

- TypeScript compilation is a release gate through `npm run typecheck`.
- Unit tests for CLI parsing, color normalization, gradient coordinate math, text escaping, outline placement, and SVG serialization.
- A determinism test creates equivalent documents with different internal IDs and requires exactly equal SVG strings.
- CLI smoke checks generate the same file twice and compare it byte for byte.
- A checked-in Sketch oracle gate validates fixture/font hashes, raster dimensions, color space, alpha bounds, aggregate and per-channel RMSE, RGBA PSNR, and alpha-support IoU/XOR through macOS ImageIO and ImageMagick; each result records the renderer environment.
- Production build verification.
- Browser checks for the complete edit-to-export journey.
- Visual captures at desktop and 390 x 844 mobile viewports.
- Iterative Product Design comparison recorded in `design-qa.md`.
