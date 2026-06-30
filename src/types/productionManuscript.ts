export interface ImportWarning { code: string; path: string; message: string }
export interface ImportError { code: string; path: string; message: string }
export interface ValidationResult { valid: boolean; errors: ImportError[]; warnings: ImportWarning[]; summary?: ProductionValidationSummary }

export interface ProductionWordObject { display: string; normalized: string; [key: string]: unknown }
export interface ProductionFontRecommendation { fontFamily?: string | null; fallback?: string | null; [key: string]: unknown }
export interface ProductionTypographyRole {
  fontRole?: string | null;
  fontFamily?: string | null;
  sizePt?: number;
  weight?: string | null;
  lineHeight?: number;
  columns?: number;
  tracking?: string | null;
  [key: string]: unknown;
}
export interface ProductionTypography {
  designIntent?: string | null;
  fontPolicy?: string | null;
  fontRecommendations?: Record<string, ProductionFontRecommendation>;
  interior: Record<string, ProductionTypographyRole>;
  contrast?: Record<string, unknown>;
  [key: string]: unknown;
}
export interface ProductionMetadata {
  language?: string | null;
  trimSize?: string | null;
  interior?: string | null;
  paperType?: string | null;
  bleed?: string | null;
  targetPuzzleCount?: number;
  targetWordCount?: number;
  intendedAudience?: string[];
  backendKeywordCandidates?: string[];
  [key: string]: unknown;
}
export interface ProductionFrontMatterPage {
  type: string;
  title: string;
  body: string;
  bulletPoints?: string[];
  sectionList?: string[];
  designNotes?: string | null;
  [key: string]: unknown;
}
export interface ProductionBackMatterPage {
  type: string;
  title: string;
  body: string;
  bulletPoints?: string[];
  designNotes?: string | null;
  [key: string]: unknown;
}
export interface ProductionInteriorLayout {
  pageSize?: string | null;
  marginsInches?: { top?: number; bottom?: number; outside?: number; insideGutter?: number; [key: string]: unknown };
  puzzlePageTemplate?: Record<string, unknown>;
  sectionDividerTemplate?: Record<string, unknown>;
  solutionTemplate?: Record<string, unknown>;
  [key: string]: unknown;
}
export interface ProductionPuzzle {
  title: string;
  subtitle?: string | null;
  blurb?: string | null;
  difficulty?: string | null;
  gridSizeRecommendation?: string | null;
  directions?: string[];
  words: string[];
  wordObjects: ProductionWordObject[];
  curationNotes?: string[];
  [key: string]: unknown;
}
export interface ProductionSection {
  name: string;
  tagline?: string | null;
  description?: string | null;
  dividerPage?: { headline?: string | null; body?: string | null; [key: string]: unknown };
  puzzles: ProductionPuzzle[];
  [key: string]: unknown;
}
export interface ProductionValidationSummary { sectionCount?: number; puzzleCount?: number; wordCount?: number; uniquePuzzleTitles?: number; duplicatePuzzleTitles?: number; automatedWarnings?: unknown[]; [key: string]: unknown }
export interface ProductionRevisionHistoryItem { version?: string | null; changes?: string[]; [key: string]: unknown }

export interface ProductionManuscript {
  schemaVersion: string;
  projectType: "kdp-large-print-word-search";
  series?: string | null;
  title: string;
  subtitle?: string | null;
  author?: string | null;
  publisher?: string | null;
  description?: string | null;
  positioning?: Record<string, unknown>;
  sourceGrounding?: Array<Record<string, unknown>>;
  metadata: ProductionMetadata;
  typography: ProductionTypography;
  frontMatter: ProductionFrontMatterPage[];
  interiorLayout: ProductionInteriorLayout;
  sections: ProductionSection[];
  backMatter: ProductionBackMatterPage[];
  qualityChecklist?: string[];
  validationSummary?: ProductionValidationSummary;
  revisionHistory?: ProductionRevisionHistoryItem[];
  [key: string]: unknown;
}
