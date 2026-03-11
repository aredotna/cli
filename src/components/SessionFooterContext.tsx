import { createContext, useContext, useLayoutEffect } from "react";
import type { ReactNode } from "react";

export type SessionFooterAction = {
  key: string;
  label: string;
};

const SessionFooterContext = createContext<
  ((actions: SessionFooterAction[]) => void) | null
>(null);

export function SessionFooterProvider({
  setActions,
  children,
}: {
  setActions: (actions: SessionFooterAction[]) => void;
  children: ReactNode;
}) {
  return (
    <SessionFooterContext.Provider value={setActions}>
      {children}
    </SessionFooterContext.Provider>
  );
}

export function useSessionFooter(actions: SessionFooterAction[]) {
  const setActions = useContext(SessionFooterContext);
  const signature = actions
    .map((action) => `${action.key}:${action.label}`)
    .join("|");

  useLayoutEffect(() => {
    if (!setActions) return;
    setActions(actions);
    return () => setActions([]);
  }, [setActions, signature]);
}
