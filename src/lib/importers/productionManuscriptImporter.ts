import type { BookProject, DirectionName, GridSize } from "@/types/puzzle";
import type {
  ImportError, ImportWarning, ProductionBackMatterPage, ProductionFrontMatterPage,
  ProductionManuscript, ProductionPuzzle, ProductionSection, ProductionTypography,
  ProductionTypographyRole, ProductionValidationSummary, ValidationResult,
} from "@/types/productionManuscript";

const SUPPORTED_PROJECT_TYPE = "kdp-large-print-word-search";
const KNOWN_TOP_LEVEL = new Set(["schemaVersion", "projectType", "series", "title", "subtitle", "author", "publisher", "description", "positioning", "sourceGrounding", "metadata", "typography", "frontMatter", "interiorLayout", "sections", "backMatter", "qualityChecklist", "validationSummary", "revisionHistory", "cover"]);
const STANDARD_FONT_HINTS = ["arial", "helvetica", "georgia", "times", "courier", "serif", "sans", "mono", "typewriter"];

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";
const optional = (value: unknown): string | null => clean(value) || null;
const strings = (value: unknown) => Array.isArray(value) ? value.map(clean).filter(Boolean) : [];
const record = (value: unknown): Record<string, unknown> => isRecord(value) ? structuredClone(value) : {};
const records = (value: unknown): Array<Record<string, unknown>> => Array.isArray(value) ? value.filter(isRecord).map((item) => structuredClone(item)) : [];
const normalizeWord = (value: string) => value.toUpperCase().replace(/[^A-Z]/g, "");
const slug = (value: string, fallback: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || fallback;
const addError = (errors: ImportError[], code: string, path: string, message: string) => errors.push({ code, path, message });
const addWarning = (warnings: ImportWarning[], code: string, path: string, message: string) => warnings.push({ code, path, message });

function rawPuzzleWords(puzzle: Record<string, unknown>) {
  const rawWords = Array.isArray(puzzle.words) ? puzzle.words.map(clean) : [];
  const rawObjects = Array.isArray(puzzle.wordObjects) ? puzzle.wordObjects.filter(isRecord) : [];
  return rawObjects.length
    ? rawObjects.map((item) => ({ display: clean(item.display), normalized: normalizeWord(clean(item.normalized) || clean(item.display)) }))
    : rawWords.map((display) => ({ display, normalized: normalizeWord(display) }));
}

function calculateSummary(input: Record<string, unknown>): ProductionValidationSummary {
  const sections = Array.isArray(input.sections) ? input.sections.filter(isRecord) : [];
  const puzzles = sections.flatMap((section) => Array.isArray(section.puzzles) ? section.puzzles.filter(isRecord) : []);
  const titles = puzzles.map((puzzle) => clean(puzzle.title).toLowerCase()).filter(Boolean);
  const uniqueTitles = new Set(titles);
  return {
    sectionCount: sections.length,
    puzzleCount: puzzles.length,
    wordCount: puzzles.reduce((sum, puzzle) => sum + rawPuzzleWords(puzzle).length, 0),
    uniquePuzzleTitles: uniqueTitles.size,
    duplicatePuzzleTitles: titles.length - uniqueTitles.size,
  };
}

export function detectProductionManuscriptJson(input: unknown): boolean {
  return isRecord(input) && typeof input.schemaVersion === "string" && input.schemaVersion.trim().startsWith("2");
}

export function validateProductionManuscriptJson(input: unknown): ValidationResult {
  const errors: ImportError[] = [];
  const warnings: ImportWarning[] = [];
  if (!isRecord(input)) {
    addError(errors, "invalid_json_shape", "$", "Production manuscript JSON must be an object.");
    return { valid: false, errors, warnings };
  }

  if (!clean(input.schemaVersion)) addWarning(warnings, "missing_schema_version", "schemaVersion", "schemaVersion is missing; legacy import should be used unless this parser was selected explicitly.");
  if (!clean(input.projectType)) addWarning(warnings, "missing_project_type", "projectType", "projectType is missing.");
  else if (clean(input.projectType) !== SUPPORTED_PROJECT_TYPE) addError(errors, "unsupported_project_type", "projectType", `Unsupported projectType: ${clean(input.projectType)}.`);
  if (!clean(input.title)) addError(errors, "missing_title", "title", "A production manuscript requires a title.");

  const sections = Array.isArray(input.sections) ? input.sections : [];
  if (!sections.length) addError(errors, "missing_sections", "sections", "At least one section is required.");
  const sectionNames = new Set<string>();
  const puzzleTitles = new Set<string>();
  for (const [sectionIndex, sectionValue] of sections.entries()) {
    const sectionPath = `sections[${sectionIndex}]`;
    if (!isRecord(sectionValue)) { addError(errors, "invalid_section", sectionPath, "Section must be an object."); continue; }
    const sectionName = clean(sectionValue.name);
    if (!sectionName) addError(errors, "missing_section_name", `${sectionPath}.name`, "Section name is required.");
    else if (sectionNames.has(sectionName.toLowerCase())) addWarning(warnings, "duplicate_section_name", `${sectionPath}.name`, `Duplicate section name: ${sectionName}.`);
    else sectionNames.add(sectionName.toLowerCase());
    if (!isRecord(sectionValue.dividerPage)) addWarning(warnings, "missing_divider_page", `${sectionPath}.dividerPage`, "A neutral divider will be created from the section name.");
    const puzzles = Array.isArray(sectionValue.puzzles) ? sectionValue.puzzles : [];
    if (!puzzles.length) addError(errors, "missing_puzzles", `${sectionPath}.puzzles`, "Section must contain at least one puzzle.");
    for (const [puzzleIndex, puzzleValue] of puzzles.entries()) {
      const puzzlePath = `${sectionPath}.puzzles[${puzzleIndex}]`;
      if (!isRecord(puzzleValue)) { addError(errors, "invalid_puzzle", puzzlePath, "Puzzle must be an object."); continue; }
      const title = clean(puzzleValue.title);
      if (!title) addError(errors, "missing_puzzle_title", `${puzzlePath}.title`, "Puzzle title is required.");
      else if (puzzleTitles.has(title.toLowerCase())) addWarning(warnings, "duplicate_puzzle_title", `${puzzlePath}.title`, `Duplicate puzzle title: ${title}.`);
      else puzzleTitles.add(title.toLowerCase());
      if (!clean(puzzleValue.blurb)) addWarning(warnings, "missing_blurb", `${puzzlePath}.blurb`, "Puzzle blurb is missing.");
      const hasWords = Array.isArray(puzzleValue.words) && puzzleValue.words.length > 0;
      const hasObjects = Array.isArray(puzzleValue.wordObjects) && puzzleValue.wordObjects.length > 0;
      if (!hasWords && !hasObjects) addError(errors, "missing_words", puzzlePath, "Puzzle requires words or wordObjects.");
      const words = rawPuzzleWords(puzzleValue);
      for (const [wordIndex, word] of words.entries()) if (!word.normalized) addError(errors, "empty_normalized_word", `${puzzlePath}.words[${wordIndex}]`, "Word is empty after A-Z normalization.");
      const validWords = words.filter((word) => word.normalized);
      if (validWords.length < 5) addError(errors, "too_few_words", puzzlePath, "Puzzle requires at least five valid normalized words.");
      const uniqueWords = new Set(validWords.map((word) => word.normalized));
      if (uniqueWords.size !== validWords.length) addWarning(warnings, "duplicate_words", puzzlePath, "Puzzle contains duplicate normalized words; original order is preserved.");
      const recommendedGrid = Number.parseInt(clean(puzzleValue.gridSizeRecommendation), 10);
      if (Number.isFinite(recommendedGrid) && validWords.some((word) => word.normalized.length > recommendedGrid)) addWarning(warnings, "word_exceeds_grid", puzzlePath, "At least one word is longer than the recommended grid size.");
    }
  }

  if (!isRecord(input.typography)) addWarning(warnings, "missing_typography", "typography", "Neutral typography defaults will be used.");
  if (!Array.isArray(input.frontMatter)) addWarning(warnings, "missing_front_matter", "frontMatter", "No front matter pages were provided.");
  else for (const [index, page] of input.frontMatter.entries()) {
    if (!isRecord(page)) { addError(errors, "invalid_front_matter_page", `frontMatter[${index}]`, "Front matter page must be an object."); continue; }
    for (const field of ["type", "title", "body"] as const) if (!clean(page[field])) addError(errors, `missing_front_matter_${field}`, `frontMatter[${index}].${field}`, `Front matter ${field} is required.`);
  }
  if (!Array.isArray(input.backMatter)) addWarning(warnings, "missing_back_matter", "backMatter", "No back matter pages were provided.");
  else for (const [index, page] of input.backMatter.entries()) {
    if (!isRecord(page)) { addError(errors, "invalid_back_matter_page", `backMatter[${index}]`, "Back matter page must be an object."); continue; }
    for (const field of ["type", "title", "body"] as const) if (!clean(page[field])) addError(errors, `missing_back_matter_${field}`, `backMatter[${index}].${field}`, `Back matter ${field} is required.`);
  }
  if (!isRecord(input.interiorLayout)) addWarning(warnings, "missing_interior_layout", "interiorLayout", "Neutral page layout defaults will be used.");
  for (const key of Object.keys(input)) if (!KNOWN_TOP_LEVEL.has(key)) addWarning(warnings, "unknown_optional_field", key, `Unknown optional field '${key}' will be preserved.`);

  if (isRecord(input.typography)) {
    const families: string[] = [];
    const visit = (value: unknown) => { if (!isRecord(value)) return; if (typeof value.fontFamily === "string") families.push(value.fontFamily); for (const child of Object.values(value)) if (isRecord(child)) visit(child); };
    visit(input.typography);
    for (const family of families) if (!STANDARD_FONT_HINTS.some((hint) => family.toLowerCase().includes(hint))) addWarning(warnings, "font_unavailable", "typography", `Font '${family}' may be unavailable; a neutral fallback will be used.`);
  }

  const summary = calculateSummary(input);
  if (isRecord(input.metadata)) {
    const targetPuzzles = Number(input.metadata.targetPuzzleCount);
    const targetWords = Number(input.metadata.targetWordCount);
    if (Number.isFinite(targetPuzzles) && targetPuzzles !== summary.puzzleCount) addWarning(warnings, "target_puzzle_count_mismatch", "metadata.targetPuzzleCount", `Expected ${targetPuzzles} puzzles; recalculated ${summary.puzzleCount}.`);
    if (Number.isFinite(targetWords) && targetWords !== summary.wordCount) addWarning(warnings, "target_word_count_mismatch", "metadata.targetWordCount", `Expected ${targetWords} words; recalculated ${summary.wordCount}.`);
  }
  if (isRecord(input.validationSummary)) {
    for (const key of ["sectionCount", "puzzleCount", "wordCount"] as const) {
      const prior = Number(input.validationSummary[key]);
      if (Number.isFinite(prior) && prior !== summary[key]) addWarning(warnings, "validation_summary_mismatch", `validationSummary.${key}`, `Stored value ${prior} does not match recalculated value ${summary[key]}.`);
    }
  }
  return { valid: errors.length === 0, errors, warnings, summary };
}

const normalizePage = <T extends ProductionFrontMatterPage | ProductionBackMatterPage>(value: Record<string, unknown>): T => ({
  ...structuredClone(value), type: clean(value.type), title: clean(value.title), body: clean(value.body),
  bulletPoints: strings(value.bulletPoints), designNotes: optional(value.designNotes),
  ...(Array.isArray(value.sectionList) ? { sectionList: strings(value.sectionList) } : {}),
}) as T;

function neutralTypography(value: unknown): ProductionTypography {
  const source = record(value);
  const interior = isRecord(source.interior) ? structuredClone(source.interior) as Record<string, ProductionTypographyRole> : {};
  return {
    ...source,
    designIntent: optional(source.designIntent),
    fontPolicy: optional(source.fontPolicy),
    interior: {
      pageTitle: { fontRole: "heading", fontFamily: "Georgia", ...record(interior.pageTitle) },
      sectionTitle: { fontRole: "heading", fontFamily: "Georgia", ...record(interior.sectionTitle) },
      body: { fontRole: "body", fontFamily: "Arial", ...record(interior.body) },
      puzzleTitle: { fontRole: "heading", fontFamily: "Georgia", ...record(interior.puzzleTitle) },
      wordList: { fontRole: "body", fontFamily: "Arial", ...record(interior.wordList) },
      gridLetters: { fontRole: "grid", fontFamily: "Courier New", ...record(interior.gridLetters) },
      solutionLetters: { fontRole: "grid", fontFamily: "Courier New", ...record(interior.solutionLetters) },
      pageNumber: { fontRole: "body", fontFamily: "Arial", ...record(interior.pageNumber) },
      ...interior,
    },
  };
}

export function normalizeProductionManuscriptJson(input: unknown): ProductionManuscript {
  const validation = validateProductionManuscriptJson(input);
  if (!validation.valid || !isRecord(input)) throw new Error(validation.errors.map((error) => `${error.path}: ${error.message}`).join("\n") || "Invalid production manuscript.");
  const source = structuredClone(input);
  delete source.cover;
  const sections: ProductionSection[] = (source.sections as unknown[]).filter(isRecord).map((section) => ({
    ...section,
    name: clean(section.name), tagline: optional(section.tagline), description: optional(section.description),
    dividerPage: isRecord(section.dividerPage) ? { ...structuredClone(section.dividerPage), headline: optional(section.dividerPage.headline), body: optional(section.dividerPage.body) } : undefined,
    puzzles: (section.puzzles as unknown[]).filter(isRecord).map((puzzle): ProductionPuzzle => {
      const providedWords = strings(puzzle.words);
      const providedObjects = Array.isArray(puzzle.wordObjects) ? puzzle.wordObjects.filter(isRecord) : [];
      const wordObjects = providedObjects.length
        ? providedObjects.map((word) => ({ ...structuredClone(word), display: clean(word.display), normalized: normalizeWord(clean(word.normalized) || clean(word.display)) }))
        : providedWords.map((display) => ({ display, normalized: normalizeWord(display) }));
      const words = providedWords.length ? providedWords : wordObjects.map((word) => word.display);
      return { ...puzzle, title: clean(puzzle.title), subtitle: optional(puzzle.subtitle), blurb: optional(puzzle.blurb), difficulty: optional(puzzle.difficulty), gridSizeRecommendation: optional(puzzle.gridSizeRecommendation), directions: strings(puzzle.directions), words, wordObjects, curationNotes: strings(puzzle.curationNotes) };
    }),
  }));
  return {
    ...source,
    schemaVersion: clean(source.schemaVersion) || "2.0",
    projectType: SUPPORTED_PROJECT_TYPE,
    series: optional(source.series), title: clean(source.title), subtitle: optional(source.subtitle), author: optional(source.author), publisher: optional(source.publisher), description: optional(source.description),
    positioning: record(source.positioning), sourceGrounding: records(source.sourceGrounding), metadata: record(source.metadata), typography: neutralTypography(source.typography),
    frontMatter: Array.isArray(source.frontMatter) ? source.frontMatter.filter(isRecord).map((page) => normalizePage<ProductionFrontMatterPage>(page)) : [],
    interiorLayout: record(source.interiorLayout), sections,
    backMatter: Array.isArray(source.backMatter) ? source.backMatter.filter(isRecord).map((page) => normalizePage<ProductionBackMatterPage>(page)) : [],
    qualityChecklist: strings(source.qualityChecklist), validationSummary: record(source.validationSummary), revisionHistory: records(source.revisionHistory),
  } as ProductionManuscript;
}

function fontSetting(typography: ProductionTypography): "serif" | "sans" | "typewriter" {
  const family = clean(typography.interior.body?.fontFamily).toLowerCase();
  if (family.includes("courier") || family.includes("mono") || family.includes("typewriter")) return "typewriter";
  if (family.includes("georgia") || family.includes("times") || family === "serif") return "serif";
  return "sans";
}

function gridSetting(value: string | null | undefined): GridSize {
  const size = Number.parseInt(value || "", 10);
  return size === 15 || size === 17 || size === 20 ? size : "auto";
}

function directionSettings(values: string[] | undefined): { directions: DirectionName[]; backwards: boolean } {
  const source = values?.length ? values.map((value) => value.toLowerCase()) : ["forward-horizontal", "forward-vertical", "forward-diagonal"];
  const directions = (["horizontal", "vertical", "diagonal"] as DirectionName[]).filter((direction) => source.some((value) => value.includes(direction)));
  return { directions: directions.length ? directions : ["horizontal", "vertical", "diagonal"], backwards: source.some((value) => value.includes("backward")) };
}

export function convertProductionManuscriptToBookProject(input: ProductionManuscript): BookProject {
  const validation = validateProductionManuscriptJson(input);
  if (!validation.valid) throw new Error(validation.errors.map((error) => `${error.path}: ${error.message}`).join("\n"));
  const margins = input.interiorLayout.marginsInches || {};
  const clampMargin = (value: unknown, fallback: number) => Math.min(1, Math.max(.5, typeof value === "number" && Number.isFinite(value) ? value : fallback));
  const firstPuzzle = input.sections[0]?.puzzles[0];
  const defaults = directionSettings(firstPuzzle?.directions);
  const known = new Set(KNOWN_TOP_LEVEL); const extraMetadata: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) if (!known.has(key)) extraMetadata[key] = structuredClone(value);
  const bleedValue = clean(input.metadata.bleed).toLowerCase();
  return {
    id: crypto.randomUUID(), title: input.title, subtitle: input.subtitle || "", series: input.series || "", author: input.author || "", publisher: input.publisher || "", description: input.description || "",
    updatedAt: new Date().toISOString(), status: "draft", templateId: "clean-classic",
    settings: { layoutVersion: 2, gridSize: gridSetting(firstPuzzle?.gridSizeRecommendation), wordColumns: "auto", bookFont: fontSetting(input.typography), directions: defaults.directions, backwards: defaults.backwards, largePrint: true, bleed: ["true", "yes", "bleed"].includes(bleedValue), margins: { top: clampMargin(margins.top, .5), bottom: clampMargin(margins.bottom, .55), inside: clampMargin(margins.insideGutter, .75), outside: clampMargin(margins.outside, .5) }, seed: crypto.randomUUID(), language: optional(input.metadata.language), trimSize: optional(input.metadata.trimSize || input.interiorLayout.pageSize), interior: optional(input.metadata.interior), paperType: optional(input.metadata.paperType) },
    sections: input.sections.map((section, sectionIndex) => ({ id: slug(section.name, `section-${sectionIndex + 1}`), name: section.name, tagline: section.tagline, description: section.description || "", dividerPage: section.dividerPage, puzzles: section.puzzles.map((puzzle, puzzleIndex) => { const direction = directionSettings(puzzle.directions); return { id: `${slug(section.name, `section-${sectionIndex + 1}`)}-${slug(puzzle.title, `puzzle-${puzzleIndex + 1}`)}`, title: puzzle.title, subtitle: puzzle.subtitle, blurb: puzzle.blurb || "", words: puzzle.words, wordObjects: puzzle.wordObjects, difficulty: puzzle.difficulty, gridSizeRecommendation: puzzle.gridSizeRecommendation, placementDirections: puzzle.directions, allowBackwards: direction.backwards, curationNotes: puzzle.curationNotes }; }) })),
    frontMatter: { welcome: input.frontMatter.find((page) => /welcome|introduction/i.test(page.type))?.body || "", howTo: input.frontMatter.find((page) => /howto|instruction/i.test(page.type))?.body || "", copyright: input.frontMatter.find((page) => /copyright/i.test(page.type))?.body || "" },
    backMatter: { thankYou: input.backMatter.find((page) => /thank/i.test(page.type))?.body || "", otherBooks: input.backMatter.find((page) => /series|nextbook/i.test(page.type))?.body || "", reviewRequest: input.backMatter.find((page) => /review/i.test(page.type))?.body || "" },
    manuscriptFrontMatter: input.frontMatter, manuscriptBackMatter: input.backMatter, metadata: input.metadata, typography: input.typography, interiorLayout: input.interiorLayout,
    reviewChecklist: input.qualityChecklist || [], researchNotes: input.sourceGrounding || [], strategyNotes: input.positioning || {}, revisionHistory: input.revisionHistory || [], validationNotes: { ...input.validationSummary, recalculated: validation.summary }, extraMetadata,
    sourceData: structuredClone(input), importWarnings: validation.warnings,
  };
}
