/**
 * Context panel selection — mutual exclusion tests.
 *
 * The context panel shows one of: subject profile, view-specific panel
 * (endpoint, organ, syndrome, specimen), or empty state. These are mutually
 * exclusive: selecting a subject must clear the view selection, and vice versa.
 *
 * Tests the core logic extracted from ViewSelectionContext and
 * FindingSelectionContext without React rendering.
 */
import { describe, it, expect } from "vitest";
import type { ViewSelection, HistopathologyViewSelection } from "@/contexts/ViewSelectionContext";

// ── Standalone state machine mirroring ViewSelectionContext ──

interface SelectionState {
  selection: ViewSelection | null;
  selectedSubject: string | null;
}

/** Mirrors ViewSelectionProvider.setSelection: clears subject when selection is set. */
function applySetSelection(state: SelectionState, sel: ViewSelection | null): SelectionState {
  return {
    selection: sel,
    selectedSubject: sel ? null : state.selectedSubject,
  };
}

/** Mirrors ViewSelectionProvider.setSelectedSubject: clears selection when subject is set. */
function applySetSelectedSubject(state: SelectionState, usubjid: string | null): SelectionState {
  return {
    selection: usubjid ? null : state.selection,
    selectedSubject: usubjid,
  };
}

// ── Finding selection state machine (mirrors FindingSelectionContext) ──

type GroupSelectionType = "organ" | "syndrome" | null;

interface FindingSelectionState {
  selectedFindingId: string | null;
  selectedGroupType: GroupSelectionType;
  selectedGroupKey: string | null;
}

/** Mirrors FindingSelectionProvider.selectFinding: clears group + subject. */
function applySelectFinding(
  fState: FindingSelectionState,
  viewState: SelectionState,
  findingId: string | null,
): { fState: FindingSelectionState; viewState: SelectionState } {
  const newFState: FindingSelectionState = {
    ...fState,
    selectedFindingId: findingId,
    selectedGroupType: findingId ? null : fState.selectedGroupType,
    selectedGroupKey: findingId ? null : fState.selectedGroupKey,
  };
  const newViewState = findingId
    ? applySetSelectedSubject(viewState, null)
    : viewState;
  return { fState: newFState, viewState: newViewState };
}

/** Mirrors FindingSelectionProvider.selectGroup: clears finding + subject. */
function applySelectGroup(
  fState: FindingSelectionState,
  viewState: SelectionState,
  type: GroupSelectionType,
  key: string | null,
): { fState: FindingSelectionState; viewState: SelectionState } {
  const newFState: FindingSelectionState = {
    selectedFindingId: type && key ? null : fState.selectedFindingId,
    selectedGroupType: type,
    selectedGroupKey: key,
  };
  const newViewState = type && key
    ? applySetSelectedSubject(viewState, null)
    : viewState;
  return { fState: newFState, viewState: newViewState };
}

// ── Context panel priority logic (mirrors ContextPanel.tsx) ──

/** Returns which panel the context panel would show. */
function resolveContextPanel(
  viewState: SelectionState,
  route: "findings" | "histopathology" | "other",
): "subject" | "route" | "empty" {
  // Subject profile takes priority (line 427 of ContextPanel.tsx)
  if (viewState.selectedSubject) return "subject";
  // Route-specific panels
  if (route === "findings" || route === "histopathology") return "route";
  return "empty";
}

// ── Test data ──

const HISTOPATH_SEL: HistopathologyViewSelection = {
  _view: "histopathology",
  specimen: "LIVER",
  finding: "Necrosis",
};

const EMPTY_STATE: SelectionState = { selection: null, selectedSubject: null };
const EMPTY_FINDING: FindingSelectionState = {
  selectedFindingId: null,
  selectedGroupType: null,
  selectedGroupKey: null,
};

// ── Tests ──

