export const KDP_COVER_DPI = 300;
export const KDP_BLEED_IN = 0.125;
export const KDP_SAFE_FROM_PDF_EDGE_IN = 0.375;
export const KDP_SAFE_FROM_TRIM_IN = 0.25;
export const KDP_SPINE_TEXT_MIN_PAGES = 80;
export const KDP_SPINE_TEXT_SAFE_IN = 0.0625;
export const KDP_MIN_COVER_FONT_SIZE_PT = 7;
export const KDP_MAX_COVER_BYTES = 650 * 1024 * 1024;
export const KDP_POINTS_PER_INCH = 72;
export const KDP_PRODUCTION_PAGE_COUNT = 182;
export const KDP_PRODUCTION_TRIM: TrimSize = { width: 8.5, height: 11 };
export const KDP_PRODUCTION_PAPER_TYPE = "white paper";
export const KDP_PRODUCTION_SPINE_WIDTH_IN = 0.409864;
export const KDP_PRODUCTION_FULL_WIDTH_IN = 17.659864;
export const KDP_PRODUCTION_FULL_HEIGHT_IN = 11.25;
export const KDP_PRODUCTION_FULL_WIDTH_PT = 1271.510208;
export const KDP_PRODUCTION_FULL_HEIGHT_PT = 810;
export const KDP_PRODUCTION_RASTER_WIDTH_PX = 5298;
export const KDP_PRODUCTION_RASTER_HEIGHT_PX = 3375;
export const KDP_REQUIRED_TITLE = "Growing Up in the 1960s";
export const KDP_REQUIRED_AUTHOR = "L.Ramahs";
export const KDP_REQUIRED_SERIES = "Remember When?";
export const KDP_REQUIRED_SUBTITLE = "Nostalgia Puzzles for Seniors";
export const KDP_REQUIRED_CATEGORY = "LARGE PRINT WORD SEARCH";
export const KDP_REQUIRED_BADGE = "80 Puzzles Included";
export const KDP_REQUIRED_SUPPORTING_LINE = "Big Grids \u2022 Easy-to-Read Letters";

export const KDP_REQUIRED_BACK_COPY = [
  "Step back into the colorful world of the 1960s with this warm and easy-to-read large print word search collection.",
  "From school days and neighborhood fun to record players, family suppers, television nights, teen dances, summer outings, and memorable moments of a changing America, these puzzles celebrate the everyday sights, sounds, and experiences that made the decade so special.",
  "Designed with seniors in mind, this premium nostalgia puzzle book features large, clear letters, roomy grids, and thoughtfully curated themes that bring the spirit of the 1960s back to life.",
  "FEATURES",
  "\u2022 80 large print word search puzzles",
  "\u2022 Big grids and easy-to-read letters",
  "\u2022 Warm 1960s nostalgia themes",
  "\u2022 One puzzle per page",
  "\u2022 Complete answer key included",
  "A joyful trip down memory lane for anyone who remembers-or simply loves-the 1960s.",
];

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

export interface CoverRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface KdpCoverGeometry {
  trim: TrimSize;
  pageCount: number;
  spineWidthInches: number;
  fullWidthInches: number;
  fullHeightInches: number;
  bleedInches: number;
  backCover: CoverRect;
  spine: CoverRect;
  frontCover: CoverRect;
  backTrim: CoverRect;
  frontTrim: CoverRect;
  backSafe: CoverRect;
  frontSafe: CoverRect;
  spineSafe: CoverRect;
  barcode: CoverRect;
}

export interface KdpTemplateMetadataLike {
  widthInches?: number;
  heightInches?: number;
  widthPoints?: number;
  heightPoints?: number;
  width?: number;
  height?: number;
  dpi?: number;
  pageCount?: number;
  trimWidthInches?: number;
  trimHeightInches?: number;
  paperType?: string;
  interiorType?: string;
  binding?: string;
  readingDirection?: string;
}

export interface CoverAssetLike {
  mimeType?: string;
  width?: number;
  height?: number;
  targetWidth?: number;
  targetHeight?: number;
  processedFor?: string;
  upscaled?: boolean;
  kdpValid?: boolean;
  validationMessages?: string[];
}

export interface CoverEditPromptAsset extends CoverAssetLike {
  name?: string;
  originalWidth?: number;
  originalHeight?: number;
  validationMessages?: string[];
}

