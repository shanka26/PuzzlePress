import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { PDFDocument, StandardFonts, degrees, grayscale, rgb, type Color, type PDFImage, type PDFPage, type PDFFont } from "pdf-lib";
import { generatePuzzle, puzzleGenerationConfig } from "@/lib/puzzle-generator";
import { buildTableOfContents, combinedPageCount, paginateTableOfContents } from "@/lib/book-pages";
import { calculatePuzzlePageLayout, resolveWordColumns } from "@/lib/pdf-layout";
import {
  KDP_MIN_COVER_FONT_SIZE_PT, KDP_PRODUCTION_PAGE_COUNT, KDP_PRODUCTION_PAPER_TYPE, KDP_PRODUCTION_TRIM,
  KDP_REQUIRED_AUTHOR, KDP_REQUIRED_BACK_COPY, KDP_REQUIRED_BADGE, KDP_REQUIRED_CATEGORY, KDP_REQUIRED_SERIES,
  KDP_REQUIRED_SUBTITLE, KDP_REQUIRED_SUPPORTING_LINE, KDP_REQUIRED_TITLE, kdpCoverGeometry,
  parseTrimSize as parseCoverTrimSize, productionCoverPreflight,
} from "@/lib/cover-prep";
import { seniorProject, seniorPuzzleWords } from "@/lib/senior-preset";
import { templates } from "@/data/templates";
import type { BookProject, GeneratedPuzzle, ProjectAsset, Puzzle, TemplateStyle } from "@/types/puzzle";

export const runtime = "nodejs";

const WIDTH = 612;
const HEIGHT = 792;
const POINTS_PER_INCH = 72;

async function embedSvg(doc: PDFDocument, bytes: Uint8Array): Promise<PDFImage> {
  const png = await sharp(bytes).resize({ width: 1224, height: 1584, fit: "fill" }).png().toBuffer();
  return doc.embedPng(png);
}

async function loadTemplateArtwork(doc: PDFDocument, artwork?: string): Promise<PDFImage | undefined> {
  if (!artwork) return undefined;
  if (artwork.startsWith("data:image/svg+xml")) {
    const encoded = artwork.split(",")[1] || "";
    const bytes = artwork.includes(";base64,") ? Buffer.from(encoded, "base64") : Buffer.from(decodeURIComponent(encoded));
    return embedSvg(doc, bytes);
  }
  if (artwork.startsWith("/")) {
    const relativePath = artwork.replace(/^\/+/, "");
    const bytes = await readFile(path.join(process.cwd(), "public", relativePath));
    return embedSvg(doc, bytes);
  }
  return undefined;
}

