# Product Design QA

## Visual Truth

- `test/fixtures/sketch/frame-2@2x.png` is the canonical Sketch-rendered pixel oracle.
- `test/fixtures/sketch/frame-2.svg` is supporting vector structure, not a portable paint authority; several Sketch-specific expansion semantics do not survive generic SVG rendering.
- `test/fixtures/sketch/frame-2.config.json` and `frame-2.manifest.json` pin the exact document, DelaSuko font hash, geometry, rasterizer, and comparison threshold.
- The supplied color-editor screenshots remain the visual source for compact color and layer controls.

## Current Evidence

- Desktop editor at 1440 × 960: `docs/qa/desktop-final.png`.
- Mobile editor at 390 × 844: `docs/qa/mobile-final.png`.
- Current-run Sketch/generated/difference canvas: `docs/qa/sketch-oracle-comparison.png`.
- Regenerable outlined SVG, 2x raster, and diff artifacts are produced by `npm run test:visual` when `GRADIENT_TEXT_GEN_VISUAL_OUTPUT_DIR` is set.

## Canonical State

- Text: `ライゼオル`.
- Font: DelaSuko Gothic One Regular v1.005, weight 400, pinned by SHA-256.
- Typography: 155 px, tracking 0, line height 1.
- Fill: exact five-stop vertical yellow gradient from the Sketch data.
- Outlines: black 12 px outside and white 20 px outside, miter joins.
- Frame: 874 × 310 with the pinned reference origin, baseline, and per-glyph import calibration.

## Audit Results

### 1. Pixel oracle — passed

- The generated SVG raster is 1748 × 620, matching the Sketch PNG.
- Both images have the exact alpha bounds `1641x437+42+93`.
- ImageMagick normalized RGBA RMSE is `0.00281185`, below the pinned `0.003` maximum.
- Alpha IoU is `0.9999223429`; only 40 support pixels differ.
- Premultiplied PSNR is approximately `51.02 dB`.
- The amplified difference image confines residuals to antialiased edges and gradient quantization. No layout, glyph, outline, or paint-order mismatch is visible.

Literal `AE = 0` is not portable between Sketch and macOS ImageIO because the rasterizers quantize vector edges and gradients differently. The implementation keeps the output as vector paths and does not embed the oracle PNG.

### 2. Rendering contract — passed

- Open CFF glyph contours are closed before SVG strokes are applied.
- Outside sizes are absolute glyph-edge distances and serialize as doubled strokes behind the base fill.
- The generated path is stored once and reused for the outer white, inner black, and gradient fill layers.
- The outlined preview uses the exact serializer markup and dimensions used by clipboard, download, and CLI output.
- The web starter preset, equivalent CLI config, and repeated export emit the same 6,937 canonical bytes without a trailing newline.

### 3. Desktop editor — passed

- The 874 × 310 starter preview uses 40 px white and 24 px black centered strokes, producing the required 20 px and 12 px outside coverage.
- Text, font, weight, size, tracking, leading, gradient stops, outline placement, and export actions are visible and usable.
- The visible Canvas control starts on `Frame 2`; editing a long text line selects `Fit artwork` and expands the preview from 874 × 310 to 3720 × 251 instead of clipping. The user can explicitly restore the reference frame.
- No browser console warnings or errors were observed in the current run.
- The in-app browser does not expose Local Font Access, and the UI correctly presents manual family-name and font-file fallbacks.

### 4. Mobile editor — passed

- At 390 × 844, body and document `scrollWidth` both equal 390 px.
- The preview canvas, editor panel, and header remain within their client width with no horizontal page overflow.
- Preview appears before the long control rail and primary export actions remain fixed and reachable.

## Evidence Limits

- Browser screenshots verify the live text preview and responsive editor. The authorized DelaSuko binary cannot be selected through the in-app browser's file chooser, so the exact outlined path preview is covered by serializer tests and the 2x pixel oracle instead.
- An exact Sketch-rasterized PNG can only be reproduced by Sketch itself or by embedding a raster image. Neither is used for the delivered standalone vector SVG.

## Verification

```bash
npm run verify
```

The gate includes strict TypeScript checks, 28 automated tests, production builds, fixture and font hashes, deterministic serializer checks, exact geometry checks, automatic fit-frame regression coverage, and the pixel oracle comparison.

final result: passed
