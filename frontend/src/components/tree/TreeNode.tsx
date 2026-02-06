import { ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface TreeNodeProps {
  label: string;
  depth: number;
  icon?: React.ReactNode;
  isExpanded?: boolean;
  isActive?: boolean;
  onClick?: () => void;
}

export function TreeNode({
  label,
  depth,
  icon,
  isExpanded,
  isActive,
  onClick,
}: TreeNodeProps) {
  return (
    <button
      className={cn(
        "flex w-full items-center gap-1 px-2 py-1 text-sm hover:bg-accent/50",
        isActive && "bg-accent"
      )}
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
      onClick={onClick}
    >
      {isExpanded !== undefined ? (
        isExpanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )
      ) : (
        <span className="w-4 shrink-0" />
      )}
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="truncate">{label}</span>
    </button>
  );
}
