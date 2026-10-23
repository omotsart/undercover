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