describe("Context panel — ViewSelection / subject mutual exclusion", () => {
  it("setSelection clears selectedSubject", () => {
    const state: SelectionState = { selection: null, selectedSubject: "SUBJ-001" };
    const result = applySetSelection(state, HISTOPATH_SEL);
    expect(result.selection).toBe(HISTOPATH_SEL);
    expect(result.selectedSubject).toBeNull();
  });

  it("setSelectedSubject clears selection", () => {
    const state: SelectionState = { selection: HISTOPATH_SEL, selectedSubject: null };
    const result = applySetSelectedSubject(state, "SUBJ-001");
    expect(result.selectedSubject).toBe("SUBJ-001");
    expect(result.selection).toBeNull();
  });

  it("setSelection(null) does NOT clear selectedSubject", () => {
    const state: SelectionState = { selection: HISTOPATH_SEL, selectedSubject: "SUBJ-001" };
    const result = applySetSelection(state, null);
    expect(result.selection).toBeNull();
    expect(result.selectedSubject).toBe("SUBJ-001");
  });

  it("setSelectedSubject(null) does NOT clear selection", () => {
    const state: SelectionState = { selection: HISTOPATH_SEL, selectedSubject: "SUBJ-001" };
    const result = applySetSelectedSubject(state, null);
    expect(result.selectedSubject).toBeNull();
    expect(result.selection).toBe(HISTOPATH_SEL);
  });

  it("both null is a valid resting state", () => {
    const result = applySetSelection(EMPTY_STATE, null);
    expect(result.selection).toBeNull();
    expect(result.selectedSubject).toBeNull();
  });
});

describe("Context panel — FindingSelection clears subject", () => {
  it("selectFinding clears selectedSubject", () => {
    const viewState: SelectionState = { selection: null, selectedSubject: "SUBJ-001" };
    const { viewState: newView } = applySelectFinding(EMPTY_FINDING, viewState, "finding-01");
    expect(newView.selectedSubject).toBeNull();
  });

  it("selectFinding(null) does NOT clear selectedSubject", () => {
    const viewState: SelectionState = { selection: null, selectedSubject: "SUBJ-001" };
    const { viewState: newView } = applySelectFinding(EMPTY_FINDING, viewState, null);
    expect(newView.selectedSubject).toBe("SUBJ-001");
  });

  it("selectGroup clears selectedSubject", () => {
    const viewState: SelectionState = { selection: null, selectedSubject: "SUBJ-001" };
    const { viewState: newView } = applySelectGroup(EMPTY_FINDING, viewState, "organ", "hepatic");
    expect(newView.selectedSubject).toBeNull();
  });

  it("selectGroup(null, null) does NOT clear selectedSubject", () => {
    const viewState: SelectionState = { selection: null, selectedSubject: "SUBJ-001" };
    const { viewState: newView } = applySelectGroup(EMPTY_FINDING, viewState, null, null);
    expect(newView.selectedSubject).toBe("SUBJ-001");
  });

  it("selectFinding clears group selection", () => {
    const fState: FindingSelectionState = {
      selectedFindingId: null,
      selectedGroupType: "organ",
      selectedGroupKey: "hepatic",
    };
    const { fState: newF } = applySelectFinding(fState, EMPTY_STATE, "finding-01");
    expect(newF.selectedGroupType).toBeNull();
    expect(newF.selectedGroupKey).toBeNull();
    expect(newF.selectedFindingId).toBe("finding-01");
  });

  it("selectGroup clears finding selection", () => {
    const fState: FindingSelectionState = {
      selectedFindingId: "finding-01",
      selectedGroupType: null,
      selectedGroupKey: null,
    };
    const { fState: newF } = applySelectGroup(fState, EMPTY_STATE, "syndrome", "XS01");
    expect(newF.selectedFindingId).toBeNull();
    expect(newF.selectedGroupType).toBe("syndrome");
    expect(newF.selectedGroupKey).toBe("XS01");
  });
});

