import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AdverseEffectsFilters } from "@/types/analysis";

interface FindingsFilterBarProps {
  filters: AdverseEffectsFilters;
  onFiltersChange: (filters: AdverseEffectsFilters) => void;
}

const DOMAINS = ["LB", "BW", "OM", "MI", "MA", "CL"];
const SEXES = ["M", "F"];
const SEVERITIES = ["adverse", "warning", "normal"];

export function FindingsFilterBar({
  filters,
  onFiltersChange,
}: FindingsFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={filters.domain ?? "all"}
        onValueChange={(v) =>
          onFiltersChange({ ...filters, domain: v === "all" ? null : v })
        }
      >
        <SelectTrigger className="h-8 w-[100px]">
          <SelectValue placeholder="Domain" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All domains</SelectItem>
          {DOMAINS.map((d) => (
            <SelectItem key={d} value={d}>
              {d}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.sex ?? "all"}
        onValueChange={(v) =>
          onFiltersChange({ ...filters, sex: v === "all" ? null : v })
        }
      >
        <SelectTrigger className="h-8 w-[80px]">
          <SelectValue placeholder="Sex" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          {SEXES.map((s) => (
            <SelectItem key={s} value={s}>
              {s === "M" ? "Male" : "Female"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.severity ?? "all"}
        onValueChange={(v) =>
          onFiltersChange({ ...filters, severity: v === "all" ? null : v })
        }
      >
        <SelectTrigger className="h-8 w-[110px]">
          <SelectValue placeholder="Severity" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All severity</SelectItem>
          {SEVERITIES.map((s) => (
            <SelectItem key={s} value={s}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        placeholder="Search findings..."
        value={filters.search}
        onChange={(e) =>
          onFiltersChange({ ...filters, search: e.target.value })
        }
        className="h-8 w-[200px]"
      />
    </div>
  );
}
