import { useQuery } from "@tanstack/react-query";

export interface ScenarioSummary {
  scenario_id: string;
  name: string;
  description: string;
  species: string | null;
  study_type: string | null;
  subjects: number | null;
  domain_count: number;
  validation_status: string;
}

async function fetchScenarios(): Promise<ScenarioSummary[]> {
  const res = await fetch("/api/scenarios");
  if (!res.ok) throw new Error(`Failed to fetch scenarios: ${res.status}`);
  return res.json();
}

export function useScenarios(enabled: boolean) {
  return useQuery({
    queryKey: ["scenarios"],
    queryFn: fetchScenarios,
    enabled,
    staleTime: Infinity,
  });
}
