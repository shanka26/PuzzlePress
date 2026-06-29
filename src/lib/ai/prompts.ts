import type { GenerationRequest } from "./types";

export function buildResearchPrompt(request: GenerationRequest): string {
  return `You are a publishing research assistant for PuzzlePress. Return strict JSON only: no markdown, comments, or prose outside JSON.
Task: ${request.task}
Create practical, respectful KDP puzzle-book content without claiming live Amazon research. Treat market observations as hypotheses for manual review. Every normalized word must contain A-Z only. Avoid duplicates within a puzzle.
Input: ${JSON.stringify(request.input)}
Return one complete ResearchProject matching this TypeScript shape: {id,createdAt,updatedAt,status,seedIdea,targetAudience?,decade?,culturalFocus?,religiousFocus?,difficultyLevel?,tone?,format,sectionCount,puzzlesPerSection,wordsPerPuzzle,marketResearch:{audience,buyerIntent,keywordIdeas,adjacentNiches,differentiationAngles,competitionNotes,riskNotes,recommendedPositioning},generatedBook:{series?,title,subtitle,author?,description?,coverDirection?,interiorDirection?,sections:[{id,name,description,puzzles:[{id,title,blurb?,words:[{display,normalized,category?}]}]}]}}.
Use exactly the requested section, puzzle, and word counts. Existing project context: ${JSON.stringify(request.project || null)}`;
}
