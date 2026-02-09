export function PanelResizeHandle({
  onPointerDown,
}: {
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  return (
    <div
      onPointerDown={onPointerDown}
      className="shrink-0 cursor-col-resize select-none border-r border-border bg-transparent transition-colors hover:bg-primary/10 active:bg-primary/20"
      style={{ width: 4 }}
    />
  );
}
