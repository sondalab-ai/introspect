import { describe, it, expect } from "vitest";
import { parseFrontmatter } from "../frontmatter.js";

describe("parseFrontmatter", () => {
  it("parses valid YAML frontmatter", () => {
    const { meta, body } = parseFrontmatter("---\nname: a\ntags: [x, y]\n---\nbody");
    expect(meta).toEqual({ name: "a", tags: ["x", "y"] });
    expect(body).toBe("body");
  });

  it("returns empty meta and the whole text when there is no frontmatter", () => {
    expect(parseFrontmatter("just text")).toEqual({ meta: {}, body: "just text" });
  });

  it("falls back to plain key: value lines when the YAML is invalid", () => {
    const raw = "---\ndescription: Review a diff\nargument-hint: [base branch] [what to focus on]\n---\nbody";
    const { meta, body } = parseFrontmatter(raw);
    expect(meta).toEqual({
      description: "Review a diff",
      "argument-hint": "[base branch] [what to focus on]",
    });
    expect(body).toBe("body");
  });
});
