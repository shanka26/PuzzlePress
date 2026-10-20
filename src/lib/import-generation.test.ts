import { describe, expect, it } from "vitest";
import { sampleBook } from "@/data/sample-book";
import { generateImportedProject } from "./import-generation";

describe("import puzzle generation", () => {
  it("generates grids before completing and reports progress", async () => {
    const project = { ...sampleBook, sections: [{ ...sampleBook.sections[0], puzzles: sampleBook.sections[0].puzzles.slice(0, 2) }] };
    const progress: number[] = [];
    const result = await generateImportedProject(project, (done) => progress.push(done));
    expect(result.generated).toBe(2);
    expect(result.failures).toEqual([]);
    expect(progress).toEqual([0, 1, 2]);
    expect(result.project.sections[0].puzzles.every((puzzle) => puzzle.generated?.grid.length)).toBe(true);
    expect(result.project).not.toBe(project);
  });

  it("keeps valid grids while reporting puzzles that could not be generated", async () => {
    const good = sampleBook.sections[0].puzzles[0];
    const project = { ...sampleBook, sections: [{ ...sampleBook.sections[0], puzzles: [good, { ...good, title: "Empty puzzle", words: [], wordObjects: [] }] }] };
    const result = await generateImportedProject(project, () => {});
    expect(result.total).toBe(2);
    expect(result.generated).toBe(1);
    expect(result.failures[0]).toContain("Empty puzzle");
    expect(result.project.sections[0].puzzles[1].generated).toBeUndefined();
  });
});
