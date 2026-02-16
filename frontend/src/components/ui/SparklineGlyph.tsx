import type { PatternType } from "@/lib/pattern-classification";

export function SparklineGlyph({
  values,
  pattern: _pattern,
}: {
  values: number[];
  pattern: PatternType;
}) {
  if (values.length === 0) return null;

  const w = 24;
  const h = 12;
  const gap = 1;
  const barW = (w - (values.length - 1) * gap) / values.length;

  const pctLabels = values.map((v) => `${Math.round(v * 100)}%`);
  const tooltipText = pctLabels.join(" \u2192 ");

  return (
    <svg
      width={w}
      height={h}
      className="inline-block align-middle"
      aria-label={`Incidence sparkline: ${tooltipText}`}
    >
      <title>{tooltipText}</title>
      {values.map((v, i) => {
        const barH = Math.max(1, v * (h - 1));
        const fill =
          i === 0
            ? "#9CA3AF"
            : v < 0.2
              ? "#D1D5DB"
              : v < 0.5
                ? "#9CA3AF"
                : v < 0.8
                  ? "#6B7280"
                  : "#4B5563";
        return (
          <rect
            key={i}
            x={i * (barW + gap)}
            y={h - barH}
            width={barW}
            height={barH}
            rx={0.5}
            fill={fill}
          />
        );
      })}
    </svg>
  );
}
