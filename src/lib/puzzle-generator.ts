import type { DirectionName, GeneratedPuzzle, GridSize, PageSettings, PlacedWord, Puzzle, PuzzleWord, ValidationIssue } from "@/types/puzzle";
import { SENIOR_LARGE_PRINT_PRESET, seniorGridSize, seniorPuzzleWords } from "./senior-preset";

const FORBIDDEN = /[^A-Za-zÀ-ÖØ-öø-ÿ0-9 '&.\-]/;

export function normalizeWord(display: string): string {
  return display.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function toPuzzleWords(words: string[]): PuzzleWord[] {
  return words.map((display) => ({ display: display.trim(), normalized: normalizeWord(display) })).filter((word) => word.display.length > 0);
}

export function validateWords(words: string[], gridSize: GridSize): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Map<string, string>();
  const max = gridSize === "auto" ? Number(SENIOR_LARGE_PRINT_PRESET.maxGridSize) : Number(gridSize);
  if (words.length > SENIOR_LARGE_PRINT_PRESET.maxWordsPerPuzzle) {
    issues.push({
      type: "long",
      word: String(words.length),
      message: `Puzzle has ${words.length} words; senior large-print puzzles allow no more than ${SENIOR_LARGE_PRINT_PRESET.maxWordsPerPuzzle}.`,
      severity: "error",
    });
  }
  for (const raw of words) {
    const word = raw.trim();
    const normalized = normalizeWord(word);
    if (!normalized) issues.push({ type: "empty", word, message: `“${word || "blank"}” has no usable letters.`, severity: "error" });
    if (FORBIDDEN.test(word)) issues.push({ type: "forbidden", word, message: `“${word}” contains a character that will be removed.`, severity: "warning" });
    if (normalized.length > max) issues.push({ type: "long", word, message: `“${word}” is longer than the ${max}×${max} grid.`, severity: "error" });
    if (seen.has(normalized) && normalized) issues.push({ type: "duplicate", word, message: `“${word}” duplicates “${seen.get(normalized)}”.`, severity: "warning" });
    else if (normalized) seen.set(normalized, word);
  }
  return issues;
}

export function puzzleGenerationConfig(puzzle: Puzzle, settings: PageSettings) {
  const recommended = Number.parseInt(puzzle.gridSizeRecommendation || "", 10);
  const gridSize: GridSize = recommended === 17 ? 17 : seniorGridSize(settings.gridSize);
  const sourceDirections = puzzle.placementDirections?.map((value) => value.toLowerCase()) || [];
  const directions = sourceDirections.length
    ? (["horizontal", "vertical", "diagonal"] as DirectionName[]).filter((direction) => sourceDirections.some((value) => value.includes(direction)))
    : settings.directions;
  return {
    words: seniorPuzzleWords(puzzle),
    options: { gridSize, directions: directions.length ? directions : SENIOR_LARGE_PRINT_PRESET.directions, backwards: false, seed: `${settings.seed}:${puzzle.id}` },
  };
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) { hash ^= seed.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}

function rngFromSeed(seed: string) {
  let state = hashSeed(seed) || 1;
  return () => { state += 0x6d2b79f5; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy;
}

function directionVectors(directions: DirectionName[], backwards: boolean) {
  const vectors: Array<[number, number]> = [];
  if (directions.includes("horizontal")) vectors.push([0, 1]);
  if (directions.includes("vertical")) vectors.push([1, 0]);
  if (directions.includes("diagonal")) vectors.push([1, 1]);
  return backwards ? [...vectors, ...vectors.map(([r, c]) => [-r, -c] as [number, number])] : vectors;
}

function attempt(words: PuzzleWord[], size: number, directions: DirectionName[], backwards: boolean, seed: string): GeneratedPuzzle | null {
  const rng = rngFromSeed(seed);
  const grid: string[][] = Array.from({ length: size }, () => Array(size).fill(""));
  const placedWords: PlacedWord[] = [];
  const vectors = directionVectors(directions, backwards);
  if (!vectors.length) return null;
  for (const word of [...words].sort((a, b) => b.normalized.length - a.normalized.length)) {
    const options: Array<{ row: number; col: number; dr: number; dc: number; score: number }> = [];
    for (const [dr, dc] of vectors) for (let row = 0; row < size; row++) for (let col = 0; col < size; col++) {
      const endRow = row + dr * (word.normalized.length - 1);
      const endCol = col + dc * (word.normalized.length - 1);
      if (endRow < 0 || endRow >= size || endCol < 0 || endCol >= size) continue;
      let valid = true; let score = 0;
      for (let i = 0; i < word.normalized.length; i++) {
        const existing = grid[row + dr * i][col + dc * i];
        if (existing && existing !== word.normalized[i]) { valid = false; break; }
        if (existing === word.normalized[i]) score++;
      }
      if (valid) options.push({ row, col, dr, dc, score });
    }
    if (!options.length) return null;
    const maxScore = Math.max(...options.map((o) => o.score));
    const best = shuffle(options.filter((o) => o.score === maxScore), rng)[0];
    const coordinates = [...word.normalized].map((letter, i) => {
      const row = best.row + best.dr * i; const col = best.col + best.dc * i;
      grid[row][col] = letter; return { row, col };
    });
    placedWords.push({ ...word, coordinates });
  }
  const alphabet = "EEEEEEEEEEEAAAAAAAAAARRRRRRRRIIIIIIIIOOOOOOOOTTTTTTTNNNNNNNSSSSSSLLLLLCCCCUUUUDDDDPPPMMMHHGGGBBFYWKVXZJQ";
  for (let row = 0; row < size; row++) for (let col = 0; col < size; col++) if (!grid[row][col]) grid[row][col] = alphabet[Math.floor(rng() * alphabet.length)];
  return { grid, size, placedWords, seed };
}

export function getSolutionCellKeys(puzzle: GeneratedPuzzle): Set<string> {
  return new Set(puzzle.placedWords.flatMap((word) => word.coordinates.map(({ row, col }) => `${row}:${col}`)));
}

export function validateGeneratedPuzzle(puzzle: GeneratedPuzzle): string[] {
  const issues: string[] = [];
  if (puzzle.grid.length !== puzzle.size || puzzle.grid.some((row) => row.length !== puzzle.size)) issues.push("Grid dimensions do not match its declared size.");
  puzzle.grid.forEach((row, rowIndex) => row.forEach((cell, colIndex) => { if (!/^[A-Z0-9]$/.test(cell)) issues.push(`Grid cell ${rowIndex}:${colIndex} is invalid.`); }));
  const seen = new Set<string>();
  for (const word of puzzle.placedWords) {
    if (!word.normalized || word.normalized !== normalizeWord(word.display)) issues.push(`Placed word ${word.display} has an incorrect normalized value.`);
    if (seen.has(word.normalized)) issues.push(`Placed word ${word.normalized} is duplicated.`); else seen.add(word.normalized);
    if (word.coordinates.length !== word.normalized.length) { issues.push(`Placed word ${word.normalized} has the wrong coordinate count.`); continue; }
    let expectedDelta: [number, number] | undefined;
    for (let index = 0; index < word.coordinates.length; index++) {
      const { row, col } = word.coordinates[index];
      if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0 || row >= puzzle.size || col >= puzzle.size) { issues.push(`Placed word ${word.normalized} has an out-of-bounds coordinate.`); continue; }
      if (puzzle.grid[row]?.[col] !== word.normalized[index]) issues.push(`Placed word ${word.normalized} does not match the grid at character ${index + 1}.`);
      if (index > 0) {
        const previous = word.coordinates[index - 1]; const delta: [number, number] = [row - previous.row, col - previous.col];
        if (!expectedDelta) expectedDelta = delta;
        if (delta[0] !== expectedDelta[0] || delta[1] !== expectedDelta[1] || Math.abs(delta[0]) > 1 || Math.abs(delta[1]) > 1 || (delta[0] === 0 && delta[1] === 0)) issues.push(`Placed word ${word.normalized} does not follow one straight adjacent line.`);
      }
    }
  }
  return [...new Set(issues)];
}

export function generatePuzzle(words: string[], options: { gridSize: GridSize; directions: DirectionName[]; backwards: boolean; seed?: string }): GeneratedPuzzle {
  const puzzleWords = toPuzzleWords(words.slice(0, SENIOR_LARGE_PRINT_PRESET.maxWordsPerPuzzle));
  if (!puzzleWords.length) throw new Error("Add at least one valid word before generating a puzzle.");
  const duplicateFree = puzzleWords.filter((word, index, all) => all.findIndex((item) => item.normalized === word.normalized) === index);
  const longest = Math.max(...duplicateFree.map((word) => word.normalized.length));
  const sizes: number[] = options.gridSize === "auto"
    ? ([Number(SENIOR_LARGE_PRINT_PRESET.gridSize), Number(SENIOR_LARGE_PRINT_PRESET.maxGridSize)]).filter((size) => size >= longest)
    : [Number(seniorGridSize(options.gridSize))];
  if (!sizes.length) throw new Error(`The longest word has ${longest} letters. Choose a larger grid or shorten it.`);
  const baseSeed = options.seed || "puzzlepress";
  for (const size of sizes) for (let retry = 0; retry < 40; retry++) {
    const result = attempt(duplicateFree, size, options.directions, false, `${baseSeed}:${retry}`);
    if (result) {
      const generated = { ...result, seed: baseSeed };
      const issues = validateGeneratedPuzzle(generated);
      const expected = new Set(duplicateFree.map((word) => word.normalized));
      const placed = new Set(generated.placedWords.map((word) => word.normalized));
      if (expected.size !== placed.size || [...expected].some((word) => !placed.has(word))) issues.push("Not every requested word was placed.");
      if (issues.length) throw new Error(`Generated puzzle failed its integrity check: ${issues.join(" ")}`);
      return generated;
    }
  }
  throw new Error(`Could not place every word in the available grid sizes. Shorten the list or enable more directions.`);
}
