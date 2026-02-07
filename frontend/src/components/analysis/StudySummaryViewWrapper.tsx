import { useCallback } from "react";
import { StudySummaryView } from "./StudySummaryView";
import { useSignalSelection } from "@/contexts/SignalSelectionContext";

export function StudySummaryViewWrapper() {
  const { setSelection } = useSignalSelection();

  const handleSelectionChange = useCallback(
    (sel: Parameters<typeof setSelection>[0]) => {
      setSelection(sel);
    },
    [setSelection]
  );

  return <StudySummaryView onSelectionChange={handleSelectionChange} />;
}