async function loadProjectArtwork(doc: PDFDocument, asset?: ProjectAsset): Promise<PDFImage | undefined> {
  if (!asset?.dataUrl) return undefined;
  const encoded = asset.dataUrl.split(",")[1];
  if (!encoded) return undefined;
  const bytes = Buffer.from(encoded, "base64");
  if (asset.mimeType === "image/png") return doc.embedPng(bytes);
  if (asset.mimeType === "image/jpeg") return doc.embedJpg(bytes);
  if (asset.mimeType === "image/svg+xml") return embedSvg(doc, bytes);
  return undefined;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function parseTrimSize(value?: string | null) {
  const match = value?.match(/(\d+(?:\.\d+)?)\s*(?:x|×)\s*(\d+(?:\.\d+)?)/i);
  return match ? { width: Number(match[1]), height: Number(match[2]) } : { width: 8.5, height: 11 };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function spineWidthInches(project: BookProject) {
  const pageCount = combinedPageCount(project);
  return kdpCoverGeometry(parseCoverTrimSize(project.settings.trimSize), pageCount, project.settings.paperType || project.settings.interior).spineWidthInches;
}

function hasCoverImage(asset?: ProjectAsset) {
  return asset?.mimeType === "image/png" || asset?.mimeType === "image/jpeg";
}

function coverY(pageHeightInches: number, yInches: number) {
  return (pageHeightInches - yInches) * POINTS_PER_INCH;
}

function coverText(text: string) {
  return text.replace(/[^\x20-\x7E\u2022]/g, "");
}

function wrapCoverText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = coverText(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else current = next;
  }
  if (current) lines.push(current);
  return lines;
}

function centeredCoverText(page: PDFPage, text: string, centerX: number, baselineY: number, size: number, font: PDFFont, color: Color) {
  const value = coverText(text);
  page.drawText(value, { x: centerX - font.widthOfTextAtSize(value, size) / 2, y: baselineY, size, font, color });
}

function drawCenteredWrappedCoverText(page: PDFPage, text: string, centerX: number, topY: number, maxWidth: number, size: number, lineGap: number, font: PDFFont, color: Color) {
  const lines = wrapCoverText(text, font, size, maxWidth);
  lines.forEach((line, index) => centeredCoverText(page, line, centerX, topY - size - index * (size + lineGap), size, font, color));
  return lines.length * (size + lineGap);
}

function drawLeftWrappedCoverText(page: PDFPage, text: string, x: number, topY: number, maxWidth: number, size: number, lineGap: number, font: PDFFont, color: Color) {
  const lines = wrapCoverText(text, font, size, maxWidth);
  lines.forEach((line, index) => page.drawText(line, { x, y: topY - size - index * (size + lineGap), size, font, color }));
  return lines.length * (size + lineGap);
}

function drawRequiredCoverText(page: PDFPage, geometry: ReturnType<typeof kdpCoverGeometry>, fonts: { regular: PDFFont; bold: PDFFont; serif: PDFFont }) {
  const pageHeight = geometry.fullHeightInches;
  const ink = rgb(.11, .16, .14);
  const muted = rgb(.34, .25, .2);
  const cream = rgb(1, .975, .91);
  const rust = rgb(.62, .22, .14);
  const frontSafe = {
    x: geometry.frontSafe.x * POINTS_PER_INCH,
    yTop: coverY(pageHeight, geometry.frontSafe.y),
    width: geometry.frontSafe.width * POINTS_PER_INCH,
    height: geometry.frontSafe.height * POINTS_PER_INCH,
  };
  const backSafe = {
    x: geometry.backSafe.x * POINTS_PER_INCH,
    yTop: coverY(pageHeight, geometry.backSafe.y),
    width: geometry.backSafe.width * POINTS_PER_INCH,
    height: geometry.backSafe.height * POINTS_PER_INCH,
  };
  const frontCenter = frontSafe.x + frontSafe.width / 2;

  page.drawRectangle({ x: frontSafe.x + 18, y: coverY(pageHeight, 10.3), width: frontSafe.width - 36, height: 9.35 * POINTS_PER_INCH, color: cream });
  centeredCoverText(page, KDP_REQUIRED_SERIES, frontCenter, coverY(pageHeight, .88), 15, fonts.bold, muted);
  drawCenteredWrappedCoverText(page, KDP_REQUIRED_TITLE, frontCenter, coverY(pageHeight, 1.6), frontSafe.width - 64, 52, 5, fonts.serif, ink);
  drawCenteredWrappedCoverText(page, KDP_REQUIRED_CATEGORY, frontCenter, coverY(pageHeight, 4.25), frontSafe.width - 90, 30, 4, fonts.bold, rust);
  centeredCoverText(page, KDP_REQUIRED_SUBTITLE, frontCenter, coverY(pageHeight, 5.55), 18, fonts.regular, ink);
  page.drawRectangle({ x: frontCenter - 92, y: coverY(pageHeight, 6.65), width: 184, height: 35, color: rust });
  centeredCoverText(page, KDP_REQUIRED_BADGE, frontCenter, coverY(pageHeight, 6.41), 14, fonts.bold, rgb(1, 1, 1));
  centeredCoverText(page, KDP_REQUIRED_SUPPORTING_LINE, frontCenter, coverY(pageHeight, 7.35), 14, fonts.bold, ink);
  centeredCoverText(page, KDP_REQUIRED_AUTHOR, frontCenter, coverY(pageHeight, 10.45), 16, fonts.bold, ink);

  page.drawRectangle({ x: backSafe.x + 12, y: coverY(pageHeight, 10.55), width: backSafe.width - 160, height: 9.75 * POINTS_PER_INCH, color: cream });
  let y = coverY(pageHeight, .78);
  for (const [index, block] of KDP_REQUIRED_BACK_COPY.entries()) {
    if (block === "FEATURES") {
      y -= 10;
      page.drawText(block, { x: backSafe.x + 38, y: y - 13, size: 13, font: fonts.bold, color: rust });
      y -= 30;
    } else {
      const isBullet = block.startsWith("\u2022");
      const size = isBullet ? 11 : index === KDP_REQUIRED_BACK_COPY.length - 1 ? 12 : 11.5;
      y -= drawLeftWrappedCoverText(page, block, backSafe.x + 38, y, backSafe.width - 214, size, 4.5, isBullet ? fonts.bold : fonts.regular, ink);
      y -= isBullet ? 3 : 13;
    }
  }

  const spine = geometry.spine;
  const spineSafe = geometry.spineSafe;
  const spineCenterX = (spineSafe.x + spineSafe.width / 2) * POINTS_PER_INCH;
  const spineCenterY = coverY(pageHeight, spine.y + spine.height / 2);
  const spineText = `${KDP_REQUIRED_TITLE}   ${KDP_REQUIRED_AUTHOR}`;
  const spineSize = Math.max(KDP_MIN_COVER_FONT_SIZE_PT, 8.5);
  page.drawText(coverText(spineText), {
    x: spineCenterX - spineSize / 2,
    y: spineCenterY - fonts.bold.widthOfTextAtSize(coverText(spineText), spineSize) / 2,
    size: spineSize,
    font: fonts.bold,
    color: ink,
    rotate: degrees(90),
  });
}

async function coverPdf(project: BookProject) {
  const fullCover = project.assets?.fullCover;
  const frontCover = project.assets?.frontCover || project.assets?.cover;
  const rearCover = project.assets?.rearCover;
  if (!hasCoverImage(fullCover) && (!hasCoverImage(frontCover) || !hasCoverImage(rearCover))) throw new Error("Upload either one full cover image, or both front and rear cover images. Cover images must be PNG or JPEG files.");

  const preflight = productionCoverPreflight({
    projectTitle: project.title,
    projectAuthor: project.author,
    projectPublisher: project.publisher,
    fullCover,
    frontCover,
    rearCover,
    officialTemplate: project.assets?.kdpTemplate?.kdpTemplate,
  });
  if (preflight.result !== "PASS") {
    const failed = preflight.checks.filter((check) => check.status === "FAIL").map((check) => `${check.name}: ${check.detail}`).join("; ");
    throw new Error(`KDP cover preflight failed: ${failed}`);
  }
  const geometry = kdpCoverGeometry(KDP_PRODUCTION_TRIM, KDP_PRODUCTION_PAGE_COUNT, KDP_PRODUCTION_PAPER_TYPE);
  const coverWidth = geometry.fullWidthInches;
  const coverHeight = geometry.fullHeightInches;
  const doc = await PDFDocument.create();
  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    serif: await doc.embedFont(StandardFonts.TimesRomanBold),
  };
  const page = doc.addPage([coverWidth * POINTS_PER_INCH, coverHeight * POINTS_PER_INCH]);
  if (fullCover) {
    const fullImage = await loadProjectArtwork(doc, fullCover);
    if (!fullImage) throw new Error("Could not embed the full cover image.");
    page.drawImage(fullImage, { x: 0, y: 0, width: coverWidth * POINTS_PER_INCH, height: coverHeight * POINTS_PER_INCH });
    drawRequiredCoverText(page, geometry, fonts);
    const bytes = await doc.save({ useObjectStreams: false });
    return Buffer.from(bytes);
  }
  const rearImage = await loadProjectArtwork(doc, rearCover);
  const frontImage = await loadProjectArtwork(doc, frontCover);
  if (!rearImage || !frontImage) throw new Error("Could not embed front and rear cover images.");

  const bleed = geometry.bleedInches * POINTS_PER_INCH;
  const trimWidth = KDP_PRODUCTION_TRIM.width * POINTS_PER_INCH;
  const spineWidth = geometry.spineWidthInches * POINTS_PER_INCH;
  const pageHeight = coverHeight * POINTS_PER_INCH;
  const rearWidth = trimWidth + bleed;
  const frontX = bleed + trimWidth + spineWidth;
  const frontWidth = trimWidth + bleed;

  page.drawImage(rearImage, { x: 0, y: 0, width: rearWidth, height: pageHeight });
  page.drawRectangle({ x: bleed + trimWidth, y: 0, width: spineWidth, height: pageHeight, color: rgb(.97, .965, .94) });
  page.drawImage(frontImage, { x: frontX, y: 0, width: frontWidth, height: pageHeight });
  drawRequiredCoverText(page, geometry, fonts);

  const bytes = await doc.save({ useObjectStreams: false });
  return Buffer.from(bytes);
}

