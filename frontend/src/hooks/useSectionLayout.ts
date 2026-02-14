import { useState, useCallback, useEffect, useRef } from "react";
import type { RefObject } from "react";

// ─── Types ──────────────────────────────────────────────────

export type SectionId = "findings" | "doseCharts" | "matrix";

interface SectionConfig {
  default: number;
  minUseful: number;
}

// ─── Constants ──────────────────────────────────────────────

const STRIP_HEIGHT = 28;
const HANDLE_HEIGHT = 4;

const SECTION_CONFIGS: Record<SectionId, SectionConfig> = {
  findings: { default: 200, minUseful: 80 },
  doseCharts: { default: 170, minUseful: 100 },
  matrix: { default: 210, minUseful: 120 },
};

const ALL_SECTIONS: SectionId[] = ["findings", "doseCharts", "matrix"];
const HINT_KEY = "dg-section-focus-hint-shown";

// ─── Helpers ────────────────────────────────────────────────

function countHandles(heights: Record<SectionId, number>): number {
  let handles = 0;
  for (let i = 0; i < ALL_SECTIONS.length - 1; i++) {
    const a = ALL_SECTIONS[i];
    const b = ALL_SECTIONS[i + 1];
    if (heights[a] > STRIP_HEIGHT && heights[b] > STRIP_HEIGHT) {
      handles++;
    }
  }
  return handles;
}

function redistributeDefaults(totalContainer: number): Record<SectionId, number> {
  // Start with defaults, then scale proportionally
  const totalDefaults = ALL_SECTIONS.reduce((s, id) => s + SECTION_CONFIGS[id].default, 0);

  // Estimate handle overhead (start assuming all visible)
  const handleOverhead = 2 * HANDLE_HEIGHT;
  const usable = totalContainer - handleOverhead;
  if (usable <= 0) {
    return { findings: STRIP_HEIGHT, doseCharts: STRIP_HEIGHT, matrix: STRIP_HEIGHT };
  }

  const heights = {} as Record<SectionId, number>;
  for (const id of ALL_SECTIONS) {
    heights[id] = Math.max(STRIP_HEIGHT, (SECTION_CONFIGS[id].default / totalDefaults) * usable);
  }

  enforceMinimums(heights, null);

  // Recalculate with actual handle count
  const actualHandles = countHandles(heights);
  if (actualHandles !== 2) {
    const usable2 = totalContainer - actualHandles * HANDLE_HEIGHT;
    const nonStrip = ALL_SECTIONS.filter((id) => heights[id] > STRIP_HEIGHT);
    const stripCount = ALL_SECTIONS.length - nonStrip.length;
    const usableForNonStrip = usable2 - stripCount * STRIP_HEIGHT;
    const totalNonStripDefaults = nonStrip.reduce((s, id) => s + SECTION_CONFIGS[id].default, 0);
    for (const id of nonStrip) {
      heights[id] = Math.max(
        SECTION_CONFIGS[id].minUseful,
        (SECTION_CONFIGS[id].default / totalNonStripDefaults) * usableForNonStrip,
      );
    }
  }

  return heights;
}

function computeFocusHeights(
  focusId: SectionId,
  naturalHeights: Record<SectionId, number>,
  totalContainer: number,
): Record<SectionId, number> {
  // Focused section gets min(natural, total - 2*STRIP - handle overhead)
  const maxForFocused = totalContainer - 2 * STRIP_HEIGHT;
  const focusedHeight = Math.min(naturalHeights[focusId], maxForFocused);
  const remaining = totalContainer - focusedHeight;

  const others = ALL_SECTIONS.filter((id) => id !== focusId);
  const totalOtherDefaults = others.reduce((s, id) => s + SECTION_CONFIGS[id].default, 0);

  const heights = {} as Record<SectionId, number>;
  heights[focusId] = focusedHeight;

  for (const id of others) {
    heights[id] = (SECTION_CONFIGS[id].default / totalOtherDefaults) * remaining;
  }

  enforceMinimums(heights, focusId);

  // Adjust for handle overhead
  const handleCount = countHandles(heights);
  const handleOverhead = handleCount * HANDLE_HEIGHT;
  const usable = totalContainer - handleOverhead;
  const scale = usable / totalContainer;
  if (scale > 0 && scale < 1) {
    // Scale all down proportionally
    for (const id of ALL_SECTIONS) {
      heights[id] = Math.max(STRIP_HEIGHT, heights[id] * scale);
    }
    enforceMinimums(heights, focusId);
  }

  return heights;
}

