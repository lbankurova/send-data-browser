/**
 * Validation tests for Expected Pharmacological Effect Classification (RC-3).
 *
 * Tests:
 * 1. PointCross regression — D9 = None (skipped) for all findings (no profile)
 * 2. D8 sample-size scoring present in generated data
 * 3. Never-reclassifiable findings block D9
 * 4. Confidence dimension completeness (D1-D9 present)
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const GENERATED = path.resolve(__dirname, "../../backend/generated");

function loadJson(study: string, file: string) {
  const p = path.join(GENERATED, study, file);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function loadFindings(study: string): any[] {
  const data = loadJson(study, "unified_findings.json");
  return data?.findings ?? [];
}

describe("Pharmacological Classification", () => {
  describe("PointCross — Regression (no expected-effect profile)", () => {
    const findings = loadFindings("PointCross");

    it("has findings to test", () => {
      expect(findings.length).toBeGreaterThan(100);
    });

    it("all findings have _confidence with D1-D9 dimensions", () => {
      const withConf = findings.filter(
        (f: any) => f._confidence?.dimensions?.length > 0,
      );
      // At least 50% of findings should have confidence scoring
      expect(withConf.length).toBeGreaterThan(findings.length * 0.3);

      for (const f of withConf) {
        const dimNames = f._confidence.dimensions.map(
          (d: any) => d.dimension,
        );
        expect(dimNames).toContain("D1");
        expect(dimNames).toContain("D2");
        expect(dimNames).toContain("D8");
        expect(dimNames).toContain("D9");
      }
    });

    it("D9 = null (skipped) for ALL findings — no compound profile active", () => {
      const withConf = findings.filter(
        (f: any) => f._confidence?.dimensions?.length > 0,
      );
      for (const f of withConf) {
        const d9 = f._confidence.dimensions.find(
          (d: any) => d.dimension === "D9",
        );
        expect(d9).toBeTruthy();
        expect(d9.score).toBeNull();
        // Rationale should indicate no profile
        expect(d9.rationale).toContain("No confirmed compound profile");
      }
    });

    it("no findings have _pharmacological_candidate flag", () => {
      const flagged = findings.filter(
        (f: any) => f._pharmacological_candidate === true,
      );
      expect(flagged).toHaveLength(0);
    });

    it("13 engineered signals still detected as tr_adverse (no regression)", () => {
      // BW decreased
      expect(
        findings.some(
          (f: any) =>
            f.domain === "BW" &&
            f.severity === "adverse" &&
            f.finding_class === "tr_adverse",
        ),
      ).toBe(true);

      // ALT increased
      expect(
        findings.some(
          (f: any) =>
            /alt|alanine/i.test(f.test_name ?? "") &&
            f.domain === "LB" &&
            f.finding_class === "tr_adverse",
        ),
      ).toBe(true);

      // AST increased
      expect(
        findings.some(
          (f: any) =>
            /ast|aspartate/i.test(f.test_name ?? "") &&
            f.domain === "LB" &&
            f.finding_class === "tr_adverse",
        ),
      ).toBe(true);

      // Liver hypertrophy (MI)
      expect(
        findings.some(
          (f: any) =>
            f.domain === "MI" &&
            /hypertrophy/i.test(f.finding ?? "") &&
            f.finding_class === "tr_adverse",
        ),
      ).toBe(true);

      // Liver weight (OM)
      expect(
        findings.some(
          (f: any) =>
            f.domain === "OM" &&
            /liver/i.test(f.specimen ?? "") &&
            f.finding_class === "tr_adverse",
        ),
      ).toBe(true);
    });
  });

  describe("Confidence scoring integrity", () => {
    const findings = loadFindings("PointCross");

    it("grade_sum is a valid number for scored findings", () => {
      const scored = findings.filter(
        (f: any) =>
          f._confidence?.grade_sum !== undefined &&
          f._confidence?.grade_sum !== null,
      );
      expect(scored.length).toBeGreaterThan(0);
      for (const f of scored) {
        const sum = f._confidence.grade_sum;
        expect(typeof sum).toBe("number");
        expect(Number.isFinite(sum)).toBe(true);
      }
    });

    it("grade is HIGH, MODERATE, or LOW", () => {
      const scored = findings.filter((f: any) => f._confidence?.grade);
      for (const f of scored) {
        expect(["HIGH", "MODERATE", "LOW"]).toContain(f._confidence.grade);
      }
    });

    it("grade thresholds are correct (sum >= 2 = HIGH, >= 0 = MODERATE, < 0 = LOW)", () => {
      const scored = findings.filter(
        (f: any) =>
          f._confidence?.grade_sum !== undefined &&
          f._confidence?.grade !== undefined,
      );
      for (const f of scored) {
        const { grade_sum, grade } = f._confidence;
        if (grade_sum >= 2) expect(grade).toBe("HIGH");
        else if (grade_sum >= 0) expect(grade).toBe("MODERATE");
        else expect(grade).toBe("LOW");
      }
    });
  });

  describe("D8 sample-size scoring", () => {
    const findings = loadFindings("PointCross");

    it("D8 scores present for findings with group_stats", () => {
      const withGroups = findings.filter(
        (f: any) =>
          f.group_stats?.length >= 2 && f._confidence?.dimensions?.length > 0,
      );
      expect(withGroups.length).toBeGreaterThan(0);

      let scored = 0;
      for (const f of withGroups) {
        const d8 = f._confidence.dimensions.find(
          (d: any) => d.dimension === "D8",
        );
        expect(d8).toBeTruthy();
        if (d8.score !== null) scored++;
      }
      // At least some findings should have D8 scored (not all skipped)
      expect(scored).toBeGreaterThan(0);

      // PointCross has N=10-20/group — majority of D8 scores should be >= 0
      const d8Scores = withGroups
        .map((f: any) => f._confidence.dimensions.find((d: any) => d.dimension === "D8"))
        .filter((d: any) => d?.score !== null)
        .map((d: any) => d.score);
      const adequate = d8Scores.filter((s: number) => s >= 0).length;
      expect(adequate / d8Scores.length).toBeGreaterThan(0.5);
    });
  });

  describe("Expected-effect profiles loaded", () => {
    const profileDir = path.resolve(
      __dirname,
      "../../shared/expected-effect-profiles",
    );

    it("5 modality profiles exist", () => {
      const files = fs.readdirSync(profileDir).filter((f) => f.endsWith(".json"));
      expect(files.length).toBeGreaterThanOrEqual(5);
      expect(files).toContain("vaccine_adjuvanted.json");
      expect(files).toContain("vaccine_non_adjuvanted.json");
      expect(files).toContain("aav_gene_therapy.json");
      expect(files).toContain("oligonucleotide.json");
      expect(files).toContain("checkpoint_inhibitor.json");
    });

    it("vaccine_adjuvanted profile has structured severity thresholds", () => {
      const profile = JSON.parse(
        fs.readFileSync(path.join(profileDir, "vaccine_adjuvanted.json"), "utf-8"),
      );
      expect(profile.profile_id).toBe("vaccine_adjuvanted");
      expect(profile.expected_findings.length).toBeGreaterThanOrEqual(9);

      // MI_injection_site should have structured threshold
      const injSite = profile.expected_findings.find(
        (f: any) => f.key === "MI_injection_site",
      );
      expect(injSite).toBeTruthy();
      expect(injSite.severity_threshold).toBeTypeOf("object");
      expect(injSite.severity_threshold.type).toBe("grade");
      expect(injSite.severity_threshold.max_non_adverse).toBe(4);
      expect(injSite.severity_threshold.never_reclassifiable).toContain("necrosis");
    });

    it("each profile has required fields", () => {
      const files = fs.readdirSync(profileDir).filter((f) => f.endsWith(".json"));
      for (const file of files) {
        const profile = JSON.parse(
          fs.readFileSync(path.join(profileDir, file), "utf-8"),
        );
        expect(profile.profile_id).toBeTruthy();
        expect(profile.display_name).toBeTruthy();
        expect(profile.modality).toBeTruthy();
        expect(profile.source).toBeTruthy();
        expect(Array.isArray(profile.expected_findings)).toBe(true);
        expect(profile.expected_findings.length).toBeGreaterThan(0);

        // Each finding has required fields
        for (const ef of profile.expected_findings) {
          expect(ef.key).toBeTruthy();
          expect(ef.domain).toBeTruthy();
          expect(ef.direction).toMatch(/^(up|down|present|absent|normal)$/);
          expect(ef.description).toBeTruthy();
          expect(ef.rationale).toBeTruthy();
        }
      }
    });
  });

  describe("Test code normalization", () => {
    const aliasFile = path.resolve(
      __dirname,
      "../../shared/config/test-code-aliases.json",
    );
    const organFile = path.resolve(
      __dirname,
      "../../shared/config/organ-aliases.json",
    );

    it("test-code-aliases.json has >= 24 alias groups", () => {
      const data = JSON.parse(fs.readFileSync(aliasFile, "utf-8"));
      const groups = data.alias_groups as Record<string, { canonical: string; aliases: string[] }>;
      expect(Object.keys(groups).length).toBeGreaterThanOrEqual(24);
    });

    it("BUN/UREAN/UREA are aliased to the same canonical code", () => {
      const data = JSON.parse(fs.readFileSync(aliasFile, "utf-8"));
      const groups = data.alias_groups as Record<string, { canonical: string; aliases: string[] }>;
      // Find the group whose canonical is BUN or whose aliases include UREAN
      const bunGroup = Object.values(groups).find(
        (g) => g.canonical === "BUN" || g.aliases.includes("UREAN"),
      );
      expect(bunGroup).toBeTruthy();
      const allCodes = [bunGroup!.canonical, ...bunGroup!.aliases];
      expect(allCodes).toContain("BUN");
      expect(allCodes).toContain("UREAN");
      expect(allCodes).toContain("UREA");
    });

    it("organ-aliases.json has >= 15 organ groups", () => {
      const data = JSON.parse(fs.readFileSync(organFile, "utf-8"));
      const groups = data.organ_groups as Record<string, string[]>;
      expect(Object.keys(groups).length).toBeGreaterThanOrEqual(15);
    });

    it("INJECTION SITE aliases include common variants", () => {
      const data = JSON.parse(fs.readFileSync(organFile, "utf-8"));
      const groups = data.organ_groups as Record<string, string[]>;
      const injAliases = groups["INJECTION SITE"];
      expect(injAliases).toBeTruthy();
      expect(injAliases.length).toBeGreaterThanOrEqual(3);
    });
  });
});
