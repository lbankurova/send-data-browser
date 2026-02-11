import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";

interface DesignModeState {
  designMode: boolean;
  toggleDesignMode: () => void;
}

const DesignModeContext = createContext<DesignModeState>({
  designMode: false,
  toggleDesignMode: () => {},
});

function getInitial(): boolean {
  try {
    return localStorage.getItem("design-mode") === "true";
  } catch {
    return false;
  }
}

export function DesignModeProvider({ children }: { children: ReactNode }) {
  const [designMode, setDesignMode] = useState(getInitial);

  const toggleDesignMode = useCallback(() => {
    setDesignMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("design-mode", String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  return (
    <DesignModeContext.Provider value={{ designMode, toggleDesignMode }}>
      {children}
    </DesignModeContext.Provider>
  );
}

export function useDesignMode() {
  return useContext(DesignModeContext);
}
