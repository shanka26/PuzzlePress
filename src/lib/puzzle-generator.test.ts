import { describe, expect, it } from "vitest";
import { generatePuzzle, getSolutionCellKeys, normalizeWord, validateGeneratedPuzzle, validateWords } from "./puzzle-generator";

describe("normalizeWord", () => {
  it("keeps display words compatible with a letter grid", () => {
    expect(normalizeWord("TV Dinner")).toBe("TVDINNER");
    expect(normalizeWord("Yo-Yo!")).toBe("YOYO");
    expect(normalizeWord("Café")).toBe("CAFE");
  });
});

describe("validateWords", () => {
  it("reports duplicates, forbidden characters, and long words", () => {
    const issues = validateWords(["TV Dinner", "TV-DINNER", "hello!", "SUPERCALIFRAGILISTIC"], 15);
    expect(issues.some((issue) => issue.type === "duplicate")).toBe(true);
    expect(issues.some((issue) => issue.type === "forbidden")).toBe(true);
    expect(issues.some((issue) => issue.type === "long")).toBe(true);
  });
});

describe("generatePuzzle", () => {
  const words = ["HOPSCOTCH", "MARBLES", "JUMP ROPE", "KICKBALL", "JACKS", "TETHERBALL"];

  it("places every normalized word and stores coordinates", () => {
    const result = generatePuzzle(words, { gridSize: 15, directions: ["horizontal", "vertical", "diagonal"], backwards: true, seed: "test" });
    expect(result.placedWords).toHaveLength(words.length);
    for (const word of result.placedWords) {
      expect(word.coordinates.map(({ row, col }) => result.grid[row][col]).join("")).toBe(word.normalized);
    }
    expect(result.grid.every((row) => row.every((cell) => /^[A-Z]$/.test(cell)))).toBe(true);
  });

  it("is deterministic for the same seed", () => {
    const options = { gridSize: 15 as const, directions: ["horizontal", "vertical", "diagonal"] as const, backwards: true, seed: "repeatable" };
    const first = generatePuzzle(words, { ...options, directions: [...options.directions] });
    const second = generatePuzzle(words, { ...options, directions: [...options.directions] });
    expect(first).toEqual(second);
  });

  it("auto-fits a word that is too long for 15 columns", () => {
    const result = generatePuzzle(["ELECTROMAGNETISM", "SCIENCE"], { gridSize: "auto", directions: ["horizontal"], backwards: false, seed: "fit" });
    expect(result.size).toBe(17);
  });

  it("fails clearly when the word cannot fit", () => {
    expect(() => generatePuzzle(["SUPERCALIFRAGILISTICEXPIALIDOCIOUS"], { gridSize: "auto", directions: ["horizontal"], backwards: false })).toThrow(/longest word/i);
  });

  it("preserves every placement and solution highlight across seeds and direction modes", () => {
    const modes = [
      { directions: ["horizontal"] as const, backwards: false, deltas: new Set(["0:1"]) },
      { directions: ["vertical"] as const, backwards: true, deltas: new Set(["1:0", "-1:0"]) },
      { directions: ["diagonal"] as const, backwards: true, deltas: new Set(["1:1", "1:-1", "-1:-1", "-1:1"]) },
      { directions: ["horizontal", "vertical", "diagonal"] as const, backwards: true, deltas: new Set(["0:1", "0:-1", "1:0", "-1:0", "1:1", "1:-1", "-1:-1", "-1:1"]) },
    ];
    for (let seedIndex = 0; seedIndex < 100; seedIndex++) for (const mode of modes) {
      const result = generatePuzzle(words, { gridSize: 15, directions: [...mode.directions], backwards: mode.backwards, seed: `stress-${seedIndex}` });
      expect(validateGeneratedPuzzle(result)).toEqual([]);
      const highlighted = getSolutionCellKeys(result);
      expect(highlighted.size).toBeGreaterThan(0);
      for (const word of result.placedWords) {
        expect(word.coordinates.map(({ row, col }) => result.grid[row][col]).join("")).toBe(word.normalized);
        for (const coordinate of word.coordinates) expect(highlighted.has(`${coordinate.row}:${coordinate.col}`)).toBe(true);
        if (word.coordinates.length > 1) {
          const first = word.coordinates[0]; const second = word.coordinates[1];
          expect(mode.deltas.has(`${second.row - first.row}:${second.col - first.col}`)).toBe(true);
        }
      }
    }
  });

  it("detects corrupted placement coordinates instead of silently accepting them", () => {
    const result = generatePuzzle(words, { gridSize: 15, directions: ["horizontal", "vertical"], backwards: true, seed: "tamper" });
    result.placedWords[0].coordinates[0] = { row: result.size, col: 0 };
    expect(validateGeneratedPuzzle(result).some((issue) => issue.includes("out-of-bounds"))).toBe(true);
  });
});
