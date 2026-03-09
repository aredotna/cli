import { useState, useEffect } from "react";
import { useApp } from "ink";
import { exitCodeFromError } from "../lib/exit-codes";

export function useCommand<T>(fn: () => Promise<T>) {
  const { exit } = useApp();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exitCode, setExitCode] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fn()
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setExitCode(exitCodeFromError(err));
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loading) {
      if (error) process.exitCode = exitCode;
      exit();
    }
  }, [loading, error, exitCode, exit]);

  return { data, error, loading };
}
