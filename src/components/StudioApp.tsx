"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Archive, BookCopy, BookOpen, Check, CheckCircle2, ChevronRight, CircleAlert,
  Clock3, Download, FileJson, FileText, FolderOpen, Grid3X3, ImagePlus,
  LayoutDashboard, LayoutTemplate, Menu, Plus, RefreshCw, Save,
  SlidersHorizontal, Sparkles, Trash2, Upload, WandSparkles, Palette, Image,
} from "lucide-react";
import { sampleBook } from "@/data/sample-book";
import { templates } from "@/data/templates";
import { parseCsvProject, parseProjectJsonWithResult } from "@/lib/importers";
import { generatePuzzle, normalizeWord, puzzleGenerationConfig, validateWords } from "@/lib/puzzle-generator";
import { buildTableOfContents, combinedPageCount, paginateTableOfContents } from "@/lib/book-pages";
import { coverCropRect, coverNeedsUpscale, coverPanelTargetPixels, effectiveCoverDpi, fullCoverTargetPixels, kdpCoverGeometry, parseTrimSize as parseCoverTrimSize, type CropRect } from "@/lib/cover-prep";
import { resolveWordColumns } from "@/lib/pdf-layout";
import { loadActiveProjectId, loadProjectsAsync, saveActiveProjectId, saveProjects } from "@/lib/storage";
import { SENIOR_LARGE_PRINT_PRESET, seniorProject, seniorPuzzleWords } from "@/lib/senior-preset";
import { loadResearchProjects } from "@/lib/research-storage";
import type { BookProject, GridSize, ProjectAsset, Puzzle, TemplateStyle } from "@/types/puzzle";
import type { ResearchProject } from "@/types/research";
import { PuzzleGrid } from "./PuzzleGrid";

type View = "dashboard" | "projects" | "import" | "editor" | "review" | "templates" | "preview" | "export";
type PreviewPage = { type: "title" | "text" | "toc" | "divider" | "puzzle" | "solution"; label: string; body?: string; bullets?: string[]; section?: string; puzzle?: Puzzle; page: number; tocEntries?: ReturnType<typeof buildTableOfContents> };
type AssetKind = "cover" | "fullCover" | "frontCover" | "rearCover" | "decorative" | "divider" | "puzzle";
type ImageGenerationProvider = "gemini" | "openai";
type TemplateIconDecoration = { icon: string; left: string; top: string; size: string; opacity: number };
type IconSlot = Omit<TemplateIconDecoration, "icon">;

const IMAGE_ART_ACCEPT = "image/png,image/jpeg,image/svg+xml,.svg";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function parsePercent(value: string) {
  return Number(value.replace("%", "")) || 0;
}

function iconSlotsAreSpaced(candidate: IconSlot, selected: IconSlot[], minGap = 7) {
  const left = parsePercent(candidate.left);
  const top = parsePercent(candidate.top);
  const size = parsePercent(candidate.size);
  const right = left + size;
  const bottom = top + size;
  return selected.every((slot) => {
    const slotLeft = parsePercent(slot.left);
    const slotTop = parsePercent(slot.top);
    const slotSize = parsePercent(slot.size);
    const slotRight = slotLeft + slotSize;
    const slotBottom = slotTop + slotSize;
    const horizontalGap = Math.max(slotLeft - right, left - slotRight, 0);
    const verticalGap = Math.max(slotTop - bottom, top - slotBottom, 0);
    return horizontalGap >= minGap || verticalGap >= minGap;
  });
}

function spacedIconSlots(pageNumber: number, pageType: PreviewPage["type"], count: number) {
  const presets: IconSlot[] = [
    { left: "7%", top: "7%", size: "17%", opacity: .5 },
    { left: "41%", top: "5%", size: "14%", opacity: .4 },
    { left: "76%", top: "8%", size: "17%", opacity: .5 },
    { left: "5%", top: "32%", size: "14%", opacity: .38 },
    { left: "80%", top: "32%", size: "14%", opacity: .38 },
    { left: "6%", top: "55%", size: "15%", opacity: .42 },
    { left: "79%", top: "55%", size: "15%", opacity: .42 },
    { left: "8%", top: "78%", size: "18%", opacity: .52 },
    { left: "41%", top: "82%", size: "14%", opacity: .42 },
    { left: "74%", top: "77%", size: "19%", opacity: .54 },
    { left: "24%", top: "88%", size: "11%", opacity: .33 },
    { left: "61%", top: "88%", size: "11%", opacity: .33 },
  ];
  const typeOffset = ["title", "text", "toc", "divider", "puzzle", "solution"].indexOf(pageType);
  const start = (pageNumber * 2 + Math.max(0, typeOffset)) % presets.length;
  const selected: IconSlot[] = [];
  for (let step = 0; step < presets.length * 2 && selected.length < count; step++) {
    const preset = presets[(start + step * 3) % presets.length];
    if (!selected.includes(preset) && iconSlotsAreSpaced(preset, selected)) selected.push(preset);
  }
  return selected;
}

function templateIconDecorations(icons: string[], pageNumber: number, pageType: PreviewPage["type"]): TemplateIconDecoration[] {
  if (!icons.length) return [];
  return spacedIconSlots(pageNumber, pageType, 3).map((slot, index) => ({
    icon: icons[(pageNumber + index) % icons.length],
    ...slot,
  }));
}

