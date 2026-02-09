import { useCallback } from "react";
import { useParams } from "react-router-dom";
import { ValidationView } from "./ValidationView";
import { useViewSelection } from "@/contexts/ViewSelectionContext";
import type { ValidationViewSelection } from "@/contexts/ViewSelectionContext";

export function ValidationViewWrapper() {
  const { studyId } = useParams<{ studyId: string }>();
  const { selection: viewSelection, setSelection } = useViewSelection();

  const handleSelectionChange = useCallback(
    (sel: ValidationViewSelection | null) => {
      setSelection(sel);
    },
    [setSelection]
  );

  const valSelection = viewSelection?._view === "validation" ? viewSelection : null;

  return (
    <ValidationView
      studyId={studyId}
      onSelectionChange={handleSelectionChange}
      viewSelection={valSelection}
    />
  );
}
