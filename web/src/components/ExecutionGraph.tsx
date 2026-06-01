import { useEffect, useMemo, useRef, useState } from "react";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceX,
  forceY,
  forceCollide,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import { select } from "d3-selection";
import { zoom, zoomIdentity, type ZoomBehavior } from "d3-zoom";
import { KIND_COLOR, eventLabel, EventDetail } from "./eventDetail.js";
import type { ExecutionNode, SessionEvent } from "../api.js";

interface GraphNode extends SimulationNodeDatum {
  id: string;
  kind: SessionEvent["kind"];
  label: string;
  depth: number;
  isSidechain: boolean;
  ev: SessionEvent;
  /** Incoming edges (from a parent) and outgoing edges (to children). */
  degIn: number;
  degOut: number;
}

interface GraphLink extends SimulationLinkDatum<GraphNode> {
  source: string;
  target: string;
}

// Synthetic per-node ids (not the event uuid): one transcript message can yield
// several events sharing a uuid, so a uuid-keyed graph collides on React keys and
// d3 link resolution. Edges come from the tree structure, not from parentUuid.
function buildGraph(tree: ExecutionNode[]): { nodes: GraphNode[]; links: GraphLink[] } {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  let counter = 0;
  const walk = (node: ExecutionNode, depth: number, parentId?: string): void => {
    const id = `n${counter++}`;
    nodes.push({
      id,
      kind: node.event.kind,
      label: eventLabel(node.event),
      depth,
      isSidechain: node.event.isSidechain,
      ev: node.event,
      degIn: 0,
      degOut: 0,
    });
    if (parentId !== undefined) links.push({ source: parentId, target: id });
    for (const child of node.children) walk(child, depth + 1, id);
  };
  for (const root of tree) walk(root, 0);
  // Count in/out degree so the renderer can flag pass-through nodes (both).
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const l of links) {
    const src = byId.get(l.source);
    const tgt = byId.get(l.target);
    if (src) src.degOut += 1;
    if (tgt) tgt.degIn += 1;
  }
  return { nodes, links };
}

const W = 800;
const H = 560;
const TICKS = 280;

export interface ExecutionGraphProps {
  tree: ExecutionNode[];
  /** Called when user clicks a node — uuid of the underlying event. */
  onSelectEvent?: (uuid: string) => void;
}

