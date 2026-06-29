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

export function calculatePuzzlePageLayout(options: {
  wordCount: number;
  wordColumns?: number;
  left: number;
  availableWidth: number;
  hasBlurb: boolean;
}): PuzzlePageLayout {
  const wordRows = Math.max(1, Math.ceil(options.wordCount / (options.wordColumns ?? 2)));
  const wordStartY = 657;
  const wordRowStep = 16;
  const wordBottomY = wordStartY - (wordRows - 1) * wordRowStep;
  const clearance = 18;
  const maximumGridTop = wordBottomY - clearance;
  const minimumGridY = options.hasBlurb ? 108 : 70;
  const gridSize = Math.max(240, Math.min(468, options.availableWidth, maximumGridTop - minimumGridY));
  const gridY = Math.max(minimumGridY, maximumGridTop - gridSize);
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
