# PuzzlePress

PuzzlePress is a local-first Next.js app for creating large-print, print-ready word search books for Amazon KDP. Projects stay in browser storage. Imported manuscripts, generated grids, template settings, and project backups remain under the publisher’s control.

## Included in the MVP

- Local project library with a complete 1950s nostalgia demo book
- Structured JSON and CSV import (`book_title`, `section`, `puzzle`, `blurb`, `words`)
- Display-word/grid-word separation and normalization
- Duplicate, forbidden-character, empty-word, and grid-length validation
- Seeded deterministic generation with 15×15, 17×17, 20×20, and auto-fit grids
- Horizontal, vertical, diagonal, and optional backwards placement
- Stored solution coordinates and answer-key highlighting
- Ten reusable interior templates, including eight image-forward SVG themes
- Per-book cover, title-page, section-divider, and puzzle-page artwork attachments
- Template SVG motifs are rasterized in grayscale and embedded in exported print PDFs
- Automatic table of contents with page numbers shared by preview and PDF export
- 8.5×11 page preview with odd/even gutter awareness and live grid regeneration
- Server-rendered puzzle, solution, and combined PDFs
- JSON project backup and template JSON export
- Large-print defaults, front matter, dividers, and back matter

## Run locally

Requires Node.js 20.9 or later.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Use **Import data** to load a manuscript or start from the included demo.

## Verify

```bash
npm test
npm run lint
npm run build
```

## Import formats

JSON follows the project shape shown in `src/data/sample-book.ts`. A minimal CSV can use one row per puzzle:

```csv
book_title,section,puzzle,blurb,words
Growing Up in the 1950s,School Days,Recess Games,Remember when recess meant fresh air?,HOPSCOTCH|MARBLES|JUMP ROPE|KICKBALL
```

Repeated rows with the same section and puzzle title are merged. Words may be separated with pipes, semicolons, or commas (quote the CSV cell when using commas).

## Architecture

- `src/types/puzzle.ts` — portable book, template, grid, and solution models
- `src/lib/puzzle-generator.ts` — UI-independent deterministic generator and validation
- `src/lib/importers.ts` — CSV and JSON adapters
- `src/lib/storage.ts` — browser-local persistence adapter
- `src/app/api/export/pdf/route.ts` — server-side PDF composition
- `src/components/StudioApp.tsx` — local-first editor workflow

The `Puzzle` and `BookSection` models keep puzzle content separate from rendering. Future crossword, maze, trivia, and coloring-page generators can implement their own generated payloads while sharing the project, template, preview, and export layers.

## Print note

The PDF endpoint emits exact 8.5×11-inch pages with embedded standard fonts and grayscale artwork. Always run the exported file through Amazon KDP’s Print Previewer before publication. Cover PDF export remains disabled until a cover template includes final page count, paper type, bleed, and spine dimensions.
