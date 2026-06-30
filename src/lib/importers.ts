import Papa from "papaparse";
import type { BookProject, BookSection, Puzzle } from "@/types/puzzle";
import { convertProductionManuscriptToBookProject, detectProductionManuscriptJson, normalizeProductionManuscriptJson, validateProductionManuscriptJson } from "./importers/productionManuscriptImporter";
import type { ImportWarning } from "@/types/productionManuscript";

const id = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || crypto.randomUUID();

function parseLegacyProjectJson(parsed: unknown, fallback: BookProject): BookProject {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("JSON must contain a book project object.");
  const legacy = parsed as Partial<BookProject> & { sections?: Array<Partial<BookSection> & { puzzles?: Array<Partial<Puzzle>> }> };
  if (!legacy.title || !Array.isArray(legacy.sections)) throw new Error("JSON must include a title and sections array.");
  return {
    ...fallback,
    ...legacy,
    id: legacy.id || crypto.randomUUID(),
    updatedAt: new Date().toISOString(),
    sections: legacy.sections.map((section, sectionIndex) => ({
      id: section.id || id(section.name || `section-${sectionIndex + 1}`),
      name: section.name || `Section ${sectionIndex + 1}`,
      description: section.description || "",
      puzzles: (section.puzzles || []).map((puzzle, puzzleIndex) => ({
        id: puzzle.id || id(puzzle.title || `puzzle-${puzzleIndex + 1}`),
        title: puzzle.title || `Puzzle ${puzzleIndex + 1}`,
        blurb: puzzle.blurb || "",
        words: Array.isArray(puzzle.words) ? puzzle.words.map(String) : [],
      })),
    })),
  };
}

export interface ProjectImportResult {
  success: true;
  importType: "production-manuscript-v2" | "legacy-puzzlepress-json";
  projectId: string;
  project: BookProject;
  summary: { title: string; series: string; sections: number; puzzles: number; words: number; frontMatterPages: number; backMatterPages: number; warnings: ImportWarning[] };
}

function summarize(project: BookProject, importType: ProjectImportResult["importType"], warnings: ImportWarning[] = []): ProjectImportResult {
  const puzzles = project.sections.flatMap((section) => section.puzzles);
  return { success: true, importType, projectId: project.id, project, summary: { title: project.title, series: project.series, sections: project.sections.length, puzzles: puzzles.length, words: puzzles.reduce((sum, puzzle) => sum + puzzle.words.length, 0), frontMatterPages: project.manuscriptFrontMatter?.length || 0, backMatterPages: project.manuscriptBackMatter?.length || 0, warnings } };
}

export function parseProjectJsonWithResult(text: string, fallback: BookProject): ProjectImportResult {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error("The uploaded file is not valid JSON."); }
  if (detectProductionManuscriptJson(parsed)) {
    const validation = validateProductionManuscriptJson(parsed);
    if (!validation.valid) throw new Error(validation.errors.map((error) => `${error.path}: ${error.message}`).join("\n"));
    const project = convertProductionManuscriptToBookProject(normalizeProductionManuscriptJson(parsed));
    return summarize(project, "production-manuscript-v2", validation.warnings);
  }
  return summarize(parseLegacyProjectJson(parsed, fallback), "legacy-puzzlepress-json");
}

export function parseProjectJson(text: string, fallback: BookProject): BookProject {
  return parseProjectJsonWithResult(text, fallback).project;
}

export function parseCsvProject(text: string, fallback: BookProject): BookProject {
  const result = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true, transformHeader: (header) => header.trim().toLowerCase() });
  if (result.errors.length) throw new Error(result.errors[0].message);
  const sections = new Map<string, BookSection>();
  for (const [index, row] of result.data.entries()) {
    const sectionName = row.section || "Imported Puzzles";
    const puzzleTitle = row.puzzle || row.title || `Puzzle ${index + 1}`;
    const sectionKey = id(sectionName);
    if (!sections.has(sectionKey)) sections.set(sectionKey, { id: sectionKey, name: sectionName, description: row.section_description || "", puzzles: [] });
    const section = sections.get(sectionKey)!;
    let puzzle = section.puzzles.find((item) => item.title === puzzleTitle);
    if (!puzzle) { puzzle = { id: `${sectionKey}-${id(puzzleTitle)}`, title: puzzleTitle, blurb: row.blurb || "", words: [] }; section.puzzles.push(puzzle); }
    const words = (row.words || row.word || "").split(/[|;,]/).map((word) => word.trim()).filter(Boolean);
    puzzle.words.push(...words);
  }
  if (!sections.size) throw new Error("No puzzle rows were found. Include section, puzzle, and words columns.");
  return { ...fallback, id: crypto.randomUUID(), title: result.data[0]?.book_title || fallback.title, updatedAt: new Date().toISOString(), sections: [...sections.values()] };
}
