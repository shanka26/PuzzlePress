import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { PDFDocument, StandardFonts, grayscale, type PDFImage, type PDFPage, type PDFFont } from "pdf-lib";
import { generatePuzzle, puzzleGenerationConfig } from "@/lib/puzzle-generator";
import { buildTableOfContents } from "@/lib/book-pages";
import { calculatePuzzlePageLayout, resolveWordColumns } from "@/lib/pdf-layout";
import { templates } from "@/data/templates";
import type { BookProject, GeneratedPuzzle, ProjectAsset, Puzzle } from "@/types/puzzle";

export const runtime = "nodejs";

const WIDTH = 612;
const HEIGHT = 792;

async function embedSvg(doc: PDFDocument, bytes: Uint8Array): Promise<PDFImage> {
  const png = await sharp(bytes).resize({ width: 1224, height: 1584, fit: "fill" }).grayscale().png().toBuffer();
  return doc.embedPng(png);
}

async function loadTemplateArtwork(doc: PDFDocument, project: BookProject): Promise<PDFImage | undefined> {
  const template = [...templates, ...(project.customTemplates || [])].find((item) => item.id === project.templateId);
  if (!template?.artwork) return undefined;
  if (template.artwork.startsWith("data:image/svg+xml")) {
    const encoded = template.artwork.split(",")[1] || "";
    const bytes = template.artwork.includes(";base64,") ? Buffer.from(encoded, "base64") : Buffer.from(decodeURIComponent(encoded));
    return embedSvg(doc, bytes);
  }
  if (template.artwork.startsWith("/")) {
    const relativePath = template.artwork.replace(/^\/+/, "");
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

function drawArtwork(page: PDFPage, images: Array<PDFImage | undefined>, opacity = .13) {
  for (const image of images) if (image) page.drawImage(image, { x: 36, y: 36, width: WIDTH - 72, height: HEIGHT - 72, opacity });
}

function safe(text: string) { return text.replace(/[^\x20-\x7E]/g, ""); }

function centered(page: PDFPage, text: string, y: number, size: number, font: PDFFont, color = grayscale(0.15)) {
  const clean = safe(text); page.drawText(clean, { x: Math.max(36, (WIDTH - font.widthOfTextAtSize(clean, size)) / 2), y, size, font, color });
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = safe(text).split(/\s+/); const lines: string[] = []; let current = "";
  for (const word of words) { const next = current ? `${current} ${word}` : word; if (font.widthOfTextAtSize(next, size) > maxWidth && current) { lines.push(current); current = word; } else current = next; }
  if (current) lines.push(current); return lines;
}

function drawPageNumber(page: PDFPage, number: number, font: PDFFont) { centered(page, String(number), 21, 8, font, grayscale(0.35)); }

function titlePage(doc: PDFDocument, project: BookProject, fonts: { regular: PDFFont; bold: PDFFont; serif: PDFFont }, number: number, artwork: Array<PDFImage | undefined>) {
  const page = doc.addPage([WIDTH, HEIGHT]);
  drawArtwork(page, artwork, .14);
  page.drawRectangle({ x: 36, y: 36, width: WIDTH - 72, height: HEIGHT - 72, borderWidth: 1, borderColor: grayscale(0.45) });
  centered(page, project.series.toUpperCase(), 604, 10, fonts.bold, grayscale(0.35));
  const titleSize = Math.min(48, Math.max(18, project.typography?.interior.pageTitle?.sizePt || 34));
  const lines = wrap(project.title, fonts.serif, titleSize, 450); lines.forEach((line, i) => centered(page, line, 505 - i * (titleSize + 5), titleSize, fonts.serif));
  const titleOffset = (lines.length - 1) * (titleSize + 5);
  page.drawLine({ start: { x: 275, y: 444 - titleOffset }, end: { x: 337, y: 444 - titleOffset }, thickness: 1.5, color: grayscale(0.3) });
  wrap(project.subtitle, fonts.regular, 14, 410).forEach((line, i) => centered(page, line, 398 - titleOffset - i * 19, 14, fonts.regular));
  centered(page, project.author, 120, 10, fonts.bold); drawPageNumber(page, number, fonts.regular);
}

function textPage(doc: PDFDocument, title: string, body: string, fonts: { regular: PDFFont; bold: PDFFont; serif: PDFFont }, number: number, bullets: string[] = []) {
  const page = doc.addPage([WIDTH, HEIGHT]);
  page.drawRectangle({ x: number % 2 ? 54 : 42, y: 38, width: 516, height: 716, borderWidth: 0.7, borderColor: grayscale(0.65) });
  centered(page, title, 650, 28, fonts.serif);
  page.drawLine({ start: { x: 285, y: 625 }, end: { x: 327, y: 625 }, thickness: 1.2, color: grayscale(0.35) });
  const bodyLines = wrap(body, fonts.regular, 14, 420);
  bodyLines.forEach((line, i) => centered(page, line, 560 - i * 21, 14, fonts.regular));
  let bulletY = 560 - bodyLines.length * 21 - 22;
  for (const bullet of bullets) for (const [lineIndex, line] of wrap(`- ${bullet}`, fonts.regular, 12, 390).entries()) {
    page.drawText(line, { x: 104, y: bulletY, size: 12, font: fonts.regular, color: grayscale(.2) });
    bulletY -= lineIndex ? 16 : 19;
  }
  drawPageNumber(page, number, fonts.regular);
}

function tableOfContentsPage(doc: PDFDocument, project: BookProject, fonts: { regular: PDFFont; bold: PDFFont; serif: PDFFont }, number: number) {
  const page = doc.addPage([WIDTH, HEIGHT]);
  page.drawRectangle({ x: number % 2 ? 54 : 42, y: 38, width: 516, height: 716, borderWidth: 0.7, borderColor: grayscale(0.65) });
  centered(page, "TABLE OF CONTENTS", 680, 26, fonts.serif);
  page.drawLine({ start: { x: 278, y: 656 }, end: { x: 334, y: 656 }, thickness: 1.2, color: grayscale(0.35) });
  let y = 620;
  for (const entry of buildTableOfContents(project)) {
    const font = entry.level === "section" ? fonts.bold : fonts.regular;
    const size = entry.level === "section" ? 12 : 11;
    const x = entry.level === "section" ? 82 : 104;
    page.drawText(safe(entry.label), { x, y, size, font, color: grayscale(entry.level === "section" ? .12 : .25) });
    page.drawText(String(entry.page), { x: 518 - font.widthOfTextAtSize(String(entry.page), size), y, size, font, color: grayscale(.25) });
    y -= entry.level === "section" ? 24 : 18;
  }
  drawPageNumber(page, number, fonts.regular);
}

function dividerPage(doc: PDFDocument, name: string, description: string, fonts: { regular: PDFFont; bold: PDFFont; serif: PDFFont }, number: number, artwork: Array<PDFImage | undefined> = []) {
  const page = doc.addPage([WIDTH, HEIGHT]);
  drawArtwork(page, artwork, .13);
  page.drawRectangle({ x: 38, y: 38, width: WIDTH - 76, height: HEIGHT - 76, borderWidth: 2, borderColor: grayscale(0.28) });
  centered(page, "SECTION", 535, 10, fonts.bold, grayscale(0.38)); centered(page, name, 462, 38, fonts.serif);
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
    const letter = generated.grid[row][col]; const preferredSize = requestedFontSize || (solution ? 10 : 13); const fontSize = Math.min(Math.max(7, preferredSize), cell * .64);
    page.drawText(letter, { x: cx + (cell - font.widthOfTextAtSize(letter, fontSize)) / 2, y: cy + cell * .28, size: fontSize, font, color: grayscale(.08) });
  }
}

function puzzlePage(doc: PDFDocument, puzzle: Puzzle, section: string, fonts: { regular: PDFFont; bold: PDFFont; serif: PDFFont; grid: PDFFont }, number: number, solution: boolean, settings: BookProject["settings"], artwork: Array<PDFImage | undefined>, typography?: BookProject["typography"]) {
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
  drawArtwork(page, artwork, .1);
  page.drawRectangle({ x: left - 10, y: borderBottom, width: availableWidth + 20, height: borderTop - borderBottom, borderWidth: .65, borderColor: grayscale(.62) });
  const puzzleTitleSize = Math.min(34, Math.max(16, typography?.interior.puzzleTitle?.sizePt || 24));
  centered(page, solution ? "SOLUTION" : section.toUpperCase(), sectionY, 9, fonts.bold, grayscale(.35)); centered(page, puzzle.title, titleY, puzzleTitleSize, fonts.serif);
  if (!solution) {
    const words = puzzle.words; const columnCount = resolveWordColumns(words.length, settings.wordColumns); const wordsPerColumn = Math.ceil(words.length / columnCount);
    const columns = Array.from({ length: columnCount }, (_, index) => words.slice(index * wordsPerColumn, (index + 1) * wordsPerColumn));
    const centers = Array.from({ length: columnCount }, (_, index) => left + availableWidth * ((index + .5) / columnCount));
    const layout = calculatePuzzlePageLayout({ wordCount: words.length, wordColumns: columnCount, left, availableWidth, hasBlurb: Boolean(puzzle.blurb), wordStartY });
    const preferredWordSize = Math.min(14, Math.max(9.5, typography?.interior.wordList?.sizePt || (columnCount === 2 ? 11.5 : columnCount === 3 ? 10.75 : 10)));
    const maximumWordWidth = availableWidth / columnCount - 12;
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
    const { project: incomingProject, kind = "combined" } = await request.json() as { project: BookProject; kind: "interior" | "solutions" | "combined" };
    if (!incomingProject?.title || !Array.isArray(incomingProject.sections)) return new NextResponse("Invalid project data", { status: 400 });
    const project: BookProject = {
      ...incomingProject,
      sections: incomingProject.sections.map((section) => ({
        ...section,
        puzzles: section.puzzles.map((puzzle) => ({
          ...puzzle,
          generated: puzzle.generated || (() => { const generation = puzzleGenerationConfig(puzzle, incomingProject.settings); return generatePuzzle(generation.words, generation.options); })(),
        })),
      })),
    };
    const doc = await PDFDocument.create();
    const configuredFont = project.settings.bookFont ?? "template";
    const templateFont = [...templates, ...(project.customTemplates || [])].find((item) => item.id === project.templateId)?.fontFamily ?? "serif";
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
      loadTemplateArtwork(doc, project),
      loadProjectArtwork(doc, project.assets?.decorative),
      loadProjectArtwork(doc, project.assets?.divider),
      loadProjectArtwork(doc, project.assets?.puzzle),
    ]);
    doc.setTitle(project.title); doc.setAuthor(project.author); doc.setSubject("Large-print word search puzzle book"); doc.setCreator("PuzzlePress");
    let pageNumber = 1;
    if (kind !== "solutions") {
      if (project.manuscriptFrontMatter?.length) {
        for (const item of project.manuscriptFrontMatter) {
          if (/titlepage/i.test(item.type)) titlePage(doc, project, fonts, pageNumber++, [templateArtwork, titleArtwork]);
          else if (/contents/i.test(item.type)) tableOfContentsPage(doc, project, fonts, pageNumber++);
          else textPage(doc, item.title, item.body, fonts, pageNumber++, [...(item.bulletPoints || []), ...(item.sectionList || [])]);
        }
      } else {
        titlePage(doc, project, fonts, pageNumber++, [templateArtwork, titleArtwork]);
        textPage(doc, "Copyright", project.frontMatter.copyright, fonts, pageNumber++);
        textPage(doc, "Welcome", project.frontMatter.welcome, fonts, pageNumber++);
        textPage(doc, "How to Use This Book", project.frontMatter.howTo, fonts, pageNumber++);
        tableOfContentsPage(doc, project, fonts, pageNumber++);
      }
      for (const section of project.sections) {
        dividerPage(doc, section.dividerPage?.headline || section.name, section.dividerPage?.body || section.description || "", fonts, pageNumber++, [templateArtwork, dividerArtwork]);
        for (const puzzle of section.puzzles) { puzzlePage(doc, puzzle, section.name, fonts, pageNumber++, false, project.settings, [templateArtwork, puzzleArtwork], project.typography); }
      }
    }
    const answerIntro = project.manuscriptBackMatter?.find((item) => /answerkeyintro/i.test(item.type));
    if (kind !== "interior") {
      if (answerIntro) textPage(doc, answerIntro.title, answerIntro.body, fonts, pageNumber++, answerIntro.bulletPoints || []);
      else if (kind === "combined" && !project.manuscriptBackMatter) dividerPage(doc, "Solutions", "Answer keys for every puzzle in this book.", fonts, pageNumber++, [templateArtwork]);
      for (const section of project.sections) for (const puzzle of section.puzzles) puzzlePage(doc, puzzle, section.name, fonts, pageNumber++, true, project.settings, [templateArtwork], project.typography);
    }
    if (kind !== "solutions") {
      if (project.manuscriptBackMatter) {
        for (const item of project.manuscriptBackMatter.filter((page) => page !== answerIntro)) textPage(doc, item.title, item.body, fonts, pageNumber++, item.bulletPoints || []);
      } else {
        textPage(doc, "Thank You", project.backMatter.thankYou, fonts, pageNumber++);
        textPage(doc, "More in the Series", project.backMatter.otherBooks, fonts, pageNumber++);
        textPage(doc, "Share Your Thoughts", project.backMatter.reviewRequest, fonts, pageNumber++);
      }
    }
    const bytes = await doc.save({ useObjectStreams: false });
    return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="puzzlepress-${kind}.pdf"`, "Cache-Control": "no-store" } });
  } catch (error) { return new NextResponse(error instanceof Error ? error.message : "PDF generation failed", { status: 500 }); }
}
