import { useEndpoint } from "../useEndpoint.js";
import { ENDPOINTS } from "../api.js";
import { JsonView } from "../components/JsonView.js";

interface ProfileResponse {
  path: string;
  profile: unknown;
}

function Section({ title, data, status, error }: {
  title: string;
  data: unknown;
  status: "loading" | "ok" | "error";
  error?: string;
}) {
  return (
    <section style={{ marginBottom: 20 }}>
      <h3 style={{ margin: "0 0 8px" }}>{title}</h3>
      {status === "loading" ? (
        <div className="loading">Caricamento…</div>
      ) : status === "error" ? (
        <div className="error">Errore: {error}</div>
      ) : (
        <JsonView value={data} style={{ maxHeight: "60vh" }} />
      )}
    </section>
  );
}

const EPOCH = "1970-01-01T00:00:00.000Z";

function isDefaultProfile(p: unknown): boolean {
  if (p === null || typeof p !== "object") return false;
  const o = p as Record<string, unknown>;
  return o.generatedAt === EPOCH;
}

export function DebugPage() {
  const sources = useEndpoint<unknown>(ENDPOINTS.sources);
  const profile = useEndpoint<ProfileResponse>(ENDPOINTS.profile);

  const profileTitle = profile.status === "ready"
    ? `/profile — discovery profile (${profile.data.path})${isDefaultProfile(profile.data.profile) ? " · default (mai generato)" : ""}`
    : "/profile — discovery profile";

  return (
    <div className="canvas-body" style={{ overflow: "auto" }}>
      <Section
        title="/sources — resolved config roots"
        data={sources.status === "ready" ? sources.data : null}
        status={sources.status === "ready" ? "ok" : sources.status === "loading" ? "loading" : "error"}
        error={sources.status === "error" ? sources.error : undefined}
      />
      <Section
        title={profileTitle}
        data={profile.status === "ready" ? profile.data.profile : null}
        status={profile.status === "ready" ? "ok" : profile.status === "loading" ? "loading" : "error"}
        error={profile.status === "error" ? profile.error : undefined}
      />
    </div>
  );
}
