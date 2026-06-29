import { describe, expect, it } from "vitest";
import { sampleBook } from "../data/sample-book";
import { buildTableOfContents, combinedPageCount } from "./book-pages";

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
});