function allPuzzles(project: BookProject) {
  return project.sections.flatMap((section) => section.puzzles.map((puzzle) => ({ section, puzzle })));
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click();
  URL.revokeObjectURL(url);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function imageDimensions(dataUrl: string): Promise<Pick<ProjectAsset, "width" | "height">> {
  return new Promise((resolve) => {
    const image = new window.Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve({});
    image.src = dataUrl;
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not decode the uploaded image."));
    image.src = dataUrl;
  });
}

function nearlyEqual(a: number, b: number, tolerance = .5) {
  return Math.abs(a - b) <= tolerance;
}

function coverProcessingMessages(source: { width: number; height: number }, crop: CropRect, target: { width: number; height: number }) {
  const messages: string[] = [];
  if (!nearlyEqual(crop.sx, 0) || !nearlyEqual(crop.sy, 0) || !nearlyEqual(crop.sw, source.width) || !nearlyEqual(crop.sh, source.height)) {
    messages.push(`Cropped to ${Math.round(crop.sw)} x ${Math.round(crop.sh)}px for the KDP aspect ratio.`);
  }
  if (source.width !== target.width || source.height !== target.height) {
    messages.push(`Resized to ${target.width} x ${target.height}px for 300 DPI output.`);
  }
  return messages.length ? messages : ["No resizing needed; source matches target pixels."];
}

function coverValidationMessages(source: { width: number; height: number }, crop: CropRect, target: { width: number; height: number }) {
  const messages: string[] = [];
  if (coverNeedsUpscale(source, crop, target)) {
    messages.push(`Source is too small after crop: needs at least ${target.width} x ${target.height}px, usable area is ${Math.round(crop.sw)} x ${Math.round(crop.sh)}px.`);
  }
  return messages;
}

function drawWrappedCanvasText(context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines = 6) {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (context.measureText(next).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else current = next;
  }
  if (current) lines.push(current);
  lines.slice(0, maxLines).forEach((line, index) => context.fillText(line, x, y + index * lineHeight));
  return Math.min(lines.length, maxLines) * lineHeight;
}

function fitCanvasFont(context: CanvasRenderingContext2D, text: string, baseSize: number, minSize: number, maxWidth: number, font: string) {
  let size = baseSize;
  do {
    context.font = `700 ${size}px ${font}`;
    if (context.measureText(text).width <= maxWidth) return size;
    size -= 4;
  } while (size >= minSize);
  return minSize;
}

async function composeGeneratedFullCoverAsset(args: {
  project: BookProject;
  artworkDataUrl: string;
  prompt: string;
  style: string;
  provider: ImageGenerationProvider;
  model: string;
}): Promise<ProjectAsset> {
  const trim = parseCoverTrimSize(args.project.settings.trimSize);
  const pageCount = combinedPageCount(args.project);
  const paperType = args.project.settings.paperType || args.project.settings.interior;
  const target = fullCoverTargetPixels(trim, pageCount, paperType);
  const geometry = kdpCoverGeometry(trim, pageCount, paperType);
  const image = await loadImage(args.artworkDataUrl);
  const source = { width: image.naturalWidth, height: image.naturalHeight };
  const crop = coverCropRect(source, target);
  const sourceCanFillWrap = !coverNeedsUpscale(source, crop, target);
  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not compose the generated cover.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  const scale = 300;
  const frontX = geometry.frontCover.x * scale;
  const frontW = geometry.frontCover.width * scale;
  const backW = geometry.backCover.width * scale;
  const safe = .5 * scale;
  const barcode = geometry.barcode;
  if (sourceCanFillWrap) {
    context.drawImage(image, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, target.width, target.height);
  } else {
    const base = context.createLinearGradient(0, 0, target.width, target.height);
    base.addColorStop(0, "#dfe6dd");
    base.addColorStop(.45, "#f8f0df");
    base.addColorStop(1, "#efe0cf");
    context.fillStyle = base;
    context.fillRect(0, 0, target.width, target.height);
    context.fillStyle = "rgba(49,71,61,.12)";
    context.fillRect(safe, safe, backW - safe * 2, target.height - safe * 2);
    context.fillStyle = "rgba(184,95,58,.11)";
    context.beginPath();
    context.arc(frontX + frontW * .68, target.height * .43, Math.min(frontW, target.height) * .23, 0, Math.PI * 2);
    context.fill();

    const frontArtMaxW = frontW - safe * 2;
    const frontArtMaxH = target.height * .42;
    const frontArtScale = Math.min(1, frontArtMaxW / source.width, frontArtMaxH / source.height);
    const frontArtW = source.width * frontArtScale;
    const frontArtH = source.height * frontArtScale;
    context.save();
    context.shadowColor = "rgba(38,55,47,.22)";
    context.shadowBlur = 35;
    context.shadowOffsetY = 22;
    context.drawImage(image, frontX + (frontW - frontArtW) / 2, safe + 680, frontArtW, frontArtH);
    context.restore();

    const backArtScale = Math.min(1, (backW - safe * 2) * .55 / source.width, target.height * .3 / source.height);
    context.globalAlpha = .26;
    context.drawImage(image, safe, target.height - safe - source.height * backArtScale, source.width * backArtScale, source.height * backArtScale);
    context.globalAlpha = 1;
  }
  context.fillStyle = "rgba(255,255,255,.96)";
  context.fillRect(barcode.x * scale, (geometry.fullHeightInches - barcode.y - barcode.height) * scale, barcode.width * scale, barcode.height * scale);

  const panelOverlay = context.createLinearGradient(frontX, 0, target.width, target.height);
  panelOverlay.addColorStop(0, "rgba(255,255,255,.18)");
  panelOverlay.addColorStop(1, "rgba(255,255,255,.78)");
  context.fillStyle = panelOverlay;
  context.fillRect(frontX, 0, frontW, target.height);
  context.fillStyle = "rgba(255,255,255,.72)";
  context.fillRect(safe, safe, backW - safe * 2, target.height - safe * 2);

  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  context.fillStyle = "#1f2d28";
  context.font = "700 54px Georgia, Times New Roman, serif";
  context.fillText(args.project.series || "PuzzlePress", frontX + frontW / 2, safe + 115);
  const title = args.project.title || "Untitled Word Search";
  const titleSize = fitCanvasFont(context, title, 126, 58, frontW - safe * 2, "Georgia, Times New Roman, serif");
  context.font = `700 ${titleSize}px Georgia, Times New Roman, serif`;
  drawWrappedCanvasText(context, title, frontX + frontW / 2, safe + 305, frontW - safe * 2, titleSize * 1.08, 3);
  context.font = "400 48px Arial, Helvetica, sans-serif";
  drawWrappedCanvasText(context, args.project.subtitle || "", frontX + frontW / 2, target.height - safe - 270, frontW - safe * 2, 58, 3);
  context.font = "700 38px Arial, Helvetica, sans-serif";
  context.fillText(args.project.author || "", frontX + frontW / 2, target.height - safe - 95);

  context.textAlign = "left";
  context.fillStyle = "#26372f";
  context.font = "700 42px Georgia, Times New Roman, serif";
  context.fillText(args.project.series || "About this book", safe, safe + 90);
  context.font = "400 32px Arial, Helvetica, sans-serif";
  const description = args.project.description || "A comfortable large-print word search collection with familiar themes, clean grids, and a complete answer key.";
  let y = safe + 165;
  y += drawWrappedCanvasText(context, description, safe, y, backW - safe * 2, 44, 7) + 45;
  context.font = "700 30px Arial, Helvetica, sans-serif";
  ["Large-print puzzle pages", "Forward-only word placement", "Complete answer key", "Senior-friendly spacing"].forEach((item) => {
    context.fillText(`- ${item}`, safe, y);
    y += 44;
  });

  const dataUrl = canvas.toDataURL("image/png");
  const providerLabel = args.provider === "openai" ? "OpenAI" : "Gemini";
  const processingMessages = [
    `Generated artwork with ${providerLabel} ${args.model}.`,
    ...(sourceCanFillWrap
      ? coverProcessingMessages(source, crop, target)
      : [
        `Generated artwork is ${source.width} x ${source.height}px; it was placed at native-or-smaller scale with no raster upscaling.`,
        `Final cover canvas was composed at ${target.width} x ${target.height}px for 300 DPI KDP output.`,
      ]),
    "PuzzlePress added KDP-safe text layout and barcode clearance.",
  ];
  const validationMessages = sourceCanFillWrap ? coverValidationMessages(source, crop, target) : [];
  return {
    name: `${args.project.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "generated-cover"}-ai-kdp-full-cover.png`,
    mimeType: "image/png",
    dataUrl,
    width: target.width,
    height: target.height,
    originalWidth: source.width,
    originalHeight: source.height,
    processedFor: "kdp-full-cover",
    upscaled: validationMessages.length > 0,
    targetWidth: target.width,
    targetHeight: target.height,
    kdpValid: validationMessages.length === 0,
    validationMessages,
    processingMessages,
    generationProvider: args.provider,
    generationModel: args.model,
    generationPrompt: args.prompt,
    generationStyle: args.style,
  };
}

async function prepareCoverAsset(file: File, trimValue?: string | null): Promise<ProjectAsset> {
  if (file.type !== "image/png" && file.type !== "image/jpeg") throw new Error("Cover images must be PNG or JPEG files.");
  const sourceDataUrl = await fileToDataUrl(file);
  const image = await loadImage(sourceDataUrl);
  const source = { width: image.naturalWidth, height: image.naturalHeight };
  const target = coverPanelTargetPixels(parseCoverTrimSize(trimValue));
  const crop = coverCropRect(source, target);
  const mimeType = file.type === "image/jpeg" ? "image/jpeg" : "image/png";
  const processingMessages = coverProcessingMessages(source, crop, target);
  const validationMessages = coverValidationMessages(source, crop, target);
  let dataUrl = sourceDataUrl;
  if (processingMessages.some((message) => message.startsWith("Cropped") || message.startsWith("Reprocessed"))) {
    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare the cover image.");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, target.width, target.height);
    dataUrl = mimeType === "image/jpeg" ? canvas.toDataURL(mimeType, .92) : canvas.toDataURL(mimeType);
  }
  return {
    name: file.name.replace(/\.(png|jpe?g)$/i, "-kdp-300dpi.$1"),
    mimeType,
    dataUrl,
    width: target.width,
    height: target.height,
    originalWidth: source.width,
    originalHeight: source.height,
    processedFor: "kdp-cover-panel",
    upscaled: validationMessages.length > 0,
    targetWidth: target.width,
    targetHeight: target.height,
    kdpValid: validationMessages.length === 0,
    validationMessages,
    processingMessages,
  };
}

async function prepareFullCoverAsset(file: File, trimValue: string | null | undefined, pageCount: number, paperType?: string | null): Promise<ProjectAsset> {
  if (file.type !== "image/png" && file.type !== "image/jpeg") throw new Error("Full cover images must be PNG or JPEG files.");
  const sourceDataUrl = await fileToDataUrl(file);
  const image = await loadImage(sourceDataUrl);
  const source = { width: image.naturalWidth, height: image.naturalHeight };
  const target = fullCoverTargetPixels(parseCoverTrimSize(trimValue), pageCount, paperType);
  const crop = coverCropRect(source, target);
  const mimeType = file.type === "image/jpeg" ? "image/jpeg" : "image/png";
  const processingMessages = coverProcessingMessages(source, crop, target);
  const validationMessages = coverValidationMessages(source, crop, target);
  let dataUrl = sourceDataUrl;
  if (processingMessages.some((message) => message.startsWith("Cropped") || message.startsWith("Reprocessed"))) {
    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare the full cover image.");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, target.width, target.height);
    dataUrl = mimeType === "image/jpeg" ? canvas.toDataURL(mimeType, .92) : canvas.toDataURL(mimeType);
  }
  return {
    name: file.name.replace(/\.(png|jpe?g)$/i, "-kdp-full-cover-300dpi.$1"),
    mimeType,
    dataUrl,
    width: target.width,
    height: target.height,
    originalWidth: source.width,
    originalHeight: source.height,
    processedFor: "kdp-full-cover",
    upscaled: validationMessages.length > 0,
    targetWidth: target.width,
    targetHeight: target.height,
    kdpValid: validationMessages.length === 0,
    validationMessages,
    processingMessages,
  };
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [metadata, encoded] = dataUrl.split(",");
  const mimeType = metadata.match(/data:([^;]+)/)?.[1] || "application/octet-stream";
  const bytes = atob(encoded); const buffer = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index++) buffer[index] = bytes.charCodeAt(index);
  return new Blob([buffer], { type: mimeType });
}

function coverAssetSummary(asset?: ProjectAsset) {
  if ((asset?.processedFor !== "kdp-cover-panel" && asset?.processedFor !== "kdp-full-cover") || !asset.targetWidth || !asset.targetHeight) return undefined;
  const source = asset.originalWidth && asset.originalHeight ? `${asset.originalWidth}x${asset.originalHeight} source` : "source checked";
  const target = `${asset.targetWidth}x${asset.targetHeight} target`;
  if (asset.generationModel && asset.processedFor === "kdp-full-cover" && !asset.upscaled) return `AI-composed ${target}, ${source} placed without upscaling, 300 DPI full wrap`;
  const dpi = asset.processedFor === "kdp-full-cover" ? "300 DPI full wrap" : asset.width && asset.height ? `${Math.floor(effectiveCoverDpi(asset.width, asset.height, { width: (asset.targetWidth / 300) - .125, height: (asset.targetHeight / 300) - .25 }) || 300)} DPI` : "300 DPI";
  return `${source} -> ${target}, ${dpi}`;
}

function coverAssetStatus(asset?: ProjectAsset) {
  if (asset?.processedFor !== "kdp-cover-panel" && asset?.processedFor !== "kdp-full-cover") return { valid: false, kind: "", details: [] as string[] };
  const validationMessages = asset.validationMessages?.length
    ? asset.validationMessages
    : asset.upscaled
      ? [`Source is too small for ${asset.targetWidth || "required"} x ${asset.targetHeight || "required"}px KDP output.`]
      : [];
  const processingMessages = asset.processingMessages || [];
  const valid = asset.kdpValid ?? (validationMessages.length === 0 && !asset.upscaled);
  const details = [
    ...(valid ? ["Valid for cover PDF export."] : validationMessages),
    ...processingMessages.map((message) => `Processing: ${message}`),
  ];
  return { valid, kind: valid ? "asset-valid" : "asset-invalid", details };
}

