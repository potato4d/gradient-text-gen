# Gradient Text Generator Product Specification

## Goal

Build a browser-based editor that lets creators compose stylized text, preview it immediately, and download the exact result as an SVG.

## Visual References

- `/Users/potato4d/Desktop/Frame 2.svg`: layered output with a multi-stop yellow gradient, a white outer outline, and a black inner outline.
- `image-1.png`: compact dark color editor with an editable stop rail, a two-dimensional color field, hue control, and direct color values.
- `image-2.png`: layered fill and border controls with enable toggles, previews, opacity, border placement, and width.

The references define the interaction density and output capabilities. The application may reorganize them into a responsive workspace but should preserve their clear, dark, professional visual language.

## Core User Journey

1. Enter or paste text.
2. Choose a font and text size.
3. Add, remove, reorder, enable, and configure fill layers.
4. Edit gradient color stops with direct color inputs and a visual picker.
5. Add, remove, reorder, enable, and configure outline layers.
6. Inspect the live result against transparent, light, or dark preview surfaces.
7. Download an SVG that preserves the selected text, font declaration, gradients, opacity, and outline stacking.

## Functional Requirements

### Text and Typography

- Editable text with multiline support.
- Selectable font family from a curated browser-safe stack.
- Font weight and text size controls.
- Letter spacing and line-height controls.
- The selected font settings must be included in the exported SVG.

### Fills and Gradients

- Multiple fill layers.
- Solid and linear-gradient fill types.
- Enable/disable, add, remove, and reorder controls.
- Per-layer opacity.
- Two or more draggable or directly editable color stops per gradient.
- Color input through native color pickers and hexadecimal values.
- Linear gradient angle control.

### Outlines

- Zero to twelve outline layers, exceeding the required ten-layer minimum.
- Enable/disable, add, remove, and reorder controls.
- Per-layer color, thickness, opacity, and `outside` / `center` / `inside` placement controls.
- Layer ordering must produce a result comparable to the reference SVG.

### Preview and Export

- Live SVG preview.
- Transparent checkerboard, light, and dark preview surfaces.
- Zoom-to-fit behavior for long or multiline text.
- SVG download with a safe filename.
- Copy SVG source to the clipboard.
- Reset to the reference-inspired starter preset.
- Deterministic serialization: identical visible settings must produce identical final SVG file content, excluding comments.

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

## Acceptance Criteria

- The full core journey works without a backend.
- The exported file opens as valid SVG and retains the visible style.
- Font changes visibly update the preview and the SVG markup.
- At least three gradient stops and two outlines can be active at once.
- The editor supports no outline and at least ten concurrent outline layers.
- Repeated SVG generation from equivalent settings produces byte-identical markup because internal editor IDs and operation history are excluded.
- Desktop and 390 px mobile browser checks pass without clipped primary controls.
- Production build succeeds and design QA reports `final result: passed`.
