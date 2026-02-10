import { useCallback } from "react";
import { useParams } from "react-router-dom";
import { CopyValidationView } from "./CopyValidationView";
import { useViewSelection } from "@/contexts/ViewSelectionContext";
import type { ValidationViewSelection } from "@/contexts/ViewSelectionContext";

export function CopyValidationViewWrapper() {
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
    <CopyValidationView
      studyId={studyId}
      onSelectionChange={handleSelectionChange}
      viewSelection={valSelection}
    />
  );
}
