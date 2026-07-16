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

The web editor and CLI start with the same content-fitted Japanese system-font document, apply validated overrides, and call the same serializer. The web interface keeps canvas bounds content-fitted and does not expose the fixed reference frame. DelaSuko and fixed-frame geometry remain isolated to the explicit Frame 2 verification document rather than presented as general editor controls. Transient IDs are never included in SVG output.

The ordinary starter uses content-derived `fit` bounds. The explicit reference document starts on its pinned 874 × 310 artboard, while web text/font/typography edits and CLI geometry overrides switch to `fit` unless a fixed frame is explicitly selected, preventing ordinary long or multiline content from inheriting the Sketch calibration and clipping.

New installed-font permission requests are user-initiated because browsers require explicit consent. `localFonts.ts` converts Local Font Access results into deduplicated family options and safely quotes family names for CSS/SVG use. The editor always retains manual family-name entry as a capability and permission fallback.

Chrome persists the `local-fonts` permission across reloads. On page entry, the editor queries only the existing permission state and automatically loads the device-font catalog when that state is already `granted`; `prompt` and `denied` states never cause a page-load permission request.

Outlined export keeps parsed font data outside the serializable editor document. The browser may read bytes from an authorized `FontData.blob()` or a user-selected OTF, TTF, or WOFF file; the CLI requires an explicit file path. `textToPath.ts` lays out glyph paths with font metrics, kerning, tracking, alignment, and multiline baselines. It closes CFF contours before stroking, treats the parsed font file's weight as authoritative, and separates fit bounds from an optional fixed reference frame. The SVG stores the combined geometry once in `<defs>` and reuses it for every fill and outline layer.

The web editor has no outline-export mode switch or dedicated outline-status area. As soon as readable font bytes are available, path serialization automatically replaces live-text markup for preview, clipboard, and download. Live text remains only as the editing fallback before a font source is authorized or selected; a path-generation error blocks silent fallback for that loaded source.

The UI names editable stroke layers "Borders" to distinguish them from font-to-path conversion. The serialized document, TypeScript model, and CLI keep `outlines[]` and `--outline` for backward compatibility.

`preferences.ts` validates and versions the localStorage workspace payload. It restores the editor document with content-fitted bounds plus the preview background and zoom, rejects malformed data, and never stores parsed fonts or font bytes.

`GRADIENT_PRESETS` in `editorModel.ts` is the single typed catalog for the eight quick gradients. The first entry owns the canonical Sunbeam values used by the initial and Frame 2 reference documents. Applying a preset clones its visual settings into fresh transient stop IDs while preserving the selected fill's identity, enabled state, and layer opacity; the serializer continues to exclude those IDs so equivalent preset applications remain byte-identical.

## Rendering Strategy

- Measure the text in the browser to derive a padded SVG view box.
- Render the outermost outlines first as repeated SVG `<text>` elements.
- Treat each outside size as an absolute glyph-edge distance and render it as a doubled centered stroke behind the fill. Use native centered strokes for `center`, and clip doubled strokes to glyph shapes for `inside`.
- Use miter joins and butt caps so sharp corners match the Sketch reference.
- When the outlined base path, canvas dimensions, padding, and translation exactly match the canonical Frame 2 geometry and the outside size is 20 px, reuse a vetted expanded outside contour with a 20 px stroke. This preset-only calibration reduces Chrome edge drift while remaining pure vector; every edited text, font, size, placement, frame, and other outline width falls back to generic doubled strokes.
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
- `FillEditor`: quick gradient selection, solid/gradient type, angle, opacity, and stop editing.
- `ColorStopEditor`: stop rail, selected color values, add/remove controls.
- `OutlineEditor`: placement, width, opacity, and color controls.
- `ExportActions`: reset, clipboard, and SVG download actions.
- `cli.ts`: argument/config validation, document overrides, and file/stdout output.
- `editorModel.ts`: shared strict types, the quick-gradient catalog, preset application/matching helpers, and document factories.
- `localFonts.ts`: installed font discovery, deduplication, and CSS family quoting.
- `textToPath.ts`: local font parsing, missing-glyph validation, glyph layout, and deterministic path geometry.
- `frame2Calibration.ts`: narrowly fingerprinted canonical outer-outline geometry and safe generic fallback selection.
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

Production is hosted by ChatGPT Sites from validated `master` commits. Each Sites release records the exact pushed commit, packages the established Worker-compatible build, saves a version, and deploys that version to the custom domain. See [Deployment](DEPLOYMENT.md) for the release and rollback contract.

## Testing Strategy

- TypeScript compilation is a release gate through `npm run typecheck`.
- Unit tests for CLI parsing, color normalization, the eight-preset catalog, preset application, gradient coordinate math, text escaping, outline placement, and SVG serialization.
- A determinism test creates equivalent documents with different internal IDs and requires exactly equal SVG strings.
- CLI smoke checks generate the same file twice and compare it byte for byte.
- A checked-in Sketch PNG oracle gate validates fixture/font hashes and rasterizes the shared SVG through headless, software-rendered Chrome at device scale factor 2. ImageMagick enforces 99.95% NCC similarity and alpha overlap plus dimensions, color space, alpha bounds, aggregate/per-channel RMSE, RGBA PSNR, and alpha-support XOR limits. macOS ImageIO remains a non-blocking secondary diagnostic, and each result records the renderer environment.
- Production build verification.
- Browser checks for the complete edit-to-export journey.
- Visual captures at desktop and 390 x 844 mobile viewports.
- Iterative Product Design comparison recorded in `design-qa.md`.
