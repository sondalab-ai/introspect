import { useState, type ReactNode } from "react";
import { NAV_GROUPS } from "./nav.js";
import { InstructionsPage } from "./pages/InstructionsPage.js";
import { AgentsPage } from "./pages/AgentsPage.js";
import { CommandsPage } from "./pages/CommandsPage.js";
import { SkillsPage } from "./pages/SkillsPage.js";
import { MemoriesPage } from "./pages/MemoriesPage.js";
import { PluginsPage } from "./pages/PluginsPage.js";
import { HooksPermsEnvPage } from "./pages/HooksPermsEnvPage.js";
import { PlaceholderPage } from "./pages/PlaceholderPage.js";

const PAGES: Record<string, () => ReactNode> = {
  "System prompt": () => <InstructionsPage />,
  "Skills": () => <SkillsPage />,
  "Agents": () => <AgentsPage />,
  "Commands": () => <CommandsPage />,
  "Memories": () => <MemoriesPage />,
  "Hooks · Perms · Env": () => <HooksPermsEnvPage />,
  "Plugins": () => <PluginsPage />,
};

function renderPage(label: string): ReactNode {
  const factory = PAGES[label];
  return factory ? factory() : <PlaceholderPage label={label} />;
}

export function App() {
  const [active, setActive] = useState("System prompt");

  return (
    <div className="app">
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
      </nav>

      <section className="canvas">
        <div className="l">{active}</div>
        {renderPage(active)}
      </section>

      <aside className="rail glass">
        <h4>Event stream</h4>
      </aside>
    </div>
  );
}
