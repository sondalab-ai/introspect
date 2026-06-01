import { useSyncExternalStore } from "react";
import { liveStore, type LiveStatus } from "./liveStore.js";
import type { LiveFrame } from "./api.js";

export type { LiveStatus };

/** Subscribe to the shared live event stream. Frames persist across page navigation. */
export function useLiveEvents(): { frames: LiveFrame[]; status: LiveStatus } {
  return useSyncExternalStore(liveStore.subscribe, liveStore.getSnapshot, liveStore.getSnapshot);
}
