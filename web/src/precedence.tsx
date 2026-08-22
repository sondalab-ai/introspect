import type { ItemSource, Precedence } from "./api.js";

function sourceLabel(s: ItemSource): string {
  return s === "plugin" ? "plugin" : "personale";
}

/** Short suffix appended to a list subtitle so overrides/redundancy stay visible inline. */
export function precedenceSuffix(p: Precedence): string {
  const tags: string[] = [];
  if (p.duplicate) tags.push("⚠ duplicato");
  if (p.shadowed && p.shadowedBy) tags.push(`↩ shadowed da ${sourceLabel(p.shadowedBy.source)}`);
  return tags.length ? ` · ${tags.join(" · ")}` : "";
}

/** Rich badges for the detail pane: source origin plus shadow/duplicate warnings. */
export function PrecedenceBadges({ p }: { p: Precedence }) {
  return (
    <div className="tools-row" style={{ marginTop: 6 }}>
      <span className="tool-chip">{p.source === "plugin" ? "da plugin" : "personale"}</span>
      {p.shadowed && p.shadowedBy ? (
        <span
          className="tool-chip"
          title={`Sovrascritta da una copia ${sourceLabel(p.shadowedBy.source)} con lo stesso nome:\n${p.shadowedBy.path}`}
        >
          ↩ shadowed da {sourceLabel(p.shadowedBy.source)}
        </span>
      ) : null}
      {p.duplicate ? (
        <span className="tool-chip" title="Another copy exists with the same name and origin: likely a duplicate or an error.">
          ⚠ duplicato
        </span>
      ) : null}
    </div>
  );
}
