import { useCallback } from "react";
import { HistopathologyView } from "./HistopathologyView";
import type { HistopathSelection } from "./HistopathologyView";
import { useViewSelection } from "@/contexts/ViewSelectionContext";

export function HistopathologyViewWrapper() {
  const { setSelection } = useViewSelection();

  const handleSelectionChange = useCallback(
    (sel: HistopathSelection | null) => {
      setSelection(sel ? { ...sel, _view: "histopathology" } : null);
    },
    [setSelection]
  );

  return <HistopathologyView onSelectionChange={handleSelectionChange} />;
}
