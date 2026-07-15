# Testing and Verification

## Automated Commands

Run the full local verification set from the repository root:

```bash
npm run typecheck
npm test
npm run build
git diff --check
```

The TypeScript test suite covers CLI parsing and configuration, local font family normalization and deduplication, deterministic glyph paths, missing-glyph rejection, color normalization, XML escaping, gradient geometry, the reference preset, deterministic output, zero and twelve outline layers, all three outline placements, Japanese text, and hosted static delivery behavior.

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

The outlined serializer test uses a generated fixture font and requires equivalent documents with different internal IDs to produce byte-identical SVG. It also verifies that the file contains one reusable path definition, preserves outside/center/inside layers, excludes font dependencies, and contains no invalid numeric values. A CLI smoke check generates the same outlined SVG twice from one system font file and compares the files byte for byte.

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

## Known Font Portability Constraint

Live-text SVG includes the selected font-family stack, weight, size, spacing, and line height. Device font discovery is available in supporting secure-context browsers after user permission, and manual family entry remains available everywhere. Outlined SVG removes the font dependency by converting supported monochrome OpenType glyphs to paths, but users remain responsible for confirming that their font license permits this use. WOFF2, font collections, bitmap emoji, and multicolor glyph layers are outside the initial outlined-export scope.
