import { useCallback } from "react";
import { DoseResponseView } from "./DoseResponseView";
import type { DoseResponseSelection } from "./DoseResponseView";
import { useViewSelection } from "@/contexts/ViewSelectionContext";

export function DoseResponseViewWrapper() {
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
    <DoseResponseView
      onSelectionChange={handleSelectionChange}
      onSubjectClick={handleSubjectClick}
    />
  );
}
