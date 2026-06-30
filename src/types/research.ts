export type ResearchStatus = "draft" | "generated" | "reviewed" | "exported";
export type ResearchFormat = "large-print-word-search" | "standard-word-search" | "kids-activity" | "trivia" | "crossword";

export interface GeneratedWord { display: string; normalized: string; category?: string }
export interface ResearchPuzzle { id: string; title: string; blurb?: string; words: GeneratedWord[] }
export interface GeneratedSection { id: string; name: string; description: string; puzzles: ResearchPuzzle[] }

export interface ResearchProject {
  id: string;
  bookProjectId?: string;
  createdAt: string;
  updatedAt: string;
  status: ResearchStatus;
  seedIdea: string;
  targetAudience?: string;
  decade?: string;
  culturalFocus?: string;
  religiousFocus?: string;
  difficultyLevel?: string;
  tone?: string[];
  format: ResearchFormat;
  sectionCount: number;
  puzzlesPerSection: number;
  wordsPerPuzzle: number;
  marketResearch: {
    audience: string;
    buyerIntent: string[];
    keywordIdeas: string[];
    adjacentNiches: string[];
    differentiationAngles: string[];
    competitionNotes: string[];
    riskNotes: string[];
    recommendedPositioning: string;
  };
  generatedBook: {
    series?: string;
    title: string;
    subtitle: string;
    author?: string;
    description?: string;
    coverDirection?: string;
    interiorDirection?: string;
    sections: GeneratedSection[];
  };
}

export interface ResearchInput {
  seedIdea: string;
  targetAudience?: string;
  decade?: string;
  culturalFocus?: string;
  religiousFocus?: string;
  difficultyLevel?: string;
  tone?: string[];
  format: ResearchFormat;
  sectionCount: number;
  puzzlesPerSection: number;
  wordsPerPuzzle: number;
}

export interface ResearchValidationIssue {
  severity: "error" | "warning";
  path: string;
  message: string;
}
