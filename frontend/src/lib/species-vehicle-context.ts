/**
 * Species, vehicle, and route interpretation context lookup.
 *
 * Static lookup tables derived from docs/knowledge/species-profiles.md
 * and docs/knowledge/vehicle-profiles.md. Returns notes relevant to the
 * current study's species/strain/vehicle/route combination.
 */

export interface ContextNote {
  category: string;
  note: string;
  severity: "info" | "caution";
}

// ── Species notes ────────────────────────────────────────────

const RAT_NOTES: ContextNote[] = [
  { category: "Hepatotoxicity", note: "Preferred markers: SDH and GLDH (more liver-specific than ALT)", severity: "info" },
  { category: "Nephrotoxicity", note: "KIM-1 and clusterin are FDA/EMA DDT-qualified", severity: "info" },
  { category: "QTc", note: "Not translational for rodent (Ito-dominated repolarization)", severity: "caution" },
];

const DOG_NOTES: ContextNote[] = [
  { category: "QTc", note: "Gold-standard model for human QT risk (Van de Water correction)", severity: "info" },
  { category: "Hepatotoxicity", note: "ALT specificity higher than rat; SDH not standard", severity: "info" },
  { category: "Emesis", note: "Intact vomiting reflex (absent in rodents)", severity: "info" },
];

const MONKEY_NOTES: ContextNote[] = [
  { category: "QTc", note: "Translationally relevant (Fridericia correction preferred)", severity: "info" },
  { category: "Immune concordance", note: "Highest immune system SOC LR+ (6.0) across species", severity: "info" },
  { category: "Cortisol", note: "Higher HPA axis variability — stress response may over-fire", severity: "caution" },
];

const MOUSE_NOTES: ContextNote[] = [
  { category: "Hepatitis concordance", note: "Immune-mediated hepatitis LR+ 462.4 (highest across species)", severity: "info" },
  { category: "Cardiac concordance", note: "Lowest cardiac SOC LR+ (1.5)", severity: "caution" },
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
      { category: "Fischer 344", note: "~38% background MCL incidence in males — evaluate causality carefully", severity: "caution" },
      { category: "Fischer 344", note: "High background pituitary adenoma and testicular interstitial cell tumors", severity: "caution" },
    ];
  }
  if (s.includes("SPRAGUE") || s.includes("SD")) {
    return [
      { category: "Sprague-Dawley", note: "Higher spontaneous mammary adenoma rate in females", severity: "info" },
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
        { category: "Corn oil", note: "May elevate TG, CHOL, ALP; hepatic lipid vacuolation at >2 mL/kg oral", severity: "caution" },
      ];
    }
  }
  if (v.includes("PEG") && v.includes("400")) {
    const notes: ContextNote[] = [];
    if (isOral) {
      notes.push({ category: "PEG400", note: "May elevate BUN/CREAT; tubular vacuolation at >2 g/kg oral", severity: "caution" });
    }
    if (r.includes("INTRAVENOUS") || r.includes("IV")) {
      notes.push({ category: "PEG400", note: "Mild hemolysis risk at >20% v/v IV", severity: "caution" });
    }
    return notes;
  }
  if (v.includes("DMSO") || v.includes("DIMETHYL SULFOXIDE")) {
    const notes: ContextNote[] = [];
    if (r.includes("INTRAVENOUS") || r.includes("IV") || r.includes("INTRAPERITONEAL") || r.includes("IP")) {
      notes.push({ category: "DMSO", note: "Hemolysis risk at >1% IV/IP; mild ALT elevation possible", severity: "caution" });
    }
    return notes;
  }
  if (v.includes("SALINE") || v.includes("WATER") || v.includes("WFI")
    || v.includes("METHYLCELLULOSE") || v.includes("CMC")) {
    return [
      { category: "Vehicle", note: "No known endpoint confounds", severity: "info" },
    ];
  }
  return [];
}

// ── Route notes ──────────────────────────────────────────────

function getRouteNotes(route: string): ContextNote[] {
  const r = route.toUpperCase();
  if (r.includes("ORAL") || r.includes("GAVAGE")) {
    return [
      { category: "Oral gavage", note: "GI stress background possible (gastric irritation at high volumes)", severity: "info" },
    ];
  }
  if (r.includes("INTRAVENOUS") || r === "IV") {
    return [
      { category: "IV route", note: "Injection site reactions expected; transient cardiovascular effects at bolus", severity: "info" },
    ];
  }
  if (r.includes("INHALATION")) {
    return [
      { category: "Inhalation", note: "Respiratory tract histopathology expected as background; restraint stress may affect BW", severity: "caution" },
    ];
  }
  if (r.includes("SUBCUTANEOUS") || r === "SC") {
    return [
      { category: "SC route", note: "Injection site tissue reactions expected (fibrosis, inflammation)", severity: "info" },
    ];
  }
  return [];
}

// ── Public API ───────────────────────────────────────────────

/**
 * Returns interpretation context notes for a given study context.
 * Combines species, strain, vehicle, and route notes. Deduplicates by category.
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
