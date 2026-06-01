import type { ReactNode } from "react";

const TOKEN_RE =
  /("(?:\\.|[^"\\])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g;

function classifyToken(raw: string): string {
  if (raw[0] === '"') return /:\s*$/.test(raw) ? "jv-key" : "jv-string";
  if (raw === "true" || raw === "false") return "jv-bool";
  if (raw === "null") return "jv-null";
  return "jv-number";
}

/** Tokenize a pretty-printed JSON string into <span>'d React nodes for syntax highlighting. */
function highlight(json: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const match of json.matchAll(TOKEN_RE)) {
    const m = match[0];
    const offset = match.index ?? 0;
    if (offset > last) out.push(json.slice(last, offset));
    out.push(<span key={i++} className={classifyToken(m)}>{m}</span>);
    last = offset + m.length;
  }
  if (last < json.length) out.push(json.slice(last));
  return out;
}

export interface JsonViewProps {
  /** Object/array/primitive to stringify with 2-space indent. */
  value?: unknown;
  /** Pre-formatted JSON string (if you already have one). Overrides `value`. */
  raw?: string;
  /** Extra class names applied to the outer pre. */
  className?: string;
  /** Inline style overrides. */
  style?: React.CSSProperties;
}

/** Pretty-print + syntax-highlight JSON. Falls back to String(value) if stringify fails. */
export function JsonView({ value, raw, className = "", style }: JsonViewProps) {
  let text: string;
  if (typeof raw === "string") {
    text = raw;
  } else {
    try { text = JSON.stringify(value, null, 2); }
    catch { text = String(value); }
  }
  return <pre className={`jv ${className}`.trim()} style={style}>{highlight(text)}</pre>;
}
