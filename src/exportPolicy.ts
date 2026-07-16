export interface AutomaticSvgOutput {
  previewMarkup: string;
  exportMarkup: string | null;
  isOutlined: boolean;
}

export function resolveAutomaticSvgOutput(
  liveTextMarkup: string,
  outlinedMarkup: string | null,
  outlineConversionRequired: boolean,
): AutomaticSvgOutput {
  if (outlinedMarkup) {
    return {
      previewMarkup: outlinedMarkup,
      exportMarkup: outlinedMarkup,
      isOutlined: true,
    };
  }

  if (outlineConversionRequired) {
    return {
      previewMarkup: "",
      exportMarkup: null,
      isOutlined: false,
    };
  }

  return {
    previewMarkup: liveTextMarkup,
    exportMarkup: liveTextMarkup,
    isOutlined: false,
  };
}
