import { createContext, useContext, useState, useCallback, useRef } from "react";
import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Selection shape
// ---------------------------------------------------------------------------

export interface StudySelection {
  studyId: string;
  sex?: string;
  organSystem?: string;
  specimen?: string;
  endpoint?: string;
  subjectId?: string;
}

/** Fields that callers can set via navigateTo — studyId comes from the provider. */
export type SelectionUpdate = Omit<Partial<StudySelection>, "studyId">;

// ---------------------------------------------------------------------------
// Context value
// ---------------------------------------------------------------------------

interface StudySelectionContextValue {
  selection: StudySelection;
  /** Atomic multi-field setter. Cascading clears apply. Pushes to history. */
  navigateTo: (partial: SelectionUpdate) => void;
  /** Pop from history stack — no cascade. */
  back: () => void;
  /** Can we go back? */
  canGoBack: boolean;
}

const StudySelectionContext = createContext<StudySelectionContextValue>({
  selection: { studyId: "" },
  navigateTo: () => {},
  back: () => {},
  canGoBack: false,
});

// ---------------------------------------------------------------------------
// Cascading logic
// ---------------------------------------------------------------------------

/** Hierarchy fields that cascade. Sex is excluded — it's a filter, not a level. */
const FIELD_ORDER: (keyof SelectionUpdate)[] = [
  "organSystem",
  "specimen",
  "endpoint",
  "subjectId",
];

/**
 * When a higher-level field changes, clear all lower-level fields
 * that weren't explicitly set in the update.
 */
function applyCascade(
  prev: StudySelection,
  update: SelectionUpdate,
): StudySelection {
  const next: StudySelection = { studyId: prev.studyId };

  // Sex is a filter, not a hierarchy level — set it but never cascade from it
  next.sex = "sex" in update ? update.sex : prev.sex;

  // Find the highest-level hierarchy field that changed
  let cascadeFrom = -1;
  for (let i = 0; i < FIELD_ORDER.length; i++) {
    const key = FIELD_ORDER[i];
    if (key in update && update[key] !== prev[key]) {
      cascadeFrom = i;
      break;
    }
  }

  // Apply fields: keep previous values for fields above the cascade point,
  // apply update values where provided, clear the rest below cascade point
  for (let i = 0; i < FIELD_ORDER.length; i++) {
    const key = FIELD_ORDER[i];
    if (key in update) {
      // Explicitly set in update
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (next as any)[key] = update[key];
    } else if (cascadeFrom >= 0 && i > cascadeFrom) {
      // Below cascade point and not explicitly set → clear
      // (field stays undefined)
    } else {
      // Above cascade point or no cascade → keep previous
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (next as any)[key] = prev[key];
    }
  }

  return next;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

const MAX_HISTORY = 5;

export function StudySelectionProvider({
  studyId,
  children,
}: {
  studyId: string;
  children: ReactNode;
}) {
  const [selection, setSelection] = useState<StudySelection>({ studyId });
  const historyRef = useRef<StudySelection[]>([]);

  // Reset when studyId changes
  const prevStudyId = useRef(studyId);
  if (studyId !== prevStudyId.current) {
    prevStudyId.current = studyId;
    setSelection({ studyId });
    historyRef.current = [];
  }

  const navigateTo = useCallback(
    (partial: SelectionUpdate) => {
      setSelection((prev) => {
        // Push current to history before changing
        const history = historyRef.current;
        history.push(prev);
        if (history.length > MAX_HISTORY) history.shift();

        const updated = applyCascade(prev, partial);
        // Keep studyId current
        updated.studyId = studyId;
        return updated;
      });
    },
    [studyId],
  );

  const back = useCallback(() => {
    const history = historyRef.current;
    if (history.length === 0) return;
    const prev = history.pop()!;
    setSelection({ ...prev, studyId });
  }, [studyId]);

  return (
    <StudySelectionContext.Provider
      value={{
        selection,
        navigateTo,
        back,
        canGoBack: historyRef.current.length > 0,
      }}
    >
      {children}
    </StudySelectionContext.Provider>
  );
}

export function useStudySelection() {
  return useContext(StudySelectionContext);
}
