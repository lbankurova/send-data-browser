/**
 * Tests for the dose-response chart option builders and the compactify
 * post-processing patterns used by DoseResponseChartPanel.
 *
 * These builders produce EChartsOption objects whose series arrays are
 * iterated with Record<string, unknown> casts — this test verifies those
 * structural contracts hold (series is an array, each entry has `type`,
 * `data`, and bar series have `barMaxWidth`/`markLine`).
 */
import { describe, test, expect } from "vitest";
import type { EChartsOption } from "echarts";
import {
  buildDoseResponseLineOption,
  buildIncidenceBarOption,
  buildEffectSizeBarOption,
} from "@/components/analysis/charts/dose-response-charts";
import type { MergedPoint } from "@/components/analysis/charts/dose-response-charts";

// ── Fixtures ─────────────────────────────────────────────────

const sexColors: Record<string, string> = { M: "#3b82f6", F: "#ec4899" };
const sexLabels: Record<string, string> = { M: "Males", F: "Females" };

function makeMergedPoints(): MergedPoint[] {
  return [
    {
      dose_level: 0, dose_label: "Control",
      mean_M: 10, sd_M: 1, p_M: null, incidence_M: 0, effect_M: null,
      mean_F: 9, sd_F: 1.2, p_F: null, incidence_F: 0, effect_F: null,
    },
    {
      dose_level: 1, dose_label: "5 mg/kg",
      mean_M: 12, sd_M: 1.5, p_M: 0.04, incidence_M: 0.2, effect_M: 0.6,
      mean_F: 11, sd_F: 1.1, p_F: 0.12, incidence_F: 0.1, effect_F: 0.3,
    },
    {
      dose_level: 2, dose_label: "15 mg/kg",
      mean_M: 18, sd_M: 2, p_M: 0.001, incidence_M: 0.8, effect_M: 1.4,
      mean_F: 16, sd_F: 1.8, p_F: 0.003, incidence_F: 0.6, effect_F: 1.1,
    },
  ];
}

// ── Helpers: replicate the compactify patterns from DoseResponseChartPanel ─

/** Mimics the series iteration in compactify — casts series to Record<string, unknown>[] */
function exerciseCompactify(opt: EChartsOption): EChartsOption {
  const o = { ...opt };
  if (Array.isArray(o.series)) {
    o.series = (o.series as Record<string, unknown>[]).map((s) => {
      const ns: Record<string, unknown> = { ...s };
      if (ns.type === "line" && ns.lineStyle) {
        ns.lineStyle = { ...(ns.lineStyle as object), width: 0.75 };
      }
      if (ns.type === "line" && Array.isArray(ns.data)) {
        ns.data = (ns.data as Record<string, unknown>[]).map((d) => {
          if (typeof d !== "object" || d == null) return d;
          const size = (d as Record<string, unknown>).symbolSize as number | undefined;
          if (size == null) return d;
          return { ...d, symbolSize: size >= 10 ? 6 : 4 };
        });
      }
      if (ns.type === "bar") {
        ns.barMaxWidth = 8;
      }
      if (ns.markLine) {
        const ml = ns.markLine as { data?: unknown[] };
        if (ml.data) {
          const filtered = ml.data.filter((d: unknown) => {
            if (typeof d !== "object" || d == null) return true;
            const rec = d as Record<string, unknown>;
            const lbl = rec.label as Record<string, unknown> | undefined;
            return lbl?.formatter !== "NOAEL";
          });
          ns.markLine = filtered.length > 0 ? { ...ml, data: filtered } : undefined;
        }
      }
      return ns;
    });
  }
  return o;
}

/** Mimics the series iteration in compactifyEffectSize — casts + accesses .data and .markLine */
function exerciseCompactifyEffectSize(opt: EChartsOption, points: MergedPoint[]): EChartsOption {
  const o = { ...opt };
  if (Array.isArray(o.series)) {
    o.series = (o.series as Record<string, unknown>[]).map((s) => {
      const newS: Record<string, unknown> = { ...s, barMaxWidth: 8 };
      if (Array.isArray(s.data) && s.data.length === points.length) {
        newS.data = (s.data as unknown[]).slice(1);
      }
      if (s.markLine) {
        const ml = s.markLine as { data?: unknown[]; [k: string]: unknown };
        if (ml.data) {
          const filtered = ml.data
            .filter((d: unknown) => {
              if (typeof d !== "object" || d == null) return true;
              const rec = d as Record<string, unknown>;
              return rec.yAxis !== 0.5 && rec.yAxis !== -0.5;
            })
            .map((d: unknown) => {
              if (typeof d !== "object" || d == null) return d;
              const rec = d as Record<string, unknown>;
              if (rec.label) return { ...rec, label: { show: false } };
              return d;
            });
          newS.markLine = filtered.length > 0 ? { ...ml, data: filtered } : undefined;
        }
      }
      return newS;
    });
  }
  return o;
}

// ── Tests ────────────────────────────────────────────────────

