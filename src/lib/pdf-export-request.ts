import type { BookProject, ProjectAsset } from "@/types/puzzle";

export type PdfExportKind = "interior" | "solutions" | "combined" | "cover";

function exportAsset(asset?: ProjectAsset): ProjectAsset | undefined {
  return asset ? { ...asset, sourceDataUrl: undefined, repairDiagnostic: undefined } : undefined;
}

// Keep print content, but omit editor history, original uploads and cached grids.
export function pdfExportProject(project: BookProject, kind: PdfExportKind): BookProject {
  const assets = project.assets;
  return {
    ...project,
    sourceData: undefined,
    researchNotes: undefined,
    strategyNotes: undefined,
    revisionHistory: undefined,
    extraMetadata: undefined,
    importWarnings: undefined,
    customTemplates: project.customTemplates?.filter((template) => template.id === project.templateId),
    sections: project.sections.map((section) => ({
      ...section,
      puzzles: section.puzzles.map((puzzle) => ({ ...puzzle, generated: undefined })),
    })),
    assets: kind === "cover" ? {
      fullCover: exportAsset(assets?.fullCover),
      frontCover: exportAsset(assets?.frontCover),
      rearCover: exportAsset(assets?.rearCover),
      spineCover: exportAsset(assets?.spineCover),
      cover: exportAsset(assets?.cover),
      kdpTemplate: assets?.kdpTemplate ? { ...exportAsset(assets.kdpTemplate)!, dataUrl: "" } : undefined,
    } : {
      decorative: exportAsset(assets?.decorative),
      divider: exportAsset(assets?.divider),
      puzzle: exportAsset(assets?.puzzle),
    },
  };
}

export async function pdfExportRequest(project: BookProject, kind: PdfExportKind): Promise<RequestInit> {
  let body = new Blob([JSON.stringify({ project: pdfExportProject(project, kind), kind })], { type: "application/json" });
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (body.size > 1_000_000 && typeof CompressionStream !== "undefined") {
    const compressed = await new Response(body.stream().pipeThrough(new CompressionStream("gzip"))).blob();
    if (compressed.size < body.size) {
      body = compressed;
      headers["Content-Type"] = "application/gzip";
    }
  }
  if (body.size > 4_000_000) {
    throw new Error("PDF export artwork is too large to send. Use smaller image files for this export and try again.");
  }
  return { method: "POST", headers, body };
}
