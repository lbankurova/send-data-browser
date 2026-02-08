import { useCallback } from "react";
import { StudySummaryView } from "./StudySummaryView";
import { useSignalSelection } from "@/contexts/SignalSelectionContext";

export function StudySummaryViewWrapper() {
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
    <StudySummaryView
      onSelectionChange={handleSelectionChange}
      onOrganSelect={handleOrganSelect}
    />
  );
}
