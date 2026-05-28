/** Keys whose values are redacted by default (case-insensitive substring). */
const SECRET_PATTERNS = [/token/i, /secret/i, /password/i, /apikey/i, /api[-_]?key/i, /auth/i];

export interface Redacted<T> {
  value: T;
  /** Dotted/bracketed paths to keys that were redacted. */
  redactedKeys: string[];
}

function isSecretKey(key: string): boolean {
  return SECRET_PATTERNS.some((re) => re.test(key));
}

/** Deep-clone-and-redact: replaces secret values with "[REDACTED]". */
export function redactSecrets<T>(input: T): Redacted<T> {
  const redactedKeys: string[] = [];
  function walk(node: unknown, path: string): unknown {
    if (node === null || typeof node !== "object") return node;
    if (Array.isArray(node)) {
      return node.map((item, i) => walk(item, `${path}[${i}]`));
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
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