export default function StudioApp() {
  const [projects, setProjects] = useState<BookProject[]>([sampleBook]);
  const [researchProjects, setResearchProjects] = useState<ResearchProject[]>([]);
  const [activeId, setActiveId] = useState(sampleBook.id);
  const [view, setView] = useState<View>("dashboard");
  const [selectedPuzzleId, setSelectedPuzzleId] = useState(sampleBook.sections[0].puzzles[0].id);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [solutionMode, setSolutionMode] = useState(false);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
      const saved = await loadProjectsAsync();
      const requestedId = new URLSearchParams(window.location.search).get("book") || loadActiveProjectId();
      if (saved.length) {
        const nextId = saved.some((item) => item.id === requestedId) ? requestedId! : saved[0].id;
        setProjects(saved); setActiveId(nextId); saveActiveProjectId(nextId);
        if (new URLSearchParams(window.location.search).get("view") === "editor") setView("editor");
      }
      setResearchProjects(loadResearchProjects());
      })();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [view]);

  const project = projects.find((item) => item.id === activeId) || projects[0] || sampleBook;
  const puzzlePairs = useMemo(() => allPuzzles(project), [project]);
  const selectedPair = puzzlePairs.find(({ puzzle }) => puzzle.id === selectedPuzzleId) || puzzlePairs[0];
  const generatedCount = puzzlePairs.filter(({ puzzle }) => puzzle.generated).length;

  const previewPages = useMemo<PreviewPage[]>(() => {
    const tocPages = paginateTableOfContents(buildTableOfContents(project));
    const pages: PreviewPage[] = [];
    const addPage = (page: Omit<PreviewPage, "page">) => pages.push({ ...page, page: pages.length + 1 });
    const addTocPages = (label = "Table of contents") => {
      tocPages.forEach((tocEntries, index) => addPage({ type: "toc", label: tocPages.length > 1 ? `${label} ${index + 1}` : label, tocEntries }));
    };

    if (project.manuscriptFrontMatter?.length) {
      for (const item of project.manuscriptFrontMatter) {
        if (/titlepage/i.test(item.type)) addPage({ type: "title", label: item.title });
        else if (/contents/i.test(item.type)) addTocPages(item.title);
        else addPage({ type: "text", label: item.title, body: item.body, bullets: [...(item.bulletPoints || []), ...(item.sectionList || [])] });
      }
    } else {
      addPage({ type: "title", label: "Title page" });
      addPage({ type: "text", label: "Copyright", body: project.frontMatter.copyright });
      addPage({ type: "text", label: "Welcome", body: project.frontMatter.welcome });
      addPage({ type: "text", label: "How to use this book", body: project.frontMatter.howTo });
      addTocPages();
    }
    for (const section of project.sections) {
      pages.push({ type: "divider", label: section.dividerPage?.headline || section.name, body: section.dividerPage?.body || section.description, section: section.name, page: pages.length + 1 });
      for (const puzzle of section.puzzles) pages.push({ type: "puzzle", label: puzzle.title, section: section.name, puzzle, page: pages.length + 1 });
    }
    const manuscriptBackMatter = project.manuscriptBackMatter || [];
    const answerIntro = manuscriptBackMatter.find((item) => /answerkeyintro/i.test(item.type));
    if (answerIntro) pages.push({ type: "text", label: answerIntro.title, body: answerIntro.body, bullets: answerIntro.bulletPoints, page: pages.length + 1 });
    for (const { section, puzzle } of puzzlePairs) pages.push({ type: "solution", label: `${puzzle.title} — solution`, section: section.name, puzzle, page: pages.length + 1 });
    if (project.manuscriptBackMatter) {
      for (const item of manuscriptBackMatter.filter((page) => page !== answerIntro)) pages.push({ type: "text", label: item.title, body: item.body, bullets: item.bulletPoints, page: pages.length + 1 });
    } else pages.push(
        { type: "text", label: "Thank you", body: project.backMatter.thankYou, page: pages.length + 1 },
        { type: "text", label: "Other books in the series", body: project.backMatter.otherBooks, page: pages.length + 2 },
        { type: "text", label: "Review request", body: project.backMatter.reviewRequest, page: pages.length + 3 },
      );
    return pages;
  }, [project, puzzlePairs]);

  function notify(message: string) { setToast(message); window.setTimeout(() => setToast(""), 2600); }

  function activateProject(id: string, nextView: View = "editor") {
    setActiveId(id); saveActiveProjectId(id); setView(nextView);
  }

  function commit(next: BookProject, message?: string) {
    const normalized = seniorProject({ ...next, updatedAt: new Date().toISOString() });
    const updated = projects.map((item) => item.id === normalized.id ? normalized : item);
    setProjects(updated); saveProjects(updated); if (message) notify(message);
  }

  function updateProject(patch: Partial<BookProject>) { commit({ ...project, ...patch }); }

  function updateSettings(patch: Partial<BookProject["settings"]>) {
    const generationChanged = patch.gridSize !== undefined || patch.directions !== undefined || patch.backwards !== undefined || patch.seed !== undefined;
    const settings = { ...project.settings, ...patch };
    const sections = generationChanged ? project.sections.map((section) => ({
      ...section,
      puzzles: section.puzzles.map((puzzle) => {
        try {
          const generation = puzzleGenerationConfig(puzzle, settings); return { ...puzzle, generated: generatePuzzle(generation.words, generation.options) };
        } catch { return { ...puzzle, generated: undefined }; }
      }),
    })) : project.sections;
    commit({ ...project, sections, settings });
  }

  async function importTemplate(file: File) {
    try {
      const parsed = JSON.parse(await file.text()) as Partial<TemplateStyle>;
      if (!parsed.name || !parsed.id) throw new Error("Template JSON must include id and name.");
      const imported: TemplateStyle = {
        id: parsed.id,
        name: parsed.name,
        description: parsed.description || "Imported custom template",
        accent: parsed.accent || "#273b31",
        paper: parsed.paper || "#fffefa",
        fontFamily: parsed.fontFamily === "sans" ? "sans" : "serif",
        borderStyle: ["line", "double", "ornate", "none"].includes(parsed.borderStyle || "") ? parsed.borderStyle! : "line",
        artwork: typeof parsed.artwork === "string" ? parsed.artwork : undefined,
        artworks: Array.isArray(parsed.artworks) ? parsed.artworks.filter((artwork): artwork is string => typeof artwork === "string") : undefined,
      };
      const customTemplates = [...(project.customTemplates || []).filter((item) => item.id !== imported.id), imported];
      commit({ ...project, customTemplates, templateId: imported.id }, "Template imported and applied");
    } catch (error) { notify(error instanceof Error ? error.message : "Could not import that template"); }
  }

  async function uploadAsset(kind: AssetKind, file: File) {
    try {
      const asset: ProjectAsset = kind === "fullCover"
        ? await prepareFullCoverAsset(file, project.settings.trimSize, combinedPageCount(project), project.settings.paperType || project.settings.interior)
        : kind === "frontCover" || kind === "rearCover"
          ? await prepareCoverAsset(file, project.settings.trimSize)
          : await (async () => {
          const dataUrl = await fileToDataUrl(file);
          const dimensions = file.type.startsWith("image/") ? await imageDimensions(dataUrl) : {};
          return { name: file.name, mimeType: file.type || "application/octet-stream", dataUrl, ...dimensions };
        })();
      const note = asset.processedFor === "kdp-full-cover"
        ? `${file.name} prepared as a one-piece KDP full cover${asset.upscaled ? " (upscaled)" : ""}`
        : asset.processedFor === "kdp-cover-panel"
          ? `${file.name} prepared for KDP 300 DPI${asset.upscaled ? " (upscaled)" : ""}`
        : `${file.name} attached`;
      commit({ ...project, assets: { ...project.assets, [kind]: asset } }, note);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not attach that file");
    }
  }

  async function generateCoverAsset(provider: ImageGenerationProvider, style: string, prompt: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/cover/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project, provider, style, prompt }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Cover generation failed");
      const generationProvider: ImageGenerationProvider = data.provider === "openai" ? "openai" : "gemini";
      const asset = await composeGeneratedFullCoverAsset({
        project,
        artworkDataUrl: data.dataUrl,
        prompt: data.prompt || prompt,
        style,
        provider: generationProvider,
        model: data.model || (generationProvider === "openai" ? "gpt-image-2" : "gemini-3.1-flash-image"),
      });
      commit({ ...project, assets: { ...project.assets, fullCover: asset } }, asset.kdpValid ? "AI cover generated and KDP validated" : "AI cover generated but needs attention");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Cover generation failed");
    } finally {
      setBusy(false);
    }
  }

  function removeAsset(kind: AssetKind) {
    const nextAssets = { ...(project.assets || {}) };
    delete nextAssets[kind];
    if (kind === "frontCover") delete nextAssets.cover;
    commit({ ...project, assets: nextAssets }, "Cover image removed");
  }

  function createProject() {
    const next = clone(sampleBook);
    next.id = crypto.randomUUID(); next.title = "Untitled Word Search Book"; next.subtitle = "A large-print puzzle collection"; next.sections = [];
    next.updatedAt = new Date().toISOString();
    const updated = [next, ...projects]; setProjects(updated); saveProjects(updated); activateProject(next.id, "editor"); notify("New project created");
  }

  function deleteProject(id: string) {
    if (projects.length === 1 || !window.confirm("Delete this project from local storage?")) return;
    const updated = projects.filter((item) => item.id !== id); setProjects(updated); saveProjects(updated); activateProject(updated[0].id, "projects"); notify("Project deleted");
  }

  function editPuzzle(puzzleId: string, patch: Partial<Puzzle>) {
    const sections = project.sections.map((section) => ({ ...section, puzzles: section.puzzles.map((puzzle) => puzzle.id === puzzleId ? { ...puzzle, ...patch, generated: undefined } : puzzle) }));
    commit({ ...project, sections });
  }

  function ensureGenerated(target = project) {
    let failures = 0;
    const sections = target.sections.map((section) => ({ ...section, puzzles: section.puzzles.map((puzzle) => {
      try {
        const generation = puzzleGenerationConfig(puzzle, target.settings); return { ...puzzle, generated: generatePuzzle(generation.words, generation.options) };
      } catch { failures++; return { ...puzzle, generated: undefined }; }
    }) }));
    const next = { ...target, sections }; commit(next);
    if (failures) notify(`${failures} puzzle${failures === 1 ? "" : "s"} need attention`); else notify("All puzzle grids generated");
    return next;
  }

  function navigate(next: View) {
    if ((next === "review" || next === "preview" || next === "export") && generatedCount < puzzlePairs.length && puzzlePairs.length) ensureGenerated();
    setView(next); if (next === "preview") setPreviewIndex(0);
  }

  async function importFile(file: File) {
    try {
      const text = await file.text();
      const result = file.name.toLowerCase().endsWith(".csv") ? undefined : parseProjectJsonWithResult(text, project);
      const imported = seniorProject(result?.project || parseCsvProject(text, project));
      const updated = [imported, ...projects.filter((item) => item.id !== imported.id)];
      setProjects(updated); saveProjects(updated); activateProject(imported.id); setSelectedPuzzleId(imported.sections[0]?.puzzles[0]?.id || ""); notify(result?.summary.warnings.length ? `${file.name} imported with ${result.summary.warnings.length} warning${result.summary.warnings.length === 1 ? "" : "s"}` : `${file.name} imported successfully`);
    } catch (error) { notify(error instanceof Error ? error.message : "Could not import that file"); }
  }

  function exportJson() { downloadBlob(new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }), `${project.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`); }

  async function exportPdf(kind: "interior" | "solutions" | "combined" | "cover") {
    setBusy(true);
    try {
      const ready = kind === "cover" ? project : ensureGenerated();
      const response = await fetch("/api/export/pdf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project: ready, kind }) });
      if (!response.ok) throw new Error(await response.text());
      downloadBlob(await response.blob(), `${project.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${kind}.pdf`); notify("Print-ready PDF exported");
    } catch (error) { notify(error instanceof Error ? error.message : "PDF export failed"); } finally { setBusy(false); }
  }

  const nav = [
    { id: "dashboard" as View, label: "Dashboard", icon: LayoutDashboard },
    { id: "projects" as View, label: "Book projects", icon: BookCopy },
    { id: "editor" as View, label: "Build book", icon: FileText },
    { id: "preview" as View, label: "Preview", icon: BookOpen },
    { id: "export" as View, label: "Export", icon: Download },
  ];
  const activeLabel = nav.find((item) => item.id === view)?.label;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><span /></div><div className="brand-name">PuzzlePress</div></div>
        <div className="sidebar-book"><BookOpen size={14} /><div><span>Current book</span><strong>{project.title}</strong></div></div>
        <div className="nav-label">Workspace</div>
        {nav.map((item) => <NavItem key={item.id} {...item} active={view === item.id} onClick={() => navigate(item.id)} />)}
        <Link className="nav-button" href={`/research/new?bookId=${project.id}`}><Sparkles size={17} strokeWidth={1.8} /><span>Research this book</span></Link>
        <div className="sidebar-footer">Local-first workspace<br /><span>Saved privately in this browser</span></div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="topbar-context">
            <div className="crumb"><span>Workspace</span><ChevronRight size={13} /><strong>{activeLabel}</strong></div>
            <div className="active-book"><BookOpen size={13} /><span>Working on</span><strong>{project.title}</strong></div>
          </div>
          <div className="top-actions">
            <button className="button ghost small" onClick={() => { saveProjects(projects); notify("Saved locally"); }}><Save size={14} /> Save</button>
            <button className="button primary small" onClick={() => navigate("preview")}><BookOpen size={14} /> Preview book</button>
          </div>
        </header>

        {view === "dashboard" && <Dashboard projects={projects} researchProjects={researchProjects} onCreate={createProject} onOpen={activateProject} />}
        {view === "projects" && <Projects projects={projects} onCreate={createProject} onOpen={activateProject} onDelete={deleteProject} />}
        {view === "import" && <ImportView project={project} fileRef={fileRef} onFile={importFile} onUseDemo={() => { const demo = clone(sampleBook); demo.id = crypto.randomUUID(); demo.updatedAt = new Date().toISOString(); const updated = [demo, ...projects]; setProjects(updated); saveProjects(updated); activateProject(demo.id); notify("Demo book added"); }} />}
        {view === "editor" && <Editor project={project} selectedPair={selectedPair} fileRef={fileRef} templateStyles={[...templates, ...(project.customTemplates || [])]} busy={busy} onFile={importFile} onUseDemo={() => { const demo = clone(sampleBook); demo.id = crypto.randomUUID(); demo.updatedAt = new Date().toISOString(); const updated = [demo, ...projects]; setProjects(updated); saveProjects(updated); activateProject(demo.id); notify("Demo book added"); }} onSelect={setSelectedPuzzleId} onUpdate={updateProject} onEditPuzzle={editPuzzle} onGenerate={() => ensureGenerated()} onGenerateCover={generateCoverAsset} onSelectTemplate={(templateId) => { updateProject({ templateId }); notify("Template applied"); }} onExportTemplate={() => { const template = [...templates, ...(project.customTemplates || [])].find((item) => item.id === project.templateId); downloadBlob(new Blob([JSON.stringify(template, null, 2)], { type: "application/json" }), `${template?.id || "template"}.json`); }} onImportTemplate={importTemplate} onAsset={uploadAsset} onRemoveAsset={removeAsset} />}
        {view === "review" && <Review project={project} pairs={puzzlePairs} selectedPair={selectedPair} solution={solutionMode} onSolution={setSolutionMode} onSelect={setSelectedPuzzleId} onGenerate={() => ensureGenerated()} />}
        {view === "templates" && <TemplatesView project={project} templateStyles={[...templates, ...(project.customTemplates || [])]} busy={busy} onGenerateCover={generateCoverAsset} onSelect={(templateId) => { updateProject({ templateId }); notify("Template applied"); }} onExport={() => { const template = [...templates, ...(project.customTemplates || [])].find((item) => item.id === project.templateId); downloadBlob(new Blob([JSON.stringify(template, null, 2)], { type: "application/json" }), `${template?.id || "template"}.json`); }} onImport={importTemplate} onAsset={uploadAsset} onRemoveAsset={removeAsset} />}
        {view === "preview" && <Preview project={project} templateStyles={[...templates, ...(project.customTemplates || [])]} pages={previewPages} index={Math.min(previewIndex, previewPages.length - 1)} onIndex={setPreviewIndex} onSettings={updateSettings} />}
        {view === "export" && <ExportView project={project} generatedCount={generatedCount} total={puzzlePairs.length} busy={busy} onPdf={exportPdf} onJson={exportJson} onCover={(asset) => downloadBlob(dataUrlToBlob(asset.dataUrl), asset.name)} />}
      </main>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function NavItem({ label, icon: Icon, active, onClick }: { label: string; icon: typeof Menu; active: boolean; onClick: () => void }) {
  return <button className={`nav-button ${active ? "active" : ""}`} onClick={onClick}><Icon size={17} strokeWidth={1.8} /><span>{label}</span></button>;
}

function Heading({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1 className="page-title">{title}</h1><p className="page-subtitle">{subtitle}</p></div>{action}</div>;
}

function Dashboard({ projects, researchProjects, onCreate, onOpen }: { projects: BookProject[]; researchProjects: ResearchProject[]; onCreate: () => void; onOpen: (id: string) => void }) {
  const puzzles = projects.reduce((sum, item) => sum + allPuzzles(item).length, 0);
  return <div className="content">
    <Heading eyebrow="Good afternoon" title="Your publishing desk" subtitle="Everything you need to shape the next book in your series." action={<button className="button primary" onClick={onCreate}><Plus size={16} /> New book project</button>} />
    <div className="stats">
      <Stat label="Book projects" value={projects.length} note="Stored locally" />
      <Stat label="Puzzles" value={puzzles} note="Across all books" />
      <Stat label="Print format" value="8.5×11" note="KDP paperback" />
      <Stat label="Research ideas" value={researchProjects.length} note="In the same workflow" />
    </div>
    <div className="workflow-bridge">
      <div><span className="eyebrow">Idea to print</span><strong>Research is now part of the book workflow</strong><p>Start from an existing book or continue a research draft, then return directly to the linked manuscript.</p></div>
      <div className="workflow-bridge-actions"><Link className="button" href="/research">View research projects</Link><Link className="button primary" href="/research/new"><Sparkles size={14} /> Start a new idea</Link></div>
    </div>
    <div className="panel">
      <div className="panel-header"><div><div className="panel-title">Recent projects</div><div className="panel-kicker">Pick up where you left off</div></div><button className="button small" onClick={onCreate}><Plus size={14} /> New project</button></div>
      <div className="panel-body dashboard-project-list"><div className="projects-grid">{projects.map((project, index) => <ProjectCard key={project.id} project={project} index={index} onOpen={() => onOpen(project.id)} />)}</div></div>
    </div>
  </div>;
}

function Stat({ label, value, note }: { label: string; value: string | number; note: string }) { return <div className="stat-card"><div className="stat-label">{label}</div><div className="stat-value">{value}</div><div className="stat-note">{note}</div></div>; }

function ProjectCard({ project, index, onOpen, onDelete }: { project: BookProject; index: number; onOpen: () => void; onDelete?: () => void }) {
  const palettes = [["#e9dfd0", "#654936"], ["#d9e2db", "#344c3e"], ["#e8d9ca", "#74462e"]]; const [bg, fg] = palettes[index % palettes.length];
  const coverImage = project.assets?.cover?.mimeType.startsWith("image/") ? project.assets.cover.dataUrl : undefined;
  return <article className="project-card">
    <button style={{ border: 0, padding: 0, width: "100%", textAlign: "left", color: "inherit" }} onClick={onOpen}>
      <div className={`cover-mini ${coverImage ? "has-cover" : ""}`} style={{ backgroundColor: bg, backgroundImage: coverImage ? `url(${coverImage})` : undefined }}><div className="cover-series">{project.series || "Puzzle collection"}</div><div className="cover-title" style={{ color: fg }}>{project.title}</div><div className="cover-orbit" /></div>
      <div className="project-info"><div className="project-name">{project.title}</div><div className="project-meta"><span className="tag">{project.status}</span><span>{allPuzzles(project).length} puzzles</span><span>•</span><span><Clock3 size={10} style={{ display: "inline" }} /> local</span></div></div>
    </button>
    {onDelete && <div style={{ padding: "0 16px 14px", display: "flex", justifyContent: "flex-end" }}><button className="button ghost small" onClick={onDelete}><Trash2 size={13} /> Delete</button></div>}
  </article>;
}

function Projects({ projects, onCreate, onOpen, onDelete }: { projects: BookProject[]; onCreate: () => void; onOpen: (id: string) => void; onDelete: (id: string) => void }) {
  return <div className="content"><Heading eyebrow="Library" title="Book projects" subtitle="Your locally saved publishing projects." action={<button className="button primary" onClick={onCreate}><Plus size={16} /> New book project</button>} /><div className="projects-grid">{projects.map((project, i) => <ProjectCard key={project.id} project={project} index={i} onOpen={() => onOpen(project.id)} onDelete={() => onDelete(project.id)} />)}</div></div>;
}

function ImportView({ project, fileRef, onFile, onUseDemo }: { project: BookProject; fileRef: React.RefObject<HTMLInputElement | null>; onFile: (file: File) => void; onUseDemo: () => void }) {
  return <div className="content"><Heading eyebrow="Step 1 of 5" title="Bring in your puzzle data" subtitle={`Import content into ${project.title}. CSV and structured JSON are supported.`} />
    <div className="editor-grid">
      <div className="panel"><div className="panel-header"><div><div className="panel-title">Import a file</div><div className="panel-kicker">CSV or PuzzlePress JSON</div></div></div><div className="panel-body">
        <button className="dropzone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) onFile(file); }} onClick={() => fileRef.current?.click()}>
          <span><span className="drop-icon"><Upload size={23} /></span><h3>Drop your manuscript here</h3><p>Choose a .csv or .json file. Nothing leaves your browser until you explicitly export it.</p><span className="button primary"><FolderOpen size={15} /> Choose file</span></span>
        </button>
        <input ref={fileRef} type="file" accept=".csv,.json,application/json,text/csv" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) onFile(file); }} />
      </div></div>
      <div className="panel"><div className="panel-header"><div><div className="panel-title">Expected format</div><div className="panel-kicker">Flexible, human-readable source files</div></div></div><div className="panel-body">
        <div className="export-card"><div className="export-icon"><FileJson size={21} /></div><div className="export-info"><strong>Structured JSON</strong><span>Best for titles, sections, blurbs, and complete project backups.</span></div></div>
        <div className="export-card"><div className="export-icon"><FileText size={21} /></div><div className="export-info"><strong>Simple CSV</strong><span>Use columns: book_title, section, puzzle, blurb, words. Separate words with |.</span></div></div>
        <button className="button" style={{ width: "100%", marginTop: 8 }} onClick={onUseDemo}><Sparkles size={15} /> Start with the 1950s demo book</button>
      </div></div>
    </div>
  </div>;
}

