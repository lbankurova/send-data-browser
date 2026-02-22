import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";

/**
 * Global tooltip that intercepts all native `title` attributes via event
 * delegation and renders a styled tooltip with max-width instead.
 *
 * Drop into the app root once — no changes needed in existing components.
 * Native title is suppressed by moving it to data-native-title on hover.
 */

interface Pos {
  text: string;
  x: number;
  y: number;
  above: boolean;
}

const DELAY_MS = 400;
const MAX_W = 210;

export function GlobalTooltip() {
  const [pos, setPos] = useState<Pos | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const active = useRef<HTMLElement | null>(null);
  const observer = useRef<MutationObserver | null>(null);

  const clear = useCallback(() => {
    clearTimeout(timer.current);
    observer.current?.disconnect();
    const el = active.current;
    if (el) {
      const saved = el.dataset.nativeTitle;
      if (saved != null) {
        el.title = saved;
        delete el.dataset.nativeTitle;
      }
      active.current = null;
    }
    setPos(null);
  }, []);

  useEffect(() => {
    const find = (node: EventTarget | null): HTMLElement | null =>
      (node as HTMLElement)?.closest?.("[title], [data-native-title]") ?? null;

    const onOver = (e: MouseEvent) => {
      const el = find(e.target);
      if (!el || el === active.current) return;

      clear();
      active.current = el;

      // Suppress native tooltip immediately
      const text = el.title;
      if (!text) return;
      el.dataset.nativeTitle = text;
      el.removeAttribute("title");

      // Watch for React re-rendering a new title on this element
      // (e.g., tooltip text changes after a state toggle while hovering)
      observer.current?.disconnect();
      observer.current = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.attributeName === "title" && el.title) {
            const newText = el.title;
            el.dataset.nativeTitle = newText;
            el.removeAttribute("title");
            setPos((prev) => prev ? { ...prev, text: newText } : prev);
          }
        }
      });
      observer.current.observe(el, { attributes: true, attributeFilter: ["title"] });

      timer.current = setTimeout(() => {
        if (active.current !== el) return;
        const r = el.getBoundingClientRect();
        const above = r.bottom + 40 > window.innerHeight;
        // Clamp x so tooltip stays within viewport (half max-width margin)
        const half = MAX_W / 2;
        setPos({
          text,
          x: Math.max(half, Math.min(window.innerWidth - half, r.left + r.width / 2)),
          y: above ? r.top - 4 : r.bottom + 4,
          above,
        });
      }, DELAY_MS);
    };

    const onOut = (e: MouseEvent) => {
      const from = find(e.target);
      const to = find(e.relatedTarget);
      if (from && from !== to) clear();
    };

    // Capture phase so we run before any stopPropagation
    document.addEventListener("mouseover", onOver, true);
    document.addEventListener("mouseout", onOut, true);
    // Hide on scroll/resize
    window.addEventListener("scroll", clear, true);
    window.addEventListener("resize", clear);

    return () => {
      clearTimeout(timer.current);
      observer.current?.disconnect();
      document.removeEventListener("mouseover", onOver, true);
      document.removeEventListener("mouseout", onOut, true);
      window.removeEventListener("scroll", clear, true);
      window.removeEventListener("resize", clear);
    };
  }, [clear]);

  if (!pos) return null;

  return createPortal(
    <div
      className="pointer-events-none fixed z-[9999] rounded border bg-popover px-2 py-1 text-[10px] leading-relaxed text-popover-foreground shadow-md"
      style={{
        left: pos.x,
        top: pos.y,
        maxWidth: MAX_W,
        transform: `translateX(-50%)${pos.above ? " translateY(-100%)" : ""}`,
      }}
    >
      {pos.text}
    </div>,
    document.body,
  );
}
