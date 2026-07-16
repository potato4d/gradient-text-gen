import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  FileUp,
  Laptop,
  Layers3,
  LoaderCircle,
  Palette,
  Plus,
  RotateCcw,
  Trash2,
  Type,
  WandSparkles,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  FONT_OPTIONS,
  MAX_OUTLINES,
  clamp,
  createFill,
  createInitialDocument,
  createOutline,
  createReferenceFrame,
  gradientCss,
  insertStop,
  normalizeHex,
  swapById,
  type EditorDocument,
  type FillLayer,
  type FillType,
  type GradientStop,
  type OutlineLayer,
  type OutlinePlacement,
  type TypographySettings,
} from "./editorModel.js";
import {
  LocalFontAccessError,
  chooseDeviceFontRecord,
  queryDeviceFontCatalog,
  quoteCssFontFamily,
  unquoteCssFontFamily,
  type LocalFontRecord,
} from "./localFonts.js";
import {
  getOutlineFontFamily,
  getOutlineFontWeight,
  parseOutlineFont,
  type OutlineFont,
} from "./textToPath.js";
import {
  measureDocument,
  serializeSvg,
  serializeSvgAsPathsResult,
  type SvgLayout,
} from "./svg.js";
import { resolveAutomaticSvgOutput } from "./exportPolicy.js";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
}

function IconButton({ label, children, className = "", ...props }: IconButtonProps) {
  return (
    <button className={`icon-button ${className}`} type="button" aria-label={label} title={label} {...props}>
      {children}
    </button>
  );
}

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}

