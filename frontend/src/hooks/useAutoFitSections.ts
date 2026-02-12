import { useState, useRef, useCallback, useEffect } from "react";
import type { RefObject } from "react";

// ─── Types ──────────────────────────────────────────────────

export interface SectionConfig {
  id: string;          // persistence key, e.g. "charts"
  min: number;         // minimum height
  max: number;         // maximum height
  defaultHeight: number; // fallback before measurement
}

export interface SectionResult {
  height: number;
  contentRef: RefObject<HTMLDivElement | null>;
  onPointerDown: (e: React.PointerEvent) => void;
}

// ─── Persistence helpers ────────────────────────────────────

function loadSaved(viewKey: string): Record<string, number> | null {
  try {
    const raw = localStorage.getItem(`pcc.sections.${viewKey}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) return parsed;
  } catch { /* ignore */ }
  return null;
}

function savePersisted(viewKey: string, heights: Record<string, number>) {
  try {
    localStorage.setItem(`pcc.sections.${viewKey}`, JSON.stringify(heights));
  } catch { /* ignore */ }
}

// ─── Constants ──────────────────────────────────────────────

const HEADER_HEIGHT = 28;   // ViewSection header bar
const HANDLE_HEIGHT = 8;    // HorizontalResizeHandle

// ─── Hook ───────────────────────────────────────────────────

export function useAutoFitSections(
  containerRef: RefObject<HTMLElement | null>,
  viewKey: string,
  configs: SectionConfig[],
): SectionResult[] {
  const count = configs.length;

  // Load persisted heights once on mount (useState lazy init avoids ref-during-render)
  const [saved] = useState(() => loadSaved(viewKey));
  // Mutable copy for the drag handler to update
  const savedRef = useRef(saved);

  // Initialize heights: use saved values or defaults
  const [heights, setHeights] = useState<number[]>(() =>
    configs.map((c) => {
      const s = saved?.[c.id];
      return s != null ? Math.max(c.min, Math.min(c.max, s)) : c.defaultHeight;
    }),
  );

  // Track which sections user has manually dragged (indices)
  const manualRef = useRef<Set<number>>(
    new Set(configs.map((c, i) => (saved?.[c.id] != null ? i : -1)).filter((i) => i >= 0)),
  );

  // Content refs for measuring natural height (useState avoids ref mutation during render)
  const [contentRefs] = useState<Array<RefObject<HTMLDivElement | null>>>(() =>
    configs.map(() => ({ current: null })),
  );

  // Auto-fit: measure content and distribute space
  const autoFit = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const available = container.clientHeight;
    // Overhead: each fixed section has a header + resize handle; flex section(s) have a header
    // Every view has exactly 1 flex section, so add 1 extra header
    const overhead = count * (HEADER_HEIGHT + HANDLE_HEIGHT) + HEADER_HEIGHT;
    const usable = available - overhead;
    if (usable <= 0) return;

    // Measure natural content heights by summing children's rendered heights.
    // Can't use scrollHeight — on a h-full overflow-auto container it returns
    // max(clientHeight, contentHeight), so it reads back the current allocation
    // when content is smaller, creating a feedback loop that never shrinks.
    const naturals: number[] = contentRefs.map((ref) => {
      const el = ref.current;
      if (!el) return 0;
      let total = 0;
      for (let i = 0; i < el.children.length; i++) {
        total += el.children[i].getBoundingClientRect().height;
      }
      return total;
    });

    setHeights((prev) => {
      const next = [...prev];
      // Only auto-fit sections that haven't been manually resized
      const autoIndices: number[] = [];
      let usedByManual = 0;
      for (let i = 0; i < count; i++) {
        if (manualRef.current.has(i)) {
          usedByManual += next[i];
        } else {
          autoIndices.push(i);
        }
      }

      if (autoIndices.length === 0) return prev;

      const availableForAuto = usable - usedByManual;
      if (availableForAuto <= 0) return prev;

      const totalNatural = autoIndices.reduce((sum, i) => sum + (naturals[i] || configs[i].defaultHeight), 0);

      if (totalNatural <= availableForAuto) {
        // Everything fits — give each its natural height
        for (const i of autoIndices) {
          const nat = naturals[i] || configs[i].defaultHeight;
          next[i] = Math.max(configs[i].min, Math.min(configs[i].max, nat));
        }
      } else {
        // Proportional distribution
        for (const i of autoIndices) {
          const nat = naturals[i] || configs[i].defaultHeight;
          const share = totalNatural > 0 ? (nat / totalNatural) * availableForAuto : availableForAuto / autoIndices.length;
          next[i] = Math.max(configs[i].min, Math.min(configs[i].max, Math.round(share)));
        }
      }

      // Check if heights actually changed to avoid unnecessary re-renders
      const changed = next.some((h, i) => h !== prev[i]);
      return changed ? next : prev;
    });
  }, [containerRef, configs, count, contentRefs]);

  // Two observers work together:
  // 1. ResizeObserver on the container — handles window/layout resizes
  // 2. MutationObserver on content refs — handles selection-driven re-renders
  //    (content refs are h-full overflow-auto, so their border-box never changes
  //     when children change — only scrollHeight does, which ResizeObserver ignores)
  useEffect(() => {
    let rafId = 0;
    const scheduleAutoFit = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => autoFit());
    };

    // Container resize (window resize, layout changes)
    const resizeObs = new ResizeObserver(scheduleAutoFit);
    if (containerRef.current) {
      resizeObs.observe(containerRef.current);
    }

    // Content mutations (selection changes, data loading, re-renders)
    const mutationObs = new MutationObserver(scheduleAutoFit);
    for (const ref of contentRefs) {
      if (ref.current) {
        mutationObs.observe(ref.current, { childList: true, subtree: true });
      }
    }

    // Initial fit
    autoFit();

    return () => {
      cancelAnimationFrame(rafId);
      resizeObs.disconnect();
      mutationObs.disconnect();
    };
  }, [autoFit, containerRef, contentRefs]);

  // Build pointer-down handlers (manual drag)
  const makePointerDown = useCallback(
    (index: number) => (e: React.PointerEvent) => {
      e.preventDefault();
      const el = e.currentTarget as HTMLElement;
      el.setPointerCapture(e.pointerId);
      const startY = e.clientY;
      const startH = heights[index];
      const cfg = configs[index];

      const onMove = (ev: PointerEvent) => {
        const delta = ev.clientY - startY;
        const newH = Math.max(cfg.min, Math.min(cfg.max, startH + delta));
        setHeights((prev) => {
          const next = [...prev];
          next[index] = newH;
          return next;
        });
      };

      const onUp = () => {
        // Mark as manual and persist
        manualRef.current.add(index);
        setHeights((prev) => {
          const persisted: Record<string, number> = {};
          for (let i = 0; i < count; i++) {
            if (manualRef.current.has(i)) {
              persisted[configs[i].id] = prev[i];
            }
          }
          savedRef.current = persisted;
          savePersisted(viewKey, persisted);
          return prev;
        });

        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerup", onUp);
        el.removeEventListener("pointercancel", onUp);
      };

      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerup", onUp);
      el.addEventListener("pointercancel", onUp);
    },
    [heights, configs, count, viewKey],
  );

  // Build results
  return configs.map((_, i) => ({
    height: heights[i],
    contentRef: contentRefs[i],
    onPointerDown: makePointerDown(i),
  }));
}
