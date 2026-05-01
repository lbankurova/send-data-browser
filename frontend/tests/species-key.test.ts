/**
 * GAP-218 / GAP-SDO-30: species normalizer consolidation.
 *
 * Verifies that the new canonical normalizeSpeciesKey() preserves the exact
 * behavior of the three pre-consolidation pattern matchers (after the
 * adapters in their respective modules apply consumer-specific vocab):
 *
 *   - species-overrides.resolveSpeciesKey()         -> "rat"|"rabbit"|"dog"|"cynomolgus"|"guinea pig"|"mouse"|null
 *   - syndrome-translational.normalizeSpecies()    -> "rat"|"dog"|"monkey"|"mouse"|"rabbit"|<lowercased input>
 *   - recovery-duration-table.normalizeSpecies()   -> "rat"|"mouse"|"dog"|"nhp"|null
 *
 * The pre-refactor implementations are inlined as oracles in this file so the
 * test fails loudly if a future edit drifts canonical pattern matching from
 * the historic per-consumer behavior.
 */

import { describe, it, expect } from "vitest";
import { normalizeSpeciesKey } from "../src/lib/species-key";
import { normalizeSpecies as translationalAdapter } from "../src/lib/syndrome-translational";

// ─── Pre-refactor oracles (verbatim from git history) ────────────────────

function legacyTranslationalNormalize(species: string): string {
  const s = species.toLowerCase().trim();
  if (s.includes("sprague") || s.includes("wistar") || s === "rat") return "rat";
  if (s.includes("beagle") || s === "dog") return "dog";
  if (s.includes("cynomolgus") || s.includes("rhesus") || s === "monkey") return "monkey";
  if (s.includes("mouse") || s.includes("cd-1") || s.includes("c57bl")) return "mouse";
  if (s.includes("rabbit") || s.includes("new zealand")) return "rabbit";
  return s;
}

function legacyRecoveryNormalize(species: string): "rat" | "mouse" | "dog" | "nhp" | null {
  const upper = species.toUpperCase().trim();
  if (upper === "RAT" || upper.includes("SPRAGUE") || upper.includes("WISTAR") || upper.includes("FISCHER")) return "rat";
  if (upper === "MOUSE" || upper.includes("CD-1") || upper.includes("B6C3F1")) return "mouse";
  if (upper === "DOG" || upper.includes("BEAGLE")) return "dog";
  if (upper === "MONKEY" || upper.includes("MACAQUE") || upper.includes("CYNOMOLGUS") || upper.includes("PRIMATE")) return "nhp";
  return null;
}

// Re-create the recovery adapter inline (identical to the post-refactor body)
// so tests don't have to import from inside that module.
function recoveryAdapter(species: string): "rat" | "mouse" | "dog" | "nhp" | null {
  const canonical = normalizeSpeciesKey(species);
  if (canonical === "cynomolgus") return "nhp";
  if (canonical === "rat" || canonical === "mouse" || canonical === "dog") return canonical;
  return null;
}

// Inputs both legacy translational AND legacy recovery agreed on. The adapter
// must preserve their outputs exactly.
const TRANSLATIONAL_PRESERVED = [
  "rat", "RAT", "Rat", "Sprague-Dawley", "SPRAGUE-DAWLEY", "Wistar", "WISTAR",
  "mouse", "MOUSE", "CD-1", "cd-1", "C57BL/6", "c57bl",
  "dog", "DOG", "Beagle", "BEAGLE",
  "monkey", "MONKEY", "Cynomolgus", "CYNOMOLGUS",
  "rabbit", "RABBIT", "New Zealand White",
  "Unknown", "elephant", "",
];

