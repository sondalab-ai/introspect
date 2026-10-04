// introspect's neutrals in theme.css are copied from the kit's generated
// neutrals.json (products.introspect.<theme>). This keeps the copy honest on
// every kit bump: each role must be pinned, in its theme block, at exactly the
// kit's value.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const neutrals = require("@sondalab/ui-kit/neutrals.json").products.introspect;
const css = readFileSync(new URL("../src/theme.css", import.meta.url), "utf8");

/** Role in neutrals.json → the kit token theme.css pins it under. */
const TOKEN = {
  "bg-canvas": "--sl-bg-canvas",
  "bg-surface": "--sl-bg-surface",
  "bg-surface-raised": "--sl-bg-surface-raised",
  "bg-tile": "--sl-bg-tile",
  "bg-sunken": "--sl-bg-sunken",
  "bg-overlay": "--sl-bg-overlay",
  "text-primary": "--sl-text-primary",
  "text-secondary": "--sl-text-secondary",
  "text-muted": "--sl-text-muted",
  "border-subtle": "--sl-border-subtle",
  "border-default": "--sl-border-default",
  "border-strong": "--sl-border-strong",
  "border-lit": "--sl-border-lit",
  "code-fg": "--sl-code-fg",
  "code-comment": "--sl-code-comment",
  "code-null": "--sl-code-null",
};

/** Declarations of the first rule whose selector is exactly `selector`. */
function block(selector) {
  const start = css.indexOf(`\n${selector} {`);
  assert.ok(start >= 0, `theme.css has no "${selector}" block`);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  const decls = new Map();
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) decls.set(m[1], m[2].trim());
  return decls;
}

const BLOCKS = { dark: block(":root"), light: block(':root[data-theme="light"]') };

for (const theme of ["dark", "light"]) {
  test(`theme.css ${theme} neutrals equal neutrals.json products.introspect.${theme}`, () => {
    const roles = Object.entries(neutrals[theme]);
    assert.ok(roles.length > 0, `neutrals.json has no ${theme} roles`);
    for (const [role, value] of roles) {
      const token = TOKEN[role];
      assert.ok(token, `neutrals.json role "${role}" has no token mapping in this test`);
      assert.equal(BLOCKS[theme].get(token), value, `${theme} ${token} (${role})`);
    }
  });
}