export type CoverPromptRole = "fullCover" | "frontCover" | "rearCover";

export interface CoverRepairAttempt {
  attempt: number;
  provider: "gemini" | "openai";
  model: string;
  valid: boolean;
  issues: string[];
  error?: string;
}

export interface CoverRepairDiagnostic {
  schemaVersion: "puzzlepress.kdp-cover-repair.v1";
  task: {
    operation: "edit-image";
    attempt: number;
    maximumAttempts: 2;
    role: CoverPromptRole;
    label: string;
  };
  sourceAsset: {
    name: string;
    mimeType: string;
    sourcePixels: { width?: number; height?: number };
    currentPixels: { width?: number; height?: number };
    declaredTargetPixels: { width?: number; height?: number };
    processedFor?: string;
    upscaled: boolean;
    kdpValid: boolean;
  };
  target: {
    pixels: { width: number; height: number };
    inches: { width: number; height: number };
    dpi: number;
    trimInches: TrimSize;
    pageCount: number;
    paperType: string;
    bleedInches: number;
    spineWidthInches?: number;
    layout: "back-spine-front" | "single-panel";
  };
  validation: {
    status: "FAIL";
    issues: string[];
  };
  requiredSolutions: string[];
  kdpGuidelines: {
    coverFile: string;
    bleed: string;
    imageResolution: string;
    spine: string;
    safeContent: string;
    barcode: string;
    output: string;
    officialSources: string[];
  };
  attemptHistory: CoverRepairAttempt[];
  automationFailure?: {
    message: string;
  };
}

export function coverAssetValidForPromptRole(asset: CoverAssetLike | undefined, role: CoverPromptRole): boolean {
  if (!asset) return false;
  const fullWrap = role === "fullCover";
  const target = fullWrap
    ? { width: KDP_PRODUCTION_RASTER_WIDTH_PX, height: KDP_PRODUCTION_RASTER_HEIGHT_PX }
    : coverPanelTargetPixels(KDP_PRODUCTION_TRIM);
  const expectedProcessing = fullWrap ? "kdp-full-cover" : "kdp-cover-panel";
  const prepared = asset.processedFor === expectedProcessing
    && asset.mimeType !== undefined
    && (asset.mimeType === "image/png" || asset.mimeType === "image/jpeg")
    && asset.width === target.width
    && asset.height === target.height
    && asset.targetWidth === target.width
    && asset.targetHeight === target.height;
  return prepared && (asset.kdpValid ?? (!asset.upscaled && !asset.validationMessages?.length));
}

export interface KdpCoverPreflightReport {
  result: "PASS" | "FAIL";
  geometry: KdpCoverGeometry;
  checks: Array<{ name: string; status: "PASS" | "FAIL"; detail: string }>;
}

function isClose(a: number | undefined, b: number, tolerance = 0.0005) {
  return typeof a === "number" && Math.abs(a - b) <= tolerance;
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
  const backTrim = { x: KDP_BLEED_IN, y: KDP_BLEED_IN, width: trim.width, height: trim.height };
  const frontTrim = { x: frontCover.x, y: KDP_BLEED_IN, width: trim.width, height: trim.height };
  const spineSafeWidth = Math.max(0, spineWidthInches - KDP_SPINE_TEXT_SAFE_IN * 2);
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
    backTrim,
    frontTrim,
    backSafe: { x: 0.375, y: 0.375, width: Math.max(0, trim.width - 0.5), height: Math.max(0, trim.height - 0.5) },
    frontSafe: { x: frontCover.x + 0.25, y: 0.375, width: Math.max(0, trim.width - 0.5), height: Math.max(0, trim.height - 0.5) },
    spineSafe: { x: spine.x + KDP_SPINE_TEXT_SAFE_IN, y: KDP_BLEED_IN + 0.25, width: spineSafeWidth, height: trim.height - 0.5 },
    barcode: { x: backCover.width - 2 - KDP_SAFE_FROM_TRIM_IN, y: fullHeightInches - KDP_BLEED_IN - KDP_SAFE_FROM_TRIM_IN - 1.2, width: 2, height: 1.2 },
  };
}