export function ExecutionGraph({ tree, onSelectEvent }: ExecutionGraphProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const gRef = useRef<SVGGElement | null>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  const layout = useMemo(() => {
    const { nodes, links } = buildGraph(tree);
    if (nodes.length === 0) return { nodes, links };
    // Direction comes from depth: each node is pulled to a vertical row matching
    // its tree depth, so parent→child arcs read top-to-bottom. Charge + collide
    // spread siblings horizontally, keeping the organic look without a hairball.
    const maxDepth = nodes.reduce((m, n) => Math.max(m, n.depth), 0);
    const TOP = 40;
    const ROW = maxDepth > 0 ? Math.min(70, (H - 2 * TOP) / maxDepth) : 0;
    const rowY = (d: number) => TOP + d * ROW;
    // Seed deterministically so the simulation always settles the same way.
    nodes.forEach((n, i) => {
      n.y = rowY(n.depth);
      n.x = W / 2 + (((i % 9) - 4) * 26);
    });
    const sim = forceSimulation<GraphNode>(nodes)
      .force("link", forceLink<GraphNode, GraphLink>(links).id((d) => d.id).distance(46).strength(0.3))
      .force("charge", forceManyBody().strength(-140))
      .force("x", forceX<GraphNode>(W / 2).strength(0.06))
      .force("y", forceY<GraphNode>((d) => rowY(d.depth)).strength(0.9))
      .force("collide", forceCollide<GraphNode>().radius(16))
      .stop();
    for (let i = 0; i < TICKS; i++) sim.tick();
    return { nodes, links };
  }, [tree]);

  useEffect(() => {
    const svgEl = svgRef.current;
    const gEl = gRef.current;
    if (!svgEl || !gEl) return;
    const sel = select(svgEl);
    const gSel = select(gEl);
    const z = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 6])
      .filter((event) => {
        if (event.type === "wheel") return true;
        if (event.type === "dblclick") return true;
        if (event.type === "mousedown") return event.button === 0 && (event.target as Element).tagName !== "circle";
        return true;
      })
      .on("zoom", (event) => {
        gSel.attr("transform", event.transform.toString());
      });
    zoomRef.current = z;
    sel.call(z);
    sel.on("dblclick.zoom", () => { sel.call(z.transform, zoomIdentity); });
    return () => { sel.on(".zoom", null); };
  }, [layout.nodes.length]);

  if (layout.nodes.length === 0) {
    return <div className="ld-empty">Nessun evento da disegnare.</div>;
  }

  const linkPaths = layout.links.map((l, i) => {
    const s = typeof l.source === "string"
      ? layout.nodes.find((n) => n.id === l.source)
      : (l.source as GraphNode);
    const t = typeof l.target === "string"
      ? layout.nodes.find((n) => n.id === l.target)
      : (l.target as GraphNode);
    if (!s || !t || s.x == null || t.x == null || s.y == null || t.y == null) return null;
    const isOnHover = hovered && (s.id === hovered || t.id === hovered);
    // Vertical cubic Bézier: control points share each endpoint's x at the
    // midline, so edges leave parents and reach children with a soft S-curve.
    const my = (s.y + t.y) / 2;
    const d = `M${s.x},${s.y} C${s.x},${my} ${t.x},${my} ${t.x},${t.y}`;
    const cls = isOnHover ? " on" : "";
    return (
      <g key={i}>
        <path className={`exec-edge${cls}`} d={d} />
        <path className={`exec-edge-flow${cls}`} d={d} />
      </g>
    );
  });

  function resetZoom(): void {
    const svgEl = svgRef.current;
    const z = zoomRef.current;
    if (!svgEl || !z) return;
    select(svgEl).call(z.transform, zoomIdentity);
  }

  return (
    <div className="exec-graph">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Execution graph"
        style={{ cursor: "grab" }}
      >
        <g ref={gRef}>
          <g>{linkPaths}</g>
          <g>
            {layout.nodes.map((n) => {
              const isHov = n.id === hovered;
              const r = n.id === selected ? 10 : isHov ? 8 : 6;
              // Pass-through node: has both an input (parent) and output (children).
              const isPass = n.degIn > 0 && n.degOut > 0;
              return (
                <g
                  key={n.id}
                  className="exec-node"
                  transform={`translate(${n.x ?? 0}, ${n.y ?? 0})`}
                  onMouseEnter={() => setHovered(n.id)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelected(n.id);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    onSelectEvent?.(n.ev.uuid);
                  }}
                  style={{ cursor: "pointer" }}
                >
                  {isPass ? (
                    <circle
                      className="exec-node-ring"
                      r={r + 3.5}
                      fill="none"
                      stroke={KIND_COLOR[n.kind]}
                      strokeOpacity={0.55}
                      strokeWidth={1}
                    />
                  ) : null}
                  <circle
                    r={r}
                    fill={KIND_COLOR[n.kind]}
                    fillOpacity={n.isSidechain ? 0.55 : 0.9}
                    stroke={n.id === selected ? "#2ee6c0" : isHov ? "#2ee6c0" : "rgba(8,12,16,.6)"}
                    strokeWidth={n.id === selected ? 2.5 : isHov ? 2 : 1}
                  />
                  {isHov ? (
                    <text
                      x={12} y={4}
                      fill="var(--txt)"
                      fontSize="11"
                      fontFamily="IBM Plex Mono"
                      style={{ pointerEvents: "none" }}
                    >
                      {n.kind}:{n.label}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </g>
        </g>
      </svg>
      <div className="exec-controls">
        <button className="tool-chip" style={{ cursor: "pointer" }} onClick={resetZoom}>
          Reset zoom
        </button>
        {selected ? (
          <button className="tool-chip" style={{ cursor: "pointer" }} onClick={() => setSelected(null)}>
            Deseleziona
          </button>
        ) : null}
        {selected && onSelectEvent ? (
          <button
            className="tool-chip"
            style={{ cursor: "pointer" }}
            onClick={() => {
              const node = layout.nodes.find((n) => n.id === selected);
              if (node) onSelectEvent(node.ev.uuid);
            }}
            title="Doppio click sul nodo o usa questo bottone"
          >
            Vai all'evento →
          </button>
        ) : null}
      </div>
      {selected ? (() => {
        const node = layout.nodes.find((n) => n.id === selected);
        return node ? <EventDetail ev={node.ev} /> : null;
      })() : (
        <div className="exec-hint">Click su un nodo per i dettagli. Doppio click per saltare all'evento.</div>
      )}
      <div className="exec-legend">
        {(Object.keys(KIND_COLOR) as SessionEvent["kind"][]).map((k) => (
          <span key={k} className="legend-item">
            <span className="legend-dot" style={{ background: KIND_COLOR[k] }} />
            {k}
          </span>
        ))}
      </div>
    </div>
  );
}
