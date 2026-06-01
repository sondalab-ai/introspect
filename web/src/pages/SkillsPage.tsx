import { ListDetail } from "../components/ListDetail.js";
import { Markdown } from "../components/Markdown.js";
import { useEndpoint } from "../useEndpoint.js";
import { ENDPOINTS, type SkillItem } from "../api.js";
import { PrecedenceBadges, precedenceSuffix } from "../precedence.js";

export function SkillsPage() {
  const state = useEndpoint<SkillItem[]>(ENDPOINTS.skills);
  if (state.status === "loading") return <div className="loading">Caricamento…</div>;
  if (state.status === "error") return <div className="error">Errore: {state.error}</div>;

  const items = state.data.map((it) => ({
    id: it.path,
    title: it.name,
    subtitle: `${it.description}${precedenceSuffix(it)}`,
    raw: it,
  }));

  return (
    <div className="canvas-body">
      <ListDetail
        storageKey="skills"
        items={items}
        listTitle="Skills"
        emptyMessage="Nessuna skill trovata."
        renderDetail={(item) => (
          <>
            <h2>{item.raw.name}</h2>
            <div className="meta">{item.raw.path}</div>
            <PrecedenceBadges p={item.raw} />
            {item.raw.description ? (
              <div className="detail-lead">{item.raw.description}</div>
            ) : null}
            <Markdown>{item.raw.body}</Markdown>
          </>
        )}
      />
    </div>
  );
}