describe("buildDoseResponseLineOption — structure", () => {
  const points = makeMergedPoints();
  const opt = buildDoseResponseLineOption(points, ["M", "F"], sexColors, sexLabels);

  test("produces an object with series array", () => {
    expect(Array.isArray(opt.series)).toBe(true);
  });

  test("series entries have type 'line' or 'custom'", () => {
    for (const s of opt.series as Record<string, unknown>[]) {
      expect(["line", "custom"]).toContain(s.type);
    }
  });

  test("line series contain data arrays sized to dose groups", () => {
    const lines = (opt.series as Record<string, unknown>[]).filter((s) => s.type === "line");
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) {
      expect(Array.isArray(l.data)).toBe(true);
      expect((l.data as unknown[]).length).toBe(points.length);
    }
  });

  test("significant points (p < 0.05) get larger symbolSize", () => {
    const mLine = (opt.series as Record<string, unknown>[]).find(
      (s) => s.type === "line" && s.name === "Males",
    );
    expect(mLine).toBeDefined();
    const data = mLine!.data as { symbolSize: number }[];
    // Dose 1: M has p=0.04 → symbolSize 10
    expect(data[1].symbolSize).toBe(10);
    // Dose 0 (control): p=null → symbolSize 6
    expect(data[0].symbolSize).toBe(6);
  });

  test("survives compactify post-processing without errors", () => {
    const compact = exerciseCompactify(opt);
    expect(Array.isArray(compact.series)).toBe(true);
    const lines = (compact.series as Record<string, unknown>[]).filter((s) => s.type === "line");
    for (const l of lines) {
      // Symbols should be shrunk: 10→6, 6→4
      const data = l.data as { symbolSize?: number }[];
      for (const d of data) {
        if (d.symbolSize != null) {
          expect(d.symbolSize).toBeLessThanOrEqual(6);
        }
      }
    }
  });
});

describe("buildIncidenceBarOption — structure", () => {
  const points = makeMergedPoints();
  const opt = buildIncidenceBarOption(points, ["M", "F"], sexColors, sexLabels);

  test("produces bar series", () => {
    const bars = (opt.series as Record<string, unknown>[]).filter((s) => s.type === "bar");
    expect(bars.length).toBe(2); // one per sex
  });

  test("bar data arrays match dose group count", () => {
    for (const s of (opt.series as Record<string, unknown>[]).filter((s) => s.type === "bar")) {
      expect((s.data as unknown[]).length).toBe(points.length);
    }
  });

  test("survives compactify — barMaxWidth is overridden to 8", () => {
    const compact = exerciseCompactify(opt);
    const bars = (compact.series as Record<string, unknown>[]).filter((s) => s.type === "bar");
    for (const b of bars) {
      expect(b.barMaxWidth).toBe(8);
    }
  });
});

describe("buildEffectSizeBarOption — structure", () => {
  const points = makeMergedPoints();
  const opt = buildEffectSizeBarOption(points, ["M", "F"], sexColors, sexLabels, "g");

  test("produces bar series with data", () => {
    const bars = (opt.series as Record<string, unknown>[]).filter((s) => s.type === "bar");
    expect(bars.length).toBe(2);
    for (const b of bars) {
      expect(Array.isArray(b.data)).toBe(true);
    }
  });

  test("first series has markLine with reference thresholds", () => {
    const first = (opt.series as Record<string, unknown>[])[0];
    expect(first.markLine).toBeDefined();
    const ml = first.markLine as { data: unknown[] };
    expect(ml.data.length).toBeGreaterThan(0);
  });

  test("survives compactifyEffectSize — data trimmed, markLine filtered", () => {
    const compact = exerciseCompactifyEffectSize(opt, points);
    const bars = (compact.series as Record<string, unknown>[]).filter((s) => s.type === "bar");
    expect(bars.length).toBe(2);
    for (const b of bars) {
      expect(b.barMaxWidth).toBe(8);
      // Data should be trimmed: control removed → length = points.length - 1
      if (Array.isArray(b.data)) {
        expect((b.data as unknown[]).length).toBe(points.length - 1);
      }
    }
    // markLine on first series: ±0.5 lines stripped, ±0.8 labels hidden
    const first = bars[0];
    if (first.markLine) {
      const ml = first.markLine as { data: { yAxis?: number; label?: { show: boolean } }[] };
      for (const d of ml.data) {
        expect(d.yAxis).not.toBe(0.5);
        expect(d.yAxis).not.toBe(-0.5);
      }
    }
  });
});

describe("compactify — NOAEL markLine stripping", () => {
  test("removes markLine entries with formatter 'NOAEL'", () => {
    const points = makeMergedPoints();
    const opt = buildDoseResponseLineOption(points, ["M"], sexColors, sexLabels, "5 mg/kg");
    // The builder adds a NOAEL markLine when noaelLabel is provided
    const compact = exerciseCompactify(opt);
    // After compactify, no series should have a markLine entry with formatter === "NOAEL"
    for (const s of (compact.series as Record<string, unknown>[])) {
      if (!s.markLine) continue;
      const ml = s.markLine as { data?: unknown[] };
      if (!ml.data) continue;
      for (const d of ml.data) {
        if (typeof d === "object" && d != null) {
          const rec = d as Record<string, unknown>;
          const lbl = rec.label as Record<string, unknown> | undefined;
          expect(lbl?.formatter).not.toBe("NOAEL");
        }
      }
    }
  });
});
