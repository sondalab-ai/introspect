import { useEffect, useRef, useState } from "react";

export interface ResizableOpts {
  /** localStorage key for persisting the user's chosen width. */
  storageKey: string;
  /** Hard min/max in pixels. */
  min: number;
  max: number;
  /** Default width if nothing is stored yet. */
  initial: number;
  /** If true, drag-left grows the panel (use for panels anchored on the right). */
  invert?: boolean;
}

export interface ResizableHandle {
  width: number;
  /** Pointer handlers to spread onto the visible resizer element. */
  handlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
  };
}

/** Resize an X-axis dimension by dragging a vertical handle. Persists across sessions. */
export function useResizableWidth(opts: ResizableOpts): ResizableHandle {
  const [width, setWidth] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(opts.storageKey);
      const n = raw === null ? NaN : Number(raw);
      return Number.isFinite(n) && n >= opts.min && n <= opts.max ? n : opts.initial;
    } catch {
      return opts.initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(opts.storageKey, String(width));
    } catch {
      // localStorage unavailable — silently degrade
    }
  }, [opts.storageKey, width]);

  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  function clamp(n: number): number {
    return Math.min(opts.max, Math.max(opts.min, n));
  }

  const handlers: ResizableHandle["handlers"] = {
    onPointerDown(e) {
      dragRef.current = { startX: e.clientX, startW: width };
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      e.preventDefault();
    },
    onPointerMove(e) {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const delta = opts.invert ? -dx : dx;
      setWidth(clamp(dragRef.current.startW + delta));
    },
    onPointerUp(e) {
      if (!dragRef.current) return;
      dragRef.current = null;
      try {
        (e.currentTarget as Element).releasePointerCapture(e.pointerId);
      } catch {
        // pointer already released
      }
    },
    onPointerCancel(e) {
      dragRef.current = null;
      try {
        (e.currentTarget as Element).releasePointerCapture(e.pointerId);
      } catch {
        // pointer already released
      }
    },
  };

  return { width, handlers };
}
