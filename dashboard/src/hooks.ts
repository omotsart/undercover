import { errorMessage } from "./format";
import { useCallback, useEffect, useState } from "react";

export const REFRESH = "undercover:refresh";

export function usePolling<T>(load: () => Promise<T>, interval = 2000) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();

  const refresh = useCallback(
    () =>
      load().then(
        (value) => {
          setData(value);
          setError(undefined);
        },
        (reason: unknown) => {
          setError(errorMessage(reason));
        },
      ),
    [load],
  );

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), interval);
    const onRefresh = () => void refresh();
    window.addEventListener(REFRESH, onRefresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener(REFRESH, onRefresh);
    };
  }, [refresh, interval]);

  return { data, error, refresh };
}

export function navigate(path: string) {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function readParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

// Replaces the query without a new history entry, so Back from a claim
// returns to the same filter and page.
export function writeParams(values: Record<string, string | null>) {
  const params = new URLSearchParams(window.location.search);
  for (const [name, value] of Object.entries(values)) {
    if (value === null) params.delete(name);
    else params.set(name, value);
  }
  const query = params.toString();
  const search = query ? "?" + query : "";
  window.history.replaceState(null, "", window.location.pathname + search);
}

export function usePath(): string {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const onPopState = () => {
      setPath(window.location.pathname);
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, []);
  return path;
}