function drawArtwork(page: PDFPage, images: Array<PDFImage | undefined>, opacity = .13) {
  for (const image of images) if (image) page.drawImage(image, { x: 36, y: 36, width: WIDTH - 72, height: HEIGHT - 72, opacity });
}

function templateAccent(template?: TemplateStyle) {
  const match = template?.accent.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!match) return rgb(.18, .28, .22);
  return rgb(parseInt(match[1], 16) / 255, parseInt(match[2], 16) / 255, parseInt(match[3], 16) / 255);
}

function drawAccentFrame(page: PDFPage, number: number, accent: ReturnType<typeof rgb>, inset = 38, borderWidth = 1.3) {
  const left = number % 2 ? inset + 8 : inset;
  const right = number % 2 ? inset : inset + 8;
  const width = WIDTH - left - right;
  const height = HEIGHT - inset * 2;
  page.drawRectangle({ x: left, y: inset, width, height, borderWidth, borderColor: accent });
  page.drawLine({ start: { x: left + 15, y: HEIGHT - inset - 18 }, end: { x: left + 78, y: HEIGHT - inset - 18 }, thickness: 2.2, color: accent });
  page.drawLine({ start: { x: WIDTH - right - 78, y: inset + 18 }, end: { x: WIDTH - right - 15, y: inset + 18 }, thickness: 2.2, color: accent });
}

