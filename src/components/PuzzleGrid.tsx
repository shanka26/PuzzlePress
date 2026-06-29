import type { GeneratedPuzzle } from "@/types/puzzle";

export function PuzzleGrid({ puzzle, solution = false, className = "grid-board" }: { puzzle: GeneratedPuzzle; solution?: boolean; className?: string }) {
  const solved = new Set(solution ? puzzle.placedWords.flatMap((word) => word.coordinates.map(({ row, col }) => `${row}:${col}`)) : []);
  return (
    <div className={className} style={{ gridTemplateColumns: `repeat(${puzzle.size}, 1fr)` }} aria-label={`${puzzle.size} by ${puzzle.size} word search grid`}>
      {puzzle.grid.flatMap((row, rowIndex) => row.map((letter, colIndex) => (
        <div className={`grid-cell ${solved.has(`${rowIndex}:${colIndex}`) ? "solved" : ""}`} key={`${rowIndex}-${colIndex}`}><span>{letter}</span></div>
      )))}
    </div>
  );
}
