import { describe, expect, it } from "vitest";
import { templates } from "./templates";

describe("template library", () => {
  it("ships ten distinct templates", () => {
    expect(templates).toHaveLength(10);
    expect(new Set(templates.map((template) => template.id)).size).toBe(10);
  });

  it("features SVG artwork on most templates", () => {
    const illustrated = templates.filter((template) => template.artwork?.endsWith(".svg"));
    expect(illustrated.length).toBeGreaterThanOrEqual(7);
  });
});
