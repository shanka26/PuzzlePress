import type { BookProject } from "@/types/puzzle";

export interface TocEntry {
  label: string;
  page: number;
  level: "section" | "puzzle";
}

export const FRONT_MATTER_PAGE_COUNT = 5;
export const TOC_ROW_LIMIT = 24;

function tableOfContentsBaseEntries(project: BookProject): Omit<TocEntry, "page">[] {
  return project.sections.flatMap((section) => [
    { label: section.name, level: "section" as const },
    ...section.puzzles.map((puzzle) => ({ label: puzzle.title, level: "puzzle" as const })),
  ]);
}

function tocEntryRows(entry: Pick<TocEntry, "level">) {
  return entry.level === "section" ? 2 : 1;
}

export function paginateTableOfContents<T extends Pick<TocEntry, "level">>(entries: T[], rowLimit = TOC_ROW_LIMIT): T[][] {
  const pages: T[][] = [[]];
  let rows = 0;
  for (const entry of entries) {
    const needed = tocEntryRows(entry);
    if (pages[pages.length - 1].length && rows + needed > rowLimit) {
      pages.push([]);
      rows = 0;
    }
    pages[pages.length - 1].push(entry);
    rows += needed;
  }
  return pages;
}

export function tableOfContentsPageCount(project: BookProject): number {
  return Math.max(1, paginateTableOfContents(tableOfContentsBaseEntries(project)).length);
}

export function hasTableOfContents(project: BookProject): boolean {
  return !project.manuscriptFrontMatter || project.manuscriptFrontMatter.some((item) => /contents/i.test(item.type));
}

export function baseFrontMatterPageCount(project: BookProject): number {
  return project.manuscriptFrontMatter?.length || FRONT_MATTER_PAGE_COUNT;
}

export function frontMatterPageCount(project: BookProject): number {
  return baseFrontMatterPageCount(project) + (hasTableOfContents(project) ? tableOfContentsPageCount(project) - 1 : 0);
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
