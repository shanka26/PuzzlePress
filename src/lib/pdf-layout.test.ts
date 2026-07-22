import { describe, expect, it } from "vitest";
import { calculatePuzzlePageLayout, resolveWordColumns } from "./pdf-layout";

describe("PDF puzzle-page layout", () => {
  it("keeps a normal large-print list clear of a grid wider than 75% of the page", () => {
    const layout = calculatePuzzlePageLayout({ wordCount: 10, wordColumns: resolveWordColumns(10, "auto"), left: 54, availableWidth: 522, hasBlurb: true });
    expect(layout.gridSize / 612).toBeGreaterThan(0.75);
    expect(layout.wordBottomY - layout.gridTopY).toBeGreaterThanOrEqual(layout.clearance);
  });

  it("uses an accessible four-column band for normal 20-word puzzles", () => {
    const columns = resolveWordColumns(20, "auto");
    const layout = calculatePuzzlePageLayout({ wordCount: 20, wordColumns: columns, left: 54, availableWidth: 522, hasBlurb: true });
    expect(columns).toBe(4);
    expect(layout.gridSize / 612).toBeGreaterThan(0.75);
    expect(layout.wordBottomY - layout.gridTopY).toBeGreaterThanOrEqual(layout.clearance);
  });

  it("raises preferred senior columns when the word list would crowd the grid", () => {
    const columns = resolveWordColumns(20, 2);
    const layout = calculatePuzzlePageLayout({ wordCount: 20, wordColumns: columns, left: 54, availableWidth: 522, hasBlurb: true, wordFontSize: 18 });
    expect(columns).toBe(4);
    expect(layout.wordBottomY - layout.gridTopY).toBeGreaterThanOrEqual(layout.clearance);
    expect(layout.gridY).toBeGreaterThanOrEqual(92);
    expect(layout.gridSize / 612).toBeGreaterThan(0.7);
  });
});
