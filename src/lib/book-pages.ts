import type { BookProject } from "@/types/puzzle";

export interface TocEntry {
  label: string;
  page: number;
  level: "section" | "puzzle";
}

export const FRONT_MATTER_PAGE_COUNT = 5;

export function frontMatterPageCount(project: BookProject): number {
  return project.manuscriptFrontMatter?.length || FRONT_MATTER_PAGE_COUNT;
}

export function buildTableOfContents(project: BookProject): TocEntry[] {
  const entries: TocEntry[] = [];
  let page = frontMatterPageCount(project) + 1;
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
  const backMatterCount = project.manuscriptBackMatter?.length || 3;
  return frontMatterPageCount(project) + project.sections.length + puzzleCount + 1 + puzzleCount + backMatterCount;
}
