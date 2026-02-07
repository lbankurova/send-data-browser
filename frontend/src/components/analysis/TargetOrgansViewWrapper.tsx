import { useCallback } from "react";
import { TargetOrgansView } from "./TargetOrgansView";
import type { OrganSelection } from "./TargetOrgansView";
import { useViewSelection } from "@/contexts/ViewSelectionContext";

export function TargetOrgansViewWrapper() {
  const { setSelection } = useViewSelection();

  const handleSelectionChange = useCallback(
    (sel: OrganSelection | null) => {
      setSelection(sel ? { ...sel, _view: "target-organs" } : null);
    },
    [setSelection]
  );

  return <TargetOrgansView onSelectionChange={handleSelectionChange} />;
}