function enforceMinimums(
  heights: Record<SectionId, number>,
  focusId: SectionId | null,
): void {
  const others = focusId ? ALL_SECTIONS.filter((id) => id !== focusId) : ALL_SECTIONS;

  for (const id of others) {
    if (heights[id] > STRIP_HEIGHT && heights[id] < SECTION_CONFIGS[id].minUseful) {
      const reclaimed = heights[id] - STRIP_HEIGHT;
      heights[id] = STRIP_HEIGHT;

      // Give reclaimed space to a beneficiary
      const beneficiary = focusId
        ? others.find((o) => o !== id && heights[o] > STRIP_HEIGHT) ?? focusId
        : others.find((o) => o !== id && heights[o] > STRIP_HEIGHT);
      if (beneficiary) {
        heights[beneficiary] += reclaimed;
      }
    }
  }
}

// ─── Hook ───────────────────────────────────────────────────

export function useSectionLayout(
  containerRef: RefObject<HTMLElement | null>,
  naturalHeights: Record<SectionId, number>,
): {
  heights: Record<SectionId, number>;
  focusedSection: SectionId | null;
  showHint: boolean;
  isStrip: (s: SectionId) => boolean;
  handleDoubleClick: (s: SectionId) => void;
  restoreDefaults: () => void;
  makeResizePointerDown: (s: SectionId) => (e: React.PointerEvent) => void;
} {
  const [heights, setHeights] = useState<Record<SectionId, number>>(() => ({
    findings: SECTION_CONFIGS.findings.default,
    doseCharts: SECTION_CONFIGS.doseCharts.default,
    matrix: SECTION_CONFIGS.matrix.default,
  }));
  const [focusedSection, setFocusedSection] = useState<SectionId | null>(null);
  const [showHint, setShowHint] = useState(false);

  // Refs to avoid stale closures
  const focusedRef = useRef(focusedSection);
  focusedRef.current = focusedSection;
  const naturalRef = useRef(naturalHeights);
  naturalRef.current = naturalHeights;

  // ── Redistribute on container resize ──────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const total = entries[0]?.contentRect.height ?? 0;
      if (total <= 0) return;

      if (focusedRef.current) {
        setHeights(computeFocusHeights(focusedRef.current, naturalRef.current, total));
      } else {
        setHeights(redistributeDefaults(total));
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef]);

  // ── Recompute on naturalHeights change ────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const total = container.clientHeight;
    if (total <= 0) return;

    if (focusedRef.current) {
      setHeights(computeFocusHeights(focusedRef.current, naturalHeights, total));
    } else {
      setHeights(redistributeDefaults(total));
    }
  }, [naturalHeights, containerRef]);

  // ── isStrip ───────────────────────────────────────────────
  const isStrip = useCallback(
    (s: SectionId) => heights[s] <= STRIP_HEIGHT,
    [heights],
  );

  // ── Double-click: toggle focus/restore ────────────────────
  const handleDoubleClick = useCallback(
    (section: SectionId) => {
      const container = containerRef.current;
      if (!container) return;
      const total = container.clientHeight;

      // One-time hint
      if (!localStorage.getItem(HINT_KEY)) {
        localStorage.setItem(HINT_KEY, "true");
        setShowHint(true);
        setTimeout(() => setShowHint(false), 3000);
      }

      if (focusedRef.current === section) {
        // Restore defaults
        setFocusedSection(null);
        setHeights(redistributeDefaults(total));
      } else {
        setFocusedSection(section);
        setHeights(computeFocusHeights(section, naturalRef.current, total));
      }
    },
    [containerRef],
  );

  // ── Restore defaults (callable externally) ────────────────
  const restoreDefaults = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const total = container.clientHeight;
    setFocusedSection(null);
    setHeights(redistributeDefaults(total));
  }, [containerRef]);

  // ── Pointer drag for resize handles ───────────────────────
  const makeResizePointerDown = useCallback(
    (section: SectionId) => (e: React.PointerEvent) => {
      e.preventDefault();
      const el = e.currentTarget as HTMLElement;
      el.setPointerCapture(e.pointerId);
      const startY = e.clientY;

      // Determine the next section (the one below this handle)
      const idx = ALL_SECTIONS.indexOf(section);
      const nextSection = ALL_SECTIONS[idx + 1];
      if (!nextSection) return;

      const startHeights = { ...heights };

      const onMove = (ev: PointerEvent) => {
        const delta = ev.clientY - startY;
        const newSectionH = Math.max(STRIP_HEIGHT, startHeights[section] + delta);
        const newNextH = Math.max(STRIP_HEIGHT, startHeights[nextSection] - delta);

        setHeights((prev) => ({
          ...prev,
          [section]: newSectionH,
          [nextSection]: newNextH,
        }));
      };

      const onUp = () => {
        setFocusedSection(null); // manual resize clears focus
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerup", onUp);
        el.removeEventListener("pointercancel", onUp);
      };

      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerup", onUp);
      el.addEventListener("pointercancel", onUp);
    },
    [heights],
  );

  return {
    heights,
    focusedSection,
    showHint,
    isStrip,
    handleDoubleClick,
    restoreDefaults,
    makeResizePointerDown,
  };
}
