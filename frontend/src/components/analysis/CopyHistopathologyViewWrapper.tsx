import { useCallback } from "react";
import { CopyHistopathologyView } from "./CopyHistopathologyView";
import type { HistopathSelection } from "./CopyHistopathologyView";
import { useViewSelection } from "@/contexts/ViewSelectionContext";

export function CopyHistopathologyViewWrapper() {
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
    <CopyHistopathologyView
      onSelectionChange={handleSelectionChange}
      onSubjectClick={handleSubjectClick}
    />
  );
}
