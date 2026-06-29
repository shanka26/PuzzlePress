import Papa from "papaparse";
import type { BookProject, BookSection, Puzzle } from "@/types/puzzle";

const id = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || crypto.randomUUID();

export function parseProjectJson(text: string, fallback: BookProject): BookProject {
  const parsed = JSON.parse(text) as Partial<BookProject> & { sections?: Array<Partial<BookSection> & { puzzles?: Array<Partial<Puzzle>> }> };
  if (!parsed.title || !Array.isArray(parsed.sections)) throw new Error("JSON must include a title and sections array.");
  return {
    ...fallback,
    ...parsed,
    id: parsed.id || crypto.randomUUID(),
    updatedAt: new Date().toISOString(),
    sections: parsed.sections.map((section, sectionIndex) => ({
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