type PageKind = "title" | "text" | "toc" | "divider" | "puzzle" | "solution";
type PdfIconSlot = { x: number; y: number; size: number; opacity: number };

function pdfIconSlotsAreSpaced(candidate: PdfIconSlot, selected: PdfIconSlot[], minGap = 42) {
  const right = candidate.x + candidate.size;
  const top = candidate.y + candidate.size;
  return selected.every((slot) => {
    const slotRight = slot.x + slot.size;
    const slotTop = slot.y + slot.size;
    const horizontalGap = Math.max(slot.x - right, candidate.x - slotRight, 0);
    const verticalGap = Math.max(slot.y - top, candidate.y - slotTop, 0);
    return horizontalGap >= minGap || verticalGap >= minGap;
  });
}

function spacedPdfIconSlots(pageNumber: number, pageKind: PageKind, count: number) {
  const presets: PdfIconSlot[] = [
    { x: WIDTH * .07, y: HEIGHT * .76, size: WIDTH * .17, opacity: .5 },
    { x: WIDTH * .41, y: HEIGHT * .81, size: WIDTH * .14, opacity: .4 },
    { x: WIDTH * .76, y: HEIGHT * .75, size: WIDTH * .17, opacity: .5 },
    { x: WIDTH * .05, y: HEIGHT * .54, size: WIDTH * .14, opacity: .38 },
    { x: WIDTH * .8, y: HEIGHT * .54, size: WIDTH * .14, opacity: .38 },
    { x: WIDTH * .06, y: HEIGHT * .31, size: WIDTH * .15, opacity: .42 },
    { x: WIDTH * .79, y: HEIGHT * .31, size: WIDTH * .15, opacity: .42 },
    { x: WIDTH * .08, y: HEIGHT * .04, size: WIDTH * .18, opacity: .52 },
    { x: WIDTH * .41, y: HEIGHT * .04, size: WIDTH * .14, opacity: .42 },
    { x: WIDTH * .74, y: HEIGHT * .05, size: WIDTH * .19, opacity: .54 },
    { x: WIDTH * .24, y: HEIGHT * .02, size: WIDTH * .11, opacity: .33 },
    { x: WIDTH * .61, y: HEIGHT * .02, size: WIDTH * .11, opacity: .33 },
  ];
  const typeOffset = ["title", "text", "toc", "divider", "puzzle", "solution"].indexOf(pageKind);
  const start = (pageNumber * 2 + Math.max(0, typeOffset)) % presets.length;
  const selected: PdfIconSlot[] = [];
  for (let step = 0; step < presets.length * 2 && selected.length < count; step++) {
    const preset = presets[(start + step * 3) % presets.length];
    if (!selected.includes(preset) && pdfIconSlotsAreSpaced(preset, selected)) selected.push(preset);
  }
  return selected;
}

function templateIconDecorations(images: Array<PDFImage | undefined>, pageNumber: number, pageKind: PageKind) {
  if (!images.length) return [];
  return spacedPdfIconSlots(pageNumber, pageKind, 3).map((slot, index) => ({
    image: images[(pageNumber + index) % images.length],
    ...slot,
  }));
}

function drawTemplateIcons(page: PDFPage, images: Array<PDFImage | undefined>, pageNumber: number, pageKind: PageKind) {
  for (const decoration of templateIconDecorations(images, pageNumber, pageKind)) {
    if (decoration.image) page.drawImage(decoration.image, { x: decoration.x, y: decoration.y, width: decoration.size, height: decoration.size, opacity: decoration.opacity });
  }
}

function safe(text: string) { return text.replace(/[^\x20-\x7E]/g, ""); }

function centered(page: PDFPage, text: string, y: number, size: number, font: PDFFont, color: Color = grayscale(0.15)) {
  const clean = safe(text); page.drawText(clean, { x: Math.max(36, (WIDTH - font.widthOfTextAtSize(clean, size)) / 2), y, size, font, color });
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = safe(text).split(/\s+/); const lines: string[] = []; let current = "";
  for (const word of words) { const next = current ? `${current} ${word}` : word; if (font.widthOfTextAtSize(next, size) > maxWidth && current) { lines.push(current); current = word; } else current = next; }
  if (current) lines.push(current); return lines;
}

function drawPageNumber(page: PDFPage, number: number, font: PDFFont) { centered(page, String(number), 21, 8, font, grayscale(0.35)); }

function templateArtworkList(template?: TemplateStyle) {
  if (template?.artworks?.length) return template.artworks;
  return template?.artwork ? [template.artwork] : [];
}

