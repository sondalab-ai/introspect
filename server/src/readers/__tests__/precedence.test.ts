import { describe, it, expect } from "vitest";
import { annotatePrecedence } from "../precedence.js";

describe("annotatePrecedence", () => {
  it("marks the plugin copy shadowed and points at the winning user item", () => {
    const [user, plugin] = annotatePrecedence([
      { name: "frontend-design", source: "user", path: "/u/fd/SKILL.md" },
      { name: "frontend-design", source: "plugin", path: "/p/fd/SKILL.md" },
    ]);
    expect(user!.shadowed).toBe(false);
    expect(user!.shadowedBy).toBeUndefined();
    expect(plugin!.shadowed).toBe(true);
    expect(plugin!.shadowedBy).toEqual({ source: "user", path: "/u/fd/SKILL.md" });
    expect(user!.duplicate).toBe(false);
    expect(plugin!.duplicate).toBe(false);
  });

  it("marks same-source repeats as duplicate without shadowing", () => {
    const items = annotatePrecedence([
      { name: "dup", source: "plugin", path: "/p/a/SKILL.md" },
      { name: "dup", source: "plugin", path: "/p/b/SKILL.md" },
    ]);
    expect(items.every((i) => i.duplicate)).toBe(true);
    expect(items.every((i) => !i.shadowed)).toBe(true);
  });

  it("leaves a unique item untouched and keeps every row (no removal)", () => {
    const items = annotatePrecedence([
      { name: "a", source: "user", path: "/u/a.md" },
      { name: "b", source: "plugin", path: "/p/b.md" },
    ]);
    expect(items).toHaveLength(2);
    expect(items.every((i) => !i.shadowed && !i.duplicate)).toBe(true);
  });
});
