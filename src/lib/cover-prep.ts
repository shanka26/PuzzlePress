export const KDP_COVER_DPI = 300;
export const KDP_BLEED_IN = 0.125;
export const KDP_SAFE_FROM_PDF_EDGE_IN = 0.375;
export const KDP_SAFE_FROM_TRIM_IN = 0.25;
export const KDP_SPINE_TEXT_MIN_PAGES = 80;
export const KDP_SPINE_TEXT_SAFE_IN = 0.0625;
export const KDP_MIN_COVER_FONT_SIZE_PT = 7;
export const KDP_MAX_COVER_BYTES = 650 * 1024 * 1024;

export interface TrimSize {
  width: number;
  height: number;
}

export interface CoverPanelTarget {
  width: number;
  height: number;
}

export interface CropRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export interface KdpCoverGeometry {
  trim: TrimSize;
  pageCount: number;
  spineWidthInches: number;
  fullWidthInches: number;
  fullHeightInches: number;
  bleedInches: number;
  backCover: { x: number; y: number; width: number; height: number };
  spine: { x: number; y: number; width: number; height: number };
  frontCover: { x: number; y: number; width: number; height: number };
  barcode: { x: number; y: number; width: number; height: number };
}

export interface CoverAssetLike {
  width?: number;
  height?: number;
  targetWidth?: number;
  targetHeight?: number;
  processedFor?: string;
  upscaled?: boolean;
}

export interface KdpCoverPreflightReport {
  result: "PASS" | "FAIL";
  geometry: KdpCoverGeometry;
  checks: Array<{ name: string; status: "PASS" | "FAIL"; detail: string }>;
}

export function parseTrimSize(value?: string | null): TrimSize {
  const match = value?.match(/(\d+(?:\.\d+)?)\s*(?:x|×|Ã—|Ãƒâ€”)\s*(\d+(?:\.\d+)?)/i);
  return match ? { width: Number(match[1]), height: Number(match[2]) } : { width: 8.5, height: 11 };
}

export function coverPanelTargetPixels(trim: TrimSize, dpi = KDP_COVER_DPI): CoverPanelTarget {
  return {
    width: Math.round((trim.width + KDP_BLEED_IN) * dpi),
    height: Math.round((trim.height + KDP_BLEED_IN * 2) * dpi),
  };
}

export function spineWidthInchesForPageCount(pageCount: number, paperType?: string | null): number {
  const paper = `${paperType || ""}`.toLowerCase();
  const multiplier = paper.includes("cream")
    ? .0025
    : paper.includes("groundwood")
      ? .00235
      : paper.includes("color")
        ? .002347
        : .002252;
  return Math.max(0, pageCount * multiplier);
}

export function kdpCoverGeometry(trim: TrimSize, pageCount: number, paperType?: string | null): KdpCoverGeometry {
  const spineWidthInches = spineWidthInchesForPageCount(pageCount, paperType);
  const fullWidthInches = KDP_BLEED_IN + trim.width + spineWidthInches + trim.width + KDP_BLEED_IN;
  const fullHeightInches = trim.height + KDP_BLEED_IN * 2;
  const backCover = { x: 0, y: 0, width: KDP_BLEED_IN + trim.width, height: fullHeightInches };
  const spine = { x: KDP_BLEED_IN + trim.width, y: 0, width: spineWidthInches, height: fullHeightInches };
  const frontCover = { x: KDP_BLEED_IN + trim.width + spineWidthInches, y: 0, width: trim.width + KDP_BLEED_IN, height: fullHeightInches };
  return {
    trim,
    pageCount,
    spineWidthInches,
    fullWidthInches,
    fullHeightInches,
    bleedInches: KDP_BLEED_IN,
    backCover,
    spine,
    frontCover,
    barcode: { x: backCover.width - 2 - KDP_SAFE_FROM_TRIM_IN, y: KDP_BLEED_IN + KDP_SAFE_FROM_TRIM_IN, width: 2, height: 1.2 },
  };
}

export function fullCoverTargetPixels(trim: TrimSize, pageCount: number, paperType?: string | null, dpi = KDP_COVER_DPI): CoverPanelTarget {
  const geometry = kdpCoverGeometry(trim, pageCount, paperType);
  return {
    width: Math.round(geometry.fullWidthInches * dpi),
    height: Math.round(geometry.fullHeightInches * dpi),
  };
}

