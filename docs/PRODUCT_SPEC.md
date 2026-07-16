# Gradient Text Generator Product Specification

## Goal

Build a browser-based editor that lets creators compose stylized text, preview it immediately, and download the exact result as an SVG.

## Visual References

- `test/fixtures/sketch/frame-2.svg`: supporting vector evidence for the layered gradient and outline geometry; matching its document structure is not an output requirement.
- `test/fixtures/sketch/frame-2@2x.png`: canonical Sketch-rendered visual oracle for the Frame 2 preset.
- `image-1.png`: compact dark color editor with an editable stop rail, a two-dimensional color field, hue control, and direct color values.
- `image-2.png`: layered fill and border controls with enable toggles, previews, opacity, border placement, and width.

The references define the interaction density and output capabilities. The application may reorganize them into a responsive workspace but should preserve their clear, dark, professional visual language.

## Core User Journey

1. Enter or paste text.
2. Choose a font and text size.
3. Add, remove, reorder, enable, and configure fill layers.
4. Edit gradient color stops with direct color inputs and a visual picker.
5. Add, remove, reorder, enable, and configure border layers.
6. Inspect the live result against transparent, light, or dark preview surfaces.
7. Download an SVG that preserves the selected text, font declaration, gradients, opacity, and outline stacking.

## CLI Journey

1. Start from the same device-independent starter used by the web editor.
2. Override text, typography, fill, gradient stops, angle, and outline layers with command-line options or JSON config.
3. Write the deterministic SVG to a file or standard output.

## Functional Requirements

### Text and Typography

- Editable text with multiline support.
- Selectable font family from a curated browser-safe stack.
- The default is the Japanese system-font stack and must not assume DelaSuko is installed.
- User-initiated discovery of installed device font families through the Local Font Access API when supported.
- Automatically reload the device-font catalog on page entry only when the browser reports that `local-fonts` permission is already granted; a new permission prompt always requires a user action.
- Manual font-family entry when installed font discovery is unsupported, unavailable, or denied.
- Font weight and text size controls.
- Letter spacing and line-height controls.
- The selected font settings must be included in the exported SVG.
- Authorized device-font data or a user-selected OTF, TTF, or WOFF file automatically converts every glyph to SVG paths without an opt-in export switch.
- Preview, copy, and download automatically prefer the path-based SVG whenever conversion is available; live text is only the fallback while no readable font data is available.
- Automatic path conversion is implicit and does not add a dedicated status card or outline-export area to the editor.
- Outlined export must keep font bytes local, exclude font-family dependencies, and stop with a clear error when the selected font lacks a required glyph.

### Fills and Gradients

- Multiple fill layers.
- Solid and linear-gradient fill types.
- Enable/disable, add, remove, and reorder controls.
- Per-layer opacity.
- Eight built-in quick gradient presets, including the unchanged canonical Sunbeam starter and seven additional warm, cool, vivid, and neutral options.
- Selecting a quick gradient converts the selected fill to a linear gradient, preserves its enabled state and layer opacity, and keeps every resulting stop and angle editable.
- Two or more draggable or directly editable color stops per gradient.
- Color input through native color pickers and hexadecimal values.
- Linear gradient angle control.

### Borders

- The interface calls editable stroke layers "Borders" while the SVG model and CLI retain `outline` naming for compatibility.
- Zero to twelve border layers, exceeding the required ten-layer minimum.
- Enable/disable, add, remove, and reorder controls.
- Per-layer color, thickness, opacity, and `outside` / `center` / `inside` placement controls.
- Outside size is the absolute distance from the glyph edge. A 20 px outside outline therefore serializes as a 40 px centered SVG stroke behind the fill.
- Layer ordering, miter joins, and the final base-path fill must reproduce the canonical Sketch oracle within its pinned comparison threshold.

### Preview and Export

- Live SVG preview.
- Transparent checkerboard, light, and dark preview surfaces.
- Zoom-to-fit behavior for long or multiline text.
- The web editor always derives fitted canvas bounds from the current artwork and does not expose a canvas-mode control.
- SVG download with a safe filename.
- Copy SVG source to the clipboard.
- Reset to the device-independent starter settings.
- Restore the last editor document, preview background, and zoom from localStorage; uploaded font binaries are never persisted and must be selected again after reload.
- Deterministic serialization: identical visible settings must produce identical final SVG file content, excluding comments.