describe("Context panel — priority resolution", () => {
  it("subject takes priority over route panel", () => {
    const state: SelectionState = { selection: null, selectedSubject: "SUBJ-001" };
    expect(resolveContextPanel(state, "findings")).toBe("subject");
    expect(resolveContextPanel(state, "histopathology")).toBe("subject");
  });

  it("route panel shows when no subject selected", () => {
    expect(resolveContextPanel(EMPTY_STATE, "findings")).toBe("route");
    expect(resolveContextPanel(EMPTY_STATE, "histopathology")).toBe("route");
  });

  it("empty state on unknown route with no subject", () => {
    expect(resolveContextPanel(EMPTY_STATE, "other")).toBe("empty");
  });
});

describe("Context panel — full interaction sequences", () => {
  it("click subject → click specimen → context switches from subject to route", () => {
    // 1. User clicks subject in mortality popover
    let state = applySetSelectedSubject(EMPTY_STATE, "SUBJ-003");
    expect(resolveContextPanel(state, "histopathology")).toBe("subject");

    // 2. User clicks specimen in histopathology rail
    state = applySetSelection(state, HISTOPATH_SEL);
    expect(resolveContextPanel(state, "histopathology")).toBe("route");
    expect(state.selectedSubject).toBeNull();
    expect(state.selection).toBe(HISTOPATH_SEL);
  });

  it("click specimen → click subject → context switches from route to subject", () => {
    // 1. User clicks specimen
    let state = applySetSelection(EMPTY_STATE, HISTOPATH_SEL);
    expect(resolveContextPanel(state, "histopathology")).toBe("route");

    // 2. User clicks subject in mortality popover
    state = applySetSelectedSubject(state, "SUBJ-003");
    expect(resolveContextPanel(state, "histopathology")).toBe("subject");
    expect(state.selection).toBeNull();
  });

  it("click subject → click endpoint → context switches from subject to route", () => {
    // 1. User clicks subject
    let viewState = applySetSelectedSubject(EMPTY_STATE, "SUBJ-003");
    expect(resolveContextPanel(viewState, "findings")).toBe("subject");

    // 2. User clicks endpoint in findings rail (goes through FindingSelectionContext)
    const { viewState: newView } = applySelectFinding(EMPTY_FINDING, viewState, "finding-01");
    expect(resolveContextPanel(newView, "findings")).toBe("route");
    expect(newView.selectedSubject).toBeNull();
  });

  it("click subject → click organ group → context switches from subject to route", () => {
    // 1. User clicks subject
    let viewState = applySetSelectedSubject(EMPTY_STATE, "SUBJ-003");
    expect(resolveContextPanel(viewState, "findings")).toBe("subject");

    // 2. User clicks organ header in findings rail
    const { viewState: newView } = applySelectGroup(EMPTY_FINDING, viewState, "organ", "hepatic");
    expect(resolveContextPanel(newView, "findings")).toBe("route");
    expect(newView.selectedSubject).toBeNull();
  });

  it("rapid toggle: subject → specimen → subject → specimen stays consistent", () => {
    let state = EMPTY_STATE;

    state = applySetSelectedSubject(state, "SUBJ-001");
    expect(state.selectedSubject).toBe("SUBJ-001");
    expect(state.selection).toBeNull();

    state = applySetSelection(state, HISTOPATH_SEL);
    expect(state.selectedSubject).toBeNull();
    expect(state.selection).toBe(HISTOPATH_SEL);

    state = applySetSelectedSubject(state, "SUBJ-002");
    expect(state.selectedSubject).toBe("SUBJ-002");
    expect(state.selection).toBeNull();

    state = applySetSelection(state, HISTOPATH_SEL);
    expect(state.selectedSubject).toBeNull();
    expect(state.selection).toBe(HISTOPATH_SEL);
  });

  it("clearing subject does not resurrect stale selection", () => {
    // Subject was selected, clearing it should not bring back a previous selection
    let state = applySetSelection(EMPTY_STATE, HISTOPATH_SEL);
    state = applySetSelectedSubject(state, "SUBJ-001"); // clears selection
    state = applySetSelectedSubject(state, null); // clears subject
    expect(state.selection).toBeNull();
    expect(state.selectedSubject).toBeNull();
  });
});
