import { ListDetail } from "../components/ListDetail.js";
import { useEndpoint } from "../useEndpoint.js";
import { ENDPOINTS, type SettingsItem } from "../api.js";

export function HooksPermsEnvPage() {
  const state = useEndpoint<SettingsItem[]>(ENDPOINTS.settings);
  if (state.status === "loading") return <div className="loading">Caricamento…</div>;
  if (state.status === "error") return <div className="error">Errore: {state.error}</div>;

  const items = state.data.map((it) => ({
    id: it.path,
    title: it.fileName,
    subtitle: it.rootPath,
    raw: it,
  }));

  return (
    <div className="canvas-body">
      <ListDetail
        storageKey="settings"
        items={items}
        listTitle="Settings"
        emptyMessage="No settings.json found."
        renderDetail={(item) => (
          <>
            <h2>{item.raw.fileName}</h2>
            <div className="meta">
              {item.raw.path}
              {item.raw.redactedKeys.length > 0
                ? ` · ${item.raw.redactedKeys.length} chiavi redatte`
                : ""}
            </div>
            <h3 className="ld-section">Hooks</h3>
            <pre>{JSON.stringify(item.raw.hooks, null, 2)}</pre>
            <h3 className="ld-section">Permissions</h3>
            <pre>{JSON.stringify(item.raw.permissions, null, 2)}</pre>
            <h3 className="ld-section">Env (redacted)</h3>
            <pre>{JSON.stringify(item.raw.env, null, 2)}</pre>
            {Object.keys(item.raw.other).length > 0 ? (
              <>
                <h3 className="ld-section">Other</h3>
                <pre>{JSON.stringify(item.raw.other, null, 2)}</pre>
              </>
            ) : null}
          </>
        )}
      />
    </div>
  );
}
