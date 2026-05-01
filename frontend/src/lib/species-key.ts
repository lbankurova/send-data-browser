/**
 * Canonical species normalizer. Single source of truth for mapping
 * raw species/strain strings (from study metadata, SEND data, free text)
 * to a fine-grained canonical species key.
 *
 * Resolves GAP-218 + GAP-SDO-30 by consolidating three previously-divergent
 * pattern matchers:
 *   - species-overrides.ts: resolveSpeciesKey()
 *   - syndrome-translational.ts: normalizeSpecies()
 *   - recovery-duration-table.ts: normalizeSpecies()
 *
 * Per-consumer vocabularies (e.g. "monkey" for SOC concordance, "nhp" for
 * recovery duration) are produced by thin adapters that wrap this function;
 * adapters live in their respective modules and only translate the canonical
 * key to their data-table vocab. This keeps consumer code unchanged while
 * eliminating the divergent pattern lists.
 *
 * Strain-aware key builders (e.g. buildSpeciesStrainKey() in
 * organ-weight-normalization.ts) are intentionally separate -- they produce
 * a different shape ("RAT_SPRAGUE_DAWLEY") for a different lookup table.
 */

export type SpeciesKey =
  | "rat"
  | "mouse"
  | "dog"
  | "cynomolgus"
  | "rabbit"
  | "guinea pig";

/**
 * Map a raw species/strain string to the canonical species key, or null if
 * unrecognized. The "cynomolgus" key is the NHP umbrella -- captures cyno,
 * rhesus, macaque, generic "monkey", "NHP", "primate", and the binomial
 * Macaca fascicularis / mulatta variants.
 */
export function normalizeSpeciesKey(species: string | null | undefined): SpeciesKey | null {
  if (!species) return null;
  const lower = species.toLowerCase().trim();
  if (!lower) return null;

  // Rat (incl. Sprague-Dawley, Wistar, Fischer 344, Long-Evans)
  if (
    lower === "rat" ||
    lower.includes("sprague") ||
    lower.includes("wistar") ||
    lower.includes("fischer") ||
    lower.includes("f344") ||
    (lower.includes("long") && lower.includes("evans"))
  ) {
    return "rat";
  }

  // Mouse strain coverage (GAP-262): match strain identifiers BEFORE the
  // generic "mouse" fall-through so B6C3F1 / CD-1 / C57BL/6 / BALB/c are
  // picked up by the dedicated mouse profile rather than rat-proxied.
  if (
    lower.includes("mouse") ||
    lower.includes("mice") ||
    lower.includes("b6c3f1") ||
    lower.includes("cd-1") ||
    lower.includes("cd1") ||
    lower.includes("crl:cd") ||
    lower.includes("c57bl") ||
    lower.includes("c57") ||
    lower.includes("bl6") ||
    lower.includes("balb") ||
    lower.includes("icr")
  ) {
    return "mouse";
  }

  // Dog (incl. beagle)
  if (lower === "dog" || lower.includes("beagle")) {
    return "dog";
  }

  // Cynomolgus / NHP umbrella
  if (
    lower.includes("cyno") ||
    lower.includes("macaq") ||
    lower.includes("rhesus") ||
    lower.includes("fascicularis") ||
    lower.includes("mulatta") ||
    lower.includes("crab") ||
    lower === "monkey" ||
    lower.includes("primate") ||
    lower === "nhp"
  ) {
    return "cynomolgus";
  }

  // Rabbit (incl. New Zealand White)
  if (lower.includes("rabbit") || lower.includes("new zealand")) {
    return "rabbit";
  }

  // Guinea pig (incl. Hartley, Dunkin, cavy)
  if (
    lower.includes("guinea") ||
    lower.includes("cavy") ||
    lower.includes("hartley") ||
    lower.includes("dunkin")
  ) {
    return "guinea pig";
  }

  return null;
}
