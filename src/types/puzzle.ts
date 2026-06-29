export type GridSize = 15 | 17 | 20 | "auto";
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
  blurb?: string;
  words: string[];
  generated?: GeneratedPuzzle;
}

export interface BookSection {
  id: string;
  name: string;
  description?: string;
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
}

export interface ProjectAsset {
  name: string;
  mimeType: string;
  dataUrl: string;
}

export interface PageSettings {
  gridSize: GridSize;
  directions: DirectionName[];
  backwards: boolean;
  largePrint: boolean;
  bleed: boolean;
  margins: { top: number; bottom: number; inside: number; outside: number };
  seed: string;
}

export interface BookProject {
  id: string;
  title: string;
  subtitle: string;
  series: string;
  author: string;
  updatedAt: string;
  status: "draft" | "ready";
  sections: BookSection[];
  templateId: string;
  customTemplates?: TemplateStyle[];
  assets?: {
    cover?: ProjectAsset;
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
}

export interface ValidationIssue {
  type: "duplicate" | "long" | "forbidden" | "empty";
  message: string;
  word: string;
  severity: "warning" | "error";
}
