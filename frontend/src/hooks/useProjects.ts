import { useQuery } from "@tanstack/react-query";

export interface Project {
  id: string;
  name: string;
  compound: string;
  cas: string;
  phase: string;
  therapeutic_area: string;
}

export function useProjects() {
  return useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await fetch("/api/portfolio/projects");
      if (!res.ok) throw new Error(`Failed to fetch projects: ${res.status}`);
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
  });
}
