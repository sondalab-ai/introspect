import { useState } from "react";
import { NAV_GROUPS } from "./nav.js";

export function App() {
  const [active, setActive] = useState("Live graph");

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
      </section>

      <aside className="rail glass">
        <h4>Event stream</h4>
      </aside>
    </div>
  );
}
