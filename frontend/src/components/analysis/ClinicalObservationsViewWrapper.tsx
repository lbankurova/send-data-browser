import { useCallback } from "react";
import { ClinicalObservationsView } from "./ClinicalObservationsView";
import type { CLObservationSelection } from "./ClinicalObservationsView";
import { useViewSelection } from "@/contexts/ViewSelectionContext";

export function ClinicalObservationsViewWrapper() {
  const { setSelection } = useViewSelection();

  const handleSelectionChange = useCallback(
    (sel: CLObservationSelection | null) => {
      setSelection(sel ? { ...sel, _view: "clinical-observations" } : null);
    },
    [setSelection]
  );

  return <ClinicalObservationsView onSelectionChange={handleSelectionChange} />;
}
