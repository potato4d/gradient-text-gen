import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Layers3,
  Palette,
  Plus,
  RotateCcw,
  Trash2,
  Type,
  WandSparkles,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  FONT_OPTIONS,
  MAX_OUTLINES,
  clamp,
  createFill,
  createInitialDocument,
  createOutline,
  gradientCss,
  insertStop,
  normalizeHex,
  swapById,
} from "./editorModel.js";
import { browserMeasureLine, measureDocument, serializeSvg } from "./svg.js";

function IconButton({ label, children, className = "", ...props }) {
  return (
    <button className={`icon-button ${className}`} type="button" aria-label={label} title={label} {...props}>
      {children}
    </button>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <button
      className="toggle"
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

function HexField({ value, onChange, label }) {
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    const next = normalizeHex(draft, value);
    setDraft(next);
    onChange(next);
  };

  return (
    <div className="color-field">
      <label className="color-swatch" aria-label={`${label} color picker`}>
        <input type="color" value={value} onChange={(event) => onChange(event.target.value.toUpperCase())} />
        <span style={{ background: value }} />
      </label>
      <label className="hex-input">
        <span>#</span>
        <input
          aria-label={`${label} hexadecimal value`}
          value={draft.replace(/^#/, "")}
          maxLength={6}
          spellCheck="false"
          onChange={(event) => setDraft(`#${event.target.value.replace(/[^0-9a-f]/gi, "")}`)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
      </label>
    </div>
  );
}

function FieldLabel({ children, value }) {
  return (
    <div className="field-label">
      <span>{children}</span>
      {value !== undefined ? <output>{value}</output> : null}
    </div>
  );
}

function RangeField({ label, value, min, max, step = 1, suffix = "", onChange }) {
  return (
    <label className="range-field">
      <FieldLabel value={`${value}${suffix}`}>{label}</FieldLabel>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function SectionHeading({ icon: Icon, title, description, action, headingId }) {
  return (
    <div className="section-heading">
      <div className="section-title-wrap">
        <span className="section-icon" aria-hidden="true">
          <Icon size={17} strokeWidth={2} />
        </span>
        <div>
          <h2 id={headingId}>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

function TextControls({ editor, onChange }) {
  const { typography } = editor;

  const updateTypography = (patch) =>
    onChange({ ...editor, typography: { ...typography, ...patch } });

  return (
    <section className="editor-section text-section" aria-labelledby="text-heading">
      <SectionHeading
        icon={Type}
        title="Text & type"
        description="Shape the words before styling the surface."
        headingId="text-heading"
      />
      <label className="control-label" htmlFor="artwork-text">
        Artwork text
      </label>
      <textarea
        id="artwork-text"
        className="text-input"
        value={editor.text}
        rows={2}
        maxLength={160}
        placeholder="Type something bold"
        onChange={(event) => onChange({ ...editor, text: event.target.value })}
      />
      <div className="control-grid control-grid-two">
        <label className="select-field">
          <span>Font</span>
          <select
            value={typography.fontId}
            onChange={(event) => {
              const font = FONT_OPTIONS.find((option) => option.id === event.target.value);
              if (font) updateTypography({ fontId: font.id, fontFamily: font.family });
            }}
          >
            {FONT_OPTIONS.map((font) => (
              <option key={font.id} value={font.id}>
                {font.label}
              </option>
            ))}
          </select>
        </label>
        <label className="select-field">
          <span>Weight</span>
          <select
            value={typography.fontWeight}
            onChange={(event) => updateTypography({ fontWeight: Number(event.target.value) })}
          >
            {[400, 500, 600, 700, 800, 900].map((weight) => (
              <option key={weight} value={weight}>
                {weight}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="control-grid control-grid-three">
        <RangeField
          label="Size"
          value={typography.fontSize}
          min={24}
          max={320}
          suffix="px"
          onChange={(fontSize) => updateTypography({ fontSize })}
        />
        <RangeField
          label="Tracking"
          value={typography.letterSpacing}
          min={-20}
          max={40}
          suffix="px"
          onChange={(letterSpacing) => updateTypography({ letterSpacing })}
        />
        <RangeField
          label="Leading"
          value={typography.lineHeight}
          min={0.7}
          max={1.8}
          step={0.05}
          onChange={(lineHeight) => updateTypography({ lineHeight })}
        />
      </div>
    </section>
  );
}

function LayerActions({ item, index, count, onMove, onRemove, noun }) {
  return (
    <div className="layer-actions">
      <IconButton label={`Move ${noun} up`} disabled={index === 0} onClick={() => onMove(-1)}>
        <ChevronUp size={16} />
      </IconButton>
      <IconButton label={`Move ${noun} down`} disabled={index === count - 1} onClick={() => onMove(1)}>
        <ChevronDown size={16} />
      </IconButton>
      <IconButton label={`Delete ${item.name}`} className="danger-button" onClick={onRemove}>
        <Trash2 size={16} />
      </IconButton>
    </div>
  );
}

function FillEditor({ fill, onChange }) {
  const [selectedStopId, setSelectedStopId] = useState(fill.stops[0]?.id);
  const selectedStop = fill.stops.find((stop) => stop.id === selectedStopId) ?? fill.stops[0];

  useEffect(() => {
    if (!fill.stops.some((stop) => stop.id === selectedStopId)) {
      setSelectedStopId(fill.stops[0]?.id);
    }
  }, [fill.stops, selectedStopId]);

  const updateStop = (id, patch) => {
    onChange({
      ...fill,
      stops: fill.stops.map((stop) => (stop.id === id ? { ...stop, ...patch } : stop)),
    });
  };

  const addStop = () => {
    const result = insertStop(fill.stops);
    onChange({ ...fill, stops: result.stops });
    setSelectedStopId(result.stop.id);
  };

  return (
    <div className="layer-editor">
      <div className="segmented-control" aria-label="Fill type">
        {[
          ["linear", "Gradient"],
          ["solid", "Solid"],
        ].map(([type, label]) => (
          <button
            key={type}
            type="button"
            className={fill.type === type ? "is-active" : ""}
            aria-pressed={fill.type === type}
            onClick={() => onChange({ ...fill, type })}
          >
            {label}
          </button>
        ))}
      </div>

      {fill.type === "linear" ? (
        <>
          <div className="gradient-heading">
            <FieldLabel value={`${fill.stops.length} colors`}>Gradient stops</FieldLabel>
            <button className="text-button" type="button" onClick={addStop}>
              <Plus size={15} /> Add color
            </button>
          </div>
          <div
            className="gradient-rail"
            style={{ background: gradientCss(fill.stops, 90) }}
            onPointerDown={(event) => {
              if (!selectedStop) return;
              const bounds = event.currentTarget.getBoundingClientRect();
              const offset = Math.round(clamp(((event.clientX - bounds.left) / bounds.width) * 100, 0, 100));
              updateStop(selectedStop.id, { offset });
            }}
          >
            {fill.stops.map((stop) => (
              <button
                key={stop.id}
                className={`stop-handle ${selectedStop?.id === stop.id ? "is-selected" : ""}`}
                type="button"
                aria-label={`Select ${stop.color} stop at ${stop.offset}%`}
                aria-pressed={selectedStop?.id === stop.id}
                style={{ left: `${stop.offset}%`, background: stop.color }}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => setSelectedStopId(stop.id)}
              />
            ))}
          </div>
          {selectedStop ? (
            <div className="stop-editor">
              <HexField
                label="Stop"
                value={selectedStop.color}
                onChange={(color) => updateStop(selectedStop.id, { color })}
              />
              <label className="compact-number">
                <span>Position</span>
                <span className="number-shell">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={selectedStop.offset}
                    onChange={(event) =>
                      updateStop(selectedStop.id, { offset: clamp(event.target.value, 0, 100) })
                    }
                  />
                  <span>%</span>
                </span>
              </label>
              <label className="compact-number">
                <span>Alpha</span>
                <span className="number-shell">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={selectedStop.opacity}
                    onChange={(event) =>
                      updateStop(selectedStop.id, { opacity: clamp(event.target.value, 0, 100) })
                    }
                  />
                  <span>%</span>
                </span>
              </label>
              <IconButton
                label="Remove selected color stop"
                className="danger-button stop-delete"
                disabled={fill.stops.length <= 2}
                onClick={() =>
                  onChange({ ...fill, stops: fill.stops.filter((stop) => stop.id !== selectedStop.id) })
                }
              >
                <Trash2 size={16} />
              </IconButton>
            </div>
          ) : null}
          <RangeField
            label="Direction"
            value={fill.angle}
            min={0}
            max={360}
            suffix="°"
            onChange={(angle) => onChange({ ...fill, angle })}
          />
        </>
      ) : (
        <div className="solid-editor">
          <FieldLabel>Fill color</FieldLabel>
          <HexField
            label="Fill"
            value={fill.color}
            onChange={(color) => onChange({ ...fill, color })}
          />
        </div>
      )}

      <RangeField
        label="Layer opacity"
        value={fill.opacity}
        min={0}
        max={100}
        suffix="%"
        onChange={(opacity) => onChange({ ...fill, opacity })}
      />
    </div>
  );
}

function FillPanel({ fills, selectedId, onSelect, onChange }) {
  const updateFill = (id, nextFill) =>
    onChange(fills.map((fill) => (fill.id === id ? nextFill : fill)));

  return (
    <section className="editor-section" aria-labelledby="fills-heading">
      <SectionHeading
        icon={Palette}
        title="Fills"
        description="Stack solids and gradients from bottom to top."
        headingId="fills-heading"
        action={
          <button
            className="add-button"
            type="button"
            onClick={() => {
              const fill = createFill(fills.length);
              onChange([...fills, fill]);
              onSelect(fill.id);
            }}
          >
            <Plus size={16} /> Add
          </button>
        }
      />
      <div className="layer-list">
        {fills.length === 0 ? <p className="empty-layers">No fills. Add one to reveal the text.</p> : null}
        {fills.map((fill, index) => {
          const isSelected = fill.id === selectedId;
          const swatch = fill.type === "linear" ? gradientCss(fill.stops, fill.angle) : fill.color;
          return (
            <div className={`layer-card ${isSelected ? "is-selected" : ""}`} key={fill.id}>
              <div className="layer-row">
                <Toggle
                  checked={fill.enabled}
                  label={`${fill.enabled ? "Disable" : "Enable"} ${fill.name}`}
                  onChange={(enabled) => updateFill(fill.id, { ...fill, enabled })}
                />
                <button className="layer-select" type="button" onClick={() => onSelect(fill.id)}>
                  <span className="layer-swatch" style={{ background: swatch }} />
                  <span className="layer-copy">
                    <strong>{fill.name}</strong>
                    <small>
                      {fill.type === "linear" ? "Linear gradient" : "Solid"} · {fill.opacity}%
                    </small>
                  </span>
                  {isSelected ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
                </button>
                <LayerActions
                  item={fill}
                  index={index}
                  count={fills.length}
                  noun="fill"
                  onMove={(direction) => onChange(swapById(fills, fill.id, direction))}
                  onRemove={() => {
                    const next = fills.filter((item) => item.id !== fill.id);
                    onChange(next);
                    if (isSelected) onSelect(next[Math.min(index, next.length - 1)]?.id ?? null);
                  }}
                />
              </div>
              {isSelected && fill.enabled ? (
                <FillEditor fill={fill} onChange={(nextFill) => updateFill(fill.id, nextFill)} />
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function OutlineEditor({ outline, onChange }) {
  return (
    <div className="layer-editor outline-editor">
      <div className="control-grid control-grid-two outline-top-grid">
        <div>
          <FieldLabel>Stroke color</FieldLabel>
          <HexField
            label="Outline"
            value={outline.color}
            onChange={(color) => onChange({ ...outline, color })}
          />
        </div>
        <label className="select-field">
          <span>Placement</span>
          <select
            value={outline.placement}
            onChange={(event) => onChange({ ...outline, placement: event.target.value })}
          >
            <option value="outside">Outside</option>
            <option value="center">Center</option>
            <option value="inside">Inside</option>
          </select>
        </label>
      </div>
      <RangeField
        label="Thickness"
        value={outline.thickness}
        min={0}
        max={64}
        suffix="px"
        onChange={(thickness) => onChange({ ...outline, thickness })}
      />
      <RangeField
        label="Opacity"
        value={outline.opacity}
        min={0}
        max={100}
        suffix="%"
        onChange={(opacity) => onChange({ ...outline, opacity })}
      />
      <p className="placement-note">
        {outline.placement === "outside"
          ? "Builds a clean ring beyond the glyph edge."
          : outline.placement === "inside"
            ? "Clips the full stroke to the glyph interior."
            : "Splits the stroke evenly across the glyph edge."}
      </p>
    </div>
  );
}

function OutlinePanel({ outlines, selectedId, onSelect, onChange }) {
  const updateOutline = (id, nextOutline) =>
    onChange(outlines.map((outline) => (outline.id === id ? nextOutline : outline)));

  return (
    <section className="editor-section" aria-labelledby="outlines-heading">
      <SectionHeading
        icon={Layers3}
        title="Outlines"
        description={`Layer 0–${MAX_OUTLINES} editable rings around or inside the glyphs.`}
        headingId="outlines-heading"
        action={
          <button
            className="add-button"
            type="button"
            disabled={outlines.length >= MAX_OUTLINES}
            onClick={() => {
              const outline = createOutline(outlines.length);
              onChange([...outlines, outline]);
              onSelect(outline.id);
            }}
          >
            <Plus size={16} /> Add <span className="count-badge">{outlines.length}</span>
          </button>
        }
      />
      <div className="layer-list">
        {outlines.length === 0 ? (
          <p className="empty-layers">No outlines. The artwork is using fills only.</p>
        ) : null}
        {outlines.map((outline, index) => {
          const isSelected = outline.id === selectedId;
          return (
            <div className={`layer-card ${isSelected ? "is-selected" : ""}`} key={outline.id}>
              <div className="layer-row">
                <Toggle
                  checked={outline.enabled}
                  label={`${outline.enabled ? "Disable" : "Enable"} ${outline.name}`}
                  onChange={(enabled) => updateOutline(outline.id, { ...outline, enabled })}
                />
                <button className="layer-select" type="button" onClick={() => onSelect(outline.id)}>
                  <span
                    className="layer-swatch outline-swatch"
                    style={{ background: outline.color, borderWidth: Math.min(7, outline.thickness / 2 + 1) }}
                  />
                  <span className="layer-copy">
                    <strong>{outline.name}</strong>
                    <small>
                      {outline.placement} · {outline.thickness}px · {outline.opacity}%
                    </small>
                  </span>
                  {isSelected ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
                </button>
                <LayerActions
                  item={outline}
                  index={index}
                  count={outlines.length}
                  noun="outline"
                  onMove={(direction) => onChange(swapById(outlines, outline.id, direction))}
                  onRemove={() => {
                    const next = outlines.filter((item) => item.id !== outline.id);
                    onChange(next);
                    if (isSelected) onSelect(next[Math.min(index, next.length - 1)]?.id ?? null);
                  }}
                />
              </div>
              {isSelected && outline.enabled ? (
                <OutlineEditor
                  outline={outline}
                  onChange={(nextOutline) => updateOutline(outline.id, nextOutline)}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PreviewStage({ markup, layout, background, onBackgroundChange, zoom, onZoomChange, isEmpty }) {
  return (
    <section className="preview-pane" aria-labelledby="preview-heading">
      <div className="preview-toolbar">
        <div>
          <span className="eyebrow">Live canvas</span>
          <h2 id="preview-heading">Preview</h2>
        </div>
        <div className="preview-controls">
          <div className="surface-control" aria-label="Preview background">
            {["transparent", "light", "dark"].map((surface) => (
              <button
                key={surface}
                type="button"
                className={`surface-dot ${surface} ${background === surface ? "is-active" : ""}`}
                aria-label={`${surface} preview background`}
                aria-pressed={background === surface}
                onClick={() => onBackgroundChange(surface)}
              />
            ))}
          </div>
          <div className="zoom-control">
            <IconButton label="Zoom out" onClick={() => onZoomChange(clamp(zoom - 10, 60, 160))}>
              <ZoomOut size={17} />
            </IconButton>
            <output>{zoom}%</output>
            <IconButton label="Zoom in" onClick={() => onZoomChange(clamp(zoom + 10, 60, 160))}>
              <ZoomIn size={17} />
            </IconButton>
          </div>
        </div>
      </div>
      <div className={`preview-canvas preview-${background}`}>
        {isEmpty ? <p className="preview-empty">Start typing to make something loud.</p> : null}
        <div
          className="preview-art"
          style={{ width: `${zoom}%` }}
          aria-hidden={isEmpty}
          dangerouslySetInnerHTML={{ __html: markup }}
        />
      </div>
      <div className="canvas-meta">
        <span>
          {layout.width} × {layout.height}px
        </span>
        <span>Transparent SVG</span>
      </div>
    </section>
  );
}

function ActionButton({ icon: Icon, children, primary = false, ...props }) {
  return (
    <button className={`action-button ${primary ? "primary" : ""}`} type="button" {...props}>
      <Icon size={17} />
      <span>{children}</span>
    </button>
  );
}

export function App() {
  const initial = useRef(createInitialDocument()).current;
  const [editor, setEditor] = useState(initial);
  const [selectedFillId, setSelectedFillId] = useState(initial.fills[0]?.id ?? null);
  const [selectedOutlineId, setSelectedOutlineId] = useState(initial.outlines[0]?.id ?? null);
  const [background, setBackground] = useState("transparent");
  const [zoom, setZoom] = useState(100);
  const [notice, setNotice] = useState("");

  const markup = useMemo(() => serializeSvg(editor, browserMeasureLine), [editor]);
  const layout = useMemo(() => measureDocument(editor, browserMeasureLine), [editor]);
  const isEmpty = editor.text.trim().length === 0;

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(""), 2400);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const reset = () => {
    const next = createInitialDocument();
    setEditor(next);
    setSelectedFillId(next.fills[0]?.id ?? null);
    setSelectedOutlineId(next.outlines[0]?.id ?? null);
    setBackground("transparent");
    setZoom(100);
    setNotice("Reference preset restored");
  };

  const copySvg = async () => {
    try {
      await navigator.clipboard.writeText(markup);
      setNotice("SVG source copied");
    } catch {
      setNotice("Clipboard access was blocked");
    }
  };

  const downloadSvg = () => {
    if (isEmpty) return;
    const blob = new Blob([markup], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const fileBase = editor.text
      .trim()
      .slice(0, 32)
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-|-$/g, "") || "gradient-text";
    anchor.href = url;
    anchor.download = `${fileBase}.svg`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("SVG downloaded");
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            <WandSparkles size={21} />
          </span>
          <div>
            <p>Gradient Type Lab</p>
            <span>Layered lettering, exported cleanly.</span>
          </div>
        </div>
        <div className="header-actions">
          <ActionButton icon={RotateCcw} onClick={reset}>
            Reset
          </ActionButton>
          <ActionButton icon={Copy} onClick={copySvg} disabled={isEmpty}>
            Copy SVG
          </ActionButton>
          <ActionButton icon={Download} primary onClick={downloadSvg} disabled={isEmpty}>
            Download SVG
          </ActionButton>
        </div>
      </header>

      <main className="workspace">
        <aside className="editor-panel" aria-label="Artwork controls">
          <div className="editor-intro">
            <span className="eyebrow">Artwork settings</span>
            <h1>Make type with depth.</h1>
            <p>Compose gradients and up to twelve precisely placed outline rings.</p>
          </div>
          <TextControls editor={editor} onChange={setEditor} />
          <FillPanel
            fills={editor.fills}
            selectedId={selectedFillId}
            onSelect={setSelectedFillId}
            onChange={(fills) => setEditor((current) => ({ ...current, fills }))}
          />
          <OutlinePanel
            outlines={editor.outlines}
            selectedId={selectedOutlineId}
            onSelect={setSelectedOutlineId}
            onChange={(outlines) => setEditor((current) => ({ ...current, outlines }))}
          />
          <div className="editor-footnote">
            <Check size={15} /> Preview and export use the same SVG renderer.
          </div>
        </aside>

        <PreviewStage
          markup={markup}
          layout={layout}
          background={background}
          onBackgroundChange={setBackground}
          zoom={zoom}
          onZoomChange={setZoom}
          isEmpty={isEmpty}
        />
      </main>

      <div className="mobile-action-bar">
        <button type="button" onClick={reset} aria-label="Reset artwork">
          <RotateCcw size={19} />
        </button>
        <button type="button" onClick={copySvg} disabled={isEmpty} aria-label="Copy SVG source">
          <Copy size={19} />
        </button>
        <button className="mobile-download" type="button" onClick={downloadSvg} disabled={isEmpty}>
          <Download size={18} /> Download SVG
        </button>
      </div>

      <div className={`toast ${notice ? "is-visible" : ""}`} role="status" aria-live="polite">
        {notice}
      </div>
    </div>
  );
}
