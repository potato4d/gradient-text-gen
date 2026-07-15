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
└── preview: background, zoom
```

Every visible control updates this document. Preview markup and downloaded SVG markup are produced from the same state to avoid export drift.

The CLI starts with the same document preset, applies validated command-line or JSON overrides, and calls the same serializer. Transient IDs are never included in SVG output.

## Rendering Strategy

- Measure the text in the browser to derive a padded SVG view box.
- Render the outermost outlines first as repeated SVG `<text>` elements.
- Build outside rings from cumulative thicknesses, use native centered strokes for `center`, and clip doubled strokes to glyph shapes for `inside`.
- Render fill layers above outlines as repeated `<text>` elements with gradient or solid paint.
- Create one SVG `<linearGradient>` definition per enabled gradient fill.
- Use `paint-order: stroke fill` so wide strokes do not eat into the fill.
- Store all color values as six-digit hexadecimal strings and opacity as percentages in UI state.

## Export Strategy

- Serialize a standalone SVG string from the editor document.
- Generate stable paint and clip IDs from rendered array positions rather than transient editor IDs.
- Omit timestamps, random values, comments, and operation history so equivalent visible settings are byte-identical.
- Include the selected CSS font-family value and typography attributes on every text node.
- Escape text content before serialization.
- Use a Blob URL for download and revoke it immediately afterward.
- Use the same serializer for the clipboard action and download action.

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
- Production build verification.
- Browser checks for the complete edit-to-export journey.
- Visual captures at desktop and 390 x 844 mobile viewports.
- Iterative Product Design comparison recorded in `design-qa.md`.
