/**
 * Species, vehicle, and route interpretation context lookup.
 *
 * Static lookup tables derived from docs/knowledge/species-profiles.md
 * and docs/knowledge/vehicle-profiles.md. Returns notes relevant to the
 * current study's species/strain/vehicle/route combination.
 *
 * Notes are scoped:
 *   domain set  → shows on that domain's row in the domain table
 *   domain null → study-level note, shows in header right column
 *
 * requiresSignal: when true, domain-scoped notes only render if
 * the domain has treatment-related signals. Silence = clean.
 */

export interface ContextNote {
  category: string;
  note: string;
  severity: "info" | "caution";
  /** Target domain (lowercase). Null = study-level (header). */
  domain: string | null;
  /** Only show when domain has TR signals. */
  requiresSignal?: boolean;
}

// ── Species notes ────────────────────────────────────────────

const RAT_NOTES: ContextNote[] = [
  { category: "QTc", note: "Not translational for rodent (Ito-dominated repolarization)", severity: "caution", domain: "eg" },
];

const DOG_NOTES: ContextNote[] = [
  { category: "QTc", note: "Gold-standard model for human QT risk (Van de Water correction)", severity: "info", domain: "eg" },
];

const MONKEY_NOTES: ContextNote[] = [
  { category: "QTc", note: "Translationally relevant (Fridericia correction preferred)", severity: "info", domain: "eg" },
  { category: "Immune concordance", note: "Highest immune system SOC LR+ (6.0) across species", severity: "info", domain: null },
  { category: "HPA axis", note: "Higher cortisol variability — stress response may over-fire", severity: "caution", domain: null },
];

const MOUSE_NOTES: ContextNote[] = [
  { category: "Hepatitis concordance", note: "Immune-mediated hepatitis LR+ 462.4 (highest across species)", severity: "info", domain: null },
  { category: "Cardiac concordance", note: "Lowest cardiac SOC LR+ (1.5)", severity: "caution", domain: "eg" },
];

function getSpeciesNotes(species: string): ContextNote[] {
  const sp = species.toUpperCase();
  if (sp === "RAT") return RAT_NOTES;
  if (sp === "DOG" || sp.includes("BEAGLE")) return DOG_NOTES;
  if (sp.includes("MONKEY") || sp.includes("CYNOMOLGUS") || sp.includes("MACACA")) return MONKEY_NOTES;
  if (sp === "MOUSE") return MOUSE_NOTES;
  return [];
}

// ── Strain notes ─────────────────────────────────────────────

function getStrainNotes(strain: string, species: string): ContextNote[] {
  const s = strain.toUpperCase();
  const sp = species.toUpperCase();
  if (sp !== "RAT") return [];
  if (s.includes("FISCHER") || s.includes("F344") || s.includes("F-344")) {
    return [
      { category: "Fischer 344", note: "~38% background MCL incidence in males — evaluate causality carefully", severity: "caution", domain: "mi" },
      { category: "Fischer 344", note: "High background pituitary adenoma and testicular interstitial cell tumors", severity: "caution", domain: "mi" },
    ];
  }
  return [];
}

// ── Vehicle notes ────────────────────────────────────────────

function getVehicleNotes(vehicle: string, route: string): ContextNote[] {
  const v = vehicle.toUpperCase();
  const r = route.toUpperCase();
  const isOral = r.includes("ORAL") || r.includes("GAVAGE");

  if (v.includes("CORN OIL") || v.includes("MAIZE OIL")) {
    if (isOral) {
      return [
        { category: "Corn oil", note: "May elevate TG, CHOL, ALP; hepatic lipid vacuolation at >2 mL/kg oral", severity: "caution", domain: "lb", requiresSignal: true },
      ];
    }
  }
  if (v.includes("PEG") && v.includes("400")) {
    const notes: ContextNote[] = [];
    if (isOral) {
      notes.push({ category: "PEG400", note: "May elevate BUN/CREAT; tubular vacuolation at >2 g/kg oral", severity: "caution", domain: "lb", requiresSignal: true });
    }
    if (r.includes("INTRAVENOUS") || r.includes("IV")) {
      notes.push({ category: "PEG400", note: "Mild hemolysis risk at >20% v/v IV", severity: "caution", domain: "lb", requiresSignal: true });
    }
    return notes;
  }
  if (v.includes("DMSO") || v.includes("DIMETHYL SULFOXIDE")) {
    const notes: ContextNote[] = [];
    if (r.includes("INTRAVENOUS") || r.includes("IV") || r.includes("INTRAPERITONEAL") || r.includes("IP")) {
      notes.push({ category: "DMSO", note: "Hemolysis risk at >1% IV/IP; mild ALT elevation possible", severity: "caution", domain: "lb", requiresSignal: true });
    }
    return notes;
  }
  return [];
}

// ── Route notes ──────────────────────────────────────────────

function getRouteNotes(route: string): ContextNote[] {
  const r = route.toUpperCase();
  if (r.includes("INTRAVENOUS") || r === "IV") {
    return [
      { category: "IV route", note: "Injection site reactions expected; transient cardiovascular effects at bolus", severity: "info", domain: "mi", requiresSignal: true },
    ];
  }
  if (r.includes("INHALATION")) {
    return [
      { category: "Inhalation", note: "Respiratory tract histopathology expected as background; restraint stress may affect BW", severity: "caution", domain: "mi" },
    ];
  }
  if (r.includes("SUBCUTANEOUS") || r === "SC") {
    return [
      { category: "SC route", note: "Injection site tissue reactions expected (fibrosis, inflammation)", severity: "info", domain: "mi", requiresSignal: true },
    ];
  }
  return [];
}

// ── Public API ───────────────────────────────────────────────

/**
 * Returns all interpretation context notes for a given study context.
 * Each note is tagged with a domain (for domain-row placement) or null
 * (for study-level header placement).
 */
export function getInterpretationContext(ctx: {
  species: string;
  strain: string;
  vehicle: string;
  route: string;
}): ContextNote[] {
  const notes: ContextNote[] = [
    ...getSpeciesNotes(ctx.species),
    ...getStrainNotes(ctx.strain, ctx.species),
    ...getVehicleNotes(ctx.vehicle, ctx.route),
    ...getRouteNotes(ctx.route),
  ];
  // Deduplicate by category+note
  const seen = new Set<string>();
  return notes.filter(n => {
    const key = `${n.category}:${n.note}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
