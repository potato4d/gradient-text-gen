# Testing and Verification

## Automated Commands

Run the full local verification set from the repository root:

```bash
npm test
npm run build
git diff --check
```

The Node test suite covers color normalization, XML escaping, gradient geometry, the reference preset, deterministic output, zero and twelve outline layers, all three outline placements, and Japanese text.

## Deterministic SVG Requirement

Deterministic output is a release gate. Two documents with identical visible settings must produce byte-identical SVG markup even when their transient fill, stop, and outline IDs differ.

The serializer therefore:

- derives gradient and clip identifiers from rendered array positions;
- excludes editor IDs, timestamps, operation history, and comments;
- sorts gradient stops only for rendering while preserving stable duplicate offsets;
- formats numeric opacity and geometry values consistently;
- uses one serializer for preview, clipboard, and download actions.

The automated test `equivalent settings serialize to byte-identical final SVG content` creates two equivalent documents with different internal IDs and compares the complete SVG strings with strict equality.

## Browser Verification Matrix

Browser checks were performed in the Codex in-app browser against the Vite development server.

| Area | Verification | Result |
| --- | --- | --- |
| Desktop layout | 1440 × 960, persistent editor and preview | Passed |
| Mobile layout | 390 × 844, stacked preview/editor, fixed export bar | Passed |
| Mobile overflow | `scrollWidth` equals 390 px for body and document | Passed |
| Font | Switched from Heavy Gothic to Japanese Sans | Passed |
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

The exported SVG includes the selected font-family stack, weight, size, spacing, and line height. Exact glyph shapes depend on fonts installed on the viewing system. Embedding commercial or system font binaries, or converting arbitrary CJK and emoji glyphs to paths, is outside the current client-only scope.