function Editor({ project, selectedPair, fileRef, templateStyles, busy, onFile, onUseDemo, onSelect, onUpdate, onEditPuzzle, onGenerate, onGenerateCover, onSelectTemplate, onExportTemplate, onImportTemplate, onAsset, onRemoveAsset }: { project: BookProject; selectedPair?: ReturnType<typeof allPuzzles>[number]; fileRef: React.RefObject<HTMLInputElement | null>; templateStyles: TemplateStyle[]; busy: boolean; onFile: (file: File) => void; onUseDemo: () => void; onSelect: (id: string) => void; onUpdate: (patch: Partial<BookProject>) => void; onEditPuzzle: (id: string, patch: Partial<Puzzle>) => void; onGenerate: () => void; onGenerateCover: (provider: ImageGenerationProvider, style: string, prompt: string) => void; onSelectTemplate: (id: string) => void; onExportTemplate: () => void; onImportTemplate: (file: File) => void; onAsset: (kind: AssetKind, file: File) => void; onRemoveAsset: (kind: AssetKind) => void }) {
  const issues = selectedPair ? validateWords(selectedPair.puzzle.words, project.settings.gridSize) : [];
  return <div className="content"><Heading eyebrow="Build" title="Build your book" subtitle="Import content, attach files, edit puzzles, and set the interior style from one workspace." action={<button className="button primary" onClick={onGenerate}><WandSparkles size={15} /> Generate all grids</button>} />
    <BuildUploads project={project} fileRef={fileRef} templateStyles={templateStyles} busy={busy} onFile={onFile} onUseDemo={onUseDemo} onGenerateCover={onGenerateCover} onSelectTemplate={onSelectTemplate} onExportTemplate={onExportTemplate} onImportTemplate={onImportTemplate} onAsset={onAsset} onRemoveAsset={onRemoveAsset} />
    <div className="editor-grid">
      <div style={{ display: "grid", gap: 20 }}>
        <div className="panel"><div className="panel-header"><div className="panel-title">Book details</div></div><div className="panel-body"><div className="field-grid">
          <Field label="Book title" full value={project.title} onChange={(title) => onUpdate({ title })} />
          <Field label="Subtitle" full value={project.subtitle} onChange={(subtitle) => onUpdate({ subtitle })} />
          <Field label="Series" value={project.series} onChange={(series) => onUpdate({ series })} />
          <Field label="Author / publisher" value={project.author} onChange={(author) => onUpdate({ author })} />
          <div className="field full"><label htmlFor="book-font">Book font</label><select id="book-font" className="select" value={project.settings.bookFont ?? "template"} onChange={(event) => onUpdate({ settings: { ...project.settings, bookFont: event.target.value as BookProject["settings"]["bookFont"] } })}><option value="template">Use template font</option><option value="serif">Classic Serif</option><option value="sans">Clean Sans</option><option value="typewriter">Typewriter</option></select></div>
        </div></div></div>
        <div className="panel"><div className="panel-header"><div><div className="panel-title">Table of contents</div><div className="panel-kicker">Automatically included in preview and PDF · {project.sections.length} sections · {allPuzzles(project).length} puzzles</div></div><span className="tag"><Check size={11} /> Auto page</span></div><div className="section-list">{project.sections.length ? project.sections.map((section) => <div className="section-row" key={section.id}><div className="section-row-head"><Archive size={14} /><strong>{section.name}</strong><span className="tag">{section.puzzles.length}</span></div>{section.puzzles.map((puzzle) => <div className={`puzzle-row ${selectedPair?.puzzle.id === puzzle.id ? "active" : ""}`} key={puzzle.id}><Grid3X3 size={13} /><button onClick={() => onSelect(puzzle.id)}>{puzzle.title}</button><span>{puzzle.words.length}</span></div>)}</div>) : <div className="empty">Import data to add sections and puzzles.</div>}</div></div>
      </div>
      <div className="panel"><div className="panel-header"><div><div className="panel-title">{selectedPair?.puzzle.title || "Select a puzzle"}</div><div className="panel-kicker">{selectedPair ? selectedPair.section.name : "No puzzle selected"}</div></div>{selectedPair?.puzzle.generated && <span className="tag"><Check size={11} /> Generated</span>}</div>
        {selectedPair && <div className="panel-body">
          <div className="field-grid"><Field label="Puzzle title" full value={selectedPair.puzzle.title} onChange={(title) => onEditPuzzle(selectedPair.puzzle.id, { title })} /><div className="field full"><label htmlFor="puzzle-blurb">Puzzle blurb</label><textarea id="puzzle-blurb" className="textarea" value={selectedPair.puzzle.blurb || ""} onChange={(event) => onEditPuzzle(selectedPair.puzzle.id, { blurb: event.target.value })} /></div></div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "22px 0 10px" }}><div><div className="stat-label">Word list</div><div className="panel-kicker">Display wording stays separate from grid lettering</div></div><button className="button small" disabled={selectedPair.puzzle.words.length >= SENIOR_LARGE_PRINT_PRESET.maxWordsPerPuzzle} onClick={() => onEditPuzzle(selectedPair.puzzle.id, { words: [...selectedPair.puzzle.words, "NEW WORD"].slice(0, SENIOR_LARGE_PRINT_PRESET.maxWordsPerPuzzle) })}><Plus size={13} /> Add word</button></div>
          <div className="word-editor">{selectedPair.puzzle.words.map((word, index) => <div className="word-item" key={`${index}-${word}`}><input className="input" value={word} aria-label={`Word ${index + 1}`} onChange={(event) => { const words = [...selectedPair.puzzle.words]; words[index] = event.target.value; onEditPuzzle(selectedPair.puzzle.id, { words }); }} /><span className="word-normalized" title={normalizeWord(word)}>{normalizeWord(word)}</span><button className="button ghost icon-button small" aria-label={`Delete ${word}`} onClick={() => onEditPuzzle(selectedPair.puzzle.id, { words: selectedPair.puzzle.words.filter((_, i) => i !== index) })}><Trash2 size={13} /></button></div>)}</div>
          {issues.slice(0, 3).map((issue, index) => <div className="issue" key={`${issue.word}-${index}`}>{issue.message}</div>)}
        </div>}
      </div>
    </div>
  </div>;
}

