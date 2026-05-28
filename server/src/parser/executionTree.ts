import type { ExecutionNode, SessionEvent } from "./types.js";

/** Build a forest from `parentUuid` links; events with no/unknown parent are roots. */
export function buildTree(events: SessionEvent[]): ExecutionNode[] {
  const nodes = new Map<string, ExecutionNode>();
  for (const event of events) {
    if (!event.uuid) continue;
    nodes.set(event.uuid, { event, children: [] });
  }
  const roots: ExecutionNode[] = [];
  for (const event of events) {
    const node = nodes.get(event.uuid);
    if (!node) continue;
    const parent = event.parentUuid ? nodes.get(event.parentUuid) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}
