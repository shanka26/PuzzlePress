import type { BookProject } from "@/types/puzzle";

export const sampleBook: BookProject = {
  id: "demo-1950s",
  title: "Growing Up in the 1950s",
  subtitle: "A Large Print Nostalgia Word Search for Seniors",
  series: "Remember When?",
  author: "PuzzlePress Studio",
  updatedAt: "2026-06-28T12:00:00.000Z",
  status: "draft",
  templateId: "vintage-nostalgia",
  settings: {
    layoutVersion: 2,
    gridSize: 15,
    wordColumns: "auto",
    bookFont: "template",
    directions: ["horizontal", "vertical", "diagonal"],
    backwards: true,
    largePrint: true,
    bleed: false,
    margins: { top: 0.5, bottom: 0.55, inside: 0.75, outside: 0.5 },
    seed: "remember-when-1950",
  },
  sections: [
    {
      id: "school-days",
      name: "School Days",
      description: "Memories of classrooms, recess, lunchboxes, and teachers.",
      puzzles: [
        { id: "recess-games", title: "Recess Games", blurb: "Remember when recess meant fresh air, laughter, and games with friends?", words: ["HOPSCOTCH", "MARBLES", "JUMP ROPE", "KICKBALL", "JACKS", "YO-YO", "TAG", "TETHERBALL", "SKIPPING", "RED ROVER"] },
        { id: "classroom", title: "In the Classroom", blurb: "Chalk dust, sharpened pencils, and the bell that started the day.", words: ["BLACKBOARD", "CHALK", "ERASER", "PENCIL", "INKWELL", "READER", "SPELLING", "DESK", "TEACHER", "BELL"] },
      ],
    },
    {
      id: "home-life",
      name: "Home Life",
      description: "The sights and sounds that made a house feel like home.",
      puzzles: [
        { id: "family-supper", title: "Family Supper", blurb: "Remember when everyone gathered around the same table at suppertime?", words: ["TV DINNER", "CASSEROLE", "MEATLOAF", "POT ROAST", "GRAVY", "BISCUITS", "APRON", "PANTRY", "DISHES", "LEFTOVERS"] },
      ],
    },
  ],
  frontMatter: {
    welcome: "Take a comfortable trip down memory lane, one word at a time.",
    howTo: "Find each listed word in the grid. Words may run across, down, diagonally, and backwards.",
    copyright: "Copyright © 2026 PuzzlePress Studio. All rights reserved.",
  },
  backMatter: {
    thankYou: "Thank you for puzzling with us.",
    otherBooks: "Look for more titles in the Remember When? series.",
    reviewRequest: "Enjoyed this book? Please consider leaving an honest review.",
  },
};
