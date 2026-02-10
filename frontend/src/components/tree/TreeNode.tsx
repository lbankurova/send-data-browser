import { ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface TreeNodeProps {
  label: string;
  depth: number;
  icon?: React.ReactNode;
  isExpanded?: boolean;
  isActive?: boolean;
  className?: string;
  onClick?: () => void;
  onToggle?: () => void;
}

export function TreeNode({
  label,
  depth,
  icon,
  isExpanded,
  isActive,
  className,
  onClick,
  onToggle,
}: TreeNodeProps) {
  return (
    <button
      className={cn(
        "flex w-full items-center gap-1 px-2 py-0.5 text-xs hover:bg-accent/50",
        isActive && "bg-accent",
        className
      )}
      style={{ paddingLeft: `${depth * 18 + 8}px` }}
      onClick={onClick}
    >
      {isExpanded !== undefined ? (
        <span
          className="shrink-0"
          onClick={
            onToggle
              ? (e) => {
                  e.stopPropagation();
                  onToggle();
                }
              : undefined
          }
        >
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </span>
      ) : (
        <span className="w-3.5 shrink-0" />
      )}
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="truncate">{label}</span>
    </button>
  );
}
