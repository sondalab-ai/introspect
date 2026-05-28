import { useEffect, useState } from "react";

export type EndpointState<T> =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; data: T };

/** Fetch JSON once on mount from a same-origin path. */
export function useEndpoint<T>(path: string): EndpointState<T> {
  const [state, setState] = useState<EndpointState<T>>({ status: "loading" });
  useEffect(() => {
    let cancelled = false;
    fetch(path)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as T;
        if (!cancelled) setState({ status: "ready", data });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({ status: "error", error: err instanceof Error ? err.message : String(err) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [path]);
  return state;
}
