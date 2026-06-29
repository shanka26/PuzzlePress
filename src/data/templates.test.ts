import { describe, expect, it } from "vitest";
import { templates } from "./templates";

describe("template library", () => {
  it("ships fourteen distinct templates", () => {
    expect(templates).toHaveLength(14);
    expect(new Set(templates.map((template) => template.id)).size).toBe(14);
  });

  it("features SVG artwork on most templates", () => {
    const illustrated = templates.filter((template) => template.artwork?.endsWith(".svg"));
    expect(illustrated.length).toBeGreaterThanOrEqual(11);
  });

  it("gives every creative expansion template its own SVG artwork", () => {
    const expandedIds = ["celestial-atlas", "jazz-age", "woodland-story", "deco-sunrise"];
    const expanded = templates.filter((template) => expandedIds.includes(template.id));
    expect(expanded).toHaveLength(expandedIds.length);
    expect(expanded.every((template) => template.artwork?.endsWith(".svg"))).toBe(true);
    expect(new Set(expanded.map((template) => template.artwork)).size).toBe(expandedIds.length);
  });
});
