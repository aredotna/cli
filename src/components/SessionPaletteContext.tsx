import { createContext, useContext } from "react";
import type { ReactNode } from "react";

const SessionPaletteContext = createContext(false);

export function SessionPaletteProvider({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  return (
    <SessionPaletteContext.Provider value={active}>
      {children}
    </SessionPaletteContext.Provider>
  );
}

export function useSessionPaletteActive() {
  return useContext(SessionPaletteContext);
}
