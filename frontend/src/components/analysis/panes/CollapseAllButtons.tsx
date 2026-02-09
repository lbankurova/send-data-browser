import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";

interface CollapseAllButtonsProps {
  onExpandAll: () => void;
  onCollapseAll: () => void;
}

export function CollapseAllButtons({
  onExpandAll,
  onCollapseAll,
}: CollapseAllButtonsProps) {
  return (
    <span className="inline-flex items-center gap-0.5">
      <button
        className="rounded p-0.5 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
        onClick={onExpandAll}
        title="Expand all"
      >
        <ChevronsUpDown className="h-3.5 w-3.5" />
      </button>
      <button
        className="rounded p-0.5 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
        onClick={onCollapseAll}
        title="Collapse all"
      >
        <ChevronsDownUp className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}
