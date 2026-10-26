// ListDetail's empty states carry the kit's Bauhaus art (ui-kit 0.41): the
// list shows `.sl-empty--shapes`, and the detail pane, blank when nothing
// matches, shows `.sl-empty--void` instead of rendering nothing. The component
// is bundled with the esbuild Vite already installs and rendered to markup.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/** Bundle ListDetail.tsx into node_modules/.cache (so bare `react` resolves) and import it. */
async function loadListDetail() {
  const entry = fileURLToPath(new URL("../src/components/ListDetail.tsx", import.meta.url));
  const outDir = fileURLToPath(new URL("../node_modules/.cache/list-detail-test/", import.meta.url));
  const { outputFiles } = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    jsx: "automatic",
    external: ["react", "react/jsx-runtime"],
  });
  mkdirSync(outDir, { recursive: true });
  const out = `${outDir}ListDetail.mjs`;
  writeFileSync(out, outputFiles[0].text);
  return (await import(pathToFileURL(out).href)).ListDetail;
}

const ListDetail = await loadListDetail();

/** Render ListDetail with `items` and the given empty message. */
function render(items) {
  return renderToStaticMarkup(
    createElement(ListDetail, {
      items,
      listTitle: "Things",
      emptyMessage: "Nothing here.",
      renderDetail: (item) => createElement("h2", null, item.title),
    }),
  );
}

/** The inner markup of the `.ld-detail` pane. */
function detailPane(html) {
  const m = html.match(/<div class="ld-detail">([\s\S]*)<\/div><\/div>$/);
  assert.ok(m, "no .ld-detail pane in the markup");
  return m[1];
}

test("blank detail pane renders an .sl-empty.sl-empty--void with the empty message", () => {
  const pane = detailPane(render([]));
  assert.match(pane, /^<div class="sl-empty sl-empty--void[ "]/);
  assert.match(pane, /<p class="sl-empty__body">Nothing here\.<\/p>/);
});

test("empty list renders an .sl-empty.sl-empty--shapes, not the void", () => {
  const html = render([]);
  const list = html.slice(0, html.indexOf('class="sl-resizer"'));
  assert.match(list, /class="sl-empty sl-empty--shapes[ "]/);
  assert.doesNotMatch(list, /sl-empty--void/);
});

test("a selected item renders its detail, with no empty state", () => {
  const html = render([{ id: "a", title: "Alpha" }]);
  assert.equal(detailPane(html), "<h2>Alpha</h2>");
  assert.doesNotMatch(html, /sl-empty/);
});
