/**
 * TRUST-03: Statistical Methodology Panel
 * Documents all statistical methods used in the analysis pipeline.
 * Pure transparency — renders static methodology documentation
 * with references to actual parameters used.
 */
import { useState } from "react";
import { CollapsiblePane } from "./panes/CollapsiblePane";

// ── Props ─────────────────────────────────────────────────────────────

interface Props {
  expandAll?: number;
  collapseAll?: number;
}

// ── Sub-section helper ────────────────────────────────────────────────

function MethodSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border/30 last:border-b-0">
      <button
        className="flex w-full items-center gap-2 py-1.5 text-left text-[11px] hover:text-foreground"
        onClick={() => setOpen(!open)}
      >
        <span className="text-[10px] text-muted-foreground">
          {open ? "\u25BC" : "\u25B6"}
        </span>
        <span className="font-medium">{title}</span>
      </button>
      {open && <div className="pb-2 pl-5 text-[10px] text-muted-foreground space-y-1">{children}</div>}
    </div>
  );
}

function Ref({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[9px] text-muted-foreground/70">[{children}]</span>;
}

// ── Component ─────────────────────────────────────────────────────────

export function MethodologyPanel({ expandAll, collapseAll }: Props) {
  return (
    <CollapsiblePane
      title="Statistical methodology"
      defaultOpen={false}
      expandAll={expandAll}
      collapseAll={collapseAll}
    >
      <div className="space-y-0 text-[11px]">
        {/* Pairwise comparisons */}
        <MethodSection title="Pairwise comparisons">
          <div>
            <span className="font-medium text-foreground">Continuous endpoints</span> (LB, BW, OM, FW):
            Welch&apos;s t-test (unequal variance) comparing each treated group vs. control.
            Min n &ge; 2 per group. <Ref>scipy.stats.ttest_ind, equal_var=False</Ref>
          </div>
          <div>
            <span className="font-medium text-foreground">Incidence endpoints</span> (MI, MA, CL, DS):
            Fisher&apos;s exact test on 2&times;2 contingency table (affected/unaffected &times; treated/control).
            Returns odds ratio and p-value. <Ref>scipy.stats.fisher_exact</Ref>
          </div>
        </MethodSection>

        {/* Multiplicity adjustment */}
        <MethodSection title="Multiplicity adjustment">
          <div>
            <span className="font-medium text-foreground">Continuous domains:</span> Bonferroni correction
            applied to pairwise p-values. p<sub>adj</sub> = min(p &times; n<sub>tests</sub>, 1.0).
          </div>
          <div>
            <span className="font-medium text-foreground">Incidence domains:</span> No correction applied.
            Each histopathological finding is a distinct biological observation, not part of a test battery.
            Consistent with FDA/EMA guidance for histopathology review.
          </div>
          <div>
            Additional: Dunnett&apos;s test provides family-wise error control for continuous many-to-one
            comparisons. <Ref>scipy.stats.dunnett</Ref>
          </div>
        </MethodSection>

        {/* Effect size */}
        <MethodSection title="Effect size">
          <div>
            <span className="font-medium text-foreground">Cohen&apos;s d</span> (pooled standard deviation):
            d = (mean<sub>treated</sub> &minus; mean<sub>control</sub>) / s<sub>pooled</sub>
          </div>
          <div>
            s<sub>pooled</sub> = &radic;(((n<sub>1</sub>&minus;1)&sdot;s<sub>1</sub>&sup2; + (n<sub>2</sub>&minus;1)&sdot;s<sub>2</sub>&sup2;) / (n<sub>1</sub>+n<sub>2</sub>&minus;2))
          </div>
          <div>
            Thresholds: |d| &ge; 0.5 moderate, |d| &ge; 1.0 large. Cap at |d| = 2.0 in signal score.
          </div>
        </MethodSection>

        {/* Trend tests */}
        <MethodSection title="Dose-response trend">
          <div>
            <span className="font-medium text-foreground">Continuous:</span> Spearman rank correlation
            between dose levels and response values (proxy for Jonckheere-Terpstra).
            Min 4 total observations. <Ref>scipy.stats.spearmanr</Ref>
          </div>
          <div>
            <span className="font-medium text-foreground">Incidence:</span> Cochran-Armitage trend test
            (chi-square approximation) using ordinal dose scores [0, 1, ..., k&minus;1].
          </div>
          <div>
            Significance threshold: trend p &lt; 0.05.
          </div>
        </MethodSection>

        {/* Additional tests */}
        <MethodSection title="Additional tests">
          <div>
            <span className="font-medium text-foreground">One-way ANOVA:</span> Overall group difference
            test for continuous endpoints. Min 2 groups with n &ge; 2 each.
            <Ref>scipy.stats.f_oneway</Ref>
          </div>
          <div>
            <span className="font-medium text-foreground">Kruskal-Wallis:</span> Non-parametric alternative
            for ordinal severity data. <Ref>scipy.stats.kruskal</Ref>
          </div>
        </MethodSection>

        {/* Pattern classification */}
        <MethodSection title="Dose-response pattern classification">
          <div>
            Patterns assigned based on dose-response shape analysis:
          </div>
          <div className="font-mono text-[9px] space-y-0.5 mt-1">
            <div>&bull; <span className="text-foreground">monotonic_increase</span> / <span className="text-foreground">monotonic_decrease</span>: Consistent directional change across dose groups</div>
            <div>&bull; <span className="text-foreground">threshold</span>: Response appears at specific dose level and above</div>
            <div>&bull; <span className="text-foreground">non_monotonic</span>: Inconsistent direction (e.g., U-shaped or inverted-U)</div>
            <div>&bull; <span className="text-foreground">flat</span>: No meaningful change</div>
            <div>&bull; <span className="text-foreground">insufficient_data</span>: Too few groups or observations</div>
          </div>
        </MethodSection>

        {/* Severity classification */}
        <MethodSection title="Severity classification">
          <div>
            Each endpoint is classified into one of three severity levels:
          </div>
          <div className="space-y-0.5 mt-1">
            <div>&bull; <span className="font-medium text-foreground">Adverse:</span> p &lt; 0.05 + (monotonic/threshold pattern OR |d| &ge; 1.0)</div>
            <div>&bull; <span className="font-medium text-foreground">Warning:</span> p &lt; 0.05 OR treatment-related flag, but doesn&apos;t meet adverse criteria</div>
            <div>&bull; <span className="font-medium text-foreground">Normal:</span> Not statistically significant and no dose-response pattern</div>
          </div>
        </MethodSection>

        {/* Signal score */}
        <MethodSection title="Signal score formula">
          <div>
            Weighted composite score (0\u20131.0) combining four components:
          </div>
          <div className="mt-1 rounded bg-muted/30 px-2 py-1 font-mono text-[9px]">
            0.35 &times; p-value + 0.20 &times; trend + 0.25 &times; effect + 0.20 &times; pattern
          </div>
          <div className="space-y-0.5 mt-1">
            <div>&bull; p-value: min(&minus;log<sub>10</sub>(p) / 4, 1.0)</div>
            <div>&bull; Trend: min(&minus;log<sub>10</sub>(trend_p) / 4, 1.0)</div>
            <div>&bull; Effect size: min(|d| / 2.0, 1.0)</div>
            <div>&bull; Pattern: lookup (monotonic=1.0, threshold=0.7, non_monotonic=0.3, flat/insufficient=0.0)</div>
          </div>
        </MethodSection>

        {/* Evidence score */}
        <MethodSection title="Evidence score (organ-level)">
          <div>
            Aggregate score per organ system combining signal strength and cross-domain convergence:
          </div>
          <div className="mt-1 rounded bg-muted/30 px-2 py-1 font-mono text-[9px]">
            evidence = (total_signal / n_endpoints) &times; (1 + 0.2 &times; (n_domains &minus; 1))
          </div>
          <div className="mt-1">
            Target organ flag: evidence &ge; 0.3 AND n_significant &ge; 1.
            Multi-domain convergence increases evidence score (up to &times;1.8 for 5 domains).
          </div>
        </MethodSection>

        {/* NOAEL */}
        <MethodSection title="NOAEL determination">
          <div>
            NOAEL = highest dose level with no adverse effects. Confidence score (0\u20131.0) starts at 1.0,
            penalized by:
          </div>
          <div className="space-y-0.5 mt-1">
            <div>&bull; Single endpoint at LOAEL (&le;1 adverse finding): &minus;0.20</div>
            <div>&bull; Sex inconsistency (M and F NOAEL differ): &minus;0.20</div>
            <div>&bull; Pathology disagreement (reserved): &minus;0.00</div>
            <div>&bull; Large non-significant effect (|d| &ge; 1.0, p &ge; 0.05): &minus;0.20</div>
          </div>
        </MethodSection>

        {/* References */}
        <MethodSection title="Software and references">
          <div className="space-y-0.5">
            <div>&bull; SciPy 1.x (scipy.stats) for all statistical tests</div>
            <div>&bull; Bonferroni correction per Dunn (1961)</div>
            <div>&bull; Dunnett&apos;s test per Dunnett (1955, 1964)</div>
            <div>&bull; Cochran-Armitage per Cochran (1954) and Armitage (1955)</div>
            <div>&bull; Cohen&apos;s d per Cohen (1988) &mdash; &ldquo;Statistical Power Analysis for the Behavioral Sciences&rdquo;</div>
            <div>&bull; FDA Guidance: &ldquo;Nonclinical Safety Evaluation of Drug or Biologic Combinations&rdquo; (2006)</div>
            <div>&bull; ICH S3A: &ldquo;Toxicokinetics&rdquo; (1994)</div>
          </div>
        </MethodSection>
      </div>
    </CollapsiblePane>
  );
}
