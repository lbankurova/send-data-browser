import { cn } from "@/lib/utils";

interface DomainLabelProps {
  domain: string;
  className?: string;
}

export function DomainLabel({ domain, className }: DomainLabelProps) {
  return (
    <span className={cn("font-mono text-[10px] font-semibold text-muted-foreground", className)}>
      {domain}
    </span>
  );
}
