import { useState, useRef, useLayoutEffect } from "react";

/**
 * Measure a container's content width via ResizeObserver.
 * Returns a ref to attach to the container and the measured width.
 */
export function useContainerWidth(defaultWidth = 200): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(defaultWidth);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w != null && w > 0) setWidth(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, width];
}
