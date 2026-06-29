import { describe, expect, it } from "vitest";
import { calculatePuzzlePageLayout } from "./pdf-layout";

describe("PDF puzzle-page layout", () => {
  it("keeps a normal large-print list clear of a grid wider than 75% of the page", () => {
    const layout = calculatePuzzlePageLayout({ wordCount: 10, left: 54, availableWidth: 522, hasBlurb: true });
    expect(layout.gridSize / 612).toBeGreaterThan(0.75);
    expect(layout.wordBottomY - layout.gridTopY).toBeGreaterThanOrEqual(layout.clearance);
  });

  it("shrinks long-list grids before allowing overlap", () => {
    const layout = calculatePuzzlePageLayout({ wordCount: 24, left: 54, availableWidth: 522, hasBlurb: true });
    expect(layout.wordBottomY - layout.gridTopY).toBeGreaterThanOrEqual(layout.clearance);
    expect(layout.gridY).toBeGreaterThanOrEqual(108);
  });
});
