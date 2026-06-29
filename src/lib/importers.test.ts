import { describe, expect, it } from "vitest";
import { sampleBook } from "../data/sample-book";
import { parseCsvProject, parseProjectJson } from "./importers";

describe("project importers", () => {
  it("merges repeated CSV puzzle rows and splits word lists", () => {
    const csv = [
      "book_title,section,puzzle,blurb,words",
      'Test Book,School Days,Recess,Remember recess?,"TAG|JUMP ROPE"',
      "Test Book,School Days,Recess,,MARBLES",
    ].join("\n");
    const project = parseCsvProject(csv, sampleBook);
    expect(project.title).toBe("Test Book");
    expect(project.sections[0].puzzles).toHaveLength(1);
    expect(project.sections[0].puzzles[0].words).toEqual(["TAG", "JUMP ROPE", "MARBLES"]);
  });

  it("hydrates minimal JSON with stable section and puzzle defaults", () => {
    const project = parseProjectJson(JSON.stringify({
      title: "Imported Book",
      sections: [{ name: "Travel", puzzles: [{ title: "Road Trip", words: ["MAP", "MOTEL"] }] }],
    }), sampleBook);
    expect(project.title).toBe("Imported Book");
    expect(project.sections[0].id).toBe("travel");
    expect(project.sections[0].puzzles[0].id).toBe("road-trip");
    expect(project.sections[0].puzzles[0].words).toEqual(["MAP", "MOTEL"]);
  });
});
