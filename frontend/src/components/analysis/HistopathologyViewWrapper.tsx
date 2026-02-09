import { useCallback } from "react";
import { HistopathologyView } from "./HistopathologyView";
import type { HistopathSelection } from "./HistopathologyView";
import { useViewSelection } from "@/contexts/ViewSelectionContext";

export function HistopathologyViewWrapper() {
  const { setSelection, setSelectedSubject } = useViewSelection();

  const handleSelectionChange = useCallback(
    (sel: HistopathSelection | null) => {
      setSelection(sel ? { ...sel, _view: "histopathology" } : null);
    },
    [setSelection]
  );

  const handleSubjectClick = useCallback(
    (usubjid: string) => {
      setSelectedSubject(usubjid);
    },
    [setSelectedSubject]
  );

  return (
    <HistopathologyView
      onSelectionChange={handleSelectionChange}
      onSubjectClick={handleSubjectClick}
    />
  );
}
