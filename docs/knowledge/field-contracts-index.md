# Field Contracts Index

One-line lookup for all computed fields in `field-contracts.md`. Scan this first; drill into the full file only for relevant entries.

| ID | Field Path | Summary |
|----|-----------|---------|
| FIELD-01 | `interpretation.overallSeverity` | Overall severity level for syndrome |
| FIELD-02 | `interpretation.certainty` | Mechanistic certainty grade |
| FIELD-03 | `interpretation.patternConfidence` | Dose-response pattern confidence |
| FIELD-04 | `interpretation.treatmentRelatedness.overall` | Treatment-relatedness verdict |
| FIELD-05 | `interpretation.adversity.overall` | Adversity determination |
| FIELD-06 | `interpretation.recovery.status` | Recovery status classification |
| FIELD-07 | `mortalityContext.mortalityNoaelCap` | Mortality NOAEL cap |
| FIELD-08 | `endpoint.worstSeverity` | Worst severity across dose groups |
| FIELD-09 | `endpoint.direction` | Finding direction (up/down) |
| FIELD-10 | `endpoint.noaelTier` / `noaelDoseValue` | Per-endpoint NOAEL tier + dose |
| FIELD-11 | `interpretation.histopathSeverityGrade` | Max histopath severity from MI data |
| FIELD-12 | `opiResult.classification` | Organ Proportionality Index class |
| FIELD-13 | `endpoint.maxEffectSize` | Maximum Hedges' g across groups |
| FIELD-14 | `endpoint.minPValue` | Minimum p-value across groups |
| FIELD-15 | `endpoint.maxFoldChange` | Maximum fold change vs. control |
| FIELD-16 | `endpoint.treatmentRelated` | Boolean treatment-relatedness flag |
| FIELD-17 | `endpoint.pattern` | Dose-response pattern label |
| FIELD-18 | `syndrome.requiredMet` | Required endpoints matched |
| FIELD-19 | `syndrome.domainsCovered` | Domains with matching evidence |
| FIELD-20 | `syndrome.supportScore` | Syndrome support strength (0-1) |
| FIELD-21 | `treatmentRelatedness.doseResponse` | DR contribution to TR |
| FIELD-22 | `treatmentRelatedness.statisticalSignificance` | Stats contribution to TR |
| FIELD-23 | `treatmentRelatedness.hcdComparison` | Historical control contribution to TR |
| FIELD-24 | `adversity.magnitudeLevel` | Effect magnitude classification |
| FIELD-25 | `adversity.adaptive` | Adaptive response flag |
| FIELD-26 | `adversity.stressConfound` | Stress confound flag |
| FIELD-27 | `interpretation.translationalConfidence.tier` | Translational confidence tier |
| FIELD-28 | `recovery.endpoints[]` | Per-endpoint recovery assessments |
| FIELD-29 | `foodConsumptionContext.bwFwAssessment` | BW-FC correlation assessment |
| FIELD-30 | `mortalityContext.mortalityNoaelCapRelevant` | Whether mortality cap applies |
| FIELD-31 | `endpoint.controlStats` / `worstTreatedStats` | Control + worst treated summary stats |
| FIELD-32 | `interpretation.speciesMarkers` | Species-specific biomarker annotations |
| FIELD-33 | `doseGroup.pooled_n_*` | Pooled animal counts (main+recovery) |
| FIELD-34 | `EndpointWithSignal.signal` | Endpoint signal composite score |
| FIELD-35 | `EndpointConfidence` | Endpoint adverse signal confidence |
| FIELD-36 | `GroupCard.groupSignal` | Dose group card signal strength |
| FIELD-37 | `RecoveryClassification.classification` | Interpretive recovery category |
| FIELD-38 | `RecoveryClassification.confidence` | Recovery classification confidence |
| FIELD-39 | `FindingNatureInfo.nature` | Biological nature category |
| FIELD-40 | `FindingNatureInfo.expected_reversibility` | Expected reversibility profile |
| FIELD-41 | `FindingNatureInfo.typical_recovery_weeks` | Typical recovery timeline |
| FIELD-42 | `ProtectiveSignalResult.classification` | Protective signal class |
| FIELD-43 | `LabClinicalMatch` | Lab-clinical cross-reference match |
| FIELD-44 | `NoaelNarrative` | NOAEL narrative summary |
| FIELD-45 | `SynthLine` | Signals panel synthesis line |
| FIELD-46 | `OrganGroup.tier` | Organ grouping tier |
| FIELD-47 | `AggregatedFinding.category` | Finding aggregation category |
| FIELD-48 | `PanelStatement` | Context panel statement |
| FIELD-49 | `effectSize` (transformed) | Multiplicity-aware effect size |
| FIELD-50 | `pValue` (corrected) | Multiplicity-corrected p-value |
| FIELD-51 | `NormalizationDecision` | Organ weight normalization decision |
| FIELD-52 | `adversity.secondaryToBW` | Secondary-to-BW adversity flag |
| FIELD-53 | `EndpointSummary.endpointConfidence` | ECI assessment (4 mechanisms + NOAEL weight) |
| FIELD-54 | `EndpointConfidenceResult.nonMonotonic` | Non-monotonic dose-response flag |
| FIELD-55 | `EndpointConfidenceResult.trendCaveat` | Trend test variance homogeneity caveat |
| FIELD-56 | `EndpointConfidenceResult.normCaveat` | Normalization confidence ceiling (FEMALE_REPRODUCTIVE) |
| FIELD-57 | `EndpointConfidenceResult.integrated` | 5-dimension integrated confidence |
| FIELD-58 | `EndpointConfidenceResult.noaelContribution` | NOAEL contribution weight + label |
| FIELD-59 | `WeightedNOAELResult` | Study-level weighted NOAEL from ECI |
| FIELD-60 | `TrendConcordanceResult` | JT/Williams' trend concordance check |
