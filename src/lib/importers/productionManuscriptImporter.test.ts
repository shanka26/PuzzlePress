import { describe, expect, it } from "vitest";
import fixture from "../../../tests/fixtures/generic_production_manuscript_v2.json";
import { sampleBook } from "../../data/sample-book";
import { parseProjectJsonWithResult } from "../importers";
import { convertProductionManuscriptToBookProject, detectProductionManuscriptJson, normalizeProductionManuscriptJson, validateProductionManuscriptJson } from "./productionManuscriptImporter";

const copy = <T,>(value: T): T => structuredClone(value);

describe("production manuscript v2 importer", () => {
  it("detects and imports a valid production manuscript", () => {
    expect(detectProductionManuscriptJson(fixture)).toBe(true);
    const result = parseProjectJsonWithResult(JSON.stringify(fixture), sampleBook);
    expect(result.importType).toBe("production-manuscript-v2");
    expect(result.summary).toMatchObject({ title: fixture.title, sections: 2, puzzles: 2, words: 12, frontMatterPages: 4, backMatterPages: 2 });
  });

  it("does not require a cover and ignores an older cover field", () => {
    expect(validateProductionManuscriptJson(fixture).valid).toBe(true);
    const normalized = normalizeProductionManuscriptJson({ ...fixture, cover: { data: "ignored" } });
    expect(normalized).not.toHaveProperty("cover");
  });

  it("generates wordObjects from words without changing display text", () => {
    const normalized = normalizeProductionManuscriptJson(fixture);
    const puzzle = normalized.sections[0].puzzles[0];
    expect(puzzle.words[0]).toBe("Alpha One");
    expect(puzzle.wordObjects[0]).toEqual({ display: "Alpha One", normalized: "ALPHAONE" });
    expect(puzzle.wordObjects[1].normalized).toBe("BETATWO");
  });

  it("generates words from wordObjects", () => {
    const normalized = normalizeProductionManuscriptJson(fixture);
    expect(normalized.sections[1].puzzles[0].words).toEqual(["Item One", "Item Two", "Item Three", "Item Four", "Item Five", "Item Six"]);
  });

  it("warns about duplicate words and duplicate puzzle titles", () => {
    const value = copy(fixture);
    value.sections[0].puzzles[0].words[1] = value.sections[0].puzzles[0].words[0];
    value.sections[1].puzzles[0].title = value.sections[0].puzzles[0].title;
    const codes = validateProductionManuscriptJson(value).warnings.map((warning) => warning.code);
    expect(codes).toContain("duplicate_words");
    expect(codes).toContain("duplicate_puzzle_title");
  });

  it("applies neutral typography defaults when typography is missing", () => {
    const value = copy(fixture) as Record<string, unknown>; delete value.typography;
    const validation = validateProductionManuscriptJson(value);
    const normalized = normalizeProductionManuscriptJson(value);
    expect(validation.warnings.some((warning) => warning.code === "missing_typography")).toBe(true);
    expect(normalized.typography.interior.pageTitle.fontFamily).toBe("Georgia");
    expect(normalized.typography.interior.body.fontFamily).toBe("Arial");
    expect(normalized.typography.interior.gridLetters.fontFamily).toBe("Courier New");
  });

  it("rejects unsupported project types", () => {
    const validation = validateProductionManuscriptJson({ ...fixture, projectType: "maze" });
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((error) => error.code === "unsupported_project_type")).toBe(true);
  });

  it("recalculates counts and warns when stored counts disagree", () => {
    const value = copy(fixture); value.validationSummary.wordCount = 99;
    const validation = validateProductionManuscriptJson(value);
    expect(validation.summary).toMatchObject({ sectionCount: 2, puzzleCount: 2, wordCount: 12 });
    expect(validation.warnings.some((warning) => warning.code === "validation_summary_mismatch")).toBe(true);
  });

  it("preserves unknown optional fields", () => {
    const manuscript = normalizeProductionManuscriptJson(fixture);
    const project = convertProductionManuscriptToBookProject(manuscript);
    expect(project.extraMetadata?.customWorkflowFlag).toBe("preserve-me");
    expect(project.metadata?.customMetadataField).toBe("preserved");
    expect(project.sourceData?.customWorkflowFlag).toBe("preserve-me");
  });

  it("imports generic front matter, back matter, and section dividers in order", () => {
    const project = convertProductionManuscriptToBookProject(normalizeProductionManuscriptJson(fixture));
    expect(project.manuscriptFrontMatter?.map((page) => page.type)).toEqual(["titlePage", "copyrightPage", "instructionsPage", "customFrontPage"]);
    expect(project.manuscriptBackMatter?.map((page) => page.type)).toEqual(["answerKeyIntro", "customClosingPage"]);
    expect(project.sections.map((section) => section.dividerPage?.headline)).toEqual(["Alpha Divider", "Beta Divider"]);
  });

  it("does not inject a series, audience, theme, or fixture book content", () => {
    const value = copy(fixture);
    delete (value as Partial<typeof fixture>).series;
    value.title = "Unclassified Manuscript";
    value.metadata.intendedAudience = [];
    const project = convertProductionManuscriptToBookProject(normalizeProductionManuscriptJson(value));
    expect(project.series).toBe("");
    expect(project.title).toBe("Unclassified Manuscript");
    expect(JSON.stringify(project)).not.toMatch(/1950s|nostalgia|church memories/i);
  });

  it("preserves complete production metadata on BookProject", () => {
    const project = convertProductionManuscriptToBookProject(normalizeProductionManuscriptJson(fixture));
    expect(project).toMatchObject({ publisher: fixture.publisher, description: fixture.description, metadata: { language: "en-US" }, reviewChecklist: fixture.qualityChecklist, strategyNotes: fixture.positioning, revisionHistory: fixture.revisionHistory });
    expect(project.typography?.interior.gridLetters.fontFamily).toBe("Atkinson Hyperlegible Mono");
    expect(project.typography?.interior.gridLetters.sizePt).toBe(22);
    expect(project.interiorLayout?.marginsInches?.insideGutter).toBe(.85);
    expect(project.researchNotes).toEqual(fixture.sourceGrounding);
    expect(project.validationNotes).toHaveProperty("recalculated");
  });

  it("returns hard errors for missing required manuscript content", () => {
    const value = copy(fixture); value.title = ""; value.sections[0].name = ""; value.sections[0].puzzles[0].title = ""; value.sections[0].puzzles[0].words = ["", "A", "B", "C"];
    const codes = validateProductionManuscriptJson(value).errors.map((error) => error.code);
    expect(codes).toEqual(expect.arrayContaining(["missing_title", "missing_section_name", "missing_puzzle_title", "empty_normalized_word", "too_few_words"]));
  });

  it("normalizes per-puzzle layout recommendations to the senior preset", () => {
    const project = convertProductionManuscriptToBookProject(normalizeProductionManuscriptJson(fixture));
    expect(project.sections[0].puzzles[0]).toMatchObject({ gridSizeRecommendation: "16x16", allowBackwards: false });
    expect(project.sections[1].puzzles[0].allowBackwards).toBe(false);
  });
});
