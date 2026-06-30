export interface PuzzlePageLayout {
  wordRows: number;
  wordStartY: number;
  wordRowStep: number;
  wordBottomY: number;
  gridX: number;
  gridY: number;
  gridSize: number;
  gridTopY: number;
  clearance: number;
}

export type WordColumnSetting = "auto" | 2 | 3 | 4 | undefined;

export function resolveWordColumns(wordCount: number, requested: WordColumnSetting): 2 | 3 | 4 {
  const accessibleMinimum = wordCount <= 12 ? 2 : wordCount <= 16 ? 3 : 4;
  if (requested === "auto" || requested === undefined) return accessibleMinimum;
  return Math.max(requested, accessibleMinimum) as 2 | 3 | 4;
}

export function calculatePuzzlePageLayout(options: {
  wordCount: number;
  wordColumns?: number;
  left: number;
  availableWidth: number;
  hasBlurb: boolean;
  wordStartY?: number;
}): PuzzlePageLayout {
  const wordRows = Math.max(1, Math.ceil(options.wordCount / (options.wordColumns ?? 2)));
  const wordStartY = options.wordStartY ?? 657;
  const wordRowStep = 15;
  const wordBottomY = wordStartY - (wordRows - 1) * wordRowStep;
  const clearance = 16;
  const maximumGridTop = wordBottomY - clearance;
  const minimumGridY = options.hasBlurb ? 92 : 64;
  const gridSize = Math.max(0, Math.min(486, options.availableWidth, maximumGridTop - minimumGridY));
  const gridY = minimumGridY;
  return {
    wordRows,
    wordStartY,
    wordRowStep,
    wordBottomY,
    gridX: options.left + (options.availableWidth - gridSize) / 2,
    gridY,
    gridSize,
    gridTopY: gridY + gridSize,
    clearance,
  };
}
