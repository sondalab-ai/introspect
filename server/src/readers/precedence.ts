export type ItemSource = "user" | "plugin";

const RANK: Record<ItemSource, number> = { user: 0, plugin: 1 };

export interface Precedence {
  /** A higher-precedence item (user > plugin) with the same name exists — this one is overridden. */
  shadowed: boolean;
  /** The overriding item (origin + path), when this one is shadowed. */
  shadowedBy?: { source: ItemSource; path: string };
  /** Another item with the same name AND the same source exists — likely redundant or a mistake. */
  duplicate: boolean;
}

/**
 * Flag items that share a `name` by source precedence (user > plugin) without
 * dropping any: shadowed marks an overridden copy (pointing at the winner),
 * duplicate marks same-source redundancy. Keeping every row makes accidental or
 * redundant duplicates visible instead of silently collapsing them.
 */
export function annotatePrecedence<T extends { name: string; source: ItemSource; path: string }>(
  items: T[],
): (T & Precedence)[] {
  const byName = new Map<string, T[]>();
  for (const it of items) {
    const arr = byName.get(it.name);
    if (arr) arr.push(it);
    else byName.set(it.name, [it]);
  }
  return items.map((it) => {
    const group = byName.get(it.name)!;
    const winner = group.reduce((best, g) => (RANK[g.source] < RANK[best.source] ? g : best), group[0]!);
    const shadowed = RANK[it.source] > RANK[winner.source];
    const sameSourceCount = group.reduce((n, g) => n + (g.source === it.source ? 1 : 0), 0);
    return {
      ...it,
      shadowed,
      shadowedBy: shadowed ? { source: winner.source, path: winner.path } : undefined,
      duplicate: sameSourceCount > 1,
    };
  });
}
