import { createContext, useContext, useState, useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import { saveAnnotation } from "@/lib/annotations-api";

const STORAGE_PREFIX = "pcc:animal-exclusions:";

interface AnimalExclusionContextValue {
  /** Pending exclusions: endpoint_label -> Set of USUBJIDs. Not yet committed. */
  pendingExclusions: Map<string, Set<string>>;
  /** Toggle a subject's exclusion for an endpoint. */
  toggleExclusion: (endpointLabel: string, usubjid: string) => void;
  /** Check if a subject is excluded for an endpoint. */
  isExcluded: (endpointLabel: string, usubjid: string) => boolean;
  /** Clear all pending exclusions. */
  clearAll: () => void;
  /** Total count of pending exclusions across all endpoints. */
  pendingCount: number;
  /** Commit all pending exclusions to the backend, trigger regeneration. */
  applyExclusions: (studyId: string) => Promise<void>;
  /** True while applyExclusions is running. */
  isApplying: boolean;
}

const AnimalExclusionContext = createContext<AnimalExclusionContextValue>({
  pendingExclusions: new Map(),
  toggleExclusion: () => {},
  isExcluded: () => false,
  clearAll: () => {},
  pendingCount: 0,
  applyExclusions: async () => {},
  isApplying: false,
});

function storageKey(studyId: string) {
  return STORAGE_PREFIX + studyId;
}

function loadFromStorage(studyId: string): Map<string, Set<string>> {
  try {
    const raw = localStorage.getItem(storageKey(studyId));
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Record<string, string[]>;
    const map = new Map<string, Set<string>>();
    for (const [ep, ids] of Object.entries(parsed)) {
      if (Array.isArray(ids) && ids.length > 0) {
        map.set(ep, new Set(ids));
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

function saveToStorage(studyId: string, map: Map<string, Set<string>>) {
  if (map.size === 0) {
    localStorage.removeItem(storageKey(studyId));
    return;
  }
  const obj: Record<string, string[]> = {};
  for (const [ep, ids] of map) {
    if (ids.size > 0) obj[ep] = [...ids];
  }
  localStorage.setItem(storageKey(studyId), JSON.stringify(obj));
}

export function AnimalExclusionProvider({
  studyId,
  children,
}: {
  studyId: string | undefined;
  children: ReactNode;
}) {
  const [exclusions, setExclusions] = useState<Map<string, Set<string>>>(() =>
    studyId ? loadFromStorage(studyId) : new Map(),
  );
  const [isApplying, setIsApplying] = useState(false);

  const toggleExclusion = useCallback(
    (endpointLabel: string, usubjid: string) => {
      setExclusions((prev) => {
        const next = new Map(prev);
        const set = new Set(next.get(endpointLabel) ?? []);
        if (set.has(usubjid)) {
          set.delete(usubjid);
        } else {
          set.add(usubjid);
        }
        if (set.size === 0) next.delete(endpointLabel);
        else next.set(endpointLabel, set);
        if (studyId) saveToStorage(studyId, next);
        return next;
      });
    },
    [studyId],
  );

  const isExcluded = useCallback(
    (endpointLabel: string, usubjid: string) => {
      return exclusions.get(endpointLabel)?.has(usubjid) ?? false;
    },
    [exclusions],
  );

  const clearAll = useCallback(() => {
    setExclusions(new Map());
    if (studyId) localStorage.removeItem(storageKey(studyId));
  }, [studyId]);

  const pendingCount = useMemo(() => {
    let count = 0;
    for (const ids of exclusions.values()) count += ids.size;
    return count;
  }, [exclusions]);

  const applyExclusions = useCallback(
    async (sid: string) => {
      if (exclusions.size === 0) return;
      setIsApplying(true);
      try {
        // Batch-save each exclusion to annotation API
        const saves: Promise<unknown>[] = [];
        for (const [ep, ids] of exclusions) {
          for (const usubjid of ids) {
            const entityKey = `${usubjid}:${ep}`;
            saves.push(
              saveAnnotation(sid, "animal-exclusions", entityKey, {
                excluded: true,
                scope: "endpoint",
                reason: "LOO outlier",
              }),
            );
          }
        }
        await Promise.all(saves);

        // Trigger regeneration
        const res = await fetch(`/api/studies/${sid}/regenerate`, {
          method: "POST",
        });
        if (!res.ok) throw new Error(`Regeneration failed: ${res.status}`);

        // Clear pending state + localStorage
        setExclusions(new Map());
        localStorage.removeItem(storageKey(sid));
      } finally {
        setIsApplying(false);
      }
    },
    [exclusions],
  );

  return (
    <AnimalExclusionContext.Provider
      value={{
        pendingExclusions: exclusions,
        toggleExclusion,
        isExcluded,
        clearAll,
        pendingCount,
        applyExclusions,
        isApplying,
      }}
    >
      {children}
    </AnimalExclusionContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- Co-located hook with Provider is the canonical React Context pattern; HMR penalty accepted.
export function useAnimalExclusion(): AnimalExclusionContextValue {
  return useContext(AnimalExclusionContext);
}
