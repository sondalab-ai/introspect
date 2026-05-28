/** Keys whose values are redacted by default (case-insensitive substring). */
const SECRET_PATTERNS = [/token/i, /secret/i, /password/i, /apikey/i, /api[-_]?key/i, /auth/i];

const SKIP_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export interface Redacted<T> {
  value: T;
  /** Dotted/bracketed paths to keys that were redacted. */
  redactedKeys: string[];
}

function isSecretKey(key: string): boolean {
  return SECRET_PATTERNS.some((re) => re.test(key));
}

function isPlainContainer(node: unknown): node is object {
  if (node === null || typeof node !== "object") return false;
  if (Array.isArray(node)) return true;
  if (node instanceof Date || node instanceof RegExp || node instanceof Map || node instanceof Set) return false;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(node)) return false;
  return true;
}

/** Deep-clone-and-redact: replaces secret values with "[REDACTED]". Cycle-safe. */
export function redactSecrets<T>(input: T): Redacted<T> {
  const redactedKeys: string[] = [];
  const seen = new WeakSet<object>();
  function walk(node: unknown, path: string): unknown {
    if (!isPlainContainer(node)) return node;
    if (seen.has(node)) return Array.isArray(node) ? [] : {};
    seen.add(node);
    if (Array.isArray(node)) {
      return node.map((item, i) => walk(item, `${path}[${i}]`));
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      if (SKIP_KEYS.has(k)) continue;
      const childPath = path === "" ? k : `${path}.${k}`;
      if (isSecretKey(k)) {
        redactedKeys.push(childPath);
        out[k] = "[REDACTED]";
      } else {
        out[k] = walk(v, childPath);
      }
    }
    return out;
  }
  return { value: walk(input, "") as T, redactedKeys };
}
