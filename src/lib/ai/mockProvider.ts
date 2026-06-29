import type { AIProvider, GenerationRequest } from "./types";
import type { GeneratedWord, ResearchInput, ResearchProject } from "@/types/research";

const sectionNames = ["Origins & Traditions", "Everyday Moments", "People & Community", "Music & Celebration", "Places We Remember", "Food & Fellowship", "Milestones", "Legacy & Reflection"];
const themeNames = ["First Memories", "Favorite Traditions", "Gathering Together", "Sounds of the Day", "Around the Neighborhood", "At the Table", "Special Occasions", "Stories We Share", "Sunday Best", "Road Trips", "Family Sayings", "Lasting Lessons"];
const vocabulary = ["MEMORIES","TRADITION","FAMILY","FRIENDS","TOGETHER","CELEBRATE","HERITAGE","LAUGHTER","MUSIC","DANCING","SUNDAY","DINNER","REUNION","WELCOME","STORIES","COMMUNITY","JOYFUL","KINDNESS","COURAGE","LEGACY","PORCH","PICNIC","CHURCH","CHOIR","HARMONY","NEIGHBORS","SCHOOL","TEACHER","PLAYGROUND","RADIO","RECORDS","MELODY","KITCHEN","RECIPE","SUPPER","GARDEN","SUMMER","HOLIDAY","JOURNEY","HOMECOMING","COLLEGE","CAMPUS","FRIENDSHIP","ROMANCE","DEVOTION","FAITH","HOPE","GRACE","PRAYER","GOSPEL","MOTOWN","RHYTHM","SOULFUL","CONCERT","DREAMS","PIONEERS","LEADERS","SERVICE","WISDOM","RESPECT","UNITY","ALBUM","DANCEHALL","FESTIVAL","PARADE","COOKOUT","SCRAPBOOK","PHOTOGRAPH","LETTER","TELEPHONE","AUTOMOBILE","BARBERSHOP","BEAUTYSHOP","FRONTYARD","HOMETOWN","CLASSROOM","GRADUATION","HOMECOMING","MARCHING","BANDSTAND","FELLOWSHIP","TESTIMONY","HYMNAL","SERMON","USHERS","POTLUCK","BISCUITS","COBBLER","LEMONADE","CHECKERS","HOPSCOTCH","MARBLES","SKIPPING","COURTSHIP","WEDDING","ANNIVERSARY","SWEETHEART","PARTNERS","PROMISE"];

export function normalizeResearchWord(value: string) { return value.toUpperCase().replace(/[^A-Z]/g, ""); }
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
function hash(value: string) { let result = 2166136261; for (const char of value) result = Math.imul(result ^ char.charCodeAt(0), 16777619); return result >>> 0; }

function wordsFor(seed: string, count: number): GeneratedWord[] {
  const start = hash(seed) % vocabulary.length;
  const chosen: GeneratedWord[] = [];
  for (let i = 0; chosen.length < count; i++) {
    const display = vocabulary[(start + i * 17) % vocabulary.length];
    const normalized = normalizeResearchWord(display);
    if (!chosen.some((word) => word.normalized === normalized)) chosen.push({ display, normalized, category: "theme" });
  }
  return chosen;
}

export function createDraftResearchProject(input: ResearchInput): ResearchProject {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), createdAt: now, updatedAt: now, status: "draft", ...input,
    marketResearch: { audience: "", buyerIntent: [], keywordIdeas: [], adjacentNiches: [], differentiationAngles: [], competitionNotes: [], riskNotes: [], recommendedPositioning: "" },
    generatedBook: { title: input.seedIdea, subtitle: "", sections: [] },
  };
}

export function generateMockProject(input: ResearchInput, existing?: ResearchProject): ResearchProject {
  const project = existing || createDraftResearchProject(input);
  const audience = input.targetAudience || (input.format === "large-print-word-search" ? "Adults and seniors who enjoy accessible, memory-rich puzzles" : "Word-search and activity-book readers");
  const focus = [input.decade, input.culturalFocus, input.religiousFocus].filter(Boolean).join(", ");
  const sections = Array.from({ length: input.sectionCount }, (_, sectionIndex) => {
    const base = sectionNames[sectionIndex % sectionNames.length];
    const name = sectionIndex === 0 && input.decade ? `${input.decade} Beginnings` : base;
    return { id: `${slug(name)}-${sectionIndex + 1}`, name, description: `${name} explored through specific, welcoming puzzle themes.`, puzzles: Array.from({ length: input.puzzlesPerSection }, (_, puzzleIndex) => {
      const themeIndex = sectionIndex * input.puzzlesPerSection + puzzleIndex;
      const baseTheme = themeNames[themeIndex % themeNames.length];
      const theme = themeIndex < themeNames.length ? baseTheme : `${baseTheme} ${Math.floor(themeIndex / themeNames.length) + 1}`;
      return { id: `${slug(theme)}-${sectionIndex + 1}-${puzzleIndex + 1}`, title: theme, blurb: `Remember the people, places, and small details that made ${theme.toLowerCase()} meaningful?`, words: wordsFor(`${input.seedIdea}:${sectionIndex}:${puzzleIndex}`, input.wordsPerPuzzle) };
    }) };
  });
  const now = new Date().toISOString();
  return { ...project, ...input, updatedAt: now, status: "generated",
    marketResearch: {
      audience, buyerIntent: ["A relaxing personal activity", "A thoughtful nostalgia gift", "A conversation starter for families"],
      keywordIdeas: [input.seedIdea, `${input.seedIdea} large print`, `${input.seedIdea} gift`, `${input.seedIdea} word search for adults`, focus].filter(Boolean) as string[],
      adjacentNiches: ["Nostalgia activity books", "Family-history gifts", "Large-print brain games"],
      differentiationAngles: ["Specific lived-experience themes", "Warm reflection blurbs", "Readable production design"],
      competitionNotes: ["Validate title phrasing and current search results manually before publishing.", "Broad themes may need a sharper audience promise."],
      riskNotes: ["Generated cultural details require human review for accuracy and sensitivity.", "No live marketplace data was used."],
      recommendedPositioning: `A ${input.tone?.join(", ") || "warm and engaging"} ${input.format.replaceAll("-", " ")} for ${audience.toLowerCase()}.`,
    },
    generatedBook: { series: input.decade ? "Remember When?" : "PuzzlePress Collections", title: input.seedIdea, subtitle: `A ${input.tone?.[0] || "Joyful"} Collection of ${input.sectionCount * input.puzzlesPerSection} Themed Puzzles`, author: "Publisher Name", description: `A carefully structured puzzle book centered on ${input.seedIdea}.`, coverDirection: "Use one bold focal image, high-contrast title typography, and a restrained palette tied to the subject. Verify all cultural symbols with a knowledgeable human reviewer.", interiorDirection: `${input.format === "large-print-word-search" ? "Large-print" : "Clear"} grids, generous margins, section dividers, and short optional reflection blurbs.`, sections },
  };
}

export class MockResearchProvider implements AIProvider {
  readonly name = "Local deterministic generator";
  async generate(request: GenerationRequest) { return generateMockProject(request.input, request.project); }
}
