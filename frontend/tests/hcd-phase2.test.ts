/**
 * hcd-phase2.test.ts — HCD Phase 2 (SQLite from NTP DTT IAD)
 *
 * Validates:
 * - SQLite HCD data is present in unified_findings.json for OM findings
 * - Extended fields (n, study_count, source, percentile_rank) appear
 * - Duration category "chronic" support
 * - Route/vehicle extraction from TS domain
 * - Backward compatibility: finding_class, _hcd_assessment structure
 * - Strain alias resolution for all 9 canonical strains in the DB
 */

import { describe, test, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

const ROOT = path.resolve(__dirname, "../..");
const UNIFIED_PATH = path.join(ROOT, "backend/generated/PointCross/unified_findings.json");
const HCD_DB_PATH = path.join(ROOT, "backend/data/hcd.db");
const JSON_HCD_PATH = path.join(ROOT, "shared/hcd-reference-ranges.json");
const METADATA_PATH = path.join(ROOT, "backend/generated/PointCross/study_metadata_enriched.json");
const PYTHON = path.join(ROOT, "backend/venv/Scripts/python.exe");

const hasGenerated = fs.existsSync(UNIFIED_PATH);
const hasDb = fs.existsSync(HCD_DB_PATH);

// ─── SQLite helper (uses Python subprocess via temp file) ───

function sqliteQuery(sql: string): any[] {
  const tmpScript = path.join(ROOT, "frontend", "_hcd_query_tmp.py");
  const pyCode = [
    "import sqlite3, json",
    `db = sqlite3.connect(r'${HCD_DB_PATH.replace(/'/g, "\\'")}')`,
    "db.row_factory = sqlite3.Row",
    `rows = db.execute(${JSON.stringify(sql)}).fetchall()`,
    "print(json.dumps([dict(r) for r in rows]))",
    "db.close()",
  ].join("\n");
  fs.writeFileSync(tmpScript, pyCode, "utf-8");
  try {
    const result = execSync(`"${PYTHON}" "${tmpScript}"`, {
      encoding: "utf-8",
      timeout: 10000,
    });
    return JSON.parse(result.trim());
  } finally {
    fs.unlinkSync(tmpScript);
  }
}

function sqliteScalar(sql: string): any {
  const rows = sqliteQuery(sql);
  if (rows.length === 0) return undefined;
  const keys = Object.keys(rows[0]);
  return rows[0][keys[0]];
}

// ─── Load data ──────────────────────────────────────────────

interface HcdAssessment {
  result: "within_hcd" | "outside_hcd" | "no_hcd";
  score: number;
  detail: string;
  n?: number;
  study_count?: number;
  source?: string;
  percentile_rank?: number;
}

interface Finding {
  domain: string;
  specimen: string | null;
  sex: string;
  finding_class?: string;
  _hcd_assessment?: HcdAssessment;
  _assessment_detail?: {
    hcd_result?: string;
    hcd_downgrade?: boolean;
    hcd_upgrade?: boolean;
  };
}

let findings: Finding[] = [];
if (hasGenerated) {
  const raw = JSON.parse(fs.readFileSync(UNIFIED_PATH, "utf-8"));
  findings = raw.findings ?? [];
}

const omFindings = findings.filter((f) => f.domain === "OM");

// ─── Tests ──────────────────────────────────────────────────

describe("HCD Phase 2 — SQLite integration", () => {
  describe("unified_findings.json OM assessments", () => {
    test.skipIf(!hasGenerated)("OM findings have _hcd_assessment", () => {
      expect(omFindings.length).toBeGreaterThan(0);
      const withHcd = omFindings.filter((f) => f._hcd_assessment != null);
      expect(withHcd.length).toBe(omFindings.length);
    });

    test.skipIf(!hasGenerated)("_hcd_assessment has required fields", () => {
      for (const f of omFindings) {
        const hcd = f._hcd_assessment!;
        expect(hcd).toBeDefined();
        expect(["within_hcd", "outside_hcd", "no_hcd"]).toContain(hcd.result);
        expect(typeof hcd.score).toBe("number");
        expect([-0.5, 0, 0.5]).toContain(hcd.score);
        expect(typeof hcd.detail).toBe("string");
        expect(hcd.detail.length).toBeGreaterThan(0);
      }
    });

    test.skipIf(!hasGenerated)(
      "SQLite-sourced assessments have extended fields (n, study_count, source)",
      () => {
        const sqliteSourced = omFindings.filter(
          (f) =>
            f._hcd_assessment?.source?.startsWith("sqlite:") &&
            f._hcd_assessment?.result !== "no_hcd"
        );
        // PointCross is SD rat — should have SQLite data
        expect(sqliteSourced.length).toBeGreaterThan(0);
        for (const f of sqliteSourced) {
          const hcd = f._hcd_assessment!;
          expect(hcd.n).toBeGreaterThan(0);
          expect(hcd.study_count).toBeGreaterThan(0);
          expect(hcd.source).toMatch(/^sqlite:/);
        }
      }
    );

    test.skipIf(!hasGenerated)(
      "SQLite-sourced assessments include percentile_rank (0-100)",
      () => {
        const sqliteSourced = omFindings.filter(
          (f) =>
            f._hcd_assessment?.source?.startsWith("sqlite:") &&
            f._hcd_assessment?.result !== "no_hcd"
        );
        for (const f of sqliteSourced) {
          const pct = f._hcd_assessment!.percentile_rank;
          expect(pct).toBeDefined();
          expect(pct).toBeGreaterThanOrEqual(0);
          expect(pct).toBeLessThanOrEqual(100);
        }
      }
    );

    test.skipIf(!hasGenerated)(
      "every OM finding has a finding_class",
      () => {
        for (const f of omFindings) {
          expect(f.finding_class).toBeDefined();
          expect([
            "not_treatment_related",
            "tr_non_adverse",
            "tr_adaptive",
            "tr_adverse",
            "equivocal",
          ]).toContain(f.finding_class);
        }
      }
    );

    test.skipIf(!hasGenerated)(
      "_assessment_detail.hcd_result is populated for OM findings",
      () => {
        const withDetail = omFindings.filter((f) => f._assessment_detail != null);
        expect(withDetail.length).toBeGreaterThan(0);
        for (const f of withDetail) {
          expect(["within_hcd", "outside_hcd", "no_hcd"]).toContain(
            f._assessment_detail!.hcd_result
          );
        }
      }
    );
  });

  describe("HCD score backward compatibility", () => {
    test.skipIf(!hasGenerated)("score is -0.5 for within_hcd, +0.5 for outside_hcd, 0 for no_hcd", () => {
      for (const f of omFindings) {
        const hcd = f._hcd_assessment!;
        if (hcd.result === "within_hcd") expect(hcd.score).toBe(-0.5);
        else if (hcd.result === "outside_hcd") expect(hcd.score).toBe(0.5);
        else expect(hcd.score).toBe(0);
      }
    });

    test.skipIf(!hasGenerated)("non-HCD-covered findings do NOT have _hcd_assessment", () => {
      const hcdDomains = new Set(["OM", "LB", "BW"]);
      const nonHcd = findings.filter((f) => !hcdDomains.has(f.domain));
      for (const f of nonHcd) {
        expect(f._hcd_assessment).toBeUndefined();
      }
    });
  });
});

describe("HCD Phase 2 — SQLite database structure", () => {
  test.skipIf(!hasDb)("hcd.db exists and has the expected tables", () => {
    const tables = sqliteQuery(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).map((r) => r.name);
    expect(tables).toContain("animal_organ_weights");
    expect(tables).toContain("hcd_aggregates");
    expect(tables).toContain("strain_aliases");
    expect(tables).toContain("etl_metadata");
  });

  test.skipIf(!hasDb)("hcd_aggregates has 7+ strains (BALB/C & LONG-EVANS too sparse)", () => {
    const strains = sqliteQuery(
      "SELECT DISTINCT strain FROM hcd_aggregates ORDER BY strain"
    ).map((r) => r.strain);
    // 7 strains have enough controls (n≥3 per sex/organ/duration) for aggregates
    // BALB/C and LONG-EVANS have <50 raw records each — too sparse
    expect(strains.length).toBeGreaterThanOrEqual(7);
    expect(strains).toEqual(
      expect.arrayContaining([
        "B6C3F1/N", "C57BL/6N", "CD-1",
        "F344/N", "FVB/N", "SD", "WISTAR HAN",
      ])
    );
  });

  test.skipIf(!hasDb)("hcd_aggregates covers 16 organs", () => {
    const organs = sqliteQuery(
      "SELECT DISTINCT organ FROM hcd_aggregates ORDER BY organ"
    ).map((r) => r.organ);
    expect(organs.length).toBe(16);
    expect(organs).toContain("BRAIN");
    expect(organs).toContain("LIVER");
    expect(organs).toContain("KIDNEY");
    expect(organs).toContain("HEART");
    expect(organs).toContain("TESTES");
    expect(organs).toContain("OVARIES");
  });

  test.skipIf(!hasDb)("hcd_aggregates has duration categories including 28-day", () => {
    const cats = sqliteQuery(
      "SELECT DISTINCT duration_category FROM hcd_aggregates ORDER BY duration_category"
    ).map((r) => r.duration_category);
    expect(cats.length).toBeGreaterThanOrEqual(3);
    expect(cats).toContain("28-day");
  });

  test.skipIf(!hasDb)("aggregate entries have valid statistics (n >= 3, sd > 0)", () => {
    const cnt = sqliteScalar(
      "SELECT COUNT(*) as cnt FROM hcd_aggregates WHERE n < 3 OR sd <= 0"
    );
    expect(cnt).toBe(0);
  });

  test.skipIf(!hasDb)("lower_2sd < upper_2sd for all aggregates", () => {
    const cnt = sqliteScalar(
      "SELECT COUNT(*) as cnt FROM hcd_aggregates WHERE lower_2sd >= upper_2sd"
    );
    expect(cnt).toBe(0);
  });

  test.skipIf(!hasDb)("strain_aliases resolves all 9 canonical strains", () => {
    const canonicals = [
      "B6C3F1/N", "BALB/C", "C57BL/6N", "CD-1",
      "F344/N", "FVB/N", "LONG-EVANS", "SD", "WISTAR HAN",
    ];
    for (const c of canonicals) {
      const rows = sqliteQuery(
        `SELECT canonical FROM strain_aliases WHERE alias = '${c.toUpperCase()}'`
      );
      expect(rows.length, `canonical "${c}" should be in strain_aliases`).toBe(1);
      expect(rows[0].canonical).toBe(c);
    }
  });

  test.skipIf(!hasDb)("strain_aliases resolves common aliases", () => {
    const cases: [string, string][] = [
      ["SPRAGUE-DAWLEY", "SD"],
      ["HSD:SD", "SD"],
      ["F344", "F344/N"],
      ["F344/NTAC", "F344/N"],
      ["WISTAR HAN IGS", "WISTAR HAN"],
      ["B6C3F1", "B6C3F1/N"],
      ["CD-1 CRL", "CD-1"],
      ["C57BL/6J", "C57BL/6N"],
      ["BALB/CJ", "BALB/C"],
      ["LONG EVANS", "LONG-EVANS"],
    ];
    for (const [alias, expected] of cases) {
      const rows = sqliteQuery(
        `SELECT canonical FROM strain_aliases WHERE alias = '${alias.toUpperCase()}'`
      );
      expect(rows.length, `alias "${alias}" should resolve`).toBe(1);
      expect(rows[0].canonical).toBe(expected);
    }
  });

  test.skipIf(!hasDb)("animal_organ_weights has >50K records", () => {
    const cnt = sqliteScalar("SELECT COUNT(*) as cnt FROM animal_organ_weights");
    expect(cnt).toBeGreaterThan(50000);
  });

  test.skipIf(!hasDb)("etl_metadata records timestamp and source", () => {
    const rows = sqliteQuery("SELECT key, value FROM etl_metadata");
    const meta = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    expect(meta.etl_timestamp).toBeDefined();
    expect(meta.source_file).toBeDefined();
    expect(parseInt(meta.n_animal_records)).toBeGreaterThan(50000);
    expect(parseInt(meta.n_aggregates)).toBeGreaterThan(100);
  });
});

describe("HCD Phase 2 — JSON fallback coexistence", () => {
  test("static JSON HCD file still exists", () => {
    expect(fs.existsSync(JSON_HCD_PATH)).toBe(true);
  });

  test("JSON has Hsd:Sprague Dawley and Crl:WI(Han) strains", () => {
    const data = JSON.parse(fs.readFileSync(JSON_HCD_PATH, "utf-8"));
    const strains = Object.keys(data.strains ?? {});
    expect(strains).toContain("Hsd:Sprague Dawley");
    expect(strains).toContain("Crl:WI(Han)");
  });
});

describe("HCD Phase 2 — route/vehicle in study metadata", () => {
  test.skipIf(!fs.existsSync(METADATA_PATH))(
    "study_metadata_enriched.json contains route and vehicle",
    () => {
      const meta = JSON.parse(fs.readFileSync(METADATA_PATH, "utf-8"));
      // PointCross is an oral gavage study
      expect(meta.route).toBeDefined();
      expect(meta.vehicle).toBeDefined();
    }
  );
});
