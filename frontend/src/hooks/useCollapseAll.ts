import { useState } from "react";

export function useCollapseAll() {
  const [expandGen, setExpandGen] = useState(0);
  const [collapseGen, setCollapseGen] = useState(0);
  return {
    expandGen,
    collapseGen,
    expandAll: () => setExpandGen((g) => g + 1),
    collapseAll: () => setCollapseGen((g) => g + 1),
  };
}
