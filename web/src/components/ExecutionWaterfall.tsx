import { useMemo, useState, type CSSProperties } from "react";
import { KIND_COLOR, eventLabel, EventDetail } from "./eventDetail.js";
import { useResizableWidth } from "../useResizableWidth.js";
import type { SessionEvent } from "../api.js";

interface Row {
  ev: SessionEvent;
  idx: number;
  depth: number;
  startFrac: number;
  endFrac: number;
  durMs: number | null;
}

interface GapMark { frac: number; real: number }

/** Idle gaps longer than this are collapsed on the axis. */
const GAP_THRESHOLD_MS = 8_000;
/** Compressed width (in ms-equivalent) given to a collapsed idle gap. */
const GAP_COMPRESSED_MS = 3_000;

function parseTs(s?: string): number | null {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

function fmtDur(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

export interface ExecutionWaterfallProps {
  events: SessionEvent[];
  /** Called on double-click — uuid of the underlying event. */
  onSelectEvent?: (uuid: string) => void;
}

/**
 * Waterfall / Gantt timeline: rows in chronological order, indented by tree
 * depth, bars on a shared time axis. `tool_use` / `subagent_spawn` get a
 * real-duration bar (paired with their `tool_result` by toolUseId); other events
 * are point markers. Long idle gaps are compressed (the axis is a piecewise map
 * of real time) and shown as labelled break lines, so active stretches stay
 * dense instead of being crushed by human-scale pauses.
 */
export function ExecutionWaterfall({ events, onSelectEvent }: ExecutionWaterfallProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const label = useResizableWidth({ storageKey: "wf-label", min: 120, max: 520, initial: 210 });

  const { rows, gaps, degenerate } = useMemo(() => {
    const depthByUuid = new Map<string, number>();
    const depthOf = (ev: SessionEvent): number => {
      const p = ev.parentUuid;
      const d = p && depthByUuid.has(p) ? depthByUuid.get(p)! + 1 : 0;
      if (!depthByUuid.has(ev.uuid)) depthByUuid.set(ev.uuid, d);
      return d;
    };
    const resultTsById = new Map<string, number>();
    for (const ev of events) {
      if (ev.kind === "tool_result") {
        const t = parseTs(ev.ts);
        if (t != null) resultTsById.set(ev.toolUseId, t);
      }
    }
    const spanEnd = (ev: SessionEvent): number | null =>
      ev.kind === "tool_use" || ev.kind === "subagent_spawn" ? resultTsById.get(ev.toolUseId) ?? null : null;

    const starts = events.map((e) => parseTs(e.ts)).filter((t): t is number => t != null);
    const tMin = starts.length ? Math.min(...starts) : 0;
    const tMax = starts.length ? Math.max(...starts) : 0;
    const degenerate = tMax - tMin <= 0;
    const n = events.length;

    // Breakpoints = every event start and span end; the axis is piecewise-linear
    // over them, compressing any segment longer than the idle threshold.
    const breakSet = new Set<number>(starts);
    for (const ev of events) {
      const e = spanEnd(ev);
      if (e != null) breakSet.add(e);
    }
    const breaks = [...breakSet].sort((a, b) => a - b);
    const comp = new Array<number>(breaks.length);
    comp[0] = 0;
    const gaps: GapMark[] = [];
    for (let i = 1; i < breaks.length; i++) {
      const real = breaks[i]! - breaks[i - 1]!;
      const c = real <= GAP_THRESHOLD_MS ? real : GAP_COMPRESSED_MS;
      comp[i] = comp[i - 1]! + c;
      if (real > GAP_THRESHOLD_MS) gaps.push({ frac: 0, real }); // frac filled below
    }
    const totalC = comp[breaks.length - 1] || 1;

    const remap = (t: number): number => {
      if (t <= breaks[0]!) return 0;
      if (t >= breaks[breaks.length - 1]!) return 1;
      let i = 0;
      while (i < breaks.length - 1 && breaks[i + 1]! <= t) i++;
      const segReal = breaks[i + 1]! - breaks[i]!;
      const segComp = comp[i + 1]! - comp[i]!;
      const within = segReal > 0 ? (t - breaks[i]!) / segReal : 0;
      return (comp[i]! + within * segComp) / totalC;
    };

    // Position gap markers at the midpoint of each compressed segment.
    let g = 0;
    for (let i = 1; i < breaks.length && g < gaps.length; i++) {
      if (breaks[i]! - breaks[i - 1]! > GAP_THRESHOLD_MS) {
        gaps[g]!.frac = (comp[i - 1]! + comp[i]!) / 2 / totalC;
        g++;
      }
    }

    const rows: Row[] = events.map((ev, i) => {
      const depth = depthOf(ev);
      const start = parseTs(ev.ts);
      const startFrac = degenerate ? (n > 1 ? i / (n - 1) : 0) : start != null ? remap(start) : 0;
      let endFrac = startFrac;
      let durMs: number | null = null;
      if (!degenerate && start != null) {
        const end = spanEnd(ev);
        if (end != null && end > start) {
          endFrac = remap(end);
          durMs = end - start;
        }
      }
      return { ev, idx: i, depth, startFrac, endFrac, durMs };
    });
    rows.sort((a, b) => a.startFrac - b.startFrac || a.idx - b.idx);
    return { rows, gaps, degenerate };
  }, [events]);

  if (events.length === 0) return <div className="ld-empty">Nessun evento.</div>;

  const selRow = selected != null ? rows.find((r) => r.idx === selected) : undefined;

  return (
    <div className="exec-graph">
      <div className="exec-wf" style={{ "--wf-label": `${label.width}px` } as CSSProperties}>
        <div className="exec-wf-resizer" style={{ left: label.width }} {...label.handlers} title="Trascina per ridimensionare" />
        {degenerate ? (
          <div className="exec-hint">Timestamp non disponibili o troppo ravvicinati — righe in ordine di sequenza.</div>
        ) : null}
        <div className="exec-wf-scroll">
          <div className="exec-wf-rows">
          {!degenerate
            ? gaps.map((g, i) => (
                <div key={`gap${i}`} className="exec-wf-gapline" style={{ left: `calc(var(--wf-label, 210px) + ${g.frac} * (100% - var(--wf-label, 210px)))` }}>
                  <span className="exec-wf-gaplabel">⋯ {fmtDur(g.real)}</span>
                </div>
              ))
            : null}
          {rows.map((r) => {
            const isErr = r.ev.kind === "tool_result" && !r.ev.ok;
            const color = isErr ? "#ff6b6b" : KIND_COLOR[r.ev.kind];
            const widthPct = Math.max((r.endFrac - r.startFrac) * 100, 0);
            return (
              <div
                key={r.idx}
                className={`exec-wf-row${r.idx === selected ? " sel" : ""}`}
                onClick={() => setSelected(r.idx)}
                onDoubleClick={() => onSelectEvent?.(r.ev.uuid)}
              >
                <div className="exec-wf-label" style={{ paddingLeft: 6 + r.depth * 12 }} title={`${r.ev.kind} · ${eventLabel(r.ev)}`}>
                  <span className="exec-wf-dot" style={{ background: color, opacity: r.ev.isSidechain ? 0.55 : 1 }} />
                  <span className="exec-wf-kind">{r.ev.kind}</span>
                  <span className="exec-wf-name">{eventLabel(r.ev)}</span>
                </div>
                <div className="exec-wf-track">
                  <div
                    className="exec-wf-bar"
                    style={{
                      left: `${r.startFrac * 100}%`,
                      width: `${widthPct}%`,
                      background: color,
                      opacity: r.ev.isSidechain ? 0.5 : 0.92,
                    }}
                  />
                  {r.durMs != null ? (
                    <span className="exec-wf-dur" style={{ left: `${r.endFrac * 100}%` }}>{fmtDur(r.durMs)}</span>
                  ) : null}
                </div>
              </div>
            );
          })}
          </div>
        </div>
      </div>
      {selRow ? (
        <EventDetail ev={selRow.ev} />
      ) : (
        <div className="exec-hint">Click su una riga per i dettagli. Doppio click per saltare all'evento. I tratti ⋯ sono pause compresse.</div>
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