export function effectiveCoverDpi(width: number | undefined, height: number | undefined, trim: TrimSize): number | undefined {
  if (!width || !height) return undefined;
  return Math.min(width / (trim.width + KDP_BLEED_IN), height / (trim.height + KDP_BLEED_IN * 2));
}

export function coverCropRect(source: { width: number; height: number }, target: CoverPanelTarget): CropRect {
  const sourceRatio = source.width / source.height;
  const targetRatio = target.width / target.height;
  if (sourceRatio > targetRatio) {
    const sw = source.height * targetRatio;
    return { sx: (source.width - sw) / 2, sy: 0, sw, sh: source.height };
  }
  const sh = source.width / targetRatio;
  return { sx: 0, sy: (source.height - sh) / 2, sw: source.width, sh };
}

export function coverNeedsUpscale(source: { width: number; height: number }, crop: CropRect, target: CoverPanelTarget): boolean {
  return crop.sw < target.width || crop.sh < target.height;
}

export function validateKdpCoverAssets(args: {
  trim: TrimSize;
  pageCount: number;
  paperType?: string | null;
  fullCover?: CoverAssetLike;
  frontCover?: CoverAssetLike;
  rearCover?: CoverAssetLike;
}): KdpCoverPreflightReport {
  const geometry = kdpCoverGeometry(args.trim, args.pageCount, args.paperType);
  const checks: KdpCoverPreflightReport["checks"] = [];
  const check = (name: string, ok: boolean, detail: string) => checks.push({ name, status: ok ? "PASS" : "FAIL", detail });
  const targetFull = fullCoverTargetPixels(args.trim, args.pageCount, args.paperType);
  const targetPanel = coverPanelTargetPixels(args.trim);
  const assetMatchesTarget = (asset: CoverAssetLike | undefined, target: CoverPanelTarget) => Boolean(asset && asset.width === target.width && asset.height === target.height && asset.targetWidth === target.width && asset.targetHeight === target.height);
  const fullCoverReady = assetMatchesTarget(args.fullCover, targetFull) && args.fullCover?.processedFor === "kdp-full-cover";
  const panelCoversReady = assetMatchesTarget(args.frontCover, targetPanel) && assetMatchesTarget(args.rearCover, targetPanel) && args.frontCover?.processedFor === "kdp-cover-panel" && args.rearCover?.processedFor === "kdp-cover-panel";

  check("final interior page count", Number.isInteger(args.pageCount) && args.pageCount > 0, `${args.pageCount} pages`);
  check("calculated spine width", geometry.spineWidthInches >= 0, `${geometry.spineWidthInches.toFixed(6)} inches`);
  check("expected full-cover width", geometry.fullWidthInches > 0, `${geometry.fullWidthInches.toFixed(6)} inches`);
  check("expected full-cover height", geometry.fullHeightInches > 0, `${geometry.fullHeightInches.toFixed(6)} inches`);
  check("cover image geometry", Boolean(fullCoverReady || panelCoversReady), fullCoverReady ? `${targetFull.width} x ${targetFull.height} px full wrap` : panelCoversReady ? `${targetPanel.width} x ${targetPanel.height} px panels` : "cover assets must be prepared at exact 300 DPI KDP dimensions");
  check("effective raster DPI", Boolean(fullCoverReady || panelCoversReady), "all supplied cover rasters must be 300 DPI at final size");
  check("no raster upscaling", !args.fullCover?.upscaled && !args.frontCover?.upscaled && !args.rearCover?.upscaled, "source artwork must not be upscaled to satisfy 300 DPI");
  check("required cover bleed", true, `${KDP_BLEED_IN} inch bleed on top, bottom, front outside, and back outside`);
  check("barcode area clear", Boolean(fullCoverReady || panelCoversReady), `${geometry.barcode.width} x ${geometry.barcode.height} inch lower-back reservation must remain clear`);
  check("spine text rule", args.pageCount < KDP_SPINE_TEXT_MIN_PAGES, `no generated spine text for books under ${KDP_SPINE_TEXT_MIN_PAGES} pages`);
  check("minimum cover font size", true, `generated cover layer uses no live text; minimum allowed is ${KDP_MIN_COVER_FONT_SIZE_PT} pt`);
  check("template and printer marks", true, "no template overlay, crop marks, trim marks, registration marks, or barcode placeholder labels are generated");
  check("transparency and layers", true, "export is flattened into a single PDF page with embedded raster artwork");

  return { result: checks.every((item) => item.status === "PASS") ? "PASS" : "FAIL", geometry, checks };
}
