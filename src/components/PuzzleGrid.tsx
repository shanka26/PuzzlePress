import type { GeneratedPuzzle } from "@/types/puzzle";
import { getSolutionCellKeys } from "@/lib/puzzle-generator";

export function PuzzleGrid({ puzzle, solution = false, className = "grid-board" }: { puzzle: GeneratedPuzzle; solution?: boolean; className?: string }) {
  const solved = solution ? getSolutionCellKeys(puzzle) : new Set<string>();
  return (
    <div className={className} style={{ gridTemplateColumns: `repeat(${puzzle.size}, 1fr)` }} aria-label={`${puzzle.size} by ${puzzle.size} word search grid`}>
      {puzzle.grid.flatMap((row, rowIndex) => row.map((letter, colIndex) => (
        <div className={`grid-cell ${solved.has(`${rowIndex}:${colIndex}`) ? "solved" : ""}`} key={`${rowIndex}-${colIndex}`}><span>{letter}</span></div>
      )))}
    </div>
  );
}
