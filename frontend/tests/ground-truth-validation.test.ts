import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const GENERATED = path.resolve(__dirname, '../../backend/generated')

function loadJson(study: string, file: string) {
  const p = path.join(GENERATED, study, file)
  if (!fs.existsSync(p)) return null
  return JSON.parse(fs.readFileSync(p, 'utf-8'))
}

/** unified_findings.json is {findings: [...], dose_groups: [...], ...} */
function loadFindings(study: string): any[] {
  const data = loadJson(study, 'unified_findings.json')
  return data?.findings ?? []
}

function loadDoseGroups(study: string): any[] {
  const data = loadJson(study, 'unified_findings.json')
  return data?.dose_groups ?? []
}

describe('Ground Truth Validation', () => {

  describe('PointCross — Engineered Signal Detection', () => {
    const findings = loadFindings('PointCross')
    const noael: any[] = loadJson('PointCross', 'noael_summary.json') ?? []
    const doseGroups = loadDoseGroups('PointCross')
    const targetOrgans: any[] = loadJson('PointCross', 'target_organ_summary.json') ?? []

    function hasAdverseOrTrAdverse(testPattern: RegExp, domain?: string) {
      return findings.some(f => {
        const nameMatch = testPattern.test(f.test_name?.toLowerCase() ?? '') ||
                         testPattern.test(f.finding?.toLowerCase() ?? '')
        const domainMatch = domain ? f.domain === domain : true
        return nameMatch && domainMatch &&
          (f.finding_class === 'tr_adverse' || f.severity === 'adverse')
      })
    }

    it('detects BW decreased (Groups 3,4)', () => {
      const bw = findings.filter(f => f.domain === 'BW' && f.finding_class === 'tr_adverse')
      expect(bw.length).toBeGreaterThan(0)
    })

    it('detects AST increased (Group 4)', () => {
      expect(hasAdverseOrTrAdverse(/aspartate aminotransferase|ast/i, 'LB')).toBe(true)
    })

    it('detects ALT increased (Group 4)', () => {
      expect(hasAdverseOrTrAdverse(/alanine aminotransferase|alt/i, 'LB')).toBe(true)
    })

    it('detects ALP increased (Group 4)', () => {
      expect(hasAdverseOrTrAdverse(/alkaline phosphatase|alp/i, 'LB')).toBe(true)
    })

    it('detects RBC decreased in males (Group 4)', () => {
      const rbc = findings.filter(f =>
        /erythrocyte|rbc/i.test(f.test_name ?? '') &&
        f.domain === 'LB' && f.sex === 'M' &&
        (f.finding_class === 'tr_adverse' || f.severity === 'adverse')
      )
      expect(rbc.length).toBeGreaterThan(0)
    })

    it('detects RBC signal in females at any confidence level (Group 4)', () => {
      // Female RBC may be at reduced confidence (warning/tr_adverse) due to
      // sex-differential baseline sensitivity — this is expected, not a bug
      const rbc = findings.filter(f =>
        /erythrocyte|rbc/i.test(f.test_name ?? '') &&
        f.domain === 'LB' && f.sex === 'F' &&
        f.finding_class === 'tr_adverse'
      )
      expect(rbc.length).toBeGreaterThan(0)
    })

    it('detects HGB decreased (Group 4)', () => {
      expect(hasAdverseOrTrAdverse(/hemoglobin|hgb/i, 'LB')).toBe(true)
    })

    it('detects HCT decreased (Group 4)', () => {
      expect(hasAdverseOrTrAdverse(/hematocrit|hct/i, 'LB')).toBe(true)
    })

    it('detects liver weight increased (Group 4)', () => {
      const liverOm = findings.filter(f =>
        f.domain === 'OM' && /liver/i.test(f.specimen ?? '') &&
        (f.finding_class === 'tr_adverse' || f.severity === 'adverse')
      )
      expect(liverOm.length).toBeGreaterThan(0)
    })

    it('detects liver macroscopic findings in at least one sex', () => {
      const liverMa = findings.filter(f =>
        f.domain === 'MA' && /liver/i.test(f.specimen ?? '') &&
        (f.finding_class === 'tr_adverse' || f.severity === 'adverse')
      )
      expect(liverMa.length).toBeGreaterThan(0)
    })

    it('detects liver microscopic findings (Groups 3,4)', () => {
      const liverMi = findings.filter(f =>
        f.domain === 'MI' && /liver/i.test(f.specimen ?? '') &&
        (f.finding_class === 'tr_adverse' || f.severity === 'adverse')
      )
      expect(liverMi.length).toBeGreaterThan(0)
    })

    it('detects liver tumors with correct finding_class', () => {
      const tf = findings.filter(f =>
        f.domain === 'TF' && /liver|hepato/i.test(f.specimen ?? f.finding ?? '')
      )
      const trAdverse = tf.filter(f => f.finding_class === 'tr_adverse')
      expect(trAdverse.length).toBeGreaterThan(0)
    })

    it('tumor findings have severity=adverse and treatment_related=true', () => {
      const tf = findings.filter(f =>
        f.domain === 'TF' && f.finding_class === 'tr_adverse'
      )
      expect(tf.length).toBeGreaterThan(0)
      for (const t of tf) {
        expect(t.severity).toBe('adverse')
        expect(t.treatment_related).toBe(true)
      }
    })

    it('NOAEL not established (LOAEL at lowest active dose)', () => {
      const combined = noael.find((n: any) => n.sex === 'Combined')
      expect(combined).toBeDefined()
      // LOAEL at dose_level 1 (lowest active dose) -> NOAEL "not established"
      // because vehicle is not a testable dose (EPA IRIS, OECD, Kale 2022)
      expect(combined.noael_dose_level).toBeNull()
    })

    it('LOAEL at first treatment group', () => {
      const combined = noael.find((n: any) => n.sex === 'Combined')
      expect(combined).toBeDefined()
      expect(combined.loael_dose_level).toBeDefined()
      expect(combined.loael_dose_level).toBeLessThanOrEqual(1)
    })

    it('correctly identifies control group', () => {
      const control = doseGroups.find((g: any) => g.is_control)
      expect(control).toBeDefined()
      expect(control.dose_level).toBe(0)
    })

    it('flags hepatic and hematologic as target organs', () => {
      const targetNames = targetOrgans
        .filter((t: any) => t.target_organ_flag)
        .map((t: any) => t.organ_system?.toLowerCase())
      expect(targetNames).toContain('hepatic')
      expect(targetNames).toContain('hematologic')
    })
  })

  describe('No-Control Studies — NOAEL Guard', () => {
    it('Study3 (no vehicle control): NOAEL = Not established', () => {
      const noael = loadJson('CBER-POC-Pilot-Study3-Gene-Therapy', 'noael_summary.json')
      if (!noael) return
      const combined = noael.find((n: any) => n.sex === 'Combined')
      expect(combined).toBeDefined()
      expect(combined.noael_dose_level).toBeNull()
      expect(combined.noael_label).toBe('Not established')
    })

    it('Study3: no_concurrent_control derivation method', () => {
      const noael = loadJson('CBER-POC-Pilot-Study3-Gene-Therapy', 'noael_summary.json')
      if (!noael) return
      const combined = noael.find((n: any) => n.sex === 'Combined')
      expect(combined.noael_derivation?.method).toBe('no_concurrent_control')
    })
  })

  describe('Vaccine Studies — Signal Detection', () => {
    it('Study2: detects CRP elevation as treatment-related', () => {
      const findings = loadFindings('CBER-POC-Pilot-Study2-Vaccine_xpt')
      if (!findings.length) return
      const crp = findings.filter((f: any) =>
        /c.reactive|crp/i.test(f.test_name ?? '') && f.finding_class === 'tr_adverse'
      )
      expect(crp.length).toBeGreaterThan(0)
    })

    it('Study2: detects fibrinogen elevation as treatment-related', () => {
      const findings = loadFindings('CBER-POC-Pilot-Study2-Vaccine_xpt')
      if (!findings.length) return
      const fib = findings.filter((f: any) =>
        /fibrinogen/i.test(f.test_name ?? '') && f.finding_class === 'tr_adverse'
      )
      expect(fib.length).toBeGreaterThan(0)
    })

    it('Study4: detects CRP elevation as treatment-related', () => {
      const findings = loadFindings('CBER-POC-Pilot-Study4-Vaccine')
      if (!findings.length) return
      const crp = findings.filter((f: any) =>
        /c.reactive|crp/i.test(f.test_name ?? '') && f.finding_class === 'tr_adverse'
      )
      expect(crp.length).toBeGreaterThan(0)
    })

    it('Study4: detects fibrinogen elevation as treatment-related', () => {
      const findings = loadFindings('CBER-POC-Pilot-Study4-Vaccine')
      if (!findings.length) return
      const fib = findings.filter((f: any) =>
        /fibrinogen/i.test(f.test_name ?? '') && f.finding_class === 'tr_adverse'
      )
      expect(fib.length).toBeGreaterThan(0)
    })

    it('Study4: has concurrent control detected', () => {
      const groups = loadDoseGroups('CBER-POC-Pilot-Study4-Vaccine')
      if (!groups.length) return
      const control = groups.find((g: any) => g.is_control)
      expect(control).toBeDefined()
    })
  })

  describe('Empty XPT Handling', () => {
    it('Study5: 0-byte XPT excluded, provenance warning generated', () => {
      const prov = loadJson('CBER-POC-Pilot-Study5', 'provenance_messages.json')
      if (!prov) return
      const emptyWarning = prov.find((p: any) =>
        p.rule_id === 'Prov-011' || /0-byte|empty/i.test(p.message ?? '')
      )
      expect(emptyWarning).toBeDefined()
    })
  })

  describe('Single-Arm Study Handling', () => {
    it('Study1 (single-arm, no control): no adverse findings', () => {
      const findings = loadFindings('CBER-POC-Pilot-Study1-Vaccine_xpt_only')
      if (!findings.length) return
      const adverse = findings.filter((f: any) => f.severity === 'adverse')
      expect(adverse.length).toBe(0)
    })
  })
})
