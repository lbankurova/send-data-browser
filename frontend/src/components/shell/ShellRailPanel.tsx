import { useParams } from "react-router-dom";
import { useResizePanel } from "@/hooks/useResizePanel";
import { PanelResizeHandle } from "@/components/ui/PanelResizeHandle";
import { PolymorphicRail } from "./PolymorphicRail";

/**
 * Shell-level rail panel. Wraps PolymorphicRail with resize handle.
 * Only renders when inside a study route (studyId present).
 */
export function ShellRailPanel() {
  const { studyId, domainName } = useParams<{ studyId: string; domainName: string }>();
  const { width, onPointerDown } = useResizePanel(300, 180, 500, "left", "pcc.layout.railWidth");

  // Don't render on landing page, non-study routes, or domain browser
  if (!studyId || domainName) return null;

  return (
    <>
      <div
        className="shrink-0 overflow-hidden border-r"
        style={{ width }}
      >
        <PolymorphicRail />
      </div>
      <PanelResizeHandle onPointerDown={onPointerDown} />
    </>
  );
}
