import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { templates } from "./templates";

describe("template library", () => {
  it("ships twenty distinct templates", () => {
    expect(templates).toHaveLength(20);
    expect(new Set(templates.map((template) => template.id)).size).toBe(20);
  });

  it("features SVG artwork on most templates", () => {
    const illustrated = templates.filter((template) => template.artwork?.endsWith(".svg"));
    expect(illustrated.length).toBeGreaterThanOrEqual(16);
  });

  it("gives every creative expansion template its own SVG artwork", () => {
    const expandedIds = ["celestial-atlas", "jazz-age", "woodland-story", "deco-sunrise", "soda-fountain-1955", "front-porch-memories", "classroom-days", "saturday-matinee", "home-life-supper-table", "growing-up-1960s"];
    const expanded = templates.filter((template) => expandedIds.includes(template.id));
    expect(expanded).toHaveLength(expandedIds.length);
    expect(expanded.every((template) => template.artwork?.endsWith(".svg"))).toBe(true);
    expect(new Set(expanded.map((template) => template.artwork)).size).toBe(expandedIds.length);
  });

  it("gives every 1950s template an alternating SVG icon pack", () => {
    const fiftiesIds = ["soda-fountain-1955", "front-porch-memories", "classroom-days", "saturday-matinee", "home-life-supper-table"];
    const fifties = templates.filter((template) => fiftiesIds.includes(template.id));
    const allIcons = fifties.flatMap((template) => template.artworks || []);

    expect(fifties).toHaveLength(fiftiesIds.length);
    for (const template of fifties) {
      expect(template.artworks?.length).toBeGreaterThanOrEqual(6);
      expect(template.artworks?.length).toBeLessThanOrEqual(10);
      expect(template.artworks?.every((artwork) => artwork.startsWith("/template-art/") && artwork.endsWith(".svg"))).toBe(true);
      expect(new Set(template.artworks).size).toBe(template.artworks?.length);
    }
    expect(new Set(allIcons).size).toBe(allIcons.length);
  });

  it("ships the 1960s black-and-white icon pack", () => {
    const template = templates.find((item) => item.id === "growing-up-1960s");
    expect(template?.artwork).toBe("/template-art/growing-up-1960s.svg");
    expect(template?.accent).toBe("#252525");
    expect(template?.artworks).toHaveLength(10);
    expect(template?.artworks?.every((artwork) => artwork.startsWith("/template-art/growing-up-1960s-") && artwork.endsWith(".svg"))).toBe(true);
    expect(new Set(template?.artworks).size).toBe(template?.artworks?.length);
  });

  it("ships SVG artwork files that can be rasterized for PDF export", async () => {
    const artworkPaths = templates.flatMap((template) => [template.artwork, ...(template.artworks || [])]).filter((artwork): artwork is string => Boolean(artwork));
    expect(artworkPaths.length).toBeGreaterThan(0);

    for (const artwork of artworkPaths) {
      const bytes = await readFile(path.join(process.cwd(), "public", artwork.replace(/^\/+/, "")));
      const png = await sharp(bytes).resize({ width: 256, height: 256, fit: "contain" }).png().toBuffer();
      const metadata = await sharp(png).metadata();

      expect(metadata.format).toBe("png");
      expect(metadata.width).toBe(256);
      expect(metadata.height).toBe(256);
    }
  }, 15_000);
});