function titlePage(doc: PDFDocument, project: BookProject, fonts: { regular: PDFFont; bold: PDFFont; serif: PDFFont }, number: number, templateArtwork: Array<PDFImage | undefined>, artwork: Array<PDFImage | undefined>, accent = rgb(.18, .28, .22)) {
  const page = doc.addPage([WIDTH, HEIGHT]);
  drawTemplateIcons(page, templateArtwork, number, "title");
  drawArtwork(page, artwork, .14);
  drawAccentFrame(page, number, accent, 36, 1.5);
  centered(page, project.series.toUpperCase(), 604, 10, fonts.bold, accent);
  const titleSize = Math.min(48, Math.max(18, project.typography?.interior.pageTitle?.sizePt || 34));
  const lines = wrap(project.title, fonts.serif, titleSize, 450); lines.forEach((line, i) => centered(page, line, 505 - i * (titleSize + 5), titleSize, fonts.serif));
  const titleOffset = (lines.length - 1) * (titleSize + 5);
  page.drawLine({ start: { x: 275, y: 444 - titleOffset }, end: { x: 337, y: 444 - titleOffset }, thickness: 2, color: accent });
  wrap(project.subtitle, fonts.regular, 14, 410).forEach((line, i) => centered(page, line, 398 - titleOffset - i * 19, 14, fonts.regular));
  centered(page, project.author, 120, 10, fonts.bold); drawPageNumber(page, number, fonts.regular);
}

function textPage(doc: PDFDocument, title: string, body: string, fonts: { regular: PDFFont; bold: PDFFont; serif: PDFFont }, number: number, bullets: string[] = [], templateArtwork: Array<PDFImage | undefined> = [], accent = rgb(.18, .28, .22)) {
  const page = doc.addPage([WIDTH, HEIGHT]);
  drawTemplateIcons(page, templateArtwork, number, "text");
  drawAccentFrame(page, number, accent, 38, 1);
  centered(page, title, 650, 28, fonts.serif);
  page.drawLine({ start: { x: 285, y: 625 }, end: { x: 327, y: 625 }, thickness: 1.8, color: accent });
  const bodyLines = wrap(body, fonts.regular, 14, 420);
  bodyLines.forEach((line, i) => centered(page, line, 560 - i * 21, 14, fonts.regular));
  let bulletY = 560 - bodyLines.length * 21 - 22;
  for (const bullet of bullets) for (const [lineIndex, line] of wrap(`- ${bullet}`, fonts.regular, 12, 390).entries()) {
    page.drawText(line, { x: 104, y: bulletY, size: 12, font: fonts.regular, color: grayscale(.2) });
    bulletY -= lineIndex ? 16 : 19;
  }
  drawPageNumber(page, number, fonts.regular);
}

function tableOfContentsPage(doc: PDFDocument, entries: ReturnType<typeof buildTableOfContents>, fonts: { regular: PDFFont; bold: PDFFont; serif: PDFFont }, number: number, part: number, totalParts: number, templateArtwork: Array<PDFImage | undefined> = [], accent = rgb(.18, .28, .22)) {
  const page = doc.addPage([WIDTH, HEIGHT]);
  drawTemplateIcons(page, templateArtwork, number, "toc");
  drawAccentFrame(page, number, accent, 38, 1);
  centered(page, "TABLE OF CONTENTS", 680, 26, fonts.serif);
  page.drawLine({ start: { x: 278, y: 656 }, end: { x: 334, y: 656 }, thickness: 1.8, color: accent });
  if (totalParts > 1) centered(page, `PART ${part}`, 635, 8, fonts.bold, accent);
  let y = 620;
  for (const entry of entries) {
    const font = entry.level === "section" ? fonts.bold : fonts.regular;
    const size = entry.level === "section" ? 12 : 11;
    const x = entry.level === "section" ? 82 : 104;
    page.drawText(safe(entry.label), { x, y, size, font, color: entry.level === "section" ? accent : grayscale(.2) });
    page.drawText(String(entry.page), { x: 518 - font.widthOfTextAtSize(String(entry.page), size), y, size, font, color: entry.level === "section" ? accent : grayscale(.25) });
    y -= entry.level === "section" ? 24 : 18;
  }
  drawPageNumber(page, number, fonts.regular);
}

function dividerPage(doc: PDFDocument, name: string, description: string, fonts: { regular: PDFFont; bold: PDFFont; serif: PDFFont }, number: number, templateArtwork: Array<PDFImage | undefined>, artwork: Array<PDFImage | undefined> = [], accent = rgb(.18, .28, .22)) {
  const page = doc.addPage([WIDTH, HEIGHT]);
  drawTemplateIcons(page, templateArtwork, number, "divider");
  drawArtwork(page, artwork, .2);
  drawAccentFrame(page, number, accent, 38, 2.2);
  centered(page, "SECTION", 535, 10, fonts.bold, accent); centered(page, name, 462, 38, fonts.serif);
  wrap(description, fonts.regular, 13, 410).forEach((line, i) => centered(page, line, 405 - i * 19, 13, fonts.regular, grayscale(0.25)));
  drawPageNumber(page, number, fonts.regular);
}