function Toggle({ checked, onChange, label, disabled = false }: ToggleProps) {
  return (
    <button
      className="toggle"
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

interface HexFieldProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
}

function HexField({ value, onChange, label }: HexFieldProps) {
  const [draft, setDraft] = useState<string>(value);

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

interface FieldLabelProps {
  children: ReactNode;
  value?: ReactNode;
}

function FieldLabel({ children, value }: FieldLabelProps) {
  return (
    <div className="field-label">
      <span>{children}</span>
      {value !== undefined ? <output>{value}</output> : null}
    </div>
  );
}

interface RangeFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}

function RangeField({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  onChange,
}: RangeFieldProps) {
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

interface SectionHeadingProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  headingId: string;
}

function SectionHeading({
  icon: Icon,
  title,
  description,
  action,
  headingId,
}: SectionHeadingProps) {
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

interface TextControlsProps {
  editor: EditorDocument;
  onChange: (editor: EditorDocument) => void;
  outlineFont: OutlineFontSource | null;
  pathExportError: string | null;
  outlineLoadState: OutlineLoadState;
  onOutlineFontChange: (source: OutlineFontSource | null) => void;
  onOutlineLoadStateChange: (state: OutlineLoadState) => void;
}

interface FontPickerProps {
  typography: TypographySettings;
  onChange: (patch: Partial<TypographySettings>) => void;
  outlineFont: OutlineFontSource | null;
  pathExportError: string | null;
  outlineLoadState: OutlineLoadState;
  onOutlineFontChange: (source: OutlineFontSource | null) => void;
  onOutlineLoadStateChange: (state: OutlineLoadState) => void;
}

interface OutlineFontSource {
  font: OutlineFont;
  label: string;
  origin: "device" | "file";
  family: string;
  weight: number;
}

type FontLoadState = "idle" | "loading" | "ready" | "unsupported" | "denied" | "failed";
type OutlineLoadState = "idle" | "loading" | "ready" | "unavailable" | "failed";

function FontPicker({
  typography,
  onChange,
  outlineFont,
  pathExportError,
  outlineLoadState,
  onOutlineFontChange,
  onOutlineLoadStateChange,
}: FontPickerProps) {
  const [deviceFonts, setDeviceFonts] = useState<typeof FONT_OPTIONS>([]);
  const [deviceFontRecords, setDeviceFontRecords] = useState<LocalFontRecord[]>([]);
  const [loadState, setLoadState] = useState<FontLoadState>("idle");
  const [customFontDraft, setCustomFontDraft] = useState("");
  const availableFonts = [...FONT_OPTIONS, ...deviceFonts];
  const currentFont = availableFonts.find((font) => font.id === typography.fontId);

  useEffect(() => {
    if (FONT_OPTIONS.some((font) => font.id === typography.fontId)) {
      setCustomFontDraft("");
      return;
    }
    setCustomFontDraft(unquoteCssFontFamily(typography.fontFamily));
  }, [typography.fontFamily, typography.fontId]);

  const loadDeviceFonts = async () => {
    setLoadState("loading");
    try {
      const catalog = await queryDeviceFontCatalog();
      setDeviceFonts(catalog.options);
      setDeviceFontRecords(catalog.records);
      setLoadState("ready");
    } catch (error) {
      if (error instanceof LocalFontAccessError) {
        setLoadState(error.reason);
      } else {
        setLoadState("failed");
      }
    }
  };

  useEffect(() => {
    if (!typography.fontId.startsWith("device:") || deviceFontRecords.length === 0) return;
    const family = unquoteCssFontFamily(typography.fontFamily);
    const record = chooseDeviceFontRecord(
      deviceFontRecords,
      family,
      typography.fontWeight,
    );
    if (!record?.blob) {
      onOutlineLoadStateChange("unavailable");
      onOutlineFontChange(null);
      return;
    }

    let cancelled = false;
    onOutlineLoadStateChange("loading");
    record
      .blob()
      .then((blob) => blob.arrayBuffer())
      .then((buffer) => parseOutlineFont(buffer))
      .then((font) => {
        if (cancelled) return;
        const fontWeight = getOutlineFontWeight(font);
        onChange({ fontWeight });
        onOutlineFontChange({
          font,
          label: record.fullName || record.style || record.family,
          origin: "device",
          family,
          weight: fontWeight,
        });
        onOutlineLoadStateChange("ready");
      })
      .catch(() => {
        if (cancelled) return;
        onOutlineFontChange(null);
        onOutlineLoadStateChange("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [
    deviceFontRecords,
    onOutlineFontChange,
    typography.fontFamily,
    typography.fontId,
    typography.fontWeight,
    onOutlineLoadStateChange,
  ]);

  const applyCustomFont = () => {
    const family = customFontDraft.trim();
    if (!family) return;
    const knownFont = availableFonts.find(
      (font) => font.label.toLocaleLowerCase() === family.toLocaleLowerCase(),
    );
    onChange(
      knownFont
        ? { fontId: knownFont.id, fontFamily: knownFont.family }
        : { fontId: `custom:${family.toLocaleLowerCase()}`, fontFamily: quoteCssFontFamily(family) },
    );
    onOutlineFontChange(null);
    onOutlineLoadStateChange("idle");
  };

  const loadFontFile = async (file: File | undefined) => {
    if (!file) return;
    onOutlineLoadStateChange("loading");
    try {
      const buffer = await file.arrayBuffer();
      const font = parseOutlineFont(buffer.slice(0));
      const family = getOutlineFontFamily(font);
      const fontWeight = getOutlineFontWeight(font);
      const previewFace = new FontFace(family, buffer.slice(0), {
        weight: String(fontWeight),
      });
      await previewFace.load();
      document.fonts.add(previewFace);
      onChange({
        fontId: `uploaded:${family.toLocaleLowerCase()}`,
        fontFamily: quoteCssFontFamily(family),
        fontWeight,
      });
      setCustomFontDraft(family);
      onOutlineFontChange({
        font,
        label: file.name,
        origin: "file",
        family,
        weight: fontWeight,
      });
      onOutlineLoadStateChange("ready");
    } catch {
      onOutlineFontChange(null);
      onOutlineLoadStateChange("failed");
    }
  };

  const statusMessage = {
    idle: "Load installed font names, or enter a family manually.",
    loading: "Reading installed font names…",
    ready:
      deviceFonts.length > 0
        ? `${deviceFonts.length} device font families available.`
        : "No device font families were returned. You can still enter one manually.",
    unsupported: "This browser cannot list device fonts. Enter a family name manually.",
    denied: "Device font access was not granted. Enter a family name manually.",
    failed: "Device fonts could not be loaded. Enter a family name manually.",
  }[loadState];

  return (
    <div className="font-picker">
      <div className="font-field-heading">
        <label htmlFor="font-family-select">Font</label>
        <button
          className="font-load-button"
          type="button"
          onClick={loadDeviceFonts}
          disabled={loadState === "loading"}
          aria-describedby="device-font-status"
        >
          {loadState === "loading" ? (
            <LoaderCircle className="is-spinning" size={13} />
          ) : (
            <Laptop size={13} />
          )}
          {loadState === "ready" ? "Reload device fonts" : "Load device fonts"}
        </button>
      </div>
      <select
        id="font-family-select"
        value={typography.fontId}
        onChange={(event) => {
          const font = availableFonts.find((option) => option.id === event.target.value);
          if (!font) return;
          onChange({ fontId: font.id, fontFamily: font.family });
          setCustomFontDraft(font.id.startsWith("device:") ? font.label : "");
          onOutlineFontChange(null);
          onOutlineLoadStateChange(font.id.startsWith("device:") ? "loading" : "idle");
        }}
      >
        {!currentFont ? (
          <option value={typography.fontId}>
            Custom · {unquoteCssFontFamily(typography.fontFamily)}
          </option>
        ) : null}
        <optgroup label="Curated fonts">
          {FONT_OPTIONS.map((font) => (
            <option key={font.id} value={font.id} style={{ fontFamily: font.family }}>
              {font.label}
            </option>
          ))}
        </optgroup>
        {deviceFonts.length > 0 ? (
          <optgroup label={`Device fonts (${deviceFonts.length})`}>
            {deviceFonts.map((font) => (
              <option key={font.id} value={font.id} style={{ fontFamily: font.family }}>
                {font.label}
              </option>
            ))}
          </optgroup>
        ) : null}
      </select>
      <div className="custom-font-row">
        <input
          aria-label="Custom font family name"
          value={customFontDraft}
          placeholder="Installed font family name"
          spellCheck="false"
          onChange={(event) => setCustomFontDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") applyCustomFont();
          }}
        />
        <button type="button" onClick={applyCustomFont} disabled={!customFontDraft.trim()}>
          Use font
        </button>
      </div>
      <p id="device-font-status" className={`font-status is-${loadState}`} aria-live="polite">
        {statusMessage}
      </p>
      <div className="font-file-row">
        <label className="font-file-button">
          <FileUp size={13} />
          Load font file
          <input
            type="file"
            accept=".otf,.ttf,.woff,font/otf,font/ttf,font/woff"
            onChange={(event) => {
              void loadFontFile(event.target.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
        </label>
        <span>OTF, TTF, or WOFF</span>
      </div>
      <div className={`path-export-control ${outlineFont && !pathExportError ? "is-ready" : ""}`}>
        <div>
          <strong>Automatic text outlines</strong>
          <small>
            {pathExportError
              ? pathExportError
              : outlineLoadState === "loading"
                ? "Preparing font outlines…"
                : outlineFont
                  ? `${outlineFont.label} is converted to portable paths automatically.`
                  : outlineLoadState === "failed"
                    ? "That font could not be read. Try another OTF, TTF, or WOFF file."
                    : "Load a device font or font file to replace live text with paths."}
          </small>
        </div>
        <span
          className="path-export-status"
          aria-label={
            outlineFont && !pathExportError
              ? "Automatic outlines ready"
              : outlineFont
                ? "Outline conversion unavailable"
                : "Live text fallback"
          }
        >
          {outlineFont && !pathExportError ? <Check size={14} /> : <Type size={14} />}
        </span>
      </div>
    </div>
  );
}

function TextControls({
  editor,
  onChange,
  outlineFont,
  pathExportError,
  outlineLoadState,
  onOutlineFontChange,
  onOutlineLoadStateChange,
}: TextControlsProps) {
  const { typography } = editor;

  const updateTypography = (patch: Partial<TypographySettings>) =>
    onChange({
      ...editor,
      typography: { ...typography, ...patch },
      frame: { mode: "fit" },
    });

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
        onChange={(event) =>
          onChange({ ...editor, text: event.target.value, frame: { mode: "fit" } })
        }
      />
      <div className="control-grid control-grid-two">
        <FontPicker
          typography={typography}
          onChange={updateTypography}
          outlineFont={outlineFont}
          pathExportError={pathExportError}
          outlineLoadState={outlineLoadState}
          onOutlineFontChange={onOutlineFontChange}
          onOutlineLoadStateChange={onOutlineLoadStateChange}
        />
        <div className="type-meta-stack">
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
          <label className="select-field">
            <span>Canvas</span>
            <select
              value={editor.frame.mode}
              onChange={(event) =>
                onChange({
                  ...editor,
                  frame:
                    event.target.value === "fixed"
                      ? createReferenceFrame()
                      : { mode: "fit" },
                })
              }
            >
              <option value="fixed">Frame 2</option>
              <option value="fit">Fit artwork</option>
            </select>
          </label>
        </div>
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

interface LayerActionsProps {
  item: { name: string };
  index: number;
  count: number;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  noun: string;
}

function LayerActions({
  item,
  index,
  count,
  onMove,
  onRemove,
  noun,
}: LayerActionsProps) {
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

interface FillEditorProps {
  fill: FillLayer;
  onChange: (fill: FillLayer) => void;
}

function FillEditor({ fill, onChange }: FillEditorProps) {
  const [selectedStopId, setSelectedStopId] = useState<string | undefined>(
    fill.stops[0]?.id,
  );
  const selectedStop = fill.stops.find((stop) => stop.id === selectedStopId) ?? fill.stops[0];

  useEffect(() => {
    if (!fill.stops.some((stop) => stop.id === selectedStopId)) {
      setSelectedStopId(fill.stops[0]?.id);
    }
  }, [fill.stops, selectedStopId]);

  const updateStop = (id: string, patch: Partial<GradientStop>) => {
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
        {(
          [
          ["linear", "Gradient"],
          ["solid", "Solid"],
          ] satisfies Array<[FillType, string]>
        ).map(([type, label]) => (
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

interface FillPanelProps {
  fills: FillLayer[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (fills: FillLayer[]) => void;
}

function FillPanel({ fills, selectedId, onSelect, onChange }: FillPanelProps) {
  const updateFill = (id: string, nextFill: FillLayer) =>
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

interface OutlineEditorProps {
  outline: OutlineLayer;
  onChange: (outline: OutlineLayer) => void;
}

function OutlineEditor({ outline, onChange }: OutlineEditorProps) {
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
            onChange={(event) =>
              onChange({ ...outline, placement: event.target.value as OutlinePlacement })
            }
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

interface OutlinePanelProps {
  outlines: OutlineLayer[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (outlines: OutlineLayer[]) => void;
}

function OutlinePanel({
  outlines,
  selectedId,
  onSelect,
  onChange,
}: OutlinePanelProps) {
  const updateOutline = (id: string, nextOutline: OutlineLayer) =>
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

type PreviewBackground = "transparent" | "light" | "dark";

interface PreviewStageProps {
  markup: string;
  layout: SvgLayout;
  background: PreviewBackground;
  onBackgroundChange: (background: PreviewBackground) => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  isEmpty: boolean;
  unavailableMessage: string | null;
}

function PreviewStage({
  markup,
  layout,
  background,
  onBackgroundChange,
  zoom,
  onZoomChange,
  isEmpty,
  unavailableMessage,
}: PreviewStageProps) {
  return (
    <section className="preview-pane" aria-labelledby="preview-heading">
      <div className="preview-toolbar">
        <div>
          <span className="eyebrow">Live canvas</span>
          <h2 id="preview-heading">Preview</h2>
        </div>
        <div className="preview-controls">
          <div className="surface-control" aria-label="Preview background">
            {(["transparent", "light", "dark"] satisfies PreviewBackground[]).map((surface) => (
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
        {!isEmpty && unavailableMessage ? (
          <p className="preview-empty">{unavailableMessage}</p>
        ) : null}
        <div
          className="preview-art"
          style={{ width: `${zoom}%` }}
          aria-hidden={isEmpty || Boolean(unavailableMessage)}
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

interface ActionButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  icon: LucideIcon;
  primary?: boolean;
}

function ActionButton({ icon: Icon, children, primary = false, ...props }: ActionButtonProps) {
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
  const [selectedFillId, setSelectedFillId] = useState<string | null>(
    initial.fills[0]?.id ?? null,
  );
  const [selectedOutlineId, setSelectedOutlineId] = useState<string | null>(
    initial.outlines[0]?.id ?? null,
  );
  const [background, setBackground] = useState<PreviewBackground>("transparent");
  const [zoom, setZoom] = useState(100);
  const [notice, setNotice] = useState("");
  const [outlineFont, setOutlineFont] = useState<OutlineFontSource | null>(null);
  const [outlineLoadState, setOutlineLoadState] = useState<OutlineLoadState>("idle");

  const markup = useMemo(() => serializeSvg(editor), [editor]);
  const pathExport = useMemo(() => {
    if (!outlineFont) return { markup: null, layout: null, error: null };
    try {
      return { ...serializeSvgAsPathsResult(editor, outlineFont.font), error: null };
    } catch (error) {
      return {
        markup: null,
        layout: null,
        error: error instanceof Error ? error.message : "Text outlines could not be generated.",
      };
    }
  }, [editor, outlineFont]);
  const automaticOutput = useMemo(
    () => resolveAutomaticSvgOutput(markup, pathExport.markup, outlineLoadState !== "idle"),
    [markup, outlineLoadState, pathExport.markup],
  );
  const layout = useMemo(() => measureDocument(editor), [editor]);
  const previewMarkup = automaticOutput.previewMarkup;
  const previewLayout = pathExport.layout ?? layout;
  const isEmpty = editor.text.trim().length === 0;
  const exportUnavailable = automaticOutput.exportMarkup === null;
  const unavailableMessage = exportUnavailable
    ? pathExport.error ||
      (outlineLoadState === "loading"
        ? "Preparing automatic text outlines…"
        : "This font could not outline every character. Choose another font.")
    : null;

  const handleOutlineFontChange = useCallback((source: OutlineFontSource | null) => {
    setOutlineFont(source);
  }, []);

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
    setOutlineFont(null);
    setOutlineLoadState("idle");
    setNotice("Starter settings restored");
  };

  const copySvg = async () => {
    if (exportUnavailable) {
      setNotice(pathExport.error || "Text outlines are not ready");
      return;
    }
    try {
      await navigator.clipboard.writeText(automaticOutput.exportMarkup ?? "");
      setNotice(automaticOutput.isOutlined ? "Outlined SVG source copied" : "SVG source copied");
    } catch {
      setNotice("Clipboard access was blocked");
    }
  };

  const downloadSvg = () => {
    if (isEmpty || exportUnavailable) {
      if (exportUnavailable) setNotice(pathExport.error || "Text outlines are not ready");
      return;
    }
    const blob = new Blob([automaticOutput.exportMarkup ?? ""], {
      type: "image/svg+xml;charset=utf-8",
    });
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
    setNotice(automaticOutput.isOutlined ? "Outlined SVG downloaded" : "SVG downloaded");
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
          <ActionButton icon={Copy} onClick={copySvg} disabled={isEmpty || exportUnavailable}>
            Copy SVG
          </ActionButton>
          <ActionButton
            icon={Download}
            primary
            onClick={downloadSvg}
            disabled={isEmpty || exportUnavailable}
          >
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
          <TextControls
            editor={editor}
            onChange={setEditor}
            outlineFont={outlineFont}
            pathExportError={pathExport.error}
            outlineLoadState={outlineLoadState}
            onOutlineFontChange={handleOutlineFontChange}
            onOutlineLoadStateChange={setOutlineLoadState}
          />
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
          markup={previewMarkup}
          layout={previewLayout}
          background={background}
          onBackgroundChange={setBackground}
          zoom={zoom}
          onZoomChange={setZoom}
          isEmpty={isEmpty}
          unavailableMessage={unavailableMessage}
        />
      </main>

      <div className="mobile-action-bar">
        <button type="button" onClick={reset} aria-label="Reset artwork">
          <RotateCcw size={19} />
        </button>
        <button
          type="button"
          onClick={copySvg}
          disabled={isEmpty || exportUnavailable}
          aria-label="Copy SVG source"
        >
          <Copy size={19} />
        </button>
        <button
          className="mobile-download"
          type="button"
          onClick={downloadSvg}
          disabled={isEmpty || exportUnavailable}
        >
          <Download size={18} /> Download SVG
        </button>
      </div>

      <div className={`toast ${notice ? "is-visible" : ""}`} role="status" aria-live="polite">
        {notice}
      </div>
    </div>
  );
}
