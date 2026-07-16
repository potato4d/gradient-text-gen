# Product Design QA

## Comparison Target

- Source visual truth: `test/fixtures/sketch/frame-2@2x.png`.
- Browser implementation: `docs/qa/chrome-oracle-comparison.png`, generated from the shared outlined SVG serializer in Chrome 150 at an 874 × 310 CSS-pixel viewport and device scale factor 2.
- State: canonical `ライゼオル` preset with DelaSuko Gothic One Regular v1.005, the five-stop yellow gradient, black 12 px outside outline, and white 20 px outside outline.
- Acceptance decision: normalized cross-correlation similarity and alpha-support overlap must each be at least 99.95%. Literal zero-error pixels are not required.
- Supporting evidence: `test/fixtures/sketch/frame-2.svg` may inform vector geometry, but matching its structure or Sketch re-import behavior is not required.

## Findings

No actionable P0, P1, or P2 mismatch remains under the accepted 99.95% contract.

- Fonts and typography: the authorized DelaSuko file is pinned by SHA-256, parsed at weight 400, and converted to closed deterministic paths. Glyph shape, tracking, baseline, and frame placement match the oracle at the required overlap.
- Spacing and layout rhythm: both artifacts are 1748 × 620 at 2x. The Chrome alpha bounds are the pinned `1641x436+42+94`; no crop, wrap, or frame drift is visible in the combined comparison.
- Colors and visual tokens: Chrome normalized RGBA RMSE is `0.00612614`; red, green, blue, and alpha RMSE are `0.00725547`, `0.00689443`, `0.00602277`, and `0.00369726`. All remain inside independent manifest ceilings. NCC similarity is `0.9999472433` (99.99472433%), above the accepted 99.95% minimum.
- Image quality and asset fidelity: the output remains pure vector glyph and outline paths. The oracle PNG, font bytes, and other raster data are not embedded. The amplified difference view confines residuals to subpixel edges and low-level gradient quantization rather than a missing or substituted asset.
- Copy and content: the canonical Japanese text is unchanged and the outlined SVG has no runtime font dependency.
- Outline geometry: alpha-support IoU is `0.9996253147` (99.96253147%), above the accepted 99.95% minimum; 193 support pixels differ.
- Signal quality: RGBA PSNR is `44.2563 dB`, above the pinned `44 dB` minimum.

The exact RGBA diagnostic reports 197,585 pixels with at least one channel difference. This does not conflict with the accepted metric: exact equality treats a one-level antialiasing or gradient quantization change as a full mismatch, while the bounded NCC, RMSE, PSNR, and alpha-overlap gates measure its visual magnitude and geometry.

## Full-View Evidence

`docs/qa/chrome-oracle-comparison.png` places the source PNG, the Chrome-rasterized outlined SVG, and an amplified absolute difference in one 874 px-wide canvas. At normal viewing scale, the two artwork rows are visually indistinguishable. The amplified row exposes fine edge and fill quantization residuals without revealing layout, glyph, paint-order, or outline-width drift.

No additional focused crop is needed: the artwork fills the comparison width, individual joins remain readable at the stored resolution, and the amplified full-width difference already isolates the fidelity-sensitive edges and gradient fill.

## Comparison History

1. The initial portable outlined SVG used only doubled centered strokes. Chrome normalized RGBA RMSE was `0.00723384`, and the outer white contour showed the largest antialiasing residual.
2. Chrome was normalized to the actual delivery condition: the 874 × 310 SVG rendered at device scale factor 2, rather than resizing SVG coordinates before rasterization.
3. The canonical 20 px outer white outline was calibrated with a vetted expanded vector contour selected only by the exact Frame 2 path fingerprint, canvas geometry, translation, and thickness. Edited text, font, size, frame placement, and other outline widths retain the generic serializer path.
4. The current Chrome result improves normalized RGBA RMSE to `0.00612614`, NCC similarity to 99.99472433%, and alpha-support overlap to 99.96253147%.
5. Dense raster-derived gradient stops and renderer-specific color offsets were rejected: they worsened aggregate Chrome error or would encode oracle-raster behavior rather than a portable editable gradient.

## Rendering Contract

- The web editor and CLI call the same deterministic TypeScript serializer.
- Equivalent explicit Frame 2 reference documents, the CLI fixture config, and repeated exports emit the same 11,956 canonical UTF-8 bytes without a trailing newline. The ordinary starter is intentionally device-independent.
- The SVG contains reusable closed path geometry and no `<text>`, `<tspan>`, `font-family`, embedded font binary, image element, or raster pixel geometry.
- The canonical outer calibration is selected only for the exact reference base path and 20 px outside thickness; every other document uses generic outside/center/inside outline rendering.
- macOS ImageIO remains a secondary diagnostic and currently reports RMSE `0.00280902`, PSNR `51.0289 dB`, alpha IoU `0.9999204016`, and 41 alpha-support XOR pixels.

## Responsive Editor Evidence

- Desktop editor: `docs/qa/desktop-final.png` at 1440 × 960.
- Mobile editor: `docs/qa/mobile-final.png` at 390 × 844.
- At 390 px, body and document `scrollWidth` both equal 390 px; preview, controls, and fixed export actions remain reachable.
- The recorded browser interaction run covered font selection/fallback, gradient edits, multiple fill and outline layers, all three outline placements, zero and twelve outlines, preview backgrounds, copy, and SVG download with no console warnings or errors.

## Follow-up Polish

- P3: Chrome and Sketch use different antialiasing and gradient quantization kernels, leaving the amplified residual shown in the comparison evidence. It is accepted by the user-authorized 99.95% threshold and is not actionable without renderer-specific raster data.

## Verification

```bash
npm run verify
```

The release gate includes strict TypeScript checks, unit/integration tests, production builds, fixture and font hashes, deterministic web/CLI bytes, closed-contour checks, the scoped Frame 2 calibration check, Chrome NCC/RMSE/PSNR/alpha metrics, the ImageIO diagnostic, and whitespace validation.

final result: passed