function drawGrid(page: PDFPage, generated: GeneratedPuzzle, x: number, y: number, size: number, font: PDFFont, solution: boolean, requestedFontSize?: number) {
  const cell = size / generated.size;
  page.drawRectangle({ x, y, width: size, height: size, color: grayscale(1), opacity: .9 });
  page.drawRectangle({ x, y, width: size, height: size, borderWidth: 1, borderColor: grayscale(0.2) });
  if (solution) for (const word of generated.placedWords) {
    const first = word.coordinates[0]; const last = word.coordinates[word.coordinates.length - 1];
    const start = { x: x + (first.col + .5) * cell, y: y + size - (first.row + .5) * cell };
    const end = { x: x + (last.col + .5) * cell, y: y + size - (last.row + .5) * cell };
    page.drawLine({ start, end, thickness: cell * .72, color: grayscale(.78), opacity: .65 });
    page.drawEllipse({ x: start.x, y: start.y, xScale: cell * .36, yScale: cell * .36, color: grayscale(.78), opacity: .65 });
    page.drawEllipse({ x: end.x, y: end.y, xScale: cell * .36, yScale: cell * .36, color: grayscale(.78), opacity: .65 });
  }
  for (let row = 0; row < generated.size; row++) for (let col = 0; col < generated.size; col++) {
    const cx = x + col * cell; const cy = y + size - (row + 1) * cell;
    const letter = generated.grid[row][col]; const preferredSize = requestedFontSize || (solution ? 11 : 22); const fontSize = Math.min(Math.max(7, preferredSize), cell * .74);
    page.drawText(letter, { x: cx + (cell - font.widthOfTextAtSize(letter, fontSize)) / 2, y: cy + cell * .28, size: fontSize, font, color: grayscale(.08) });
  }
}

function puzzlePage(doc: PDFDocument, puzzle: Puzzle, section: string, fonts: { regular: PDFFont; bold: PDFFont; serif: PDFFont; grid: PDFFont }, number: number, solution: boolean, settings: BookProject["settings"], templateArtwork: Array<PDFImage | undefined>, artwork: Array<PDFImage | undefined>, accent: ReturnType<typeof rgb>, typography?: BookProject["typography"]) {
  if (!puzzle.generated) return;
  const page = doc.addPage([WIDTH, HEIGHT]); const odd = number % 2 === 1;
  const margins = settings.margins;
  const left = (odd ? margins.inside : margins.outside) * 72;
  const right = (odd ? margins.outside : margins.inside) * 72;
  const availableWidth = WIDTH - left - right;
  const borderBottom = Math.max(28, margins.bottom * 72 - 10);
  const borderTop = HEIGHT - margins.top * 72 + 10;
  const sectionY = Math.min(728, borderTop - 28);
  const titleY = sectionY - 38;
  const wordStartY = titleY - 45;
  drawTemplateIcons(page, templateArtwork, number, solution ? "solution" : "puzzle");
  drawArtwork(page, artwork, .14);
  page.drawRectangle({ x: left - 10, y: borderBottom, width: availableWidth + 20, height: borderTop - borderBottom, borderWidth: 1.1, borderColor: accent });
  const puzzleTitleSize = Math.min(34, Math.max(16, typography?.interior.puzzleTitle?.sizePt || 24));
  centered(page, solution ? "SOLUTION" : section.toUpperCase(), sectionY, 9, fonts.bold, accent); centered(page, puzzle.title, titleY, puzzleTitleSize, fonts.serif);
  if (!solution) {
    const words = seniorPuzzleWords(puzzle); const columnCount = resolveWordColumns(words.length, settings.wordColumns); const wordsPerColumn = Math.ceil(words.length / columnCount);
    const columns = Array.from({ length: columnCount }, (_, index) => words.slice(index * wordsPerColumn, (index + 1) * wordsPerColumn));
    const wordColumnGap = columnCount === 2 ? 34 : columnCount === 3 ? 26 : 20;
    const wordColumnWidth = (availableWidth - wordColumnGap * (columnCount - 1)) / columnCount;
    const centers = Array.from({ length: columnCount }, (_, index) => left + wordColumnWidth / 2 + index * (wordColumnWidth + wordColumnGap));
    const preferredWordSize = Math.min(18, Math.max(9.5, typography?.interior.wordList?.sizePt || 18));
    const layout = calculatePuzzlePageLayout({ wordCount: words.length, wordColumns: columnCount, left, availableWidth, hasBlurb: Boolean(puzzle.blurb), wordStartY, wordFontSize: preferredWordSize });
    const maximumWordWidth = wordColumnWidth - 4;
    columns.forEach((column, columnIndex) => column.forEach((word, row) => { const clean = safe(word); const naturalWidth = fonts.bold.widthOfTextAtSize(clean, preferredWordSize); const size = Math.max(9.5, preferredWordSize * Math.min(1, maximumWordWidth / Math.max(1, naturalWidth))); page.drawText(clean, { x: centers[columnIndex] - fonts.bold.widthOfTextAtSize(clean, size) / 2, y: layout.wordStartY - row * layout.wordRowStep, size, font: fonts.bold, color: grayscale(.12) }); }));
    drawGrid(page, puzzle.generated, layout.gridX, layout.gridY, layout.gridSize, fonts.grid, false, typography?.interior.gridLetters?.sizePt);
    if (puzzle.blurb) wrap(puzzle.blurb, fonts.regular, 9, 440).slice(0, 2).forEach((line, i) => centered(page, line, 76 - i * 13, 9, fonts.regular, grayscale(.28)));
  } else {
    const gridSize = Math.min(430, availableWidth);
    drawGrid(page, puzzle.generated, left + (availableWidth - gridSize) / 2, 190, gridSize, fonts.grid, true, typography?.interior.solutionLetters?.sizePt);
  }
  drawPageNumber(page, number, fonts.regular);
}

