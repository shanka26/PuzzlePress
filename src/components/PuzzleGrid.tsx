import type { GeneratedPuzzle } from "@/types/puzzle";

export function PuzzleGrid({ puzzle, solution = false, className = "grid-board" }: { puzzle: GeneratedPuzzle; solution?: boolean; className?: string }) {
  return (
    <div className={className} style={{ gridTemplateColumns: `repeat(${puzzle.size}, 1fr)` }} aria-label={`${puzzle.size} by ${puzzle.size} word search grid`}>
      {solution && <svg className="solution-paths" viewBox={`0 0 ${puzzle.size} ${puzzle.size}`} preserveAspectRatio="none" aria-hidden="true">
        {puzzle.placedWords.map((word) => {
          const start = word.coordinates[0]; const end = word.coordinates[word.coordinates.length - 1];
          return <line key={word.normalized} x1={start.col + .5} y1={start.row + .5} x2={end.col + .5} y2={end.row + .5} />;
        })}
      </svg>}
      {puzzle.grid.flatMap((row, rowIndex) => row.map((letter, colIndex) => (
        <div className="grid-cell" key={`${rowIndex}-${colIndex}`}><span>{letter}</span></div>
      )))}
    </div>
  );
}
