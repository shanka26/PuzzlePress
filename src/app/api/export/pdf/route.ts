import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { PDFDocument, StandardFonts, grayscale, type PDFImage, type PDFPage, type PDFFont } from "pdf-lib";
import { generatePuzzle } from "@/lib/puzzle-generator";
import { buildTableOfContents } from "@/lib/book-pages";
import { calculatePuzzlePageLayout } from "@/lib/pdf-layout";
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
  const lines = wrap(project.title, fonts.serif, 34, 450); lines.forEach((line, i) => centered(page, line, 505 - i * 39, 34, fonts.serif));
  page.drawLine({ start: { x: 275, y: 444 - (lines.length - 1) * 38 }, end: { x: 337, y: 444 - (lines.length - 1) * 38 }, thickness: 1.5, color: grayscale(0.3) });
  wrap(project.subtitle, fonts.regular, 14, 410).forEach((line, i) => centered(page, line, 398 - (lines.length - 1) * 38 - i * 19, 14, fonts.regular));
  centered(page, project.author, 120, 10, fonts.bold); drawPageNumber(page, number, fonts.regular);
}

function textPage(doc: PDFDocument, title: string, body: string, fonts: { regular: PDFFont; bold: PDFFont; serif: PDFFont }, number: number) {
  const page = doc.addPage([WIDTH, HEIGHT]);
  page.drawRectangle({ x: number % 2 ? 54 : 42, y: 38, width: 516, height: 716, borderWidth: 0.7, borderColor: grayscale(0.65) });
  centered(page, title, 650, 28, fonts.serif);
  page.drawLine({ start: { x: 285, y: 625 }, end: { x: 327, y: 625 }, thickness: 1.2, color: grayscale(0.35) });
  wrap(body, fonts.regular, 14, 420).forEach((line, i) => centered(page, line, 560 - i * 21, 14, fonts.regular));
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

function drawGrid(page: PDFPage, generated: GeneratedPuzzle, x: number, y: number, size: number, font: PDFFont, solution: boolean) {
  const cell = size / generated.size; const answerCells = new Set(solution ? generated.placedWords.flatMap((word) => word.coordinates.map(({ row, col }) => `${row}:${col}`)) : []);
  page.drawRectangle({ x, y, width: size, height: size, color: grayscale(1), opacity: .9 });
  page.drawRectangle({ x, y, width: size, height: size, borderWidth: 1, borderColor: grayscale(0.2) });
  for (let row = 0; row < generated.size; row++) for (let col = 0; col < generated.size; col++) {
    const cx = x + col * cell; const cy = y + size - (row + 1) * cell;
    if (answerCells.has(`${row}:${col}`)) page.drawEllipse({ x: cx + cell / 2, y: cy + cell / 2, xScale: cell * .37, yScale: cell * .37, color: grayscale(.78), opacity: .65 });
    const letter = generated.grid[row][col]; const fontSize = Math.min(solution ? 10 : 13, cell * .64);
    page.drawText(letter, { x: cx + (cell - font.widthOfTextAtSize(letter, fontSize)) / 2, y: cy + cell * .28, size: fontSize, font, color: grayscale(.08) });
  }
}

function puzzlePage(doc: PDFDocument, puzzle: Puzzle, section: string, fonts: { regular: PDFFont; bold: PDFFont; serif: PDFFont }, number: number, solution: boolean, margins: BookProject["settings"]["margins"], artwork: Array<PDFImage | undefined>) {
  if (!puzzle.generated) return;
  const page = doc.addPage([WIDTH, HEIGHT]); const odd = number % 2 === 1;
  const left = (odd ? margins.inside : margins.outside) * 72;
  const right = (odd ? margins.outside : margins.inside) * 72;
  const availableWidth = WIDTH - left - right;
  drawArtwork(page, artwork, .1);
  page.drawRectangle({ x: left - 10, y: Math.max(28, margins.bottom * 72 - 10), width: availableWidth + 20, height: HEIGHT - margins.top * 72 - margins.bottom * 72 + 20, borderWidth: .65, borderColor: grayscale(.62) });
  centered(page, solution ? "SOLUTION" : section.toUpperCase(), 728, 9, fonts.bold, grayscale(.35)); centered(page, puzzle.title, 690, 24, fonts.serif);
  if (!solution) {
    const words = puzzle.words; const midpoint = Math.ceil(words.length / 2);
    const centers = [left + availableWidth * .25, left + availableWidth * .75];
    const layout = calculatePuzzlePageLayout({ wordCount: words.length, left, availableWidth, hasBlurb: Boolean(puzzle.blurb) });
    [words.slice(0, midpoint), words.slice(midpoint)].forEach((column, columnIndex) => column.forEach((word, row) => { const clean = safe(word); const size = 12; page.drawText(clean, { x: centers[columnIndex] - fonts.bold.widthOfTextAtSize(clean, size) / 2, y: layout.wordStartY - row * layout.wordRowStep, size, font: fonts.bold, color: grayscale(.12) }); }));
    drawGrid(page, puzzle.generated, layout.gridX, layout.gridY, layout.gridSize, fonts.bold, false);
    if (puzzle.blurb) wrap(puzzle.blurb, fonts.regular, 9, 440).slice(0, 2).forEach((line, i) => centered(page, line, 76 - i * 13, 9, fonts.regular, grayscale(.28)));
  } else {
    const gridSize = Math.min(430, availableWidth);
    drawGrid(page, puzzle.generated, left + (availableWidth - gridSize) / 2, 190, gridSize, fonts.bold, true);
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
          generated: puzzle.generated || generatePuzzle(puzzle.words, {
            gridSize: incomingProject.settings.gridSize,
            directions: incomingProject.settings.directions,
            backwards: incomingProject.settings.backwards,
            seed: `${incomingProject.settings.seed}:${puzzle.id}`,
          }),
        })),
      })),
    };
    const doc = await PDFDocument.create();
    const fonts = { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold), serif: await doc.embedFont(StandardFonts.TimesRomanBold) };
    const [templateArtwork, titleArtwork, dividerArtwork, puzzleArtwork] = await Promise.all([
      loadTemplateArtwork(doc, project),
      loadProjectArtwork(doc, project.assets?.decorative),
      loadProjectArtwork(doc, project.assets?.divider),
      loadProjectArtwork(doc, project.assets?.puzzle),
    ]);
    doc.setTitle(project.title); doc.setAuthor(project.author); doc.setSubject("Large-print word search puzzle book"); doc.setCreator("PuzzlePress");
    let pageNumber = 1;
    if (kind !== "solutions") {
      titlePage(doc, project, fonts, pageNumber++, [templateArtwork, titleArtwork]);
      textPage(doc, "Copyright", project.frontMatter.copyright, fonts, pageNumber++);
      textPage(doc, "Welcome", project.frontMatter.welcome, fonts, pageNumber++);
      textPage(doc, "How to Use This Book", project.frontMatter.howTo, fonts, pageNumber++);
      tableOfContentsPage(doc, project, fonts, pageNumber++);
      for (const section of project.sections) {
        dividerPage(doc, section.name, section.description || "", fonts, pageNumber++, [templateArtwork, dividerArtwork]);
        for (const puzzle of section.puzzles) { puzzlePage(doc, puzzle, section.name, fonts, pageNumber++, false, project.settings.margins, [templateArtwork, puzzleArtwork]); }
      }
    }
    if (kind !== "interior") {
      if (kind === "combined") dividerPage(doc, "Solutions", "Answer keys for every puzzle in this book.", fonts, pageNumber++, [templateArtwork]);
      for (const section of project.sections) for (const puzzle of section.puzzles) puzzlePage(doc, puzzle, section.name, fonts, pageNumber++, true, project.settings.margins, [templateArtwork]);
    }
    if (kind !== "solutions") {
      textPage(doc, "Thank You", project.backMatter.thankYou, fonts, pageNumber++);
      textPage(doc, "More in the Series", project.backMatter.otherBooks, fonts, pageNumber++);
      textPage(doc, "Share Your Thoughts", project.backMatter.reviewRequest, fonts, pageNumber++);
    }
    const bytes = await doc.save({ useObjectStreams: false });
    return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="puzzlepress-${kind}.pdf"`, "Cache-Control": "no-store" } });
  } catch (error) { return new NextResponse(error instanceof Error ? error.message : "PDF generation failed", { status: 500 }); }
}
