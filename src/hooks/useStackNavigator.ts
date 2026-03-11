import { useCallback, useRef, useState } from "react";

interface UseStackNavigatorOptions {
  onPopRoot?: () => void;
  beforeTransition?: () => void;
}

export function useStackNavigator<T>(
  initial: T,
  options: UseStackNavigatorOptions = {},
) {
  const [stack, setStack] = useState<T[]>([initial]);
  const stackRef = useRef(stack);
  stackRef.current = stack;

  const current = stack[stack.length - 1]!;

  const push = useCallback(
    (next: T) => {
      options.beforeTransition?.();
      setStack((s) => [...s, next]);
    },
    [options.beforeTransition],
  );

  const pop = useCallback(() => {
    options.beforeTransition?.();
    if (stackRef.current.length <= 1) {
      options.onPopRoot?.();
      return;
    }
    setStack((s) => s.slice(0, -1));
  }, [options.beforeTransition, options.onPopRoot]);

  const replace = useCallback(
    (next: T) => {
      options.beforeTransition?.();
      setStack((s) => [...s.slice(0, -1), next]);
    },
    [options.beforeTransition],
  );

  const popTo = useCallback(
    (next: T) => {
      options.beforeTransition?.();
      if (stackRef.current.length <= 1) {
        setStack([next]);
        return;
      }
      setStack((s) => [...s.slice(0, -2), next]);
    },
    [options.beforeTransition],
  );

  const reset = useCallback(
    (next: T) => {
      options.beforeTransition?.();
      setStack([next]);
    },
    [options.beforeTransition],
  );

  return { stack, current, push, pop, replace, popTo, reset };
}
