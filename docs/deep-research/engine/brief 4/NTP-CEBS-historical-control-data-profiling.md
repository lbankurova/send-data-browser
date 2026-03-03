# NTP CEBS historical control data: what's usable and how to integrate it

**The NTP DTT Individual Animal Data (IAD) collection — not the CEBS historical controls page — is the critical resource that changes the integration calculus.** A freely downloadable 78 MB Excel file contains individual animal-level organ weight data across 14+ strains, 40+ tissues including brain, covering hundreds of NTP studies. This means Option B (SQLite reference database from downloaded data) is far more viable than previously assumed, though Option A (static ranges) remains the fastest path to unblocking the A-3 factor. The recommended approach is a phased strategy: ship Option A in two weeks using compiled vendor/NTP reference ranges, then migrate to Option B within six weeks using DTT IAD data. Option C (sendigR) should be eliminated — **sendigR does not support the OM (organ measurements) domain** in its analysis pipeline, and CEBS data is not in SEND/XPT format.

---

## CEBS data inventory across five strains

The NTP CEBS ecosystem actually comprises three distinct systems with very different utility: the Historical Controls page (summary PDFs for chronic studies), the CEBS study database (per-study individual data), and the DTT Integrated Data Collections (harmonized cross-study IAD datasets). The table below profiles each strain across all three.

| Dimension | Hsd:Sprague Dawley | Wistar Han | F344/N | B6C3F1/N (mouse) | CD-1 (mouse) |
|---|---|---|---|---|---|
| **Studies in HC database** | ~8–15 per 5-yr window | 3–8 total (2006–2010) | 90+ (legacy) | 88+ (legacy) | **Not available** |
| **Organ weight (OM)** | ✅ DTT IAD + subchronic | ✅ DTT IAD (limited) | ✅ DTT IAD + extensive | ✅ DTT IAD | ✅ DTT IAD (listed as CD-1 CRL) |
| **Body weight (BW)** | ✅ All sources | ✅ Per-study + IAD | ✅ All sources | ✅ All sources | ✅ DTT IAD |
| **Brain weight** | ✅ DTT IAD only | ✅ DTT IAD; Inotiv HCD | ✅ DTT IAD | ✅ DTT IAD | ✅ DTT IAD |
| **Clinical pathology** | ✅ Clin Chem + Heme IAD | ✅ Per-study only | ✅ IAD + legacy | ✅ IAD | ✅ IAD |
| **Histopathology** | ✅ HC page + IAD (2.9 GB) | ✅ Per-study only | ✅ HC page + IAD | ✅ HC page + IAD | ❌ Not in HC; IAD unclear |
| **Age range** | 90-day, 2-year | 90-day, 2-year | 14-day, 90-day, 2-year | 90-day, 2-year | Limited |
| **Study date range** | 2007–2020+ | ~2006–2010 | ~1978–2008 | ~1978–2020+ | Sparse |
| **Download format** | Excel (IAD), PDF (HC) | Excel (IAD), PDF | Excel (IAD), PDF (HC) | Excel (IAD), PDF (HC) | Excel (IAD) |

**CD-1 mice are not an NTP bioassay strain** and have no historical control compilation on the NTP controls page. However, the DTT IAD Organ Weight dataset does list "CD-1 CRL" as a strain, likely from a small number of mechanistic studies. For production CD-1 HCD, Charles River's proprietary MARTA database is the primary industry source. **Wistar Han** has minimal NTP chronic study data (NTP used it only briefly ~2006–2008 before switching to SD), but Inotiv/RCC maintains the gold-standard Wistar Han HCD compiled from **700+ studies** with organ-to-brain ratios already computed. F344/N is the most data-rich strain in NTP's collection with decades of studies, though it has largely fallen out of use for new pharmaceutical toxicology studies.

---

## The DTT IAD datasets are the real discovery

The NTP Historical Controls page at `ntp.niehs.nih.gov/data/controls` is a dead end for organ weight data. It provides only **PDF-format summary statistics** focused on tumor incidence and body weight growth curves from chronic 2-year studies. Organ weights are not collected in NTP chronic studies — they come from the subchronic (90-day) components.

The actionable data lives in the **DTT Integrated Data Collections** at `cebs.niehs.nih.gov/cebs/paper/16015`. Key datasets relevant to the A-3 factor:

