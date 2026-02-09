import { cn } from "@/lib/utils";
import { getDomainBadgeColor } from "@/lib/severity-colors";

interface DomainLabelProps {
  domain: string;
  className?: string;
}

export function DomainLabel({ domain, className }: DomainLabelProps) {
  return (
    <span className={cn("text-[9px] font-semibold", getDomainBadgeColor(domain).text, className)}>
      {domain}
    </span>
  );
}