### Command Line

- TypeScript CLI exposed as `gradient-text-gen` after build or package installation.
- Repeatable gradient stop and outline arguments.
- All curated font IDs available through `--list-fonts`.
- Custom installed or CSS font-family declarations available through `--font-family` and `fontFamily` configuration.
- Outlined path export available through `--text-to-path` and `textToPath` with an explicit font file.
- JSON configuration for repeatable automation.
- File output and standard-output modes.
- The CLI and browser editor share one document model and SVG serializer.

## Responsive Requirements

- Desktop: persistent editor panel beside a large preview workspace.
- Tablet: reduced spacing and adaptable panel width.
- Mobile at 390 x 844: preview first, editing sections stacked below, no horizontal page overflow, and practical 44 px tap targets.
- Sticky access to export on mobile without covering content.

## Accessibility

- Semantic labels for all controls.
- Keyboard-reachable layer and stop actions.
- Visible focus styles.
- Text alternatives for icon-only buttons.
- Reduced-motion support.
- Sufficient contrast for small controls and disabled states.

## Canonical Visual Oracle

The final Frame 2 PNG is the sole visual contract for one named outlined configuration. Its config, supporting source SVG, Sketch PNG, font fingerprint, dimensions, rasterizers, comparison metrics, and thresholds are declared once in `test/fixtures/sketch/frame-2.manifest.json` and `frame-2.config.json`.

- DelaSuko is reference-fixture-only and is not exposed as a built-in or default font.
- The selected font bytes must match the declared DelaSuko Gothic One Regular SHA-256 before comparison.
- The shared serializer must emit an 874 × 310 outlined SVG with closed path contours, the fixed reference origin, exact gradient stops, miter joins, black 12 px outside coverage, and white 20 px outside coverage.
- Chrome rasterizes the generated 874 × 310 SVG at device scale factor 2 into the authoritative 1748 × 620 browser comparison surface.
- ImageMagick requires the exact declared dimensions, sRGB color space, and alpha bounds, then enforces at least `0.9995` normalized cross-correlation similarity, independently bounded aggregate/per-channel RMSE, at least `0.9995` alpha-support intersection-over-union, RGBA PSNR, and alpha-support XOR limits.
- macOS ImageIO remains a non-blocking secondary cross-renderer diagnostic with its own stricter advisory geometry and color thresholds.
- Literal zero-error pixels are not required after the accepted 99.95% similarity decision. Embedding the PNG or encoding raster pixels as vector geometry to force equality is prohibited; the delivered artifact remains editable vector SVG paths.

## Acceptance Criteria

- The full core journey works without a backend.
- The exported file opens as valid SVG and retains the visible style.
- Font changes visibly update the preview and the SVG markup.
- The initial web and CLI documents use the Japanese system-font stack, fit their content, and contain no DelaSuko dependency.
- A device or manually entered font family updates the preview and is preserved in exported SVG markup.
- Outlined export contains reusable SVG path geometry and no `<text>`, `<tspan>`, `font-family`, or embedded font data.
- At least three gradient stops and two borders can be active at once.
- Exactly eight quick gradients are available from the selected Fill editor, and the canonical Sunbeam preset retains its five original stop values and 180-degree direction.
- The editor supports no border and at least ten concurrent border layers.
- Repeated SVG generation from equivalent settings produces byte-identical markup because internal editor IDs and operation history are excluded.
- Equivalent CLI and web settings produce byte-identical SVG markup.
- CLI file/stdout, browser preview, clipboard, and download use the same canonical UTF-8 SVG bytes without adding an end-of-file newline.
- When automatic outlining is available, the preview renders the same path-based markup and dimensions used for copy and download.
- Once font data is available, preview, copy, and download contain paths automatically and never require a separate outline-export toggle.
- The canonical Frame 2 Chrome verification passes the manifest's 99.95% similarity and alpha-overlap minimums plus every dimension, alpha-bound, color-error, and signal-quality threshold.
- Desktop and 390 px mobile browser checks pass without clipped primary controls.
- Production build succeeds and design QA reports `final result: passed`.