- **Organ Weight IAD** (February 2026): 78 MB Excel, individual animal level, 40+ tissues, 14+ strains, includes brain, pituitary, thyroid, and all organs needed for the top-15 panel
- **Terminal Bodyweight IAD** (February 2026): 85.9 MB Excel, same animal identifiers enabling OM-to-BW ratio computation
- **Clinical Chemistry IAD** and **Hematology IAD** (2024): Individual animal clinical pathology with harmonized assay names and units
- **Histopathology IAD**: 2.9 GB CSV with standardized tissue, morphology, and severity terminology
- **In-life Bodyweight IAD**: 5.4 GB CSV with serial body weights

All datasets are **freely downloadable without registration** (US government public domain), updated approximately monthly, and marked as "preliminary drafts under SME review." They include animal identifiers (enabling cross-domain linkage), study metadata, and a "Dose Response Study Flag" for filtering. Original legacy values are retained alongside harmonized values per the DTT Data Dictionary.

---

## Data quality assessment against HCD requirements

The five critical data quality questions yield mixed but workable answers.

**OM and BW from same animals with timing alignment?** Yes, in the DTT IAD datasets. Both the Organ Weight IAD and Terminal Bodyweight IAD use consistent animal identifiers (ANIMAL_ID / study identifiers) that enable joining. Terminal body weights are recorded at necropsy, and organ weights are collected immediately post-mortem, so timing alignment is inherent. **This means organ-to-body weight ratio computation is feasible from DTT IAD data.**

**Brain weight consistently recorded?** Brain weight is confirmed present in the DTT IAD Organ Weight dataset and in Inotiv's Wistar Han HCD. However, **brain weight is NOT part of NTP's standard subchronic organ weight panel** (which covers liver, thymus, kidney, testes, epididymides, ovaries, heart, and lung). Brain appears in a subset of studies — likely those conducted under more recent protocols or specific study designs. This means **Bailey organ-to-brain ratios for adrenal and ovaries** will have smaller sample sizes than organ-to-body ratios. The Inotiv Wistar Han dataset explicitly provides organ-to-brain ratios (OBR) for all organs, making it the better source for Bailey ratios in Wistar Han.

**Variance in study conduct dates?** NTP's historical controls page enforces a **5-year rolling window** (e.g., studies started 2007–2016 for the SD rat), consistent with Keenan et al.'s STP recommendation of 2–7 years. The DTT IAD spans a much wider date range and would require date filtering at query time. For SD rat, the relevant window is approximately 2012–2020+ (recent NTP studies). For F344/N, the bulk of data is older (1978–2008), so the 5-year window constraint eliminates most F344 data unless one accepts the Keenan caveat that wider intervals may be appropriate when endpoint values are stable.

**Route of administration and vehicle recorded?** Yes. The NTP historical controls are explicitly stratified by route and vehicle. DTT IAD includes study-level metadata with route information. Inotiv data aggregates across routes but provides separate tables for feed versus gavage groups. The Carfagna et al. 2021 analysis of **1,800+ SEND datasets at FDA CDER** found route/vehicle are among the more reliably populated fields, though overall field population rates ranged from **6% to 99%** — with basic demographics (species, strain, sex) at ~99% and derived fields (animal age at observation) as low as 6%.

**SEND domains and terminology consistency?** NTP data is **not in CDISC SEND format**. Data is stored in NTP's Provantis LIMS (modern studies) and legacy systems (TDMSE for histopathology, GDB for organ weights). The DTT IAD applies NTP-internal harmonization to the DTT Data Dictionary standard, but this does not map directly to SEND controlled terminology. Organ names use natural language forms ("Brain," "Liver") rather than SEND's inverted form ("GLAND, ADRENAL"). Any pipeline ingesting both NTP and sponsor SEND data will need a terminology mapping layer.

---

## What Keenan, Carfagna, and Kluxen tell us about matching criteria

The STP best practices (Keenan et al. 2009) specify **ten consensus principles** for HCD use. The most operationally relevant for the platform's A-3 factor are these matching requirements: **strain, sex, laboratory, route of administration, vehicle, diet, study duration, and a 2–7 year time window**. Same-laboratory data is preferred over cross-laboratory compilations. The concurrent control remains the primary comparator; HCD provides context, not replacement.

