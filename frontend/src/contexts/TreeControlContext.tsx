import { createContext, useCallback, useContext, useRef, useState } from "react";

interface TreeControlValue {
  /** Whether any study node is expanded */
  hasExpanded: boolean;
  /** Expand all study nodes — call register() first to populate IDs */
  expandAll: () => void;
  /** Collapse all study nodes */
  collapseAll: () => void;
  /** Register the set of all study IDs (called by BrowsingTree) */
  register: (ids: string[]) => void;
  /** Internal: expanded set + setter for BrowsingTree to bind to */
  expandedStudies: Set<string>;
  setExpandedStudies: React.Dispatch<React.SetStateAction<Set<string>>>;
  manuallyCollapsed: React.MutableRefObject<Set<string>>;
}

const TreeControlContext = createContext<TreeControlValue | null>(null);

export function TreeControlProvider({ children }: { children: React.ReactNode }) {
  const [expandedStudies, setExpandedStudies] = useState<Set<string>>(new Set());
  const manuallyCollapsed = useRef<Set<string>>(new Set());
  const allIdsRef = useRef<string[]>([]);

  const register = useCallback((ids: string[]) => {
    allIdsRef.current = ids;
  }, []);

  const expandAll = useCallback(() => {
    setExpandedStudies(new Set(allIdsRef.current));
    manuallyCollapsed.current.clear();
  }, []);

  const collapseAll = useCallback(() => {
    setExpandedStudies(new Set());
    manuallyCollapsed.current = new Set(allIdsRef.current);
  }, []);

  return (
    <TreeControlContext.Provider
      value={{
        hasExpanded: expandedStudies.size > 0,
        expandAll,
        collapseAll,
        register,
        expandedStudies,
        setExpandedStudies,
        manuallyCollapsed,
      }}
    >
      {children}
    </TreeControlContext.Provider>
  );
}

export function useTreeControl() {
  const ctx = useContext(TreeControlContext);
  if (!ctx) throw new Error("useTreeControl must be used within TreeControlProvider");
  return ctx;
}