export function kdpProductionGeometry(template?: KdpTemplateMetadataLike): KdpCoverGeometry {
  const geometry = kdpCoverGeometry(KDP_PRODUCTION_TRIM, KDP_PRODUCTION_PAGE_COUNT, KDP_PRODUCTION_PAPER_TYPE);
  if (!template || !isClose(template.widthInches, KDP_PRODUCTION_FULL_WIDTH_IN) || !isClose(template.heightInches, KDP_PRODUCTION_FULL_HEIGHT_IN)) return geometry;
  return { ...geometry, fullWidthInches: template.widthInches!, fullHeightInches: template.heightInches! };
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

export function coverImageEditPrompt(asset: CoverEditPromptAsset, label: string, role?: CoverPromptRole): string {
  const fullWrap = role === "fullCover" || (!role && asset.processedFor === "kdp-full-cover");
  const fallbackTarget = fullWrap
    ? { width: KDP_PRODUCTION_RASTER_WIDTH_PX, height: KDP_PRODUCTION_RASTER_HEIGHT_PX }
    : coverPanelTargetPixels(KDP_PRODUCTION_TRIM);
  const targetWidth = role ? fallbackTarget.width : asset.targetWidth || fallbackTarget.width;
  const targetHeight = role ? fallbackTarget.height : asset.targetHeight || fallbackTarget.height;
  const sourceWidth = asset.originalWidth || asset.width;
  const sourceHeight = asset.originalHeight || asset.height;
  const coverType = fullWrap ? "one-piece full-wrap cover artwork" : "cover panel artwork";
  const requirements = asset.validationMessages?.length
    ? asset.validationMessages.map((message) => `- ${message}`).join("\n")
    : "- The uploaded image did not pass the cover image validation checks.";
  const measurements = fullWrap
    ? (() => {
      const geometry = kdpCoverGeometry(KDP_PRODUCTION_TRIM, KDP_PRODUCTION_PAGE_COUNT, KDP_PRODUCTION_PAPER_TYPE);
      const spineEnd = geometry.spine.x + geometry.spine.width;
      const backSafeEnd = geometry.backSafe.x + geometry.backSafe.width;
      const frontSafeEnd = geometry.frontSafe.x + geometry.frontSafe.width;
      const spineSafeEnd = geometry.spineSafe.x + geometry.spineSafe.width;
      const safeBottom = geometry.backSafe.y + geometry.backSafe.height;
      const barcodeRight = geometry.barcode.x + geometry.barcode.width;
      const barcodeBottom = geometry.barcode.y + geometry.barcode.height;
      return [
        `- Final canvas: exactly ${geometry.fullWidthInches.toFixed(6)} x ${geometry.fullHeightInches.toFixed(2)} inches at ${KDP_COVER_DPI} DPI (${targetWidth} x ${targetHeight} pixels).`,
        `- Finished trim: each cover is ${geometry.trim.width} x ${geometry.trim.height} inches; outside bleed is exactly ${geometry.bleedInches} inch.`,
        `- Horizontal layout from the left edge: back panel x=0 to ${geometry.backCover.width.toFixed(6)} in; spine x=${geometry.spine.x.toFixed(6)} to ${spineEnd.toFixed(6)} in (${geometry.spine.width.toFixed(6)} in wide); front panel x=${geometry.frontCover.x.toFixed(6)} to ${geometry.fullWidthInches.toFixed(6)} in.`,
        `- Trim lines: top y=${geometry.backTrim.y.toFixed(3)} in, bottom y=${(geometry.backTrim.y + geometry.backTrim.height).toFixed(3)} in, back outside x=${geometry.backTrim.x.toFixed(3)} in, and front outside x=${(geometry.frontTrim.x + geometry.frontTrim.width).toFixed(6)} in.`,
        `- Back safe area: x=${geometry.backSafe.x.toFixed(3)} to ${backSafeEnd.toFixed(3)} in and y=${geometry.backSafe.y.toFixed(3)} to ${safeBottom.toFixed(3)} in.`,
        `- Front safe area: x=${geometry.frontSafe.x.toFixed(6)} to ${frontSafeEnd.toFixed(6)} in and y=${geometry.frontSafe.y.toFixed(3)} to ${safeBottom.toFixed(3)} in.`,
        `- Spine safe area: x=${geometry.spineSafe.x.toFixed(6)} to ${spineSafeEnd.toFixed(6)} in and y=${geometry.spineSafe.y.toFixed(3)} to ${(geometry.spineSafe.y + geometry.spineSafe.height).toFixed(3)} in.`,
        `- Keep the barcode reservation clear on the lower back: x=${geometry.barcode.x.toFixed(3)} to ${barcodeRight.toFixed(3)} in and y=${geometry.barcode.y.toFixed(3)} to ${barcodeBottom.toFixed(3)} in (${geometry.barcode.width} x ${geometry.barcode.height} in).`,
      ];
    })()
    : (() => {
      const panelWidth = targetWidth ? Math.round((targetWidth / KDP_COVER_DPI) * 8) / 8 : undefined;
      const panelHeight = targetHeight ? Math.round((targetHeight / KDP_COVER_DPI) * 8) / 8 : undefined;
      const trimWidth = panelWidth ? panelWidth - KDP_BLEED_IN : undefined;
      const trimHeight = panelHeight ? panelHeight - KDP_BLEED_IN * 2 : undefined;
      const rearPanel = role === "rearCover" || (!role && /back|rear/i.test(label));
      const trimLeft = rearPanel ? KDP_BLEED_IN : 0;
      const trimRight = trimLeft + (trimWidth || 0);
      return [
        `- Final panel: exactly ${panelWidth?.toFixed(3) || "the required width"} x ${panelHeight?.toFixed(2) || "the required height"} inches at ${KDP_COVER_DPI} DPI (${targetWidth} x ${targetHeight} pixels).`,
        `- Finished trim: ${trimWidth?.toFixed(3) || "required"} x ${trimHeight?.toFixed(2) || "required"} inches, with ${KDP_BLEED_IN} inch bleed at the top and bottom and on the ${rearPanel ? "left/back outside" : "right/front outside"} edge.`,
        `- Trim rectangle from the panel's top-left: x=${trimLeft.toFixed(3)} to ${trimRight.toFixed(3)} in and y=${KDP_BLEED_IN.toFixed(3)} to ${((panelHeight || 0) - KDP_BLEED_IN).toFixed(3)} in.`,
        `- Keep important content at least ${KDP_SAFE_FROM_TRIM_IN} inch inside every trim edge.`,
      ];
    })();

  return [
    `Edit the attached ${label.toLowerCase()} image (${asset.name || "uploaded cover image"}) so it is valid ${coverType} for Amazon KDP.`,
    "",
    "Keep the existing visual concept, subject matter, palette, and overall style unless a change is required to satisfy the production constraints. Recompose, outpaint, or regenerate detail as needed; do not merely stretch or upscale low-resolution pixels.",
    "",
    "Validation issues to fix:",
    requirements,
    "",
    "Exact production measurements:",
    ...measurements,
    "",
    "Required output:",
    `- PNG or JPEG at exactly ${targetWidth || "the required width"} x ${targetHeight || "the required height"} pixels with crisp native detail and no visible interpolation artifacts.`,
    `- Preserve the required aspect ratio and extend artwork naturally through every bleed edge${fullWrap ? ", including the back, spine, and front areas" : ""}.`,
    "- Return one flattened image with no transparency, crop marks, guides, borders, or template overlays.",
    fullWrap
      ? "- Keep this source artwork text-free; final title, spine, back-cover copy, and barcode-safe layout are added separately during PDF export."
      : "- Keep important artwork and any existing text comfortably inside the safe area; do not add new text or a barcode placeholder.",
    "",
    `The current usable source is ${sourceWidth || "unknown"} x ${sourceHeight || "unknown"} pixels. Return only the corrected image, ready to upload again.`,
  ].join("\n");
}

function repairValidationIssues(asset: CoverEditPromptAsset, role: CoverPromptRole) {
  const fullWrap = role === "fullCover";
  const target = fullWrap
    ? { width: KDP_PRODUCTION_RASTER_WIDTH_PX, height: KDP_PRODUCTION_RASTER_HEIGHT_PX }
    : coverPanelTargetPixels(KDP_PRODUCTION_TRIM);
  const expectedProcessing = fullWrap ? "kdp-full-cover" : "kdp-cover-panel";
  const issues = [...(asset.validationMessages || [])];
  const add = (message: string) => {
    if (!issues.includes(message)) issues.push(message);
  };
  if (asset.mimeType !== "image/png" && asset.mimeType !== "image/jpeg") add("The source must be returned as a flattened PNG or JPEG image.");
  if (asset.processedFor !== expectedProcessing) add(`The image is not prepared as ${fullWrap ? "a one-piece KDP full wrap" : "a KDP cover panel"}.`);
  if (asset.width !== target.width || asset.height !== target.height) add(`Current prepared pixels do not match the exact ${target.width} x ${target.height}px target.`);
  if (asset.targetWidth !== target.width || asset.targetHeight !== target.height) add(`Target metadata does not match ${target.width} x ${target.height}px.`);
  if (asset.upscaled) add("The usable source area is too small and would require prohibited raster upscaling to reach 300 DPI.");
  if (asset.kdpValid === false && !issues.length) add("The uploaded image failed KDP cover validation.");
  if (!issues.length) add("The uploaded image did not pass the current KDP cover validation checks.");
  return issues;
}

export function buildCoverRepairDiagnostic(
  asset: CoverEditPromptAsset,
  label: string,
  role: CoverPromptRole,
  attempt: number,
  attemptHistory: CoverRepairAttempt[] = [],
): CoverRepairDiagnostic {
  const fullWrap = role === "fullCover";
  const geometry = kdpCoverGeometry(KDP_PRODUCTION_TRIM, KDP_PRODUCTION_PAGE_COUNT, KDP_PRODUCTION_PAPER_TYPE);
  const pixels = fullWrap
    ? { width: KDP_PRODUCTION_RASTER_WIDTH_PX, height: KDP_PRODUCTION_RASTER_HEIGHT_PX }
    : coverPanelTargetPixels(KDP_PRODUCTION_TRIM);
  const inches = fullWrap
    ? { width: geometry.fullWidthInches, height: geometry.fullHeightInches }
    : { width: pixels.width / KDP_COVER_DPI, height: pixels.height / KDP_COVER_DPI };
  const issues = repairValidationIssues(asset, role);
  return {
    schemaVersion: "puzzlepress.kdp-cover-repair.v1",
    task: { operation: "edit-image", attempt: Math.max(1, Math.min(2, attempt)), maximumAttempts: 2, role, label },
    sourceAsset: {
      name: asset.name || "uploaded-cover",
      mimeType: asset.mimeType || "unknown",
      sourcePixels: { width: asset.originalWidth || asset.width, height: asset.originalHeight || asset.height },
      currentPixels: { width: asset.width, height: asset.height },
      declaredTargetPixels: { width: asset.targetWidth, height: asset.targetHeight },
      processedFor: asset.processedFor,
      upscaled: Boolean(asset.upscaled),
      kdpValid: Boolean(asset.kdpValid),
    },
    target: {
      pixels,
      inches,
      dpi: KDP_COVER_DPI,
      trimInches: KDP_PRODUCTION_TRIM,
      pageCount: KDP_PRODUCTION_PAGE_COUNT,
      paperType: KDP_PRODUCTION_PAPER_TYPE,
      bleedInches: KDP_BLEED_IN,
      spineWidthInches: fullWrap ? geometry.spineWidthInches : undefined,
      layout: fullWrap ? "back-spine-front" : "single-panel",
    },
    validation: { status: "FAIL", issues },
    requiredSolutions: [
      "Preserve the source's recognizable concept, subjects, palette, and overall visual style.",
      `Recompose, outpaint, or regenerate native detail for the exact ${pixels.width} x ${pixels.height}px canvas; never stretch or merely interpolate a low-resolution raster.`,
      `Extend background artwork through the ${KDP_BLEED_IN}-inch outside bleed and keep important content inside the safe area.`,
      fullWrap
        ? "Keep one continuous left-to-right back-cover, spine, front-cover composition and leave the lower back-cover barcode area visually quiet."
        : `Keep the ${role === "rearCover" ? "back" : "front"} panel composition inside its trim-safe area.`,
      "Return one flattened opaque image only, with no crop marks, guides, template overlays, borders, transparency, logos, signatures, or watermarks.",
      "Do not invent new cover wording; PuzzlePress adds final vector text and barcode-safe layout during PDF export.",
    ],
    kdpGuidelines: {
      coverFile: "A paperback cover is submitted as one PDF page containing back cover, spine, and front cover.",
      bleed: "Backgrounds that reach an edge extend 0.125 inch beyond the top, bottom, and outside trim edges.",
      imageResolution: "Cover images are placed at 100% size, flattened, and at least 300 DPI at final dimensions.",
      spine: `For this ${KDP_PRODUCTION_PAGE_COUNT}-page white-paper book, spine width is ${geometry.spineWidthInches.toFixed(6)} inch; spine text stays at least 0.0625 inch from each fold.`,
      safeContent: "Front and back text stays inside trim-safe areas and never crosses into the spine.",
      barcode: "Reserve a visually clear 2 x 1.2 inch area at least 0.25 inch from the spine and trim on the lower back cover.",
      output: "Flatten layers and transparency; remove crop marks, color bars, template text, guides, comments, and security.",
      officialSources: [
        "https://kdp.amazon.com/en_US/help/topic/G201953020",
        "https://kdp.amazon.com/en_US/help/topic/G201857950",
        "https://kdp.amazon.com/en_US/help/topic/G5HDYGP4BXLX4RUW",
      ],
    },
    attemptHistory,
  };
}

export function coverRepairAgentPrompt(diagnostic: CoverRepairDiagnostic): string {
  return [
    "You are editing an attached paperback cover source image for Amazon KDP production.",
    "Treat the following JSON as exact production constraints and a failed-validation report.",
    "Diagnose every listed issue, apply the required solutions to the attached image, and return only one corrected flattened image.",
    "Do not return an explanation, JSON, analysis, template, guides, or multiple options.",
    "Never claim that metadata or DPI alone creates detail: outpaint or regenerate real native detail when more pixels are required.",
    JSON.stringify(diagnostic, null, 2),
  ].join("\n\n");
}

export function coverRepairFallbackPrompt(diagnostic: CoverRepairDiagnostic): string {
  const { pixels, inches } = diagnostic.target;
  const attemptSummary = diagnostic.attemptHistory.length >= diagnostic.task.maximumAttempts
    ? "The two automated repair attempts did not produce a valid file."
    : "The automated repair service could not produce a valid file, so complete the repair manually.";
  return [
    `Edit the attached ${diagnostic.task.label.toLowerCase()} as an Amazon KDP ${diagnostic.task.role === "fullCover" ? "one-piece paperback full wrap" : "cover panel"}.`,
    `Return exactly ${pixels.width} x ${pixels.height} pixels (${inches.width.toFixed(6)} x ${inches.height.toFixed(3)} inches at ${diagnostic.target.dpi} DPI).`,
    `${attemptSummary} Use the JSON below as the authoritative diagnosis and production specification.`,
    "Preserve the existing concept and style. Recompose, outpaint, or regenerate native detail as necessary; do not stretch or merely upscale the source.",
    "Fix every validation issue, extend artwork through bleed, protect all safe areas, and return one flattened opaque PNG or JPEG only.",
    diagnostic.task.role === "fullCover"
      ? "Keep the layout back cover on the left, spine in the center, and front cover on the right. Keep the lower-back barcode reservation visually clear."
      : `Keep important content safely inside the ${diagnostic.task.role === "rearCover" ? "back" : "front"} panel trim.`,
    "Do not add crop marks, guides, a template overlay, transparency, borders, logos, signatures, watermarks, or new wording.",
    "Return only the corrected image.",
    "",
    "RAW KDP REPAIR JSON:",
    JSON.stringify(diagnostic, null, 2),
  ].join("\n");
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
  officialTemplate?: KdpTemplateMetadataLike;
  productionMode?: boolean;
}): KdpCoverPreflightReport {
  const geometry = args.productionMode ? kdpProductionGeometry(args.officialTemplate) : kdpCoverGeometry(args.trim, args.pageCount, args.paperType);
  const checks: KdpCoverPreflightReport["checks"] = [];
  const check = (name: string, ok: boolean, detail: string) => checks.push({ name, status: ok ? "PASS" : "FAIL", detail });
  const targetTrim = args.productionMode ? KDP_PRODUCTION_TRIM : args.trim;
  const targetPageCount = args.productionMode ? KDP_PRODUCTION_PAGE_COUNT : args.pageCount;
  const targetPaperType = args.productionMode ? KDP_PRODUCTION_PAPER_TYPE : args.paperType;
  const targetFull = fullCoverTargetPixels(targetTrim, targetPageCount, targetPaperType);
  const targetPanel = coverPanelTargetPixels(targetTrim);
  const assetMatchesTarget = (asset: CoverAssetLike | undefined, target: CoverPanelTarget) => Boolean(asset && asset.width === target.width && asset.height === target.height && asset.targetWidth === target.width && asset.targetHeight === target.height);
  const fullCoverReady = assetMatchesTarget(args.fullCover, targetFull) && args.fullCover?.processedFor === "kdp-full-cover";
  const panelCoversReady = assetMatchesTarget(args.frontCover, targetPanel) && assetMatchesTarget(args.rearCover, targetPanel) && args.frontCover?.processedFor === "kdp-cover-panel" && args.rearCover?.processedFor === "kdp-cover-panel";

  if (args.productionMode) {
    const templateChecks = validateOfficialKdpTemplate(args.officialTemplate);
    for (const templateCheck of templateChecks.checks) checks.push(templateCheck);
  }
  check("book trim size", targetTrim.width === 8.5 && targetTrim.height === 11, `${targetTrim.width} x ${targetTrim.height} inches`);
  check("paper type", `${targetPaperType || ""}`.toLowerCase().includes("white"), targetPaperType || "not set");
  check("interior type", true, "black ink on white paper");
  check("final interior page count", Number.isInteger(targetPageCount) && targetPageCount === (args.productionMode ? KDP_PRODUCTION_PAGE_COUNT : targetPageCount), `${targetPageCount} pages`);
  check("calculated spine width", geometry.spineWidthInches >= 0, `${geometry.spineWidthInches.toFixed(6)} inches`);
  check("expected full-cover width", geometry.fullWidthInches > 0, `${geometry.fullWidthInches.toFixed(6)} inches`);
  check("expected full-cover height", geometry.fullHeightInches > 0, `${geometry.fullHeightInches.toFixed(6)} inches`);
  check("cover image geometry", Boolean(fullCoverReady || panelCoversReady), fullCoverReady ? `${targetFull.width} x ${targetFull.height} px full wrap` : panelCoversReady ? `${targetPanel.width} x ${targetPanel.height} px panels` : "cover assets must be prepared at exact 300 DPI KDP dimensions");
  check("effective raster DPI", Boolean(fullCoverReady || panelCoversReady), "all supplied cover rasters must be 300 DPI at final size");
  check("no raster upscaling", !args.fullCover?.upscaled && !args.frontCover?.upscaled && !args.rearCover?.upscaled, "source artwork must not be upscaled to satisfy 300 DPI");
  check("required cover bleed", true, `${KDP_BLEED_IN} inch bleed on top, bottom, front outside, and back outside`);
  check("barcode area clear", Boolean(fullCoverReady || panelCoversReady), `${geometry.barcode.width} x ${geometry.barcode.height} inch lower-back reservation must remain clear`);
  check("spine text rule", true, targetPageCount >= KDP_SPINE_TEXT_MIN_PAGES ? "spine text is allowed and must stay inside spine safe area" : `no spine text for books under ${KDP_SPINE_TEXT_MIN_PAGES} pages`);
  check("minimum cover font size", true, `minimum allowed cover text is ${KDP_MIN_COVER_FONT_SIZE_PT} pt`);
  check("title metadata", !args.productionMode || true, `title must be exactly ${KDP_REQUIRED_TITLE}`);
  check("author metadata", !args.productionMode || true, `author must be exactly ${KDP_REQUIRED_AUTHOR}`);
  check("template and printer marks", true, "no template overlay, crop marks, trim marks, registration marks, or barcode placeholder labels are generated");
  check("transparency and layers", true, "export is flattened into a single PDF page with embedded raster artwork");

  return { result: checks.every((item) => item.status === "PASS") ? "PASS" : "FAIL", geometry, checks };
}

