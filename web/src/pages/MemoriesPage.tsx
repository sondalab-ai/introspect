import { ListDetail } from "../components/ListDetail.js";
import { Markdown } from "../components/Markdown.js";
import { useEndpoint } from "../useEndpoint.js";
import { ENDPOINTS, type MemoryItem } from "../api.js";
import { prettyProjectName } from "../projectName.js";

type ScopeKind = "global" | "project" | "discovered";

function scopeKind(s: string): ScopeKind {
  if (s === "global") return "global";
  if (s.startsWith("discovered:")) return "discovered";
  return "project";
}

/** Human scope label: project scopes use the same pretty path as the Projects page. */
function scopeLabel(m: Pick<MemoryItem, "scope" | "cwd">): string {
  if (m.scope === "global") return "global";
  if (m.scope.startsWith("discovered:")) return m.scope.slice("discovered:".length);
  return prettyProjectName(m.cwd, m.scope);
}

function ScopeChip({ memory }: { memory: MemoryItem }) {
  return (
    <span className={`glass-chip is-${scopeKind(memory.scope)}`} title={memory.cwd ?? memory.scope}>
      <span className="chip-text">{scopeLabel(memory)}</span>
    </span>
  );
}

interface MemoryRow {
  id: string;
  title: string;
  subtitle: string;
  level: number;
  raw: MemoryItem;
}

function dirOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

function isMemoryMd(name: string): boolean {
  return name.toUpperCase() === "MEMORY";
}

/** Group by folder, then within each folder MEMORY.md first (level 0), others indented (level 1). */
function withHierarchy(items: MemoryItem[]): MemoryRow[] {
  const groups = new Map<string, MemoryItem[]>();
  for (const it of items) {
    const d = dirOf(it.path);
    const g = groups.get(d);
    if (g) g.push(it);
    else groups.set(d, [it]);
  }
  const dirs = [...groups.keys()].sort();
  const out: MemoryRow[] = [];
  for (const d of dirs) {
    const group = groups.get(d)!;
    const memoryMd = group.find((i) => isMemoryMd(i.name));
    const others = group
      .filter((i) => i !== memoryMd)
      .sort((a, b) => a.name.localeCompare(b.name));
    const hasParent = !!memoryMd;
    if (memoryMd) {
      out.push({
        id: memoryMd.path,
        title: memoryMd.name,
        subtitle: scopeLabel(memoryMd),
        level: 0,
        raw: memoryMd,
      });
    }
    for (const o of others) {
      out.push({
        id: o.path,
        title: o.name,
        subtitle: scopeLabel(o),
        level: hasParent ? 1 : 0,
        raw: o,
      });
    }
  }
  return out;
}

export function MemoriesPage() {
  const state = useEndpoint<MemoryItem[]>(ENDPOINTS.memories);
  if (state.status === "loading") return <div className="loading">Caricamento…</div>;
  if (state.status === "error") return <div className="error">Errore: {state.error}</div>;

  const items = withHierarchy(state.data);

  return (
    <div className="canvas-body">
      <ListDetail
        storageKey="memories"
        items={items}
        listTitle={`Memories (${items.length})`}
        emptyMessage="Nessuna memoria trovata."
        renderDetail={(item) => (
          <>
            <h2>{item.raw.name}</h2>
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "2px 0 16px" }}>
              <ScopeChip memory={item.raw} />
            </div>
            <div className="meta">{item.raw.path}</div>
            <Markdown>{item.raw.body}</Markdown>
          </>
        )}
      />
    </div>
  );
}
