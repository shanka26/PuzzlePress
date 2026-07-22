import type { ImportWarning, ProductionBackMatterPage, ProductionFrontMatterPage, ProductionInteriorLayout, ProductionManuscript, ProductionMetadata, ProductionRevisionHistoryItem, ProductionTypography, ProductionValidationSummary } from "./productionManuscript";

export type GridSize = 15 | 16 | 17 | 20 | "auto";
export type DirectionName = "horizontal" | "vertical" | "diagonal";

export interface PuzzleWord {
  display: string;
  normalized: string;
}

export interface Coordinate {
  row: number;
  col: number;
}

export interface PlacedWord extends PuzzleWord {
  coordinates: Coordinate[];
}

export interface GeneratedPuzzle {
  grid: string[][];
  size: number;
  placedWords: PlacedWord[];
  seed: string;
}

export interface Puzzle {
  id: string;
  title: string;
  subtitle?: string | null;
  blurb?: string;
  words: string[];
  wordObjects?: PuzzleWord[];
  difficulty?: string | null;
  gridSizeRecommendation?: string | null;
  placementDirections?: string[];
  allowBackwards?: boolean;
  curationNotes?: string[];
  generated?: GeneratedPuzzle;
}

export interface BookSection {
  id: string;
  name: string;
  tagline?: string | null;
  description?: string;
  dividerPage?: { headline?: string | null; body?: string | null; [key: string]: unknown };
  puzzles: Puzzle[];
}

export interface TemplateStyle {
  id: string;
  name: string;
  description: string;
  accent: string;
  paper: string;
  fontFamily: "serif" | "sans";
  borderStyle: "line" | "double" | "ornate" | "none";
  artwork?: string;
  artworks?: string[];
}

export interface ProjectAsset {
  name: string;
  mimeType: string;
  dataUrl: string;
  width?: number;
  height?: number;
  originalWidth?: number;
  originalHeight?: number;
  processedFor?: "kdp-cover-panel" | "kdp-full-cover";
  upscaled?: boolean;
  targetWidth?: number;
  targetHeight?: number;
  kdpValid?: boolean;
  validationMessages?: string[];
  processingMessages?: string[];
  generationProvider?: "gemini" | "openai";
  generationModel?: string;
  generationPrompt?: string;
  generationStyle?: string;
}

export interface PageSettings {
  layoutVersion?: 2;
  gridSize: GridSize;
  wordColumns?: "auto" | 2 | 3 | 4;
  bookFont?: "template" | "serif" | "sans" | "typewriter";
  directions: DirectionName[];
  backwards: boolean;
  largePrint: boolean;
  bleed: boolean;
  margins: { top: number; bottom: number; inside: number; outside: number };
  seed: string;
  language?: string | null;
  trimSize?: string | null;
  interior?: string | null;
  paperType?: string | null;
}

export interface BookProject {
  id: string;
  researchProjectId?: string;
  title: string;
  subtitle: string;
  series: string;
  author: string;
  publisher?: string;
  description?: string;
  updatedAt: string;
  status: "draft" | "ready";
  sections: BookSection[];
  templateId: string;
  customTemplates?: TemplateStyle[];
  assets?: {
    cover?: ProjectAsset;
    fullCover?: ProjectAsset;
    frontCover?: ProjectAsset;
    rearCover?: ProjectAsset;
    decorative?: ProjectAsset;
    divider?: ProjectAsset;
    puzzle?: ProjectAsset;
  };
  settings: PageSettings;
  frontMatter: {
    welcome: string;
    howTo: string;
    copyright: string;
  };
  backMatter: {
    thankYou: string;
    otherBooks: string;
    reviewRequest: string;
  };
  manuscriptFrontMatter?: ProductionFrontMatterPage[];
  manuscriptBackMatter?: ProductionBackMatterPage[];
  metadata?: ProductionMetadata;
  typography?: ProductionTypography;
  interiorLayout?: ProductionInteriorLayout;
  reviewChecklist?: string[];
  researchNotes?: Array<Record<string, unknown>>;
  strategyNotes?: Record<string, unknown>;
  revisionHistory?: ProductionRevisionHistoryItem[];
  validationNotes?: ProductionValidationSummary;
  extraMetadata?: Record<string, unknown>;
  sourceData?: ProductionManuscript;
  importWarnings?: ImportWarning[];
}

export interface ValidationIssue {
  type: "duplicate" | "long" | "forbidden" | "empty";
  message: string;
  word: string;
  severity: "warning" | "error";
}
