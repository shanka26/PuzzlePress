import { NextResponse } from "next/server";
import { convertProductionManuscriptToBookProject, detectProductionManuscriptJson, normalizeProductionManuscriptJson, validateProductionManuscriptJson } from "../../../../lib/importers/productionManuscriptImporter";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const input: unknown = await request.json();
    if (!detectProductionManuscriptJson(input)) return NextResponse.json({ success: false, errors: [{ code: "unsupported_import_format", path: "schemaVersion", message: "Expected production manuscript schemaVersion 2.x." }] }, { status: 400 });
    const validation = validateProductionManuscriptJson(input);
    if (!validation.valid) return NextResponse.json({ success: false, errors: validation.errors, warnings: validation.warnings }, { status: 400 });
    const manuscript = normalizeProductionManuscriptJson(input);
    const project = convertProductionManuscriptToBookProject(manuscript);
    const puzzles = project.sections.flatMap((section) => section.puzzles);
    return NextResponse.json({
      success: true,
      importType: "production-manuscript-v2",
      projectId: project.id,
      project,
      summary: {
        title: project.title,
        series: project.series,
        sections: project.sections.length,
        puzzles: puzzles.length,
        words: puzzles.reduce((sum, puzzle) => sum + puzzle.words.length, 0),
        frontMatterPages: manuscript.frontMatter.length,
        backMatterPages: manuscript.backMatter.length,
        warnings: validation.warnings,
      },
    });
  } catch (error) {
    return NextResponse.json({ success: false, errors: [{ code: "invalid_json", path: "$", message: error instanceof Error ? error.message : "Invalid JSON request." }] }, { status: 400 });
  }
}
