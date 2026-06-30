import type { ResearchInput, ResearchProject } from "@/types/research";

export type GenerationTask = "market-research" | "metadata" | "outline" | "section" | "puzzle" | "words" | "blurb" | "full-project";
export interface GenerationRequest { task: GenerationTask; input: ResearchInput; project?: ResearchProject; sectionId?: string; puzzleId?: string }
export interface AIProvider { readonly name: string; generate(request: GenerationRequest): Promise<ResearchProject> }

export function validateResearchInput(input: ResearchInput): string[] {
  const errors: string[] = [];
  if (!input.seedIdea?.trim()) errors.push("A book idea is required.");
  const counts: Array<[keyof Pick<ResearchInput, "sectionCount" | "puzzlesPerSection" | "wordsPerPuzzle">, number, number, string]> = [
    ["sectionCount", 1, 20, "Sections"],
    ["puzzlesPerSection", 1, 30, "Themes per section"],
    ["wordsPerPuzzle", 3, 30, "Words per puzzle"],
  ];
  for (const [key, minimum, maximum, label] of counts) {
    const value = input[key];
    if (!Number.isInteger(value) || value < minimum || value > maximum) errors.push(`${label} must be a whole number from ${minimum} to ${maximum}.`);
  }
  return errors;
}

export function validateGeneratedCounts(project: ResearchProject, input: ResearchInput): string[] {
  const errors: string[] = [];
  if (project.generatedBook.sections.length !== input.sectionCount) errors.push(`Expected ${input.sectionCount} sections but received ${project.generatedBook.sections.length}.`);
  for (const [sectionIndex, section] of project.generatedBook.sections.entries()) {
    if (section.puzzles.length !== input.puzzlesPerSection) errors.push(`Section ${sectionIndex + 1} expected ${input.puzzlesPerSection} themes but received ${section.puzzles.length}.`);
    for (const [puzzleIndex, puzzle] of section.puzzles.entries()) if (puzzle.words.length !== input.wordsPerPuzzle) errors.push(`Section ${sectionIndex + 1}, puzzle ${puzzleIndex + 1} expected ${input.wordsPerPuzzle} words but received ${puzzle.words.length}.`);
  }
  return errors;
}
