import Papa from "papaparse";
import type { BookProject } from "@/types/puzzle";
import type { ResearchProject } from "@/types/research";

export function toPuzzlePressJson(project: ResearchProject) {
  const book = project.generatedBook;
  return { series: book.series || "", title: book.title, subtitle: book.subtitle, author: book.author || "", sections: book.sections.map((section) => ({ name: section.name, description: section.description, puzzles: section.puzzles.map((puzzle) => ({ title: puzzle.title, blurb: puzzle.blurb || "", words: puzzle.words.map((word) => word.display), wordObjects: puzzle.words.map(({ display, normalized }) => ({ display, normalized })) })) })) };
}

export function toResearchCsv(project: ResearchProject) {
  const book = project.generatedBook;
  const rows = book.sections.flatMap((section) => section.puzzles.map((puzzle) => {
    const row: Record<string, string> = { Series: book.series || "", Title: book.title, Subtitle: book.subtitle, Author: book.author || "", Section: section.name, SectionDescription: section.description, PuzzleTitle: puzzle.title, Blurb: puzzle.blurb || "" };
    for (let index = 0; index < project.wordsPerPuzzle; index++) { row[`Word${index + 1}`] = puzzle.words[index]?.display || ""; row[`NormalizedWord${index + 1}`] = puzzle.words[index]?.normalized || ""; }
    return row;
  }));
  return Papa.unparse(rows);
}

export function toResearchMarkdown(project: ResearchProject) {
  const research = project.marketResearch; const book = project.generatedBook;
  const total = book.sections.reduce((sum, section) => sum + section.puzzles.length, 0);
  const recommendation = total > 100 ? "Prioritize the first 80–100 puzzles after human review; retain the remainder for a sequel or bonus edition." : `Use all ${total} planned puzzles after editorial review.`;
  return `# ${book.title}: Research & Production Report\n\n## Concept summary\n${book.description || project.seedIdea}\n\n## Target buyer\n${research.audience}\n\n## Gift buyer profile\n${research.buyerIntent.map((item) => `- ${item}`).join("\n")}\n\n## Keyword ideas\n${research.keywordIdeas.map((item) => `- ${item}`).join("\n")}\n\n## Adjacent niches\n${research.adjacentNiches.map((item) => `- ${item}`).join("\n")}\n\n## Differentiation strategy\n${research.differentiationAngles.map((item) => `- ${item}`).join("\n")}\n\n## Competition risk\n${[...research.competitionNotes, ...research.riskNotes].map((item) => `- ${item}`).join("\n")}\n\n## Production recommendation\n${research.recommendedPositioning}\n\n${recommendation}\n\n## Suggested cover direction\n${book.coverDirection || "Human art direction required."}\n\n## Suggested interior direction\n${book.interiorDirection || "Use clear, readable puzzle layouts."}\n`;
}

export function toBookProject(project: ResearchProject, base: BookProject, id = crypto.randomUUID()): BookProject {
  const book = project.generatedBook;
  return { ...base, id, researchProjectId: project.id, updatedAt: new Date().toISOString(), status: "draft", title: book.title, subtitle: book.subtitle, series: book.series || "", author: book.author || "Publisher Name", sections: book.sections.map((section) => ({ id: section.id, name: section.name, description: section.description, puzzles: section.puzzles.map((puzzle) => ({ id: puzzle.id, title: puzzle.title, blurb: puzzle.blurb, words: puzzle.words.map((word) => word.display) })) })) };
}
