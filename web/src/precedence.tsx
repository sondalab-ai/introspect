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
      <span className="sl-tag sl-tag--plain">{p.source === "plugin" ? "Da plugin" : "Personale"}</span>
      {p.shadowed && p.shadowedBy ? (
        <span
          className="sl-tag sl-tag--plain"
          title={`Sovrascritta da una copia ${sourceLabel(p.shadowedBy.source)} con lo stesso nome:\n${p.shadowedBy.path}`}
        >
          ↩ Shadowed da {sourceLabel(p.shadowedBy.source)}
        </span>
      ) : null}
      {p.duplicate ? (
        <span className="sl-tag sl-tag--plain" title="Another copy exists with the same name and origin: likely a duplicate or an error.">
          ⚠ Duplicato
        </span>
      ) : null}
    </div>
  );
}
