import { useCallback } from "react";
import { CopyNoaelDecisionView } from "./CopyNoaelDecisionView";
import { useViewSelection } from "@/contexts/ViewSelectionContext";

export function CopyNoaelDecisionViewWrapper() {
  const { setSelection } = useViewSelection();

  const handleSelectionChange = useCallback(
    (sel: { endpoint_label: string; dose_level: number; sex: string } | null) => {
      setSelection(sel ? { ...sel, _view: "noael" } : null);
    },
    [setSelection]
  );

  return <CopyNoaelDecisionView onSelectionChange={handleSelectionChange} />;
}