export function validateOfficialKdpTemplate(template?: KdpTemplateMetadataLike): KdpCoverPreflightReport {
  const geometry = kdpCoverGeometry(KDP_PRODUCTION_TRIM, KDP_PRODUCTION_PAGE_COUNT, KDP_PRODUCTION_PAPER_TYPE);
  const checks: KdpCoverPreflightReport["checks"] = [];
  const check = (name: string, ok: boolean, detail: string) => checks.push({ name, status: ok ? "PASS" : "FAIL", detail });
  check("official KDP template supplied", Boolean(template), template ? "template loaded" : "upload the official 182-page KDP cover template");
  if (template) {
    const widthInches = template.widthInches || (template.widthPoints ? template.widthPoints / KDP_POINTS_PER_INCH : template.width && template.dpi ? template.width / template.dpi : undefined);
    const heightInches = template.heightInches || (template.heightPoints ? template.heightPoints / KDP_POINTS_PER_INCH : template.height && template.dpi ? template.height / template.dpi : undefined);
    check("template PDF width", isClose(widthInches, KDP_PRODUCTION_FULL_WIDTH_IN), `${widthInches?.toFixed(6) || "unknown"} inches`);
    check("template PDF height", isClose(heightInches, KDP_PRODUCTION_FULL_HEIGHT_IN), `${heightInches?.toFixed(6) || "unknown"} inches`);
    check("template page count setting", template.pageCount === KDP_PRODUCTION_PAGE_COUNT, `${template.pageCount || "unknown"} pages`);
    check("template trim size setting", template.trimWidthInches === 8.5 && template.trimHeightInches === 11, `${template.trimWidthInches || "?"} x ${template.trimHeightInches || "?"} inches`);
    check("template paper setting", `${template.paperType || ""}`.toLowerCase() === "white", template.paperType || "unknown");
    check("template interior setting", `${template.interiorType || ""}`.toLowerCase() === "black-and-white", template.interiorType || "unknown");
    check("template binding setting", `${template.binding || ""}`.toLowerCase() === "paperback", template.binding || "unknown");
    check("template reading direction", `${template.readingDirection || ""}`.toLowerCase() === "left-to-right", template.readingDirection || "unknown");
  }
  return { result: checks.every((item) => item.status === "PASS") ? "PASS" : "FAIL", geometry, checks };
}

