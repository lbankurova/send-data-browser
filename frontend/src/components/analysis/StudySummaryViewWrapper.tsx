import { useCallback } from "react";
import { StudySummaryView } from "./StudySummaryView";
import { useSignalSelection } from "@/contexts/SignalSelectionContext";

export function StudySummaryViewWrapper() {
  const { setSelection, setOrganSelection } = useSignalSelection();

  const handleSelectionChange = useCallback(
    (sel: Parameters<typeof setSelection>[0]) => {
      setSelection(sel);
    },
    [setSelection]
  );

  const handleOrganSelect = useCallback(
    (organ: string | null) => {
      setOrganSelection(organ);
    },
    [setOrganSelection]
  );

  return (
    <StudySummaryView
      onSelectionChange={handleSelectionChange}
      onOrganSelect={handleOrganSelect}
    />
  );
}
