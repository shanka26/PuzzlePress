import { describe, expect, it } from "vitest";
import { gunzipSync } from "node:zlib";
import { sampleBook } from "@/data/sample-book";
import { pdfExportProject, pdfExportRequest } from "./pdf-export-request";

describe("PDF export payload", () => {
  it("excludes large cover uploads and originals without changing the saved project", async () => {
    const art = { name: "art.png", mimeType: "image/png", dataUrl: "data:image/png;base64,abc", sourceDataUrl: "original" };
    const project = { ...sampleBook, assets: { fullCover: { ...art, dataUrl: "x".repeat(6_000_000) }, puzzle: art } };
    const request = await pdfExportRequest(project, "combined");
    expect((request.body as Blob).size).toBeLessThan(1_000_000);
    const exported = pdfExportProject(project, "combined");
    expect(exported.assets?.fullCover).toBeUndefined();
    expect(exported.assets?.puzzle?.dataUrl).toBe(art.dataUrl);
    expect(exported.assets?.puzzle?.sourceDataUrl).toBeUndefined();
    expect(project.assets.fullCover.dataUrl.length).toBe(6_000_000);
    expect(project.assets.puzzle.sourceDataUrl).toBe("original");
  });

  it("compresses large print content losslessly", async () => {
    const project = { ...sampleBook, frontMatter: { ...sampleBook.frontMatter, welcome: "Print content ".repeat(100_000) } };
    const request = await pdfExportRequest(project, "combined");
    expect(request.headers).toEqual({ "Content-Type": "application/gzip" });
    const decoded = JSON.parse(gunzipSync(Buffer.from(await (request.body as Blob).arrayBuffer())).toString());
    expect(decoded.project.frontMatter.welcome).toBe(project.frontMatter.welcome);
  });
});
