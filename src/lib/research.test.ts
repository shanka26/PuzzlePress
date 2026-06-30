import { describe, expect, it } from "vitest";
import { generateMockProject } from "./ai/mockProvider";
import { toBookProject, toPuzzlePressJson, toResearchCsv, toResearchMarkdown } from "./research-export";
import { validateResearchProject } from "./research-validation";
import { sampleBook } from "../data/sample-book";
import { normalizeProjectLayout, upsertProject } from "./storage";
import { validateGeneratedCounts, validateResearchInput } from "./ai/types";
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

  it("keeps a stable link when research updates an existing book", () => {
    const project = generateMockProject(input);
    const linked = toBookProject(project, structuredClone(sampleBook), "linked-book");
    const updated = toBookProject({ ...project, generatedBook: { ...project.generatedBook, title: "Updated title" } }, linked, linked.id);
    const books = upsertProject([linked, structuredClone(sampleBook)], updated);

    expect(updated.id).toBe("linked-book");
    expect(updated.researchProjectId).toBe(project.id);
    expect(books.filter((book) => book.id === "linked-book")).toHaveLength(1);
    expect(books[0].title).toBe("Updated title");
  });

  it("migrates old books to accessible auto-fit columns and print-safe margins", () => {
    const legacy = structuredClone(sampleBook);
    legacy.settings.layoutVersion = undefined;
    legacy.settings.wordColumns = 2;
    legacy.settings.margins = { top: .25, bottom: 1.5, inside: .4, outside: 1.2 };
    const migrated = normalizeProjectLayout(legacy);

    expect(migrated.settings.wordColumns).toBe("auto");
    expect(migrated.settings.margins).toEqual({ top: .5, bottom: 1, inside: .5, outside: 1 });
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

  it("enforces project-development count limits", () => {
    expect(validateResearchInput(input)).toEqual([]);
    expect(validateResearchInput({ ...input, sectionCount: 0, puzzlesPerSection: 31, wordsPerPuzzle: 2 })).toHaveLength(3);
  });

  it("detects providers that return different counts than requested", () => {
    const project = generateMockProject(input);
    expect(validateGeneratedCounts(project, input)).toEqual([]);
    project.generatedBook.sections[0].puzzles[0].words.pop();
    expect(validateGeneratedCounts(project, input)[0]).toContain("expected 10 words");
  });
});