function BuildUploads({ project, fileRef, templateStyles, busy, onFile, onUseDemo, onGenerateCover, onSelectTemplate, onExportTemplate, onImportTemplate, onAsset, onRemoveAsset }: { project: BookProject; fileRef: React.RefObject<HTMLInputElement | null>; templateStyles: TemplateStyle[]; busy: boolean; onFile: (file: File) => void; onUseDemo: () => void; onGenerateCover: (provider: ImageGenerationProvider, style: string, prompt: string) => void; onSelectTemplate: (id: string) => void; onExportTemplate: () => void; onImportTemplate: (file: File) => void; onAsset: (kind: AssetKind, file: File) => void; onRemoveAsset: (kind: AssetKind) => void }) {
  const templateInput = useRef<HTMLInputElement>(null);
  const fullCoverInput = useRef<HTMLInputElement>(null);
  const frontCoverInput = useRef<HTMLInputElement>(null);
  const rearCoverInput = useRef<HTMLInputElement>(null);
  const decorativeInput = useRef<HTMLInputElement>(null);
  const dividerInput = useRef<HTMLInputElement>(null);
  const puzzleInput = useRef<HTMLInputElement>(null);
  const selectedTemplate = templateStyles.find((item) => item.id === project.templateId);
  const fullCover = project.assets?.fullCover;
  const frontCover = project.assets?.frontCover || project.assets?.cover;
  const rearCover = project.assets?.rearCover;
  return <div className="build-stack">
    <div className="build-grid">
      <div className="panel"><div className="panel-header"><div><div className="panel-title">Source files</div><div className="panel-kicker">Start or replace project content</div></div><button className="button small" onClick={onUseDemo}><Sparkles size={14} /> Use demo</button></div><div className="panel-body">
        <button className="dropzone compact" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) onFile(file); }} onClick={() => fileRef.current?.click()}>
          <span><span className="drop-icon"><Upload size={21} /></span><h3>Project or manuscript</h3><p>Drop a CSV, structured manuscript JSON, or PuzzlePress backup.</p><span className="button small"><FolderOpen size={14} /> Choose file</span></span>
        </button>
        <input ref={fileRef} type="file" accept=".csv,.json,application/json,text/csv" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) onFile(file); event.target.value = ""; }} />
      </div></div>
      <div className="panel"><div className="panel-header"><div><div className="panel-title">Uploads</div><div className="panel-kicker">Cover, interior art, and template files</div></div><Palette size={18} /></div><div className="panel-body">
        <CoverGeneratorPanel project={project} busy={busy} onGenerate={onGenerateCover} />
        <div className="upload-drop-grid">
          <UploadDrop icon={Image} title="Full wrap cover" note="One PNG/JPEG with back, spine, and front" asset={fullCover} inputRef={fullCoverInput} onFile={(file) => onAsset("fullCover", file)} onRemove={() => onRemoveAsset("fullCover")} />
          <UploadDrop icon={ImagePlus} title="Front cover" note="PNG or JPEG, 300 DPI" asset={frontCover} inputRef={frontCoverInput} onFile={(file) => onAsset("frontCover", file)} onRemove={() => onRemoveAsset("frontCover")} />
          <UploadDrop icon={BookOpen} title="Back cover" note="PNG or JPEG, 300 DPI" asset={rearCover} inputRef={rearCoverInput} onFile={(file) => onAsset("rearCover", file)} onRemove={() => onRemoveAsset("rearCover")} />
          <UploadDrop icon={Sparkles} title="Title-page art" note="PNG, JPEG, or SVG" asset={project.assets?.decorative} inputRef={decorativeInput} onFile={(file) => onAsset("decorative", file)} accept={IMAGE_ART_ACCEPT} />
          <UploadDrop icon={Image} title="Section art" note="PNG, JPEG, or SVG" asset={project.assets?.divider} inputRef={dividerInput} onFile={(file) => onAsset("divider", file)} accept={IMAGE_ART_ACCEPT} />
          <UploadDrop icon={Grid3X3} title="Puzzle-page art" note="PNG, JPEG, or SVG" asset={project.assets?.puzzle} inputRef={puzzleInput} onFile={(file) => onAsset("puzzle", file)} accept={IMAGE_ART_ACCEPT} />
          <UploadDrop icon={LayoutTemplate} title="Template JSON" note={selectedTemplate?.name || "Import style settings"} inputRef={templateInput} onFile={onImportTemplate} accept=".json,application/json" />
        </div>
        <input ref={fullCoverInput} type="file" accept="image/png,image/jpeg" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) onAsset("fullCover", file); event.target.value = ""; }} />
        <input ref={frontCoverInput} type="file" accept="image/png,image/jpeg" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) onAsset("frontCover", file); event.target.value = ""; }} />
        <input ref={rearCoverInput} type="file" accept="image/png,image/jpeg" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) onAsset("rearCover", file); event.target.value = ""; }} />
        <input ref={decorativeInput} type="file" accept={IMAGE_ART_ACCEPT} hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) onAsset("decorative", file); event.target.value = ""; }} />
        <input ref={dividerInput} type="file" accept={IMAGE_ART_ACCEPT} hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) onAsset("divider", file); event.target.value = ""; }} />
        <input ref={puzzleInput} type="file" accept={IMAGE_ART_ACCEPT} hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) onAsset("puzzle", file); event.target.value = ""; }} />
        <input ref={templateInput} type="file" accept=".json,application/json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) onImportTemplate(file); event.target.value = ""; }} />
      </div></div>
    </div>
    <div className="panel"><div className="panel-header"><div><div className="panel-title">Interior style</div><div className="panel-kicker">Selected: {selectedTemplate?.name || "None"}</div></div><button className="button small" onClick={onExportTemplate}><FileJson size={14} /> Export template</button></div><div className="panel-body"><div className="template-strip">{templateStyles.map((template) => <button className={`template-card compact ${project.templateId === template.id ? "selected" : ""}`} key={template.id} onClick={() => onSelectTemplate(template.id)}><div className="template-thumb" style={{ background: template.paper, color: template.accent }}>{template.artwork && <span className="template-svg" style={{ backgroundImage: `url(${template.artwork})` }} />}<div className="template-page"><div className="template-page-title" style={{ background: template.accent }} /><div className="template-lines" /></div></div><div className="template-name">{template.name}</div>{project.templateId === template.id && <span className="check"><Check size={13} /></span>}</button>)}</div></div></div>
  </div>;
}