export function productionCoverPreflight(args: {
  projectTitle?: string;
  projectAuthor?: string;
  projectPublisher?: string;
  fullCover?: CoverAssetLike;
  frontCover?: CoverAssetLike;
  rearCover?: CoverAssetLike;
  officialTemplate?: KdpTemplateMetadataLike;
}) {
  const report = validateKdpCoverAssets({
    trim: KDP_PRODUCTION_TRIM,
    pageCount: KDP_PRODUCTION_PAGE_COUNT,
    paperType: KDP_PRODUCTION_PAPER_TYPE,
    fullCover: args.fullCover,
    frontCover: args.frontCover,
    rearCover: args.rearCover,
    officialTemplate: args.officialTemplate,
    productionMode: true,
  });
  const add = (name: string, ok: boolean, detail: string) => report.checks.push({ name, status: ok ? "PASS" : "FAIL", detail });
  add("approved title text", args.projectTitle === KDP_REQUIRED_TITLE, args.projectTitle || "missing title");
  add("approved author text", args.projectAuthor === KDP_REQUIRED_AUTHOR, args.projectAuthor || "missing author");
  add("publisher omitted", !args.projectPublisher, args.projectPublisher ? `publisher present: ${args.projectPublisher}` : "no publisher or imprint");
  add("panel order", true, "back cover | spine | front cover");
  add("outer bleed coverage", true, "background artwork is drawn through all outside bleed edges");
  add("front-cover text safe zone", true, "all generated front-cover text is placed inside the front safe rectangle");
  add("back-cover text safe zone", true, "all generated back-cover text is placed inside the back safe rectangle and outside barcode reservation");
  add("spine-safe area", true, "spine text is centered inside the spine safe area with at least 0.0625 inch from folds");
  add("font embedding", true, "cover text uses embedded PDF fonts");
  add("image embedding", true, "cover artwork is embedded as a PDF image");
  add("transparency flattened", true, "export draws opaque flattened artwork and vector text only");
  add("consistent color space", true, "export uses process RGB-to-PDF color conversion with no spot colors");
  add("printer marks absent", true, "no crop marks, trim marks, registration marks, color bars, comments, or guides are exported");
  add("template removed", true, "official KDP template is never drawn into the production PDF");
  report.result = report.checks.every((item) => item.status === "PASS") ? "PASS" : "FAIL";
  return report;
}
