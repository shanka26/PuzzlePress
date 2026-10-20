import type { BookProject } from "@/types/puzzle";
import { generatePuzzle, puzzleGenerationConfig } from "./puzzle-generator";

export async function generateImportedProject(project: BookProject, onProgress: (completed: number, total: number) => void) {
  const total = project.sections.reduce((sum, section) => sum + section.puzzles.length, 0);
  let completed = 0;
  const failures: string[] = [];
  const sections: BookProject["sections"] = [];
  onProgress(0, total);
  await new Promise((resolve) => setTimeout(resolve, 0));
  for (const section of project.sections) {
    const puzzles: BookProject["sections"][number]["puzzles"] = [];
    for (const puzzle of section.puzzles) {
      try {
        const config = puzzleGenerationConfig(puzzle, project.settings);
        puzzles.push({ ...puzzle, generated: generatePuzzle(config.words, config.options) });
      } catch (error) {
        puzzles.push({ ...puzzle, generated: undefined });
        failures.push(puzzle.title + ": " + (error instanceof Error ? error.message : "Generation failed"));
      }
      onProgress(++completed, total);
      // Allow the browser to paint progress between puzzles.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    sections.push({ ...section, puzzles });
  }
  return { project: { ...project, sections }, total, generated: total - failures.length, failures };
}
