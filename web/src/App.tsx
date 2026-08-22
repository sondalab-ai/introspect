import { useEffect, useState, type ReactNode } from "react";
import { NAV_GROUPS } from "./nav.js";
import { useResizableWidth } from "./useResizableWidth.js";
import { InstructionsPage } from "./pages/InstructionsPage.js";
import { AgentsPage } from "./pages/AgentsPage.js";
import { CommandsPage } from "./pages/CommandsPage.js";
import { SkillsPage } from "./pages/SkillsPage.js";
import { MemoriesPage } from "./pages/MemoriesPage.js";
import { PluginsPage } from "./pages/PluginsPage.js";
import { HooksPermsEnvPage } from "./pages/HooksPermsEnvPage.js";
import { ProjectsPage } from "./pages/ProjectsPage.js";
import { SessionsHistoryPage } from "./pages/SessionsHistoryPage.js";
import { DebugPage } from "./pages/DebugPage.js";
import { ExportBundlePage } from "./pages/ExportBundlePage.js";
import { LiveGraphPage } from "./pages/LiveGraphPage.js";
import { PlaceholderPage } from "./pages/PlaceholderPage.js";
import { LiveRail } from "./components/LiveRail.js";

const PAGES: Record<string, () => ReactNode> = {
  "Live graph": () => <LiveGraphPage />,
  "System prompt": () => <InstructionsPage />,
  "Skills": () => <SkillsPage />,
  "Agents": () => <AgentsPage />,
  "Commands": () => <CommandsPage />,
  "Memories": () => <MemoriesPage />,
  "Hooks · Perms · Env": () => <HooksPermsEnvPage />,
  "Plugins": () => <PluginsPage />,
  "Projects": () => <ProjectsPage />,
  "Sessions · History": () => <SessionsHistoryPage />,
  "Debug": () => <DebugPage />,
  "Export bundle": () => <ExportBundlePage />,
};

function renderPage(label: string): ReactNode {
  const factory = PAGES[label];
  return factory ? factory() : <PlaceholderPage label={label} />;
}

type Theme = "dark" | "light";
const SCALE_MIN = 0.8;
const SCALE_MAX = 1.6;
const SCALE_STEP = 0.1;

function clampScale(n: number): number {
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round(n * 10) / 10));
}

/** Persisted UI preferences (theme + zoom), applied to the document root. */
function useAppPrefs() {
  const [theme, setTheme] = useState<Theme>(() =>
    localStorage.getItem("ui-theme") === "light" ? "light" : "dark",
  );
  const [scale, setScale] = useState<number>(() => {
    const v = Number(localStorage.getItem("ui-scale"));
    return Number.isFinite(v) && v > 0 ? clampScale(v) : 1;
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("ui-theme", theme);
  }, [theme]);
  useEffect(() => {
    document.documentElement.style.setProperty("--ui-scale", String(scale));
    localStorage.setItem("ui-scale", String(scale));
  }, [scale]);

  return {
    theme,
    scale,
    toggleTheme: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
    bumpScale: (d: number) => setScale((s) => clampScale(s + d)),
    resetScale: () => setScale(1),
  };
}

export function App() {
  const [active, setActive] = useState("System prompt");
  const prefs = useAppPrefs();
  const nav = useResizableWidth({ storageKey: "nav-w", min: 180, max: 360, initial: 222 });
  const rail = useResizableWidth({
    storageKey: "rail-w", min: 240, max: 720, initial: 320, invert: true,
  });

  return (
    <div
      className="app"
      style={{ gridTemplateColumns: `${nav.width}px 8px 1fr 8px ${rail.width}px` }}
    >
      <nav className="nav glass">
        <div className="brand">
          <b>◇</b> intro<b>spect</b>
        </div>
        {NAV_GROUPS.map((group) => (
          <div key={group.title}>
            <div className="grp">{group.title}</div>
            {group.items.map((item) => (
              <div
                key={item.label}
                className={`item${item.label === active ? " on" : ""}`}
                onClick={() => setActive(item.label)}
              >
                <span>{item.label}</span>
                {item.badge ? <span className="n">{item.badge}</span> : null}
              </div>
            ))}
          </div>
        ))}
        <div className="nav-foot">
          <button
            className="pref-btn"
            onClick={prefs.toggleTheme}
            title={prefs.theme === "dark" ? "Light theme" : "Dark theme"}
          >
            {prefs.theme === "dark" ? "☀ light" : "☾ dark"}
          </button>
          <div className="pref-font" title="Interface size">
            <button className="pref-btn" onClick={() => prefs.bumpScale(-SCALE_STEP)} aria-label="Decrease">A−</button>
            <button className="pref-pct" onClick={prefs.resetScale} title="Reset to 100%">
              {Math.round(prefs.scale * 100)}%
            </button>
            <button className="pref-btn" onClick={() => prefs.bumpScale(SCALE_STEP)} aria-label="Increase">A+</button>
          </div>
        </div>
      </nav>

      <div className="resizer" role="separator" aria-orientation="vertical"
           aria-label="Resize navigation" {...nav.handlers}>
        <div className="resizer-grip" />
      </div>

      <section className="canvas">
        <div className="l">{active}</div>
        {renderPage(active)}
      </section>

      <div
        className="resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize event stream"
        {...rail.handlers}
      >
        <div className="resizer-grip" />
      </div>

      <aside className="rail glass">
        <LiveRail />
      </aside>
    </div>
  );
}
