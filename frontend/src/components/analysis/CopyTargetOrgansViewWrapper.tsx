import { useCallback } from "react";
import { CopyTargetOrgansView } from "./CopyTargetOrgansView";
import type { OrganSelection } from "./CopyTargetOrgansView";
import { useViewSelection } from "@/contexts/ViewSelectionContext";

export function CopyTargetOrgansViewWrapper() {
  const { setSelection } = useViewSelection();

  const handleSelectionChange = useCallback(
    (sel: OrganSelection | null) => {
      setSelection(sel ? { ...sel, _view: "target-organs" } : null);
    },
    [setSelection]
  );

  return <CopyTargetOrgansView onSelectionChange={handleSelectionChange} />;
}
