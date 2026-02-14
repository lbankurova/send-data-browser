import { useCallback, useRef } from "react";
import type { KeyboardEvent } from "react";

export function useRailKeyboard(onClear: () => void) {
  const containerRef = useRef<HTMLDivElement>(null);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        onClear();
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();

      const container = containerRef.current;
      if (!container) return;

      const buttons = Array.from(
        container.querySelectorAll<HTMLButtonElement>(
          ":scope > div > button, :scope > button",
        ),
      );
      if (!buttons.length) return;

      const idx = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next =
        e.key === "ArrowDown"
          ? idx < buttons.length - 1
            ? idx + 1
            : 0
          : idx > 0
            ? idx - 1
            : buttons.length - 1;

      buttons[next].focus();
      buttons[next].scrollIntoView({ block: "nearest" });
    },
    [onClear],
  );

  return { containerRef, onKeyDown };
}
