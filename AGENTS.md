# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

## Product Decisions

- Keep product documentation and Git commit messages in English.
- Font selection is a core requirement and must affect both the preview and exported SVG.
- Let users load installed device font families when the browser supports Local Font Access, with manual family-name entry as the fallback.
- Support deterministic outlined SVG export from an authorized device font or a user-selected OTF, TTF, or WOFF file; never upload or embed the font binary.
- Use the supplied color-editor screenshots for control density and interaction patterns.
- Use `/Users/potato4d/Desktop/Frame 2.svg` as the output-style reference for layered gradient text and outlines.
- Support desktop and 390 px-wide mobile layouts without horizontal page overflow.
- Keep the application, shared SVG model, tests, and CLI in strict TypeScript.
- The web editor and CLI must share the same deterministic SVG serializer.