Carfagna et al. 2021 queried FDA CDER's >1,800 SEND datasets and found that cross-study analysis is severely hampered by **implementation variability in SEND**. Even extracting animal age required multiple algorithmic approaches because sponsors encode it inconsistently. This is why the DTT IAD datasets — which have been internally harmonized by NTP staff — are more practically usable than raw SEND datasets for building an HCD database.

Zarn et al. 2024 (referenced in the task as Kluxen 2024) analyzed JMPR's use of HCD from 2004–2021 and found that JMPR uses HCD **"routinely and exclusively to avoid potential false positive decisions"** — precisely the A-3 factor use case. However, JMPR relies only on the HCD range (extreme values) without investigating whether the HCD and index study control groups follow the same distribution. This is a methodological weakness: **prediction intervals or percentile ranking against the HCD distribution are statistically superior** to simple range checks.

The ECETOC A-3 factor specifically states: "A difference is less likely to be treatment-related if the change is within the normal biological variation (i.e., within the range of historical control values or other reference values)." For practical implementation, this translates to checking whether a group mean or individual value falls within the **5th–95th percentile range** (or mean ± 2 SD) of the matched HCD distribution.

---

## Option C should be eliminated immediately

sendigR (the PHUSE R package for cross-study SEND analysis) supports only three endpoint domains: **BW (body weights), LB (laboratory tests), and MI (microscopic findings)**. The OM (organ measurements) domain — the single most important domain for the A-3 factor in organ weight analysis — **is not supported** in sendigR's dashboard or aggregation functions. While the low-level `getSubjData()` function can extract raw OM data, all analysis and visualization infrastructure would need to be built from scratch.

Additionally, sendigR requires data in SEND/XPT format, and CEBS/DTT data is not in SEND format. Converting NTP data to SEND would require a full ETL pipeline (estimated 4–8 weeks) for terminology mapping alone. The xptcleaner dependency adds Python 3.9.6+ via reticulate, introducing deployment complexity inappropriate for a startup's MVP. Full sendigR integration would require **6–12 weeks of engineering** with no guarantee of data quality parity with the DTT IAD datasets that are already harmonized.

The Steger-Hartmann et al. 2020 "virtual control groups" concept — using HCD to replace concurrent controls entirely — is an aspirational research direction (now the IHI VICT3R project) that requires data quality standards exceeding what any current public dataset provides. This is a 3–5 year industry initiative, not an MVP feature.

---

## Recommended phased approach: Option A now, Option B next

**Phase 1 (Option A — ship in 2 weeks):** Compile static reference ranges from three sources into a JSON configuration file. This immediately enables A-3 factor assessment for the two highest-priority strain/duration combinations.

For **SD rat (28-day and 90-day)**, use Envigo/Inotiv Hsd:Sprague Dawley data (n=20 per group per timepoint, mean ± SD available at 28-day and 13-week intervals) supplemented by NTP Technical Report control group data. For **Wistar Han (28-day and 90-day)**, use Inotiv's RccHan:WIST organ weight HCD compiled from **700+ studies** with mean, SD, min, max, 5th/95th percentiles stratified by age group (<8 wk, 8–12 wk, 13–18 wk, 19–40 wk). These Inotiv PDFs are freely downloadable from `inotiv.com/rcchanwist-background-data`.

The JSON schema should store: `strain`, `sex`, `study_duration_days`, `organ`, `weight_type` (absolute/relative_bw/relative_brain), `mean`, `sd`, `n`, `p5`, `p95`, `min`, `max`, `source`, `date_range`. Design this schema to accept Option B computed values as drop-in replacements.

The A-3 factor check becomes: if group mean falls within [p5, p95] (or [mean − 2SD, mean + 2SD] when percentiles unavailable), return `within_hcd`. Otherwise return `outside_hcd`. This is deterministic, has no external dependency, and runs in microseconds.

**Phase 2 (Option B — ship in 6 weeks):** Download the DTT IAD Organ Weight and Terminal Bodyweight Excel files. Build a SQLite reference database with this ETL pipeline:

1. Parse Excel files, extract control animals (filter by dose = 0 or control group flag)
2. Join organ weights to terminal body weights by animal ID
3. Compute organ-to-body weight ratios and organ-to-brain weight ratios
4. Index by strain, sex, study duration bucket (28-day, 90-day, chronic), route, and study start date
5. At query time, filter by matching criteria and compute percentiles dynamically