function CoverGeneratorPanel({ project, busy, onGenerate }: { project: BookProject; busy: boolean; onGenerate: (provider: ImageGenerationProvider, style: string, prompt: string) => void }) {
  const [provider, setProvider] = useState<ImageGenerationProvider>("gemini");
  const [style, setStyle] = useState("warm nostalgic 1960s illustration, tasteful black-and-white compatible palette, friendly senior audience, clean commercial paperback style");
  const [prompt, setPrompt] = useState(project.description || "Use familiar nostalgic objects from the book themes, with a welcoming front-cover focal area and quiet back-cover texture.");
  const pageCount = combinedPageCount(project);
  const trim = parseCoverTrimSize(project.settings.trimSize);
  const target = fullCoverTargetPixels(trim, pageCount, project.settings.paperType || project.settings.interior);
  return <div className="cover-generator">
    <div className="cover-generator-head"><div><strong>AI full-wrap cover generator</strong><span>Choose Gemini or OpenAI artwork; PuzzlePress adds KDP-safe text, barcode clearance, bleed, and validation.</span></div><span className="tag">{target.width} x {target.height}px</span></div>
    <div className="cover-generator-grid">
      <label><span>Image model</span><select className="select" value={provider} onChange={(event) => setProvider(event.target.value as ImageGenerationProvider)}>
        <option value="gemini">Gemini / Nano Banana</option>
        <option value="openai">OpenAI / ChatGPT image model</option>
      </select><small>{provider === "openai" ? "Uses OPENAI_API_KEY and gpt-image-2." : "Uses GEMINI_API_KEY or GOOGLE_API_KEY and Gemini image generation."}</small></label>
      <label><span>Style</span><select className="select" value={style} onChange={(event) => setStyle(event.target.value)}>
        <option value="warm nostalgic 1960s illustration, tasteful black-and-white compatible palette, friendly senior audience, clean commercial paperback style">Warm nostalgia</option>
        <option value="mid-century collage of household objects and memory cues, soft paper texture, high contrast, uncluttered paperback composition">Mid-century collage</option>
        <option value="classic bookstore paperback cover, elegant illustrated objects, calm high-contrast background, polished matte finish look">Classic paperback</option>
        <option value="minimal vintage pattern, large clear focal area, refined monochrome-friendly illustration, senior-friendly mood">Minimal vintage</option>
      </select></label>
      <label><span>Tweaks</span><textarea className="textarea compact" value={prompt} onChange={(event) => setPrompt(event.target.value)} /></label>
    </div>
    <button className="button primary" disabled={busy || !project.title} onClick={() => onGenerate(provider, style, prompt)}><WandSparkles size={15} /> {busy ? "Generating cover" : "Generate KDP cover"}</button>
  </div>;
}

function UploadDrop({ icon: Icon, title, note, asset, inputRef, onFile, onRemove }: { icon: typeof Upload; title: string; note: string; asset?: ProjectAsset; inputRef: React.RefObject<HTMLInputElement | null>; onFile: (file: File) => void; accept?: string; onRemove?: () => void }) {
  const imagePreview = asset?.mimeType.startsWith("image/") ? asset.dataUrl : undefined;
  const assetNote = coverAssetSummary(asset) || asset?.name || note;
  const coverStatus = coverAssetStatus(asset);
  const readyLabel = asset?.processedFor === "kdp-full-cover"
    ? coverStatus.valid ? "Full cover valid" : "Full cover not valid"
    : asset?.processedFor === "kdp-cover-panel"
      ? coverStatus.valid ? "KDP cover valid" : "Cover not valid"
      : asset ? "Replace" : "Drop or choose";
  return <div className={`upload-drop ${asset ? "attached" : ""} ${coverStatus.kind}`} role="button" tabIndex={0} onClick={() => inputRef.current?.click()} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); inputRef.current?.click(); } }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) onFile(file); }}>
    {asset && onRemove && <button className="asset-remove" type="button" aria-label={`Remove ${title}`} title={`Remove ${title}`} onClick={(event) => { event.stopPropagation(); onRemove(); }}><Trash2 size={13} /></button>}
    <span className="upload-drop-preview" style={imagePreview ? { backgroundImage: `url(${imagePreview})` } : undefined}>{!imagePreview && <Icon size={20} strokeWidth={1.7} />}{asset && <span className="art-check">{coverStatus.valid ? <Check size={11} /> : <CircleAlert size={11} />}</span>}</span>
    <span className="upload-drop-copy"><strong>{title}</strong><small>{assetNote}</small><em>{readyLabel}</em>{coverStatus.details.length ? <span className="asset-details">{coverStatus.details.map((item, index) => <span key={`${item}-${index}`}>{item}</span>)}</span> : null}</span>
  </div>;
}

function Field({ label, value, onChange, full = false }: { label: string; value: string; onChange: (value: string) => void; full?: boolean }) { const id = useId(); return <div className={`field ${full ? "full" : ""}`}><label htmlFor={id}>{label}</label><input id={id} className="input" value={value} onChange={(event) => onChange(event.target.value)} /></div>; }

function Review({ project, pairs, selectedPair, solution, onSolution, onSelect, onGenerate }: { project: BookProject; pairs: ReturnType<typeof allPuzzles>; selectedPair?: ReturnType<typeof allPuzzles>[number]; solution: boolean; onSolution: (value: boolean) => void; onSelect: (id: string) => void; onGenerate: () => void }) {
  const issues = pairs.flatMap(({ puzzle }) => validateWords(puzzle.words, project.settings.gridSize));
  return <div className="content"><Heading eyebrow="Step 3 of 5" title="Review every puzzle" subtitle="Inspect generated grids and catch manuscript issues before layout." action={<div style={{ display: "flex", gap: 8 }}><button className={`button ${!solution ? "dark" : ""}`} onClick={() => onSolution(false)}>Puzzle</button><button className={`button ${solution ? "dark" : ""}`} onClick={() => onSolution(true)}>Solution</button></div>} />
    {(project.reviewChecklist?.length || project.importWarnings?.length) ? <div className="panel manuscript-review"><div className="panel-header"><div><div className="panel-title">Production manuscript review</div><div className="panel-kicker">Imported checklist and validation notices</div></div></div><div className="panel-body manuscript-review-grid"><div><strong>Checklist</strong>{project.reviewChecklist?.length ? project.reviewChecklist.map((item, index) => <label key={`${item}-${index}`}><input type="checkbox" /> {item}</label>) : <span>No checklist supplied.</span>}</div><div><strong>Import notices</strong>{project.importWarnings?.length ? project.importWarnings.map((warning, index) => <span key={`${warning.code}-${index}`}>{warning.path}: {warning.message}</span>) : <span>No import warnings.</span>}</div></div></div> : null}
    <div className="review-layout">
      <div className="panel"><div className="panel-header"><div><div className="panel-title">Puzzles</div><div className="panel-kicker">{pairs.length - issues.filter((issue) => issue.severity === "error").length} ready · {issues.length} notices</div></div><button className="button icon-button small" onClick={onGenerate} aria-label="Regenerate puzzles"><RefreshCw size={14} /></button></div><div className="review-list">{pairs.map(({ section, puzzle }, index) => <button className={`review-item ${puzzle.id === selectedPair?.puzzle.id ? "active" : ""}`} onClick={() => onSelect(puzzle.id)} key={puzzle.id}><span className="review-number">{String(index + 1).padStart(2, "0")}</span><span><span className="review-item-title">{puzzle.title}</span><span className="review-item-meta">{section.name} · {puzzle.words.length} words</span></span></button>)}</div></div>
      <div className="panel"><div className="panel-header"><div><div className="panel-title">{selectedPair?.puzzle.title || "No puzzle"}</div><div className="panel-kicker">{selectedPair?.puzzle.generated?.size || project.settings.gridSize}×{selectedPair?.puzzle.generated?.size || project.settings.gridSize} · {solution ? "answer key" : "player view"}</div></div><span className="tag">{selectedPair?.puzzle.generated ? "All words placed" : "Needs generation"}</span></div><div className="panel-body">{selectedPair?.puzzle.generated ? <PuzzleGrid puzzle={selectedPair.puzzle.generated} solution={solution} /> : <div className="empty"><CircleAlert size={24} /><p>Could not generate this puzzle with the current settings.</p><button className="button" onClick={onGenerate}>Try again</button></div>}</div></div>
    </div>
  </div>;
}

function TemplatesView({ project, templateStyles, busy, onGenerateCover, onSelect, onExport, onImport, onAsset, onRemoveAsset }: { project: BookProject; templateStyles: TemplateStyle[]; busy: boolean; onGenerateCover: (provider: ImageGenerationProvider, style: string, prompt: string) => void; onSelect: (id: string) => void; onExport: () => void; onImport: (file: File) => void; onAsset: (kind: AssetKind, file: File) => void; onRemoveAsset: (kind: AssetKind) => void }) {
  const templateInput = useRef<HTMLInputElement>(null);
  const decorativeInput = useRef<HTMLInputElement>(null);
  const dividerInput = useRef<HTMLInputElement>(null);
  const puzzleInput = useRef<HTMLInputElement>(null);
  const fullCoverInput = useRef<HTMLInputElement>(null);
  const frontCoverInput = useRef<HTMLInputElement>(null);
  const rearCoverInput = useRef<HTMLInputElement>(null);
  const selectedTemplate = templateStyles.find((item) => item.id === project.templateId);
  const fullCover = project.assets?.fullCover;
  const frontCover = project.assets?.frontCover || project.assets?.cover;
  const rearCover = project.assets?.rearCover;
  return <div className="content"><Heading eyebrow="Step 4 of 5" title="Style and artwork" subtitle={`Designing ${project.title}. Choose an interior, then attach the art that belongs to this book.`} action={<button className="button" onClick={onExport}><FileJson size={15} /> Export selected template</button>} />
    <div className="editor-grid template-editor"><div className="panel"><div className="panel-header"><div><div className="panel-title">Interior template</div><div className="panel-kicker">Selected: {selectedTemplate?.name || "None"}</div></div><button className="button small" onClick={() => templateInput.current?.click()}><Upload size={14} /> Import template</button></div><div className="panel-body"><div className="template-grid">{templateStyles.map((template) => <button className={`template-card ${project.templateId === template.id ? "selected" : ""}`} key={template.id} onClick={() => onSelect(template.id)}><div className="template-thumb" style={{ background: template.paper, color: template.accent }}>{template.artwork && <span className="template-svg" style={{ backgroundImage: `url(${template.artwork})` }} />}<div className="template-page"><div className="template-page-title" style={{ background: template.accent }} /><div className="template-lines" /></div></div><div className="template-name">{template.name}</div><div className="template-desc">{template.description}</div>{project.templateId === template.id && <span className="check"><Check size={13} /></span>}</button>)}</div></div></div>
      <div className="panel artwork-panel"><div className="panel-header"><div><div className="panel-title">Book artwork</div><div className="panel-kicker">Files stay attached to this book project</div></div><Palette size={18} /></div><div className="panel-body">
        <div className="art-help"><strong>Build the visual package</strong><span>Upload either one full-wrap cover or separate back/front panels for the KDP cover PDF, then optional title-page and section art.</span></div>
        <CoverGeneratorPanel project={project} busy={busy} onGenerate={onGenerateCover} />
        <div className="art-grid">
          <ArtCard icon={Image} title="Full wrap cover" note="One 300 DPI PNG/JPEG with back, spine, and front" asset={fullCover} onClick={() => fullCoverInput.current?.click()} onRemove={() => onRemoveAsset("fullCover")} featured />
          <ArtCard icon={BookOpen} title="Rear cover" note="300 DPI PNG or JPEG back cover" asset={rearCover} onClick={() => rearCoverInput.current?.click()} onRemove={() => onRemoveAsset("rearCover")} featured />
          <ArtCard icon={ImagePlus} title="Front cover" note="300 DPI PNG or JPEG front cover" asset={frontCover} onClick={() => frontCoverInput.current?.click()} onRemove={() => onRemoveAsset("frontCover")} featured />
          <ArtCard icon={Sparkles} title="Title-page art" note="PNG, JPEG, or SVG decoration" asset={project.assets?.decorative} onClick={() => decorativeInput.current?.click()} />
          <ArtCard icon={Image} title="Section art" note="PNG, JPEG, or SVG divider image" asset={project.assets?.divider} onClick={() => dividerInput.current?.click()} />
          <ArtCard icon={Grid3X3} title="Puzzle-page art" note="Subtle PNG, JPEG, or SVG page accent" asset={project.assets?.puzzle} onClick={() => puzzleInput.current?.click()} />
        </div>
        <input ref={templateInput} type="file" accept=".json,application/json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) onImport(file); event.target.value = ""; }} />
        <input ref={decorativeInput} type="file" accept={IMAGE_ART_ACCEPT} hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) onAsset("decorative", file); event.target.value = ""; }} />
        <input ref={dividerInput} type="file" accept={IMAGE_ART_ACCEPT} hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) onAsset("divider", file); event.target.value = ""; }} />
        <input ref={puzzleInput} type="file" accept={IMAGE_ART_ACCEPT} hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) onAsset("puzzle", file); event.target.value = ""; }} />
        <input ref={fullCoverInput} type="file" accept="image/png,image/jpeg" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) onAsset("fullCover", file); event.target.value = ""; }} />
        <input ref={rearCoverInput} type="file" accept="image/png,image/jpeg" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) onAsset("rearCover", file); event.target.value = ""; }} />
        <input ref={frontCoverInput} type="file" accept="image/png,image/jpeg" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) onAsset("frontCover", file); event.target.value = ""; }} />
        <div className="art-tip"><CheckCircle2 size={15} /><span>Artwork is included in project JSON backups. Cover export uses the full-wrap image when present, or combines rear cover, calculated spine, and front cover.</span></div>
      </div></div>
    </div>
  </div>;
}

