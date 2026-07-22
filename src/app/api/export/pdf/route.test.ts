import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { POST } from "./route";
import { sampleBook } from "@/data/sample-book";
import { combinedPageCount } from "@/lib/book-pages";
import { fullCoverTargetPixels, parseTrimSize } from "@/lib/cover-prep";
import type { BookProject } from "@/types/puzzle";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe("PDF export route", () => {
  it("embeds template SVG icon packs and uploaded SVG puzzle art", async () => {
    const svg = await readFile(path.join(process.cwd(), "public", "template-art", "soda-fountain-1955-soda.svg"), "utf8");
    const project: BookProject = {
      ...clone(sampleBook),
      templateId: "soda-fountain-1955",
      assets: {
        puzzle: {
          name: "soda-fountain-1955-soda.svg",
          mimeType: "image/svg+xml",
          dataUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
        },
      },
    };

    const response = await POST(new Request("http://localhost/api/export/pdf", {
      method: "POST",
      body: JSON.stringify({ project, kind: "combined" }),
    }));
    const bytes = Buffer.from(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/pdf");
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(10_000);
  }, 15_000);

  it("exports a KDP cover PDF from one uploaded full-wrap image", async () => {
    const target = fullCoverTargetPixels(parseTrimSize(sampleBook.settings.trimSize), combinedPageCount(sampleBook), sampleBook.settings.paperType || sampleBook.settings.interior);
    const png = await sharp({
      create: {
        width: target.width,
        height: target.height,
        channels: 3,
        background: { r: 222, g: 196, b: 156 },
      },
    }).png().toBuffer();
    const pngDataUrl = `data:image/png;base64,${png.toString("base64")}`;
    const project: BookProject = {
      ...clone(sampleBook),
      assets: {
        fullCover: {
          name: "full-cover.png",
          mimeType: "image/png",
          dataUrl: pngDataUrl,
          processedFor: "kdp-full-cover",
          width: target.width,
          height: target.height,
          targetWidth: target.width,
          targetHeight: target.height,
        },
      },
    };

    const response = await POST(new Request("http://localhost/api/export/pdf", {
      method: "POST",
      body: JSON.stringify({ project, kind: "cover" }),
    }));
    if (!response.ok) throw new Error(await response.text());
    const bytes = Buffer.from(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/pdf");
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("rejects an unprepared full-wrap cover instead of stretching it into a KDP PDF", async () => {
    const png = await sharp({
      create: {
        width: 24,
        height: 12,
        channels: 3,
        background: { r: 222, g: 196, b: 156 },
      },
    }).png().toBuffer();
    const project: BookProject = {
      ...clone(sampleBook),
      assets: {
        fullCover: {
          name: "full-cover.png",
          mimeType: "image/png",
          dataUrl: `data:image/png;base64,${png.toString("base64")}`,
          processedFor: "kdp-full-cover",
          width: 24,
          height: 12,
        },
      },
    };

    const response = await POST(new Request("http://localhost/api/export/pdf", {
      method: "POST",
      body: JSON.stringify({ project, kind: "cover" }),
    }));

    expect(response.status).toBe(500);
    expect(await response.text()).toContain("KDP cover preflight failed");
  });
});
