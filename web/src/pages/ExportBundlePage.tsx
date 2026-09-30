export function ExportBundlePage() {
  function download(): void {
    window.location.href = "/export";
  }
  return (
    <div className="canvas-body" style={{ overflow: "auto", padding: "0 4px" }}>
      <h2>Export bundle</h2>
      <p className="detail-lead">
        Esporta una copia portatile della configurazione locale di Claude:
        <br />
        prompt, agents, commands, skills, memorie globali + per-progetto.
      </p>
      <dl className="sl-kv">
        <dt>Contenuto</dt>
        <dd>
          CLAUDE.md, agents/, commands/, skills/, memory/, plugins.json, settings.json
          (chiavi sensibili redatte come <code>[REDACTED]</code>; vedi
          {" "}<code>manifest.json → redactedSettingsKeys</code>),
          profile.json, per ogni progetto solo la sottocartella <code>memory/</code>.
        </dd>
        <dt>Esclusi</dt>
        <dd>tutto <code>projects/&lt;slug&gt;/*.jsonl</code> (i transcript).</dd>
        <dt>Formato</dt>
        <dd>ZIP standard, scompattabile con <code>unzip</code>.</dd>
      </dl>
      <button type="button" className="sl-btn sl-btn--ghost sl-btn--sm" style={{ marginTop: 12 }} onClick={download}>
        Scarica bundle.zip →
      </button>
    </div>
  );
}
