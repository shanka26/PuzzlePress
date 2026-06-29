import { describe, expect, it } from "vitest";
import { generateMockProject } from "./ai/mockProvider";
import { toPuzzlePressJson, toResearchCsv, toResearchMarkdown } from "./research-export";
import { validateResearchProject } from "./research-validation";
import type { ResearchInput } from "@/types/research";

const input: ResearchInput = { seedIdea: "Family Reunion Word Search", format: "large-print-word-search", sectionCount: 2, puzzlesPerSection: 2, wordsPerPuzzle: 10, tone: ["joyful"] };

describe("research generator", () => {
  it("generates the exact requested structure deterministically", () => {
    const first = generateMockProject(input);
    const second = generateMockProject(input);
    expect(first.generatedBook.sections).toHaveLength(2);
    expect(first.generatedBook.sections[0].puzzles).toHaveLength(2);
    expect(first.generatedBook.sections[0].puzzles[0].words).toHaveLength(10);
    expect(first.generatedBook.sections[0].puzzles[0].words).toEqual(second.generatedBook.sections[0].puzzles[0].words);
    expect(validateResearchProject(first)).toEqual([]);
  });

  it("exports the PuzzlePress schema, flat CSV, and report", () => {
    const project = generateMockProject(input);
    const exported = toPuzzlePressJson(project);
    expect(exported.sections[0].puzzles[0].wordObjects[0].normalized).toMatch(/^[A-Z]+$/);
    expect(toResearchCsv(project)).toContain("NormalizedWord10");
    expect(toResearchMarkdown(project)).toContain("## Suggested cover direction");
  });

  it("blocks duplicate words", () => {
    const project = generateMockProject(input);
    project.generatedBook.sections[0].puzzles[0].words[1] = project.generatedBook.sections[0].puzzles[0].words[0];
    expect(validateResearchProject(project).some((issue) => issue.severity === "error" && issue.message.includes("Duplicate"))).toBe(true);
  });

  it("blocks normalized values that do not represent their display words", () => {
    const project = generateMockProject(input);
    project.generatedBook.sections[0].puzzles[0].words[0].normalized = "WRONG";
    expect(validateResearchProject(project).some((issue) => issue.message.includes("does not match"))).toBe(true);
  });

  it("generates exact, unique, matching word lists across varied concepts", () => {
    for (const seedIdea of ["1950s Nostalgia", "Black Family Reunion", "Gospel Music", "HBCU Memories", "Motown and Soul"]) {
      const project = generateMockProject({ ...input, seedIdea, sectionCount: 4, puzzlesPerSection: 5, wordsPerPuzzle: 20 });
      expect(validateResearchProject(project)).toEqual([]);
      for (const section of project.generatedBook.sections) for (const puzzle of section.puzzles) {
        expect(puzzle.words).toHaveLength(20);
        expect(new Set(puzzle.words.map((word) => word.normalized)).size).toBe(20);
      }
    }
  });
});