This enables **matched HCD queries**: given a study's strain, sex, duration, route, and date, pull the relevant control animal distribution and compute percentile ranks for each organ weight. The DTT IAD covers SD, Wistar Han, F344/N, B6C3F1/N, and CD-1 CRL — all five target strains.

**Phase 3 (future, optional):** Augment the SQLite database with customer-contributed SEND control data. This captures the best part of Option C (customer's own HCD) without the sendigR/xptcleaner dependency chain. A lightweight SEND XPT parser that extracts OM, BW, DM, and TS domains into the same SQLite schema is ~2 weeks of engineering.

---

## Starter reference ranges for SD rat organ weights

The following table provides immediately usable reference ranges from Envigo Study C11963 (Hsd:Sprague Dawley SD, feed group, n=20). These can be entered directly as the Phase 1 JSON config for A-3 factor assessment. All values are absolute weights in grams, mean ± SD.

| Organ | Male 28-day | Male 13-week | Female 28-day | Female 13-week |
|---|---|---|---|---|
| **Body weight** | — | — | — | — |
| Brain | **1.84 ± 0.06** | **1.94 ± 0.05** | **1.72 ± 0.05** | **1.78 ± 0.05** |
| Liver | **11.0 ± 1.02** | **12.1 ± 1.24** | **6.50 ± 0.68** | **6.55 ± 0.68** |
| Kidney (both) | 2.17 ± 0.20 | 2.91 ± 2.24 | 1.37 ± 0.12 | 1.44 ± 0.10 |
| Heart | 1.19 ± 0.09 | 1.39 ± 0.10 | 0.87 ± 0.07 | 0.95 ± 0.05 |
| Spleen | 0.92 ± 0.11 | 0.96 ± 0.11 | 0.67 ± 0.09 | 0.66 ± 0.09 |
| Thymus | 0.50 ± 0.10 | 0.31 ± 0.04 | — | — |
| Testes (both) | **3.66 ± 0.20** | **3.95 ± 0.24** | — | — |
| Epididymides | 1.10 ± 0.08 | 1.35 ± 0.10 | — | — |
| Ovaries | — | — | 0.11 ± 0.02 | 0.10 ± 0.01 |
| Adrenal | 0.05 ± 0.01 | 0.06 ± 0.01 | 0.07 ± 0.01 | 0.06 ± 0.01 |

**Data quality flag:** The male 13-week kidney SD of 2.24 (vs. mean 2.91) appears anomalously high — likely a transcription or outlier issue in the source PDF. Cross-validate against NTP TR-595 control data (right kidney male 28-day: 1.08 ± 0.03 SE, n=10; multiply by 2 for both kidneys ≈ 2.16) before using in production.

For Wistar Han, the Inotiv RccHan:WIST dataset provides superior coverage with **700+ studies, age-stratified 5th/95th percentiles, and pre-computed organ-to-brain ratios**. The PDF at `inotiv.com/hubfs/resources/data-sheets/hcd_obo_obr_owt_kopiervorlage.pdf` should be digitized for Phase 1 alongside the SD data above.

---

## Conclusion

The NTP CEBS ecosystem is more useful than its clunky web interface suggests, but the value is concentrated in the **DTT IAD Excel downloads** — not the historical controls page (PDF-only tumor data) and not the deprecated CEBSR API. The critical gap is that NTP data is NTP-formatted, not SEND-formatted, so any sendigR-based approach requires a conversion layer that defeats the purpose of using sendigR in the first place.

For the specific goal of enabling A-3 factor assessment for SD and Wistar Han in 28-day and 90-day studies, **Option A (static ranges) is the correct MVP** because it can ship in two weeks using the reference data compiled above plus the Inotiv Wistar Han PDFs. The Phase 2 upgrade to Option B using DTT IAD data is straightforward (download Excel, filter controls, build SQLite, compute percentiles) and should be prioritized immediately after Phase 1 ships — it unlocks dynamic matching by route, vehicle, age, and study date that static ranges cannot provide. Option C should be permanently deprioritized: sendigR doesn't support organ weights, CEBS isn't in SEND format, and the engineering cost buys no data quality advantage over the already-harmonized DTT IAD datasets.