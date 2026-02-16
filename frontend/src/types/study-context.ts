/**
 * Parsed study context derived from StudyMetadata (ts.xpt Trial Summary).
 * Consumed by engine functions that need study-aware logic:
 * historical controls, recovery assessment, syndrome detection, CT normalization.
 */

export interface StudyContext {
  studyId: string;
  strain: string;                       // STRAIN → "SPRAGUE-DAWLEY"
  species: string;                      // SPECIES → "RAT"
  route: string;                        // ROUTE → "ORAL GAVAGE"
  studyType: string;                    // SSTYP → "REPEAT DOSE TOXICITY"
  dosingDurationWeeks: number | null;   // DOSDUR → 13 (parsed from ISO 8601)
  recoveryPeriodDays: number | null;    // RECSAC → 14 (null if no recovery arm)
  terminalSacrificeWeeks: number | null; // TRMSAC → 13
  sexPopulation: "M" | "F" | "BOTH";   // SEXPOP → "BOTH"
  ageAtStartWeeks: number | null;       // AGETXT midpoint + AGEU → 6.5
  estimatedNecropsyAgeWeeks: number | null; // ageAtStartWeeks + dosingDurationWeeks
  supplier: string;                     // SPLRNAM → "Rat Labs"
  vehicle: string;                      // TRTV → "Saline"
  treatment: string;                    // TRT → "PCDRUG"
  studyDesign: string;                  // SDESIGN → "PARALLEL"
  plannedSubjectsM: number | null;      // PLANMSUB → 75
  plannedSubjectsF: number | null;      // PLANFSUB → 75
  diet: string;                         // DIET → "STANDARD"
  glpCompliant: boolean;                // GLPTYP present → true
  sendCtVersion: string;                // SNDCTVER → "SEND Terminology 2017-03-31"
  title: string;                        // STITLE
}