export async function POST(request: Request) {
  try {
    const { project: incomingProject, kind = "combined" } = await request.json() as { project: BookProject; kind: "interior" | "solutions" | "combined" | "cover" };
    if (!incomingProject?.title || !Array.isArray(incomingProject.sections)) return new NextResponse("Invalid project data", { status: 400 });
    if (kind === "cover") {
      const bytes = await coverPdf(incomingProject);
      return new NextResponse(bytes, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="puzzlepress-cover.pdf"`, "Cache-Control": "no-store" } });
    }
    const normalizedProject = seniorProject(incomingProject);
    const project: BookProject = {
      ...normalizedProject,
      sections: normalizedProject.sections.map((section) => ({
        ...section,
        puzzles: section.puzzles.map((puzzle) => ({
          ...puzzle,
          generated: (() => { const generation = puzzleGenerationConfig(puzzle, normalizedProject.settings); return generatePuzzle(generation.words, generation.options); })(),
        })),
      })),
    };
    const doc = await PDFDocument.create();
    const configuredFont = project.settings.bookFont ?? "template";
    const selectedTemplate = [...templates, ...(project.customTemplates || [])].find((item) => item.id === project.templateId);
    const templateFont = selectedTemplate?.fontFamily ?? "serif";
    const accent = templateAccent(selectedTemplate);
    const bookFont = configuredFont === "template" ? templateFont : configuredFont;
    const fontNames = bookFont === "typewriter"
      ? { regular: StandardFonts.Courier, bold: StandardFonts.CourierBold, heading: StandardFonts.CourierBold }
      : bookFont === "sans"
        ? { regular: StandardFonts.Helvetica, bold: StandardFonts.HelveticaBold, heading: StandardFonts.HelveticaBold }
        : { regular: StandardFonts.TimesRoman, bold: StandardFonts.TimesRomanBold, heading: StandardFonts.TimesRomanBold };
    const fontKind = (family: unknown, fallback: "serif" | "sans" | "typewriter") => {
      const value = typeof family === "string" ? family.toLowerCase() : "";
      if (value.includes("courier") || value.includes("mono") || value.includes("typewriter")) return "typewriter";
      if (value.includes("georgia") || value.includes("times") || value === "serif") return "serif";
      if (value.includes("arial") || value.includes("helvetica") || value.includes("sans")) return "sans";
      return fallback;
    };
    const roleFont = (kind: "serif" | "sans" | "typewriter", bold = false) => kind === "typewriter" ? (bold ? StandardFonts.CourierBold : StandardFonts.Courier) : kind === "sans" ? (bold ? StandardFonts.HelveticaBold : StandardFonts.Helvetica) : (bold ? StandardFonts.TimesRomanBold : StandardFonts.TimesRoman);
    const bodyKind = fontKind(project.typography?.interior.body?.fontFamily, bookFont);
    const headingKind = fontKind(project.typography?.interior.puzzleTitle?.fontFamily || project.typography?.interior.pageTitle?.fontFamily, bookFont);
    const gridKind = fontKind(project.typography?.interior.gridLetters?.fontFamily, "typewriter");
    const fonts = { regular: await doc.embedFont(project.typography ? roleFont(bodyKind) : fontNames.regular), bold: await doc.embedFont(project.typography ? roleFont(bodyKind, true) : fontNames.bold), serif: await doc.embedFont(project.typography ? roleFont(headingKind, true) : fontNames.heading), grid: await doc.embedFont(roleFont(project.typography ? gridKind : bodyKind, true)) };
    const [templateArtwork, titleArtwork, dividerArtwork, puzzleArtwork] = await Promise.all([
      Promise.all(templateArtworkList(selectedTemplate).map((artwork) => loadTemplateArtwork(doc, artwork))),
      loadProjectArtwork(doc, project.assets?.decorative),
      loadProjectArtwork(doc, project.assets?.divider),
      loadProjectArtwork(doc, project.assets?.puzzle),
    ]);
    const tocPages = paginateTableOfContents(buildTableOfContents(project));
    const addTableOfContentsPages = () => tocPages.forEach((entries, index) => {
      const number = pageNumber++;
      tableOfContentsPage(doc, entries, fonts, number, index + 1, tocPages.length, templateArtwork, accent);
    });
    doc.setTitle(project.title); doc.setAuthor(project.author); doc.setSubject("Large-print word search puzzle book"); doc.setCreator("PuzzlePress");
    let pageNumber = 1;
    if (kind !== "solutions") {
      if (project.manuscriptFrontMatter?.length) {
        for (const item of project.manuscriptFrontMatter) {
          if (/titlepage/i.test(item.type)) { const number = pageNumber++; titlePage(doc, project, fonts, number, templateArtwork, [titleArtwork], accent); }
          else if (/contents/i.test(item.type)) addTableOfContentsPages();
          else { const number = pageNumber++; textPage(doc, item.title, item.body, fonts, number, [...(item.bulletPoints || []), ...(item.sectionList || [])], templateArtwork, accent); }
        }
      } else {
        { const number = pageNumber++; titlePage(doc, project, fonts, number, templateArtwork, [titleArtwork], accent); }
        { const number = pageNumber++; textPage(doc, "Copyright", project.frontMatter.copyright, fonts, number, [], templateArtwork, accent); }
        { const number = pageNumber++; textPage(doc, "Welcome", project.frontMatter.welcome, fonts, number, [], templateArtwork, accent); }
        { const number = pageNumber++; textPage(doc, "How to Use This Book", project.frontMatter.howTo, fonts, number, [], templateArtwork, accent); }
        addTableOfContentsPages();
      }
      for (const section of project.sections) {
        { const number = pageNumber++; dividerPage(doc, section.dividerPage?.headline || section.name, section.dividerPage?.body || section.description || "", fonts, number, templateArtwork, [dividerArtwork], accent); }
        for (const puzzle of section.puzzles) { const number = pageNumber++; puzzlePage(doc, puzzle, section.name, fonts, number, false, project.settings, templateArtwork, [puzzleArtwork], accent, project.typography); }
      }
    }
    const answerIntro = project.manuscriptBackMatter?.find((item) => /answerkeyintro/i.test(item.type));
    if (kind !== "interior") {
      if (answerIntro) { const number = pageNumber++; textPage(doc, answerIntro.title, answerIntro.body, fonts, number, answerIntro.bulletPoints || [], templateArtwork, accent); }
      else if (kind === "combined" && !project.manuscriptBackMatter) { const number = pageNumber++; dividerPage(doc, "Solutions", "Answer keys for every puzzle in this book.", fonts, number, templateArtwork, [], accent); }
      for (const section of project.sections) for (const puzzle of section.puzzles) { const number = pageNumber++; puzzlePage(doc, puzzle, section.name, fonts, number, true, project.settings, templateArtwork, [], accent, project.typography); }
    }
    if (kind !== "solutions") {
      if (project.manuscriptBackMatter) {
        for (const item of project.manuscriptBackMatter.filter((page) => page !== answerIntro)) { const number = pageNumber++; textPage(doc, item.title, item.body, fonts, number, item.bulletPoints || [], templateArtwork, accent); }
      } else {
        { const number = pageNumber++; textPage(doc, "Thank You", project.backMatter.thankYou, fonts, number, [], templateArtwork, accent); }
        { const number = pageNumber++; textPage(doc, "More in the Series", project.backMatter.otherBooks, fonts, number, [], templateArtwork, accent); }
        { const number = pageNumber++; textPage(doc, "Share Your Thoughts", project.backMatter.reviewRequest, fonts, number, [], templateArtwork, accent); }
      }
    }
    const bytes = await doc.save({ useObjectStreams: false });
    return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="puzzlepress-${kind}.pdf"`, "Cache-Control": "no-store" } });
  } catch (error) { return new NextResponse(error instanceof Error ? error.message : "PDF generation failed", { status: 500 }); }
}
