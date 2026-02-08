import { useCallback } from "react";
import { useParams } from "react-router-dom";
import { ValidationView } from "./ValidationView";
import { useViewSelection } from "@/contexts/ViewSelectionContext";

export function ValidationViewWrapper() {
  const { studyId } = useParams<{ studyId: string }>();
  const { selection: viewSelection, setSelection } = useViewSelection();

  const handleSelectionChange = useCallback(
    (sel: Record<string, unknown> | null) => {
      setSelection(sel);
    },
    [setSelection]
  );

  return (
    <ValidationView
      studyId={studyId}
      onSelectionChange={handleSelectionChange}
      viewSelection={viewSelection}
    />
  );
}
