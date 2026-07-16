# Testing and Verification

## Automated Commands

Run the full local verification set from the repository root:

```bash
npm run typecheck
npm test
npm run build
npm run test:visual
git diff --check
```

The strict TypeScript gate includes the application, CLI, worker, build helpers, and visual-verification scripts. The test suite covers CLI parsing and configuration, local font family normalization and deduplication, deterministic glyph paths, missing-glyph rejection, color normalization, XML escaping, gradient geometry, the reference preset, deterministic output, zero and twelve outline layers, all three outline placements, the scoped Frame 2 outline calibration, Japanese text, and hosted static delivery behavior.

The production build must include `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`. The worker tests verify static delivery, HTML navigation fallback, and unmodified asset 404 responses.

## Deterministic SVG Requirement

Deterministic output is a release gate. Two documents with identical visible settings must produce byte-identical SVG markup even when their transient fill, stop, and outline IDs differ.

The serializer therefore:

- derives gradient and clip identifiers from rendered array positions;
- excludes editor IDs, timestamps, operation history, and comments;
- sorts gradient stops only for rendering while preserving stable duplicate offsets;
- formats numeric opacity and geometry values consistently;
- uses one serializer for preview, clipboard, and download actions.

The automated test `equivalent settings serialize to byte-identical final SVG content` creates two equivalent documents with different internal IDs and compares the complete SVG strings with strict equality.

The CLI test suite repeats the same guarantee for two documents created from equivalent CLI options. The smoke check writes two SVG files with identical options and compares them byte for byte.

The outlined serializer test uses a generated fixture font and requires equivalent documents with different internal IDs to produce byte-identical SVG. It also verifies that the file contains one reusable path definition, preserves outside/center/inside layers, excludes font dependencies, and contains no invalid numeric values. The Sketch oracle script exercises outlined generation with the authorized reference font and verifies the resulting visual artifact.

CLI file output is compared directly with the in-memory web serializer string. The test also requires the canonical no-trailing-newline policy.

## Sketch PNG Oracle

Run the canonical visual gate on macOS:

```bash
GRADIENT_TEXT_GEN_REFERENCE_FONT="$HOME/Library/Fonts/DelaSukoGothicOne-R.otf" \
  npm run test:visual
```

The final Sketch PNG is the sole visual oracle; the companion SVG is supporting geometry evidence only. The script validates the checked-in fixture and font hashes, requires the web starter preset, equivalent CLI config, and repeated exports to be byte-identical without a trailing newline, runs the authoritative Chrome gate, and records an optional ImageIO diagnostic.

The authoritative browser gate keeps the SVG at 874 × 310 and lets Chrome render it at device scale factor 2. ImageMagick then requires:

- exact 1748 × 620 dimensions, sRGB color space, and exact `1641x436+42+94` nonzero-alpha bounds;
- normalized cross-correlation similarity at or above `0.9995` (99.95%);
- normalized RGBA RMSE at or below `0.0062`;
- red, green, blue, and alpha RMSE at or below `0.0074`, `0.0071`, `0.0062`, and `0.0038` respectively;
- RGBA PSNR at or above `44 dB`;
- alpha-support IoU at or above `0.9995` (99.95%); and
- no more than 250 alpha-support XOR pixels.

The result also reports the exact differing-pixel count as a diagnostic. It is not an acceptance gate because the accepted requirement is 99.95%, not literal `AE = 0`.

The secondary macOS ImageIO diagnostic reports advisory violations against:

- exact 1748 x 620 raster dimensions, sRGB color space, and exact `1641x437+42+93` nonzero-alpha bounds;
- normalized RGBA RMSE at or below `0.003`;
- red, green, blue, and alpha RMSE at or below `0.003`, `0.0028`, `0.0041`, and `0.0015` respectively;
- RGBA PSNR at or above `50 dB`;
- alpha-support IoU at or above `0.9999`; and
- no more than 100 alpha-support XOR pixels.

Chrome, Sketch, and ImageIO do not quantize gradients and antialiased edges identically. The Chrome gate therefore pairs a 99.95% whole-image correlation threshold with independent color-error and shape-overlap limits. ImageIO results are emitted with `passed`, `warning`, or `unavailable` status and never reject an otherwise passing Chrome result. A raster image or raster-derived pixel geometry must never be embedded in the SVG to satisfy the gate.

The JSON result reports the macOS, Chrome, `sips`, and ImageMagick versions used for the run. Manifest thresholds are validated at runtime and fail closed when missing, nonnumeric, out of range, or nonintegral where an integer count is required. A missing or failing `sips` invocation is captured in the non-blocking `imageIo` diagnostic; `GRADIENT_TEXT_GEN_SIPS` can override the executable for verification.

Use `npm run verify` for the full local release gate. The visual step fails clearly when the authorized reference font, Chrome, or ImageMagick is unavailable; missing ImageIO tooling remains diagnostic-only.

## Browser Verification Matrix

Browser checks were performed in the Codex in-app browser against the Vite development server.

| Area | Verification | Result |
| --- | --- | --- |
| Desktop layout | 1440 × 960, persistent editor and preview | Passed |
| Mobile layout | 390 × 844, stacked preview/editor, fixed export bar | Passed |
| Mobile overflow | `scrollWidth` equals 390 px for body and document | Passed |
| Font | Switched from Heavy Gothic to Japanese Sans | Passed |
| Device font discovery | Invoked Local Font Access; the restricted in-app context showed the manual fallback message | Passed |
| Manual device font | Applied Menlo; preview and copied SVG contained the exact family declaration | Passed |
| Outlined export controls | Font-file fallback and disabled-until-ready path switch are present | Passed |
| Gradient | Changed the selected stop from `#E9F62A` to `#FF00FF` | Passed |
| Fill layers | Added a second fill and observed two rendered fill nodes | Passed |
| Preview surface | Switched the preview to dark | Passed |
| Outline maximum | Added outlines until twelve were active; add action disabled at the limit | Passed |
| Outline placement | Changed an outline to `inside`; clip path and inside node appeared | Passed |
| Zero outlines | Removed both starter outlines; no placement nodes remained | Passed |
| Copy SVG | Clipboard included XML declaration, reference gradient stop, and font declaration | Passed |
| Download SVG | Download action completed and displayed success feedback | Passed |
| Console | No browser warning or error entries | Passed |

## Visual Evidence

- `docs/qa/desktop-final.png`: final desktop viewport capture.
- `docs/qa/mobile-final.png`: final 390 × 844 capture at the top of the document.
- `docs/qa/desktop-comparison.png`: desktop implementation and all source references in one comparison canvas.
- `docs/qa/controls-comparison.png`: focused comparison of the supplied color/layer controls and the implemented editor.
- `docs/qa/mobile-comparison.png`: mobile implementation and source references in one comparison canvas.
- `docs/qa/chrome-oracle-comparison.png`: Sketch PNG, Chrome-rasterized outlined SVG, and amplified difference in one comparison canvas.

## Known Font Portability Constraint

Live-text SVG includes the selected font-family stack, weight, size, spacing, and line height. Device font discovery is available in supporting secure-context browsers after user permission, and manual family entry remains available everywhere. Outlined SVG removes the font dependency by converting supported monochrome OpenType glyphs to paths, but users remain responsible for confirming that their font license permits this use. WOFF2, font collections, bitmap emoji, and multicolor glyph layers are outside the initial outlined-export scope.
