import { describe, expect, it } from "vitest";
import { sampleBook } from "../data/sample-book";
import type { BookProject } from "@/types/puzzle";
import { buildTableOfContents, combinedPageCount, paginateTableOfContents, tableOfContentsPageCount } from "./book-pages";

describe("book pagination", () => {
  it("aligns contents entries with divider and puzzle page numbers", () => {
    const entries = buildTableOfContents(sampleBook);
    expect(entries).toEqual([
      { label: "School Days", page: 6, level: "section" },
      { label: "Recess Games", page: 7, level: "puzzle" },
      { label: "In the Classroom", page: 8, level: "puzzle" },
      { label: "Home Life", page: 9, level: "section" },
      { label: "Family Supper", page: 10, level: "puzzle" },
    ]);
  });

  it("counts front matter, contents, puzzles, solutions, and back matter", () => {
    expect(combinedPageCount(sampleBook)).toBe(17);
  });

  it("paginates long tables of contents and shifts interior page numbers", () => {
    const largeBook: BookProject = {
      ...sampleBook,
      sections: Array.from({ length: 8 }, (_, sectionIndex) => ({
        id: `section-${sectionIndex}`,
        name: `Section ${sectionIndex + 1}`,
        description: "A long section for contents pagination.",
        puzzles: Array.from({ length: 5 }, (_, puzzleIndex) => ({
          id: `puzzle-${sectionIndex}-${puzzleIndex}`,
          title: `Puzzle ${sectionIndex + 1}.${puzzleIndex + 1}`,
          words: ["ALPHA", "BRAVO", "CHARLIE"],
        })),
      })),
    };
    const entries = buildTableOfContents(largeBook);
    const tocPages = paginateTableOfContents(entries);

    expect(tableOfContentsPageCount(largeBook)).toBeGreaterThan(1);
    expect(tocPages.every((page) => page.length > 0)).toBe(true);
    expect(entries[0]).toEqual({ label: "Section 1", page: 5 + tableOfContentsPageCount(largeBook), level: "section" });
  });
});
