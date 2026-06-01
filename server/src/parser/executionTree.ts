import type { ExecutionNode, SessionEvent } from "./types.js";

/**
 * Build a forest from `parentUuid` links; events with no/unknown parent are roots.
 *
 * One transcript message can normalize into several events that share its `uuid`
 * (e.g. `text` + `tool_use`), so nodes are kept per-event (no overwrite) and the
 * uuid→node map only records the first occurrence for parent resolution. Events
 * sharing a uuid become siblings under the same parent instead of clobbering one
 * another. Self-references (a sibling pointing at its own shared uuid) are treated
 * as roots to avoid cycles.
 */
export function buildTree(events: SessionEvent[]): ExecutionNode[] {
  const nodes: ExecutionNode[] = events.map((event) => ({ event, children: [] }));
  const firstByUuid = new Map<string, ExecutionNode>();
  for (const node of nodes) {
    const id = node.event.uuid;
    if (id && !firstByUuid.has(id)) firstByUuid.set(id, node);
  }
  const roots: ExecutionNode[] = [];
  for (const node of nodes) {
    const pu = node.event.parentUuid;
    const parent = pu ? firstByUuid.get(pu) : undefined;
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}
