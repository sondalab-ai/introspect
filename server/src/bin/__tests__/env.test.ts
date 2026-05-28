import { describe, it, expect } from "vitest";
import { parseExtraRoots } from "../env.js";

describe("parseExtraRoots", () => {
  it("returns an empty array for undefined or empty input", () => {
    expect(parseExtraRoots(undefined)).toEqual([]);
    expect(parseExtraRoots("")).toEqual([]);
  });

  it("splits, trims, and drops empty entries", () => {
    expect(parseExtraRoots("/a, /b ,, /c ")).toEqual(["/a", "/b", "/c"]);
  });

  it("preserves a single root", () => {
    expect(parseExtraRoots("/only")).toEqual(["/only"]);
  });
});