function ArtCard({ icon: Icon, title, note, asset, onClick, onRemove, featured = false }: { icon: typeof Upload; title: string; note: string; asset?: ProjectAsset; onClick: () => void; onRemove?: () => void; featured?: boolean }) {
  const imagePreview = asset?.mimeType.startsWith("image/") ? asset.dataUrl : undefined;
  const assetNote = coverAssetSummary(asset) || asset?.name || note;
  const coverStatus = coverAssetStatus(asset);
  const readyLabel = asset?.processedFor === "kdp-full-cover"
    ? coverStatus.valid ? "Full cover valid" : "Full cover not valid"
    : asset?.processedFor === "kdp-cover-panel"
      ? coverStatus.valid ? "KDP cover valid" : "Cover not valid"
      : asset ? "Click to replace" : "+ Add file";
  return <div className={`art-card ${featured ? "featured" : ""} ${asset ? "attached" : ""} ${coverStatus.kind}`} role="button" tabIndex={0} onClick={onClick} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onClick(); } }}>
    {asset && onRemove && <button className="asset-remove" type="button" aria-label={`Remove ${title}`} title={`Remove ${title}`} onClick={(event) => { event.stopPropagation(); onRemove(); }}><Trash2 size={13} /></button>}
    <span className="art-preview" style={imagePreview ? { backgroundImage: `url(${imagePreview})` } : undefined}>{!imagePreview && <Icon size={featured ? 28 : 22} strokeWidth={1.5} />}{asset && <span className="art-check">{coverStatus.valid ? <Check size={11} /> : <CircleAlert size={11} />}</span>}</span>
    <span className="art-copy"><strong>{title}</strong><small>{assetNote}</small><em>{readyLabel}</em>{coverStatus.details.length ? <span className="asset-details">{coverStatus.details.map((item, index) => <span key={`${item}-${index}`}>{item}</span>)}</span> : null}</span>
  </div>;
}

function Preview({ project, templateStyles, pages, index, onIndex, onSettings }: { project: BookProject; templateStyles: TemplateStyle[]; pages: PreviewPage[]; index: number; onIndex: (index: number) => void; onSettings: (settings: Partial<BookProject["settings"]>) => void }) {
  const page = pages[index]; const template = templateStyles.find((item) => item.id === project.templateId) || templates[0];
  return <div className="content" style={{ maxWidth: "none" }}><Heading eyebrow="Step 5 of 5" title="Preview the finished book" subtitle={`${pages.length} generated pages · 8.5 × 11 in · ${project.settings.bleed ? "bleed" : "no bleed"}`} action={<div style={{ display: "flex", gap: 7 }}><button className="button" disabled={index <= 0} onClick={() => onIndex(index - 1)}>Previous</button><button className="button" disabled={index >= pages.length - 1} onClick={() => onIndex(index + 1)}>Next</button></div>} />
    <div className="preview-workspace">
      <div className="thumbnail-list">{pages.map((item, itemIndex) => <button className={`page-thumb ${itemIndex === index ? "active" : ""}`} key={`${item.type}-${itemIndex}`} onClick={() => onIndex(itemIndex)}><div className="page-thumb-sheet"><span>{item.type === "puzzle" ? <Grid3X3 size={24} strokeWidth={1} /> : item.type === "solution" ? <CheckCircle2 size={22} strokeWidth={1} /> : item.label}</span></div><div className="page-thumb-label">{item.page}. {item.label}</div></button>)}</div>
      <div className="page-stage"><BookPage project={project} page={page} template={template} /></div>
      <div className="panel preview-settings"><div className="panel-header"><div><div className="panel-title">Page settings</div><div className="panel-kicker">Live print preview</div></div><SlidersHorizontal size={17} /></div><div className="panel-body"><div className="settings-list">
        <div className="setting-row"><label>Grid size</label><select className="select" value={project.settings.gridSize} onChange={(event) => onSettings({ gridSize: Number(event.target.value) as GridSize })}><option value="16">16 x 16 senior preset</option><option value="17">17 x 17 maximum</option></select></div>
        <div className="setting-row"><label>Word-list layout</label><select className="select" value={project.settings.wordColumns === undefined || Number(project.settings.wordColumns) === 1 ? "auto" : project.settings.wordColumns} onChange={(event) => onSettings({ wordColumns: event.target.value === "auto" ? "auto" : Number(event.target.value) as 2 | 3 | 4 })}><option value="2">2 columns preferred</option><option value="3">3 columns when needed</option><option value="4">4 columns for long lists</option><option value="auto">Auto-fit</option></select></div>
        <div className="setting-row"><label>Book font</label><select className="select" value={project.settings.bookFont ?? "template"} onChange={(event) => onSettings({ bookFont: event.target.value as BookProject["settings"]["bookFont"] })}><option value="template">Use template font</option><option value="serif">Classic Serif</option><option value="sans">Clean Sans</option><option value="typewriter">Typewriter</option></select></div>
        <div className="toggle-row"><span>Large-print mode</span><button className={`toggle ${project.settings.largePrint ? "on" : ""}`} aria-label="Toggle large-print mode" onClick={() => onSettings({ largePrint: !project.settings.largePrint })} /></div>
        <div className="toggle-row"><span>Forward-only words</span><button className="toggle on" aria-label="Forward-only words locked on" onClick={() => onSettings({ backwards: false })} /></div>
        <div className="toggle-row"><span>Full bleed</span><button className={`toggle ${project.settings.bleed ? "on" : ""}`} aria-label="Toggle bleed" onClick={() => onSettings({ bleed: !project.settings.bleed })} /></div>
        <div className="setting-row"><label>Allowed directions</label>{(["horizontal", "vertical", "diagonal"] as const).map((direction) => <label className="check-row" key={direction}><input type="checkbox" checked={project.settings.directions.includes(direction)} onChange={() => { const directions = project.settings.directions.includes(direction) ? project.settings.directions.filter((item) => item !== direction) : [...project.settings.directions, direction]; if (directions.length) onSettings({ directions }); }} /> <span>{direction[0].toUpperCase() + direction.slice(1)}</span></label>)}</div>
        <div className="setting-row"><label>Deterministic seed</label><input className="input" value={project.settings.seed} onChange={(event) => onSettings({ seed: event.target.value })} /></div>
        <div className="setting-row"><label>Print-safe margins (inches)</label><div className="margin-grid">{(["top", "bottom", "inside", "outside"] as const).map((side) => <label key={side}><span>{side}</span><input className="input" type="number" min="0.5" max="1" step="0.05" value={Math.min(1, Math.max(.5, project.settings.margins[side]))} onChange={(event) => onSettings({ margins: { ...project.settings.margins, [side]: Math.min(1, Math.max(.5, Number(event.target.value))) } })} /></label>)}</div></div>
        <div className="issue"><strong>Odd/even aware.</strong> Inside gutter swaps automatically on facing pages during PDF export.</div>
      </div></div></div>
    </div>
  </div>;
}

