import type { ResearchProject, ResearchValidationIssue } from "@/types/research";
import { normalizeResearchWord } from "./ai/mockProvider";

const genericThemes = new Set(["fun words", "word search", "miscellaneous", "general knowledge", "random words"]);
const sensitiveTerms = ["slave", "primitive", "exotic", "ghetto", "tribal"];

export function validateResearchProject(project: ResearchProject, gridSize = 15): ResearchValidationIssue[] {
  const issues: ResearchValidationIssue[] = [];
  const themes = new Map<string, string>();
  if (!project.generatedBook.sections.length) issues.push({ severity: "error", path: "sections", message: "The book has no sections." });
  project.generatedBook.sections.forEach((section, sectionIndex) => {
    const sectionPath = `Section ${sectionIndex + 1}`;
    if (!section.puzzles.length) issues.push({ severity: "error", path: sectionPath, message: "Section has no puzzles." });
    section.puzzles.forEach((puzzle, puzzleIndex) => {
      const path = `${sectionPath} / Puzzle ${puzzleIndex + 1}`;
      if (!puzzle.title.trim()) issues.push({ severity: "error", path, message: "Puzzle title is empty." });
      const theme = puzzle.title.trim().toLowerCase();
      if (genericThemes.has(theme)) issues.push({ severity: "warning", path, message: "Puzzle theme is overly generic." });
      if (themes.has(theme)) issues.push({ severity: "warning", path, message: `Duplicate puzzle theme; first used in ${themes.get(theme)}.` }); else themes.set(theme, path);
      if (puzzle.words.length !== project.wordsPerPuzzle) issues.push({ severity: "error", path, message: `Expected ${project.wordsPerPuzzle} words; found ${puzzle.words.length}.` });
      const seen = new Set<string>();
      puzzle.words.forEach((word, wordIndex) => {
        const wordPath = `${path} / Word ${wordIndex + 1}`;
        if (!/^[A-Z]+$/.test(word.normalized)) issues.push({ severity: "error", path: wordPath, message: "Normalized word must contain A-Z only." });
        if (word.normalized !== normalizeResearchWord(word.display)) issues.push({ severity: "error", path: wordPath, message: "Normalized word does not match the display word." });
        if (seen.has(word.normalized)) issues.push({ severity: "error", path: wordPath, message: "Duplicate word in this puzzle." });
        seen.add(word.normalized);
        if (word.normalized.length > gridSize) issues.push({ severity: "warning", path: wordPath, message: `Word is longer than the selected ${gridSize}×${gridSize} grid.` });
        if (sensitiveTerms.some((term) => word.display.toLowerCase().includes(term))) issues.push({ severity: "warning", path: wordPath, message: "Potentially sensitive wording requires human review." });
      });
    });
  });
  return issues;
}
