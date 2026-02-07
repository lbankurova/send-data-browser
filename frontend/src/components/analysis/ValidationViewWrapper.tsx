import { useCallback } from "react";
import { ValidationView } from "./ValidationView";
import { useViewSelection } from "@/contexts/ViewSelectionContext";
import type { ValidationIssue } from "./ValidationView";

export function ValidationViewWrapper() {
  const { setSelection } = useViewSelection();

  const handleSelectionChange = useCallback(
    (issue: ValidationIssue | null) => {
      setSelection(issue ? { ...issue, _view: "validation" } : null);
    },
    [setSelection]
  );

  return <ValidationView onSelectionChange={handleSelectionChange} />;
}