function BookPage({ project, page, template }: { project: BookProject; page: PreviewPage; template: (typeof templates)[number] }) {
  const odd = page.page % 2 === 1;
  const margins = project.settings.margins;
  const leftMargin = odd ? margins.inside : margins.outside;
  const rightMargin = odd ? margins.outside : margins.inside;
  const marginPercent = (inches: number) => `${Math.min(1, Math.max(.5, inches)) / 8.5 * 100}%`;
  const style = { "--book-accent": template.accent, "--book-paper": template.paper, "--page-margin-top": marginPercent(margins.top), "--page-margin-bottom": marginPercent(margins.bottom), "--page-margin-left": marginPercent(leftMargin), "--page-margin-right": marginPercent(rightMargin) } as React.CSSProperties;
  const border = template.borderStyle !== "none" ? <div className={`book-page-border ${template.borderStyle}`} /> : null;
  const templateIcons = template.artworks?.length ? template.artworks : template.artwork ? [template.artwork] : [];
  const templateArt = templateIconDecorations(templateIcons, page.page, page.type).map((decoration, index) => (
    <div
      className="book-template-art"
      key={`${decoration.icon}-${index}`}
      style={{ backgroundImage: `url(${decoration.icon})`, left: decoration.left, top: decoration.top, width: decoration.size, opacity: decoration.opacity }}
    />
  ));
  const selectedFont = project.settings.bookFont ?? "template";
  const resolvedFont = selectedFont === "template" ? template.fontFamily : selectedFont;
  const previewWords = seniorPuzzleWords(page.puzzle || { words: [] });
  const wordColumns = resolveWordColumns(previewWords.length, project.settings.wordColumns);
  const wordColumnGap = wordColumns === 2 ? "34px" : wordColumns === 3 ? "26px" : "20px";
  const pageClass = `book-page font-${resolvedFont} ${project.settings.largePrint ? "large-print" : ""}`;
  if (!page) return <div className="book-page" />;
  if (page.type === "title") return <div className={pageClass} style={{ ...style, backgroundImage: project.assets?.decorative ? `linear-gradient(rgba(255,255,255,.86),rgba(255,255,255,.86)),url(${project.assets.decorative.dataUrl})` : undefined, backgroundSize: "cover" }}>{border}{templateArt}<div style={{ margin: "auto", textAlign: "center", maxWidth: "85%", position: "relative", zIndex: 1 }}><div className="book-section">{project.series}</div><h2 className="serif" style={{ fontSize: "clamp(35px, 6vw, 68px)", lineHeight: .92, margin: "20px 0" }}>{project.title}</h2><hr className="book-rule" /><p style={{ fontSize: "clamp(11px, 1.5vw, 18px)" }}>{project.subtitle}</p><p style={{ marginTop: 55, font: "600 10px var(--font-sans)" }}>{project.author}</p></div><span className="page-number">{page.page}</span></div>;
  if (page.type === "text") return <div className={pageClass} style={style}>{border}{templateArt}<div className="text-page-content"><h2 className="serif">{page.label}</h2><hr className="book-rule" /><p>{page.body}</p>{page.bullets?.length ? <ul className="manuscript-bullets">{page.bullets.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : null}</div><span className="page-number">{page.page}</span></div>;
  if (page.type === "toc") return <div className={pageClass} style={style}>{border}{templateArt}<div className="toc-page"><div className="book-section">Inside this book</div><h2 className="serif">{page.label.replace(/\s+\d+$/, "")}</h2><hr className="book-rule" />{page.tocEntries && page.tocEntries.length < buildTableOfContents(project).length ? <div className="toc-page-part">Page {page.label.match(/\d+$/)?.[0] || 1}</div> : null}<div className="toc-list">{(page.tocEntries || buildTableOfContents(project)).map((entry) => <div className={`toc-entry ${entry.level}`} key={`${entry.label}-${entry.page}`}><span>{entry.label}</span><i /><b>{entry.page}</b></div>)}</div></div><span className="page-number">{page.page}</span></div>;
  if (page.type === "divider") return <div className={pageClass} style={{ ...style, backgroundImage: project.assets?.divider ? `linear-gradient(rgba(255,255,255,.82),rgba(255,255,255,.82)),url(${project.assets.divider.dataUrl})` : undefined, backgroundSize: "cover" }}>{border}{templateArt}<div style={{ margin: "auto", textAlign: "center", position: "relative", zIndex: 1 }}><div className="book-section">Section</div><h2 className="serif" style={{ fontSize: "clamp(38px, 6vw, 72px)", margin: "14px 0" }}>{page.label}</h2><hr className="book-rule" /><p style={{ fontStyle: "italic", fontSize: "clamp(10px, 1.3vw, 16px)" }}>{page.body}</p></div><span className="page-number">{page.page}</span></div>;
  let generated = page.puzzle?.generated;
  if (!generated && page.puzzle?.words.length) {
    try {
      const generation = puzzleGenerationConfig(page.puzzle, project.settings); generated = generatePuzzle(generation.words, generation.options);
    } catch { generated = undefined; }
  }
  return <div className={pageClass} style={{ ...style, backgroundImage: page.type === "puzzle" && project.assets?.puzzle ? `linear-gradient(rgba(255,255,255,.92),rgba(255,255,255,.92)),url(${project.assets.puzzle.dataUrl})` : undefined, backgroundSize: "cover" }}>{border}{templateArt}<div className="book-page-head"><div className="book-section">{page.type === "solution" ? "Solution" : page.section}</div><h2 className="book-title serif">{page.puzzle?.title}</h2></div>{page.type === "puzzle" && <div className="book-words" style={{ gridTemplateColumns: `repeat(${wordColumns}, minmax(0, 1fr))`, "--word-column-gap": wordColumnGap } as React.CSSProperties}>{previewWords.map((word, wordIndex) => <div key={`${word}-${wordIndex}`}>{word}</div>)}</div>}{generated ? <PuzzleGrid puzzle={generated} solution={page.type === "solution"} className="book-grid" /> : <div className="empty">Grid not generated</div>}{page.puzzle?.blurb && page.type === "puzzle" && <div className="book-blurb">{page.puzzle.blurb}</div>}<span className="page-number">{page.page}</span></div>;
}

function coverDpi(asset: ProjectAsset | undefined, trim: { width: number; height: number }) {
  return effectiveCoverDpi(asset?.width, asset?.height, trim);
}

function kdpCoverImageReady(asset?: ProjectAsset) {
  return (asset?.mimeType === "image/png" || asset?.mimeType === "image/jpeg") && asset.processedFor === "kdp-cover-panel" && asset.width === asset.targetWidth && asset.height === asset.targetHeight && (asset.kdpValid ?? !asset.upscaled);
}

function kdpFullCoverReady(asset?: ProjectAsset) {
  return (asset?.mimeType === "image/png" || asset?.mimeType === "image/jpeg") && asset.processedFor === "kdp-full-cover" && asset.width === asset.targetWidth && asset.height === asset.targetHeight && (asset.kdpValid ?? !asset.upscaled);
}

function ExportView({ project, generatedCount, total, busy, onPdf, onJson, onCover }: { project: BookProject; generatedCount: number; total: number; busy: boolean; onPdf: (kind: "interior" | "solutions" | "combined" | "cover") => void; onJson: () => void; onCover: (asset: ProjectAsset) => void }) {
  const issues = allPuzzles(project).flatMap(({ puzzle }) => validateWords(puzzle.words, project.settings.gridSize)); const errors = issues.filter((item) => item.severity === "error");
  const trim = parseCoverTrimSize(project.settings.trimSize);
  const fullCover = project.assets?.fullCover;
  const frontCover = project.assets?.frontCover || project.assets?.cover;
  const rearCover = project.assets?.rearCover;
  const frontDpi = coverDpi(frontCover, trim);
  const rearDpi = coverDpi(rearCover, trim);
  const frontOriginalDpi = effectiveCoverDpi(frontCover?.originalWidth || frontCover?.width, frontCover?.originalHeight || frontCover?.height, trim);
  const rearOriginalDpi = effectiveCoverDpi(rearCover?.originalWidth || rearCover?.width, rearCover?.originalHeight || rearCover?.height, trim);
  const fullCoverReady = Boolean(kdpFullCoverReady(fullCover) && !fullCover?.upscaled);
  const panelCoversReady = Boolean(kdpCoverImageReady(frontCover) && kdpCoverImageReady(rearCover) && !frontCover?.upscaled && !rearCover?.upscaled);
  const coversReady = Boolean(fullCoverReady || panelCoversReady);
  return <div className="content"><Heading eyebrow="Ready for press" title="Export your book" subtitle="Create print-ready files and keep a portable project backup." />
    <div className="export-grid"><div className="panel"><div className="panel-header"><div><div className="panel-title">Publishing files</div><div className="panel-kicker">Generated locally and on this app’s PDF endpoint</div></div></div><div className="panel-body">
      <ExportCard icon={ImagePlus} title="KDP full-cover PDF" note={fullCoverReady ? "Uses uploaded full-wrap cover image" : "Uses rear cover, calculated spine, front cover, and bleed"} action="Export PDF" disabled={busy || !coversReady} onClick={() => onPdf("cover")} />
      <ExportCard icon={BookOpen} title="Combined interior PDF" note="Front matter, dividers, puzzles, and answer key" action="Export PDF" disabled={busy || !!errors.length} onClick={() => onPdf("combined")} />
      <ExportCard icon={Grid3X3} title="Puzzle interior PDF" note="Book pages without the answer key" action="Export PDF" disabled={busy || !!errors.length} onClick={() => onPdf("interior")} />
      <ExportCard icon={CheckCircle2} title="Solutions PDF" note="Compact answer-key pages only" action="Export PDF" disabled={busy || !!errors.length} onClick={() => onPdf("solutions")} />
      <ExportCard icon={FileJson} title="Project backup" note="Portable JSON with settings, content, and grids" action="Export JSON" disabled={false} onClick={onJson} />
      <ExportCard icon={Image} title="Prepared full wrap cover" note={fullCover?.name || "Attach a full wrap cover in Style and artwork"} action={fullCover ? "Download" : "Needs file"} disabled={!fullCover} onClick={() => { if (fullCover) onCover(fullCover); }} />
      <ExportCard icon={ImagePlus} title="Prepared front cover panel" note={frontCover?.name || "Attach a front cover image in Style and artwork"} action={frontCover ? "Download" : "Needs file"} disabled={!frontCover} onClick={() => { if (frontCover) onCover(frontCover); }} />
      <ExportCard icon={Image} title="Prepared rear cover panel" note={rearCover?.name || "Attach a rear cover image in Style and artwork"} action={rearCover ? "Download" : "Needs file"} disabled={!rearCover} onClick={() => { if (rearCover) onCover(rearCover); }} />
    </div></div>
    <div style={{ display: "grid", gap: 20 }}><div className="panel"><div className="panel-header"><div><div className="panel-title">Preflight check</div><div className="panel-kicker">KDP paperback readiness</div></div></div><div className="panel-body preflight">
      <Preflight ok={generatedCount === total} text={`${generatedCount} of ${total} puzzle grids generated`} />
      <Preflight ok={!errors.length} text={errors.length ? `${errors.length} blocking word-list issues` : "All words fit the selected grid size"} />
      <Preflight ok={coversReady} text={fullCoverReady ? `Full wrap cover prepared at ${fullCover?.width || "?"} x ${fullCover?.height || "?"} pixels` : panelCoversReady ? "Separate front and rear cover panels are ready" : "Upload either a full wrap cover, or both front and back cover panels"} />
      <Preflight ok={fullCoverReady || kdpCoverImageReady(frontCover)} text={fullCoverReady ? "Front panel is included in the full wrap cover" : frontCover ? `Front cover prepared at ${frontCover.width || "?"} x ${frontCover.height || "?"} pixels${frontDpi ? ` (${Math.floor(frontDpi)} DPI panel)` : ""}` : "Front cover image required when no full wrap is uploaded"} />
      <Preflight ok={fullCoverReady || kdpCoverImageReady(rearCover)} text={fullCoverReady ? "Rear panel and spine are included in the full wrap cover" : rearCover ? `Rear cover prepared at ${rearCover.width || "?"} x ${rearCover.height || "?"} pixels${rearDpi ? ` (${Math.floor(rearDpi)} DPI panel)` : ""}` : "Rear cover image required when no full wrap is uploaded"} />
      <Preflight ok={!fullCover?.upscaled} text={fullCover?.upscaled ? "Full wrap cover source was upscaled; upload higher-resolution source art" : fullCover ? "Full wrap cover source did not require upscaling" : "Full wrap source quality will be checked after upload"} />
      <Preflight ok={!frontCover?.upscaled} text={frontCover?.upscaled ? `Front cover source was about ${Math.floor(frontOriginalDpi || 0)} DPI before processing; app upscaled it to the KDP panel size` : frontCover ? "Front cover source did not require upscaling" : "Front cover source quality will be checked after upload"} />
      <Preflight ok={!rearCover?.upscaled} text={rearCover?.upscaled ? `Rear cover source was about ${Math.floor(rearOriginalDpi || 0)} DPI before processing; app upscaled it to the KDP panel size` : rearCover ? "Rear cover source did not require upscaling" : "Rear cover source quality will be checked after upload"} />
      <Preflight ok text={`${trim.width} × ${trim.height} inch interior page size`} />
      <Preflight ok text="Cover PDF uses KDP full-cover layout with 0.125 inch bleed and calculated spine" />
      <Preflight ok text="Black-and-white print-safe interior" />
    </div></div><div className="panel"><div className="panel-body"><div className="stat-label">Estimated book</div><div className="stat-value">{combinedPageCount(project)}</div><div className="stat-note">pages including contents and answer key</div></div></div></div>
    </div>
  </div>;
}

function ExportCard({ icon: Icon, title, note, action, disabled, onClick }: { icon: typeof BookOpen; title: string; note: string; action: string; disabled: boolean; onClick: () => void }) { return <div className="export-card"><div className="export-icon"><Icon size={21} /></div><div className="export-info"><strong>{title}</strong><span>{note}</span></div><button className="button small" disabled={disabled} onClick={onClick}><Download size={13} /> {action}</button></div>; }
function Preflight({ ok, text }: { ok: boolean; text: string }) { return <div className={`preflight-row ${ok ? "success" : "warning"}`}>{ok ? <CheckCircle2 size={15} /> : <CircleAlert size={15} />}<span>{text}</span></div>; }