const RECOVERY_PRESERVED = [
  "rat", "RAT", "Rat", "Sprague-Dawley", "SPRAGUE-DAWLEY", "Wistar", "WISTAR",
  "mouse", "MOUSE", "CD-1", "cd-1", "B6C3F1",
  "dog", "DOG", "Beagle", "BEAGLE",
  "monkey", "MONKEY", "Cynomolgus", "CYNOMOLGUS", "Macaque", "MACAQUE",
  "rabbit", "RABBIT", "New Zealand White",
  "Unknown", "elephant", "",
];

// ─── Tests ────────────────────────────────────────────────────────────────

describe("normalizeSpeciesKey (canonical)", () => {
  it("returns null for empty/null/undefined input", () => {
    expect(normalizeSpeciesKey(null)).toBeNull();
    expect(normalizeSpeciesKey(undefined)).toBeNull();
    expect(normalizeSpeciesKey("")).toBeNull();
    expect(normalizeSpeciesKey("   ")).toBeNull();
  });

  it("recognizes rat strains case-insensitively", () => {
    expect(normalizeSpeciesKey("rat")).toBe("rat");
    expect(normalizeSpeciesKey("RAT")).toBe("rat");
    expect(normalizeSpeciesKey("Sprague-Dawley")).toBe("rat");
    expect(normalizeSpeciesKey("WISTAR")).toBe("rat");
    expect(normalizeSpeciesKey("Fischer 344")).toBe("rat");
    expect(normalizeSpeciesKey("F344")).toBe("rat");
    expect(normalizeSpeciesKey("Long-Evans")).toBe("rat");
  });

  it("recognizes mouse strains case-insensitively", () => {
    expect(normalizeSpeciesKey("mouse")).toBe("mouse");
    expect(normalizeSpeciesKey("CD-1")).toBe("mouse");
    expect(normalizeSpeciesKey("B6C3F1")).toBe("mouse");
    expect(normalizeSpeciesKey("C57BL/6")).toBe("mouse");
    expect(normalizeSpeciesKey("BALB/c")).toBe("mouse");
  });

  it("recognizes dog strains", () => {
    expect(normalizeSpeciesKey("dog")).toBe("dog");
    expect(normalizeSpeciesKey("Beagle")).toBe("dog");
  });

  it("collapses NHP umbrella to cynomolgus", () => {
    expect(normalizeSpeciesKey("monkey")).toBe("cynomolgus");
    expect(normalizeSpeciesKey("Cynomolgus")).toBe("cynomolgus");
    expect(normalizeSpeciesKey("Rhesus")).toBe("cynomolgus");
    expect(normalizeSpeciesKey("Macaque")).toBe("cynomolgus");
    expect(normalizeSpeciesKey("Macaca fascicularis")).toBe("cynomolgus");
    expect(normalizeSpeciesKey("Macaca mulatta")).toBe("cynomolgus");
    expect(normalizeSpeciesKey("NHP")).toBe("cynomolgus");
    expect(normalizeSpeciesKey("primate")).toBe("cynomolgus");
  });

  it("recognizes rabbit", () => {
    expect(normalizeSpeciesKey("rabbit")).toBe("rabbit");
    expect(normalizeSpeciesKey("New Zealand White")).toBe("rabbit");
  });

  it("recognizes guinea pig", () => {
    expect(normalizeSpeciesKey("guinea pig")).toBe("guinea pig");
    expect(normalizeSpeciesKey("Hartley")).toBe("guinea pig");
    expect(normalizeSpeciesKey("Dunkin-Hartley")).toBe("guinea pig");
    expect(normalizeSpeciesKey("cavy")).toBe("guinea pig");
  });

  it("returns null for unknown species", () => {
    expect(normalizeSpeciesKey("elephant")).toBeNull();
    expect(normalizeSpeciesKey("xyz")).toBeNull();
  });
});

