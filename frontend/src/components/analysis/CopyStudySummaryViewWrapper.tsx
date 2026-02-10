import { useCallback } from "react";
import { CopyStudySummaryView } from "./CopyStudySummaryView";
import { useSignalSelection } from "@/contexts/SignalSelectionContext";

export function CopyStudySummaryViewWrapper() {
  const { setSelection, setOrganSelection, clearSelection } = useSignalSelection();

  const handleSelectionChange = useCallback(
    (sel: Parameters<typeof setSelection>[0]) => {
      setSelection(sel);
    },
    [setSelection]
  );

  const handleOrganSelect = useCallback(
    (organ: string | null) => {
      if (organ) setOrganSelection(organ);
      else clearSelection();
    },
    [setOrganSelection, clearSelection]
  );

  return (
    <CopyStudySummaryView
      onSelectionChange={handleSelectionChange}
      onOrganSelect={handleOrganSelect}
    />
  );
}
