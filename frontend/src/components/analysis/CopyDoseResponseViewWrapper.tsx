import { useCallback } from "react";
import { CopyDoseResponseView } from "./CopyDoseResponseView";
import type { DoseResponseSelection } from "./CopyDoseResponseView";
import { useViewSelection } from "@/contexts/ViewSelectionContext";

export function CopyDoseResponseViewWrapper() {
  const { setSelection, setSelectedSubject } = useViewSelection();

  const handleSelectionChange = useCallback(
    (sel: DoseResponseSelection | null) => {
      setSelection(sel ? { ...sel, _view: "dose-response" } : null);
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
    <CopyDoseResponseView
      onSelectionChange={handleSelectionChange}
      onSubjectClick={handleSubjectClick}
    />
  );
}