describe("syndrome-translational normalizeSpecies adapter (GAP-218)", () => {
  it.each(TRANSLATIONAL_PRESERVED)("preserves legacy output for %j", (input) => {
    const legacy = legacyTranslationalNormalize(input);
    const adapter = translationalAdapter(input);
    expect(adapter).toBe(legacy);
  });

  // Documented expansions: inputs the legacy pattern list missed but the
  // canonical recognizer catches. Each is a domain-unambiguous mapping
  // (B6C3F1 is the standard NTP mouse; Macaque is the NHP umbrella term)
  // that legacy silently fell through into the SOC concordance lookup as
  // a literal lowercased string, producing a guaranteed lookup miss.
  it("expands recognition for inputs legacy translational missed", () => {
    expect(translationalAdapter("B6C3F1")).toBe("mouse");      // legacy: "b6c3f1"
    expect(translationalAdapter("BALB/c")).toBe("mouse");      // legacy: "balb/c"
    expect(translationalAdapter("Macaque")).toBe("monkey");    // legacy: "macaque"
    expect(translationalAdapter("MACAQUE")).toBe("monkey");    // legacy: "macaque"
    expect(translationalAdapter("Rhesus")).toBe("monkey");     // legacy: "rhesus"
    expect(translationalAdapter("Fischer 344")).toBe("rat");   // legacy: "fischer 344"
    expect(translationalAdapter("Long-Evans")).toBe("rat");    // legacy: "long-evans"
    expect(translationalAdapter("Hartley")).toBe("guinea pig"); // legacy: "hartley"
  });

  it("falls through to lowercased input for genuinely unknown species", () => {
    expect(translationalAdapter("Elephant")).toBe("elephant");
    expect(translationalAdapter("XYZ")).toBe("xyz");
  });
});

describe("recovery-duration normalizeSpecies adapter (GAP-218)", () => {
  it.each(RECOVERY_PRESERVED)("preserves legacy output for %j", (input) => {
    const legacy = legacyRecoveryNormalize(input);
    const adapter = recoveryAdapter(input);
    if (legacy === null) {
      expect(adapter).toBeNull();
    } else {
      expect(adapter).toBe(legacy);
    }
  });

  // Documented expansions: inputs the legacy pattern list missed.
  it("expands recognition for inputs legacy recovery missed", () => {
    expect(recoveryAdapter("C57BL/6")).toBe("mouse");   // legacy: null
    expect(recoveryAdapter("c57bl")).toBe("mouse");     // legacy: null
    expect(recoveryAdapter("BALB/c")).toBe("mouse");    // legacy: null
    expect(recoveryAdapter("F344")).toBe("rat");        // legacy: null (legacy hit "FISCHER" only)
    expect(recoveryAdapter("Long-Evans")).toBe("rat");  // legacy: null
    expect(recoveryAdapter("Rhesus")).toBe("nhp");      // legacy: null (legacy hit "MACAQUE" / "CYNOMOLGUS" / "PRIMATE" / "MONKEY" only)
  });

  it("returns null for rabbit / guinea pig / unknown (recovery has no entries for these)", () => {
    expect(recoveryAdapter("rabbit")).toBeNull();
    expect(recoveryAdapter("New Zealand White")).toBeNull();
    expect(recoveryAdapter("Hartley")).toBeNull();
    expect(recoveryAdapter("guinea pig")).toBeNull();
    expect(recoveryAdapter("elephant")).toBeNull();
  });
});

describe("organ-sex-concordance.lookupBand consumption invariant", () => {
  // organ-sex-concordance.ts:244 documents that lookupBand expects "monkey",
  // not "cynomolgus", because speciesBands data uses the "monkey" vocabulary.
  // This test fails if the syndrome-translational adapter ever drifts.
  it("translational adapter emits 'monkey' (not 'cynomolgus') for NHP inputs", () => {
    expect(translationalAdapter("monkey")).toBe("monkey");
    expect(translationalAdapter("Cynomolgus")).toBe("monkey");
    expect(translationalAdapter("Rhesus")).toBe("monkey");
    expect(translationalAdapter("Macaque")).toBe("monkey");
    expect(translationalAdapter("NHP")).toBe("monkey");
  });
});
