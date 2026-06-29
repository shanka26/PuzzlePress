import type { BookProject } from "@/types/puzzle";

export interface TocEntry {
  label: string;
  page: number;
  level: "section" | "puzzle";
}

export const FRONT_MATTER_PAGE_COUNT = 5;

export function buildTableOfContents(project: BookProject): TocEntry[] {
  const entries: TocEntry[] = [];
  let page = FRONT_MATTER_PAGE_COUNT + 1;
  for (const section of project.sections) {
    entries.push({ label: section.name, page, level: "section" });
    page += 1;
    for (const puzzle of section.puzzles) {
      entries.push({ label: puzzle.title, page, level: "puzzle" });
      page += 1;
    }
  }
  return entries;
}

export function combinedPageCount(project: BookProject): number {
  const puzzleCount = project.sections.reduce((total, section) => total + section.puzzles.length, 0);
  return FRONT_MATTER_PAGE_COUNT + project.sections.length + puzzleCount + 1 + puzzleCount + 3;
}
