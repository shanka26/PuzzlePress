import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { POST } from "./route";
import { sampleBook } from "@/data/sample-book";
import {
  KDP_PRODUCTION_FULL_HEIGHT_IN, KDP_PRODUCTION_FULL_WIDTH_IN, KDP_PRODUCTION_PAGE_COUNT,
  KDP_PRODUCTION_PAPER_TYPE, KDP_PRODUCTION_RASTER_HEIGHT_PX, KDP_PRODUCTION_RASTER_WIDTH_PX,
  KDP_PRODUCTION_TRIM, KDP_REQUIRED_AUTHOR, KDP_REQUIRED_SUBTITLE, KDP_REQUIRED_TITLE, fullCoverTargetPixels,
} from "@/lib/cover-prep";
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
    const target = fullCoverTargetPixels(KDP_PRODUCTION_TRIM, KDP_PRODUCTION_PAGE_COUNT, KDP_PRODUCTION_PAPER_TYPE);
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
      title: KDP_REQUIRED_TITLE,
      subtitle: KDP_REQUIRED_SUBTITLE,
      author: KDP_REQUIRED_AUTHOR,
      publisher: undefined,
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
          kdpValid: true,
        },
        kdpTemplate: {
          name: "kdp-template.png",
          mimeType: "image/png",
          dataUrl: pngDataUrl,
          processedFor: "kdp-official-template",
          width: KDP_PRODUCTION_RASTER_WIDTH_PX,
          height: KDP_PRODUCTION_RASTER_HEIGHT_PX,
          targetWidth: KDP_PRODUCTION_RASTER_WIDTH_PX,
          targetHeight: KDP_PRODUCTION_RASTER_HEIGHT_PX,
          kdpValid: true,
          kdpTemplate: {
            fileKind: "png",
            widthInches: KDP_PRODUCTION_FULL_WIDTH_IN,
            heightInches: KDP_PRODUCTION_FULL_HEIGHT_IN,
            widthPoints: KDP_PRODUCTION_FULL_WIDTH_IN * 72,
            heightPoints: KDP_PRODUCTION_FULL_HEIGHT_IN * 72,
            dpi: 300,
            pageCount: KDP_PRODUCTION_PAGE_COUNT,
            trimWidthInches: KDP_PRODUCTION_TRIM.width,
            trimHeightInches: KDP_PRODUCTION_TRIM.height,
            paperType: "white",
            interiorType: "black-and-white",
            binding: "paperback",
            readingDirection: "left-to-right",
          },
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
    const pdf = await PDFDocument.load(bytes);
    const [page] = pdf.getPages();
    expect(page.getWidth()).toBeCloseTo(KDP_PRODUCTION_FULL_WIDTH_IN * 72, 5);
    expect(page.getHeight()).toBeCloseTo(KDP_PRODUCTION_FULL_HEIGHT_IN * 72, 5);
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
