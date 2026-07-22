import type { BookProject, DirectionName, GridSize, PageSettings, Puzzle } from "@/types/puzzle";
import type { ProductionTypography } from "@/types/productionManuscript";

export const SENIOR_LARGE_PRINT_PRESET = {
  presetName: "Senior Large Print Word Search",
  trimSize: "8.5x11",
  gridSize: 16 as GridSize,
  maxGridSize: 17 as GridSize,
  wordsPerPuzzle: 18,
  maxWordsPerPuzzle: 20,
  wordListColumns: 2 as const,
  directions: ["horizontal", "vertical", "diagonal"] as DirectionName[],
  backwards: false,
  margins: { top: 0.65, bottom: 0.65, inside: 0.85, outside: 0.6 },
  typography: {
    gridLetters: { fontRole: "grid", fontFamily: "Atkinson Hyperlegible Mono", sizePt: 22, weight: "bold" },
    solutionLetters: { fontRole: "grid", fontFamily: "Atkinson Hyperlegible Mono", sizePt: 11, weight: "bold" },
    wordList: { fontRole: "body", fontFamily: "Atkinson Hyperlegible", sizePt: 18, columns: 2 },
    puzzleTitle: { fontRole: "heading", fontFamily: "Libre Baskerville", sizePt: 26 },
    body: { fontRole: "body", fontFamily: "Atkinson Hyperlegible", sizePt: 15 },
  },
};

export function seniorPuzzleWords(puzzle: Pick<Puzzle, "wordObjects" | "words">): string[] {
  const words = puzzle.wordObjects?.length ? puzzle.wordObjects.map((word) => word.normalized || word.display) : puzzle.words;
  return words.slice(0, SENIOR_LARGE_PRINT_PRESET.maxWordsPerPuzzle);
}

export function seniorGridSize(value: GridSize | string | null | undefined): GridSize {
  const size = Number.parseInt(String(value || ""), 10);
  if (size === 17) return 17;
  return 16;
}

export function seniorSettings(settings: PageSettings): PageSettings {
  return {
    ...settings,
    layoutVersion: 2,
    gridSize: seniorGridSize(settings.gridSize),
    wordColumns: SENIOR_LARGE_PRINT_PRESET.wordListColumns,
    directions: [...SENIOR_LARGE_PRINT_PRESET.directions],
    backwards: false,
    largePrint: true,
    margins: { ...SENIOR_LARGE_PRINT_PRESET.margins },
    trimSize: SENIOR_LARGE_PRINT_PRESET.trimSize,
  };
}

export function seniorTypography(typography?: ProductionTypography): ProductionTypography {
  const interior = typography?.interior || {};
  return {
    ...(typography || {}),
    interior: {
      ...interior,
      body: { ...(interior.body || {}), ...SENIOR_LARGE_PRINT_PRESET.typography.body },
      puzzleTitle: { ...(interior.puzzleTitle || {}), ...SENIOR_LARGE_PRINT_PRESET.typography.puzzleTitle },
      wordList: { ...(interior.wordList || {}), ...SENIOR_LARGE_PRINT_PRESET.typography.wordList },
      gridLetters: { ...(interior.gridLetters || {}), ...SENIOR_LARGE_PRINT_PRESET.typography.gridLetters },
      solutionLetters: { ...(interior.solutionLetters || {}), ...SENIOR_LARGE_PRINT_PRESET.typography.solutionLetters },
    },
  };
}

export function seniorPuzzle(puzzle: Puzzle): Puzzle {
  return {
    ...puzzle,
    gridSizeRecommendation: `${SENIOR_LARGE_PRINT_PRESET.gridSize}x${SENIOR_LARGE_PRINT_PRESET.gridSize}`,
    placementDirections: ["forward-horizontal", "forward-vertical", "forward-diagonal"],
    allowBackwards: false,
    generated: puzzle.generated && seniorGeneratedGrid(puzzle.generated) ? puzzle.generated : undefined,
  };
}

function seniorGeneratedGrid(generated: NonNullable<Puzzle["generated"]>): boolean {
  if (generated.size < Number(SENIOR_LARGE_PRINT_PRESET.gridSize) || generated.size > Number(SENIOR_LARGE_PRINT_PRESET.maxGridSize)) return false;
  if (generated.placedWords.length > SENIOR_LARGE_PRINT_PRESET.maxWordsPerPuzzle) return false;
  return generated.placedWords.every((word) => {
    if (word.coordinates.length <= 1) return true;
    const first = word.coordinates[0];
    const second = word.coordinates[1];
    const delta = { row: second.row - first.row, col: second.col - first.col };
    return delta.row >= 0 && delta.col >= 0 && Math.abs(delta.row) <= 1 && Math.abs(delta.col) <= 1;
  });
}

export function seniorProject(project: BookProject): BookProject {
  return {
    ...project,
    settings: seniorSettings(project.settings),
    typography: seniorTypography(project.typography),
    interiorLayout: {
      ...(project.interiorLayout || {}),
      pageSize: SENIOR_LARGE_PRINT_PRESET.trimSize,
      marginsInches: {
        top: SENIOR_LARGE_PRINT_PRESET.margins.top,
        bottom: SENIOR_LARGE_PRINT_PRESET.margins.bottom,
        outside: SENIOR_LARGE_PRINT_PRESET.margins.outside,
        insideGutter: SENIOR_LARGE_PRINT_PRESET.margins.inside,
      },
    },
    sections: project.sections.map((section) => ({
      ...section,
      puzzles: section.puzzles.map(seniorPuzzle),
    })),
  };
}
