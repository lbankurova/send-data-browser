import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

interface CollapsiblePaneProps {
  title: string;
  defaultOpen?: boolean;
  headerRight?: ReactNode;
  children: ReactNode;
}

export function CollapsiblePane({
  title,
  defaultOpen = true,
  headerRight,
  children,
}: CollapsiblePaneProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b last:border-b-0">
      <button
        className="flex w-full items-center gap-1 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent/50"
        onClick={() => setIsOpen((v) => !v)}
      >
        {isOpen ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        {title}
        {headerRight && (
          <span className="ml-auto flex items-center gap-1.5 text-[9px] font-medium normal-case tracking-normal">
            {headerRight}
          </span>
        )}
      </button>
      {isOpen && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}
