"""SQLite-backed HCD reference range database.

Provides the same interface as HcdRangeDB (JSON) but backed by the SQLite
database built by ``etl.hcd_etl``. Supports more strains, organs, and
duration categories than the static JSON, plus percentile ranking against
individual animal data.

Architecture: singleton pattern — the DB connection is opened once and
reused across all queries. Thread-safe via SQLite's WAL mode + read-only access.
"""

from __future__ import annotations

import logging
import sqlite3
from pathlib import Path

from config import HCD_DB_PATH

log = logging.getLogger(__name__)

# Lazy-loaded singleton
_INSTANCE: HcdSqliteDB | None = None


class HcdSqliteDB:
    """SQLite-backed HCD — same interface as HcdRangeDB."""

    def __init__(self, db_path: Path | None = None):
        self._db_path = db_path or HCD_DB_PATH
        self._conn: sqlite3.Connection | None = None
        self._available: bool | None = None
        self._lb_iad_available: bool | None = None

    def _get_conn(self) -> sqlite3.Connection | None:
        if self._conn is not None:
            return self._conn
        if not self._db_path.exists():
            return None
        try:
            self._conn = sqlite3.connect(
                str(self._db_path),
                check_same_thread=False,
            )
            self._conn.row_factory = sqlite3.Row
            # Verify tables exist
            tables = {
                r[0] for r in
                self._conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table'"
                )
            }
            if "hcd_aggregates" not in tables:
                log.warning("hcd.db missing hcd_aggregates table")
                self._conn.close()
                self._conn = None
                return None
            return self._conn
        except Exception as e:
            log.warning("Failed to open HCD SQLite: %s", e)
            self._conn = None
            return None

    @property
    def available(self) -> bool:
        """True if the SQLite DB exists and has valid data."""
        if self._available is not None:
            return self._available
        conn = self._get_conn()
        if conn is None:
            self._available = False
            return False
        # Check that we have at least some aggregates
        count = conn.execute("SELECT COUNT(*) FROM hcd_aggregates").fetchone()[0]
        self._available = count > 0
        return self._available

    def resolve_strain(self, strain_raw: str | None) -> str | None:
        """Look up canonical strain name from alias table."""
        if not strain_raw:
            return None
        conn = self._get_conn()
        if conn is None:
            return None
        row = conn.execute(
            "SELECT canonical FROM strain_aliases WHERE alias = ?",
            (strain_raw.strip().upper(),),
        ).fetchone()
        return row[0] if row else None

    def query(
        self,
        strain: str,
        sex: str,
        duration_category: str,
        organ: str,
    ) -> dict | None:
        """Look up HCD aggregate by exact strain/sex/duration/organ.

        Returns dict compatible with HcdRange: mean, sd, n, lower, upper, source,
        plus extended fields: p5, p25, median, p75, p95, study_count.
        """
        conn = self._get_conn()
        if conn is None:
            return None
        row = conn.execute(
            """SELECT * FROM hcd_aggregates
               WHERE strain = ? AND sex = ? AND duration_category = ? AND organ = ?""",
            (strain, sex.strip().upper(), duration_category, organ.strip().upper()),
        ).fetchone()
        if row is None:
            return None
        return self._row_to_dict(row)

    def query_extended(
        self,
        strain: str,
        sex: str,
        duration_category: str,
        organ: str,
        *,
        route: str | None = None,
        vehicle: str | None = None,
    ) -> dict | None:
        """Dynamic matching with progressive filter relaxation.

        Try hierarchy:
        1. Full match (strain + sex + organ + duration + route + vehicle)
           — computes aggregate on the fly from animal_organ_weights
        2. Drop vehicle
        3. Drop route
        4. Base aggregates table (pre-computed, no route/vehicle filter)

        Returns None if no match at any level.
        """
        conn = self._get_conn()
        if conn is None:
            return None

        sex_upper = sex.strip().upper()
        organ_upper = organ.strip().upper()

        # If route/vehicle provided, try progressively relaxed dynamic queries
        if route or vehicle:
            for r, v, label in [
                (route, vehicle, "full"),
                (route, None, "no_vehicle"),
                (None, None, "no_route"),
            ]:
                result = self._dynamic_aggregate(
                    conn, strain, sex_upper, duration_category, organ_upper,
                    route=r, vehicle=v,
                )
                if result is not None:
                    result["match_level"] = label
                    return result

        # Fallback: pre-computed aggregates (no route/vehicle filter)
        return self.query(strain, sex_upper, duration_category, organ_upper)

    def _dynamic_aggregate(
        self,
        conn: sqlite3.Connection,
        strain: str,
        sex: str,
        duration_category: str,
        organ: str,
        *,
        route: str | None = None,
        vehicle: str | None = None,
    ) -> dict | None:
        """Compute aggregate on the fly from animal_organ_weights with filters."""
        conditions = [
            "strain = ?", "sex = ?", "duration_category = ?", "organ = ?",
        ]
        params: list = [strain, sex, duration_category, organ]

        if route:
            conditions.append("route = ?")
            params.append(route.strip().upper())
        if vehicle:
            conditions.append("vehicle = ?")
            params.append(vehicle.strip().upper())

        where = " AND ".join(conditions)
        row = conn.execute(
            f"""SELECT
                COUNT(*) as n,
                AVG(organ_weight_g) as mean,
                -- SQLite doesn't have STDEV; compute manually
                COUNT(DISTINCT study_id) as study_count
            FROM animal_organ_weights
            WHERE {where}""",
            params,
        ).fetchone()

        if row is None or row[0] < 3:
            return None

        n = row[0]
        mean = row[1]
        study_count = row[2]

        # Compute SD and percentiles from raw values
        values_rows = conn.execute(
            f"SELECT organ_weight_g FROM animal_organ_weights WHERE {where}",
            params,
        ).fetchall()
        values = [r[0] for r in values_rows]

        import numpy as np
        arr = np.array(values, dtype=float)
        sd = float(np.std(arr, ddof=1))
        if sd < 1e-10:
            return None

        return {
            "organ": organ,
            "sex": sex,
            "duration_category": duration_category,
            "mean": round(mean, 6),
            "sd": round(sd, 6),
            "n": n,
            "lower": round(mean - 2 * sd, 6),
            "upper": round(mean + 2 * sd, 6),
            "source": f"sqlite:{strain}",
            "p5": round(float(np.percentile(arr, 5)), 6),
            "p25": round(float(np.percentile(arr, 25)), 6),
            "median": round(float(np.median(arr)), 6),
            "p75": round(float(np.percentile(arr, 75)), 6),
            "p95": round(float(np.percentile(arr, 95)), 6),
            "study_count": study_count,
        }

    def query_by_age(
        self,
        strain: str,
        sex: str,
        age_months: float,
        organ: str,
    ) -> dict | None:
        """Look up HCD aggregate by nearest age stratum (for non-rodent species).

        Returns dict compatible with query() output, plus:
          age_matched: the age_months of the matched stratum
          age_gap: absolute difference in months between requested and matched
        """
        conn = self._get_conn()
        if conn is None:
            return None

        sex_upper = sex.strip().upper()
        organ_upper = organ.strip().upper()

        rows = conn.execute(
            """SELECT * FROM hcd_aggregates
               WHERE strain = ? AND sex = ? AND organ = ?
               AND age_months IS NOT NULL
               ORDER BY ABS(age_months - ?)
               LIMIT 1""",
            (strain, sex_upper, organ_upper, age_months),
        ).fetchone()

        if rows is None:
            return None

        result = self._row_to_dict(rows)
        matched_age = rows["age_months"]
        result["age_matched"] = matched_age
        result["age_gap"] = round(abs(age_months - matched_age), 1)
        result["source"] = rows["source"] if "source" in rows.keys() else f"sqlite:{strain}"
        result["confidence"] = rows["confidence"] if "confidence" in rows.keys() else None
        result["sd_inflated"] = rows["sd_inflated"] if "sd_inflated" in rows.keys() else None
        return result

    def percentile_rank(
        self,
        value: float,
        strain: str,
        sex: str,
        duration_category: str,
        organ: str,
    ) -> float | None:
        """Rank a value against the matched HCD distribution (0-100).

        Returns the percentage of historical control values below the given value.
        """
        conn = self._get_conn()
        if conn is None:
            return None

        sex_upper = sex.strip().upper()
        organ_upper = organ.strip().upper()

        total = conn.execute(
            """SELECT COUNT(*) FROM animal_organ_weights
               WHERE strain = ? AND sex = ? AND duration_category = ? AND organ = ?""",
            (strain, sex_upper, duration_category, organ_upper),
        ).fetchone()[0]

        if total < 3:
            return None

        below = conn.execute(
            """SELECT COUNT(*) FROM animal_organ_weights
               WHERE strain = ? AND sex = ? AND duration_category = ? AND organ = ?
               AND organ_weight_g < ?""",
            (strain, sex_upper, duration_category, organ_upper, value),
        ).fetchone()[0]

        return round(100.0 * below / total, 1)

    # ------------------------------------------------------------------
    # LB domain queries
    # ------------------------------------------------------------------

    @property
    def lb_available(self) -> bool:
        """True if the LB HCD tables exist and have data."""
        conn = self._get_conn()
        if conn is None:
            return False
        tables = {
            r[0] for r in
            conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
        if "hcd_lb_aggregates" not in tables:
            return False
        count = conn.execute("SELECT COUNT(*) FROM hcd_lb_aggregates").fetchone()[0]
        return count > 0

    @property
    def lb_iad_available(self) -> bool:
        """True if individual animal lab values exist (NTP DTT IAD data)."""
        if self._lb_iad_available is not None:
            return self._lb_iad_available
        conn = self._get_conn()
        if conn is None:
            self._lb_iad_available = False
            return False
        tables = {
            r[0] for r in
            conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
        if "animal_lab_values" not in tables:
            self._lb_iad_available = False
            return False
        count = conn.execute("SELECT COUNT(*) FROM animal_lab_values").fetchone()[0]
        self._lb_iad_available = count > 0
        return self._lb_iad_available

    def percentile_rank_lb(
        self,
        value: float,
        strain: str,
        sex: str,
        test_code: str,
        duration_category: str,
    ) -> float | None:
        """Rank a lab value against the matched HCD distribution (0-100).

        Uses individual animal records from NTP DTT IAD (animal_lab_values).
        Returns the percentage of historical control values below the given value,
        or None if fewer than 10 matching records exist.

        Minimum n=10: at n<10 the empirical percentile has only a few
        discriminating levels (e.g. n=3 gives 0/33/67/100) which is too
        coarse to be informative for continuous lab values. n=10 gives
        10% granularity minimum. Caller guards on lb_iad_available.
        """
        conn = self._get_conn()
        if conn is None:
            return None

        sex_upper = sex.strip().upper()
        tc_upper = test_code.strip().upper()

        total = conn.execute(
            """SELECT COUNT(*) FROM animal_lab_values
               WHERE strain = ? AND sex = ? AND test_code = ?
               AND duration_category = ?""",
            (strain, sex_upper, tc_upper, duration_category),
        ).fetchone()[0]

        if total < 10:
            return None

        below = conn.execute(
            """SELECT COUNT(*) FROM animal_lab_values
               WHERE strain = ? AND sex = ? AND test_code = ?
               AND duration_category = ?
               AND value < ?""",
            (strain, sex_upper, tc_upper, duration_category, value),
        ).fetchone()[0]

        return round(100.0 * below / total, 1)

    def resolve_species(self, species_raw: str | None) -> str | None:
        """Map raw TS SPECIES value to canonical species key for LB lookups."""
        if not species_raw:
            return None
        conn = self._get_conn()
        if conn is None:
            return None
        # Check LB species aliases table
        tables = {
            r[0] for r in
            conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
        if "hcd_lb_species_aliases" not in tables:
            return None
        row = conn.execute(
            "SELECT canonical FROM hcd_lb_species_aliases WHERE alias = ?",
            (species_raw.strip().upper(),),
        ).fetchone()
        return row[0] if row else None

    def resolve_lb_strain(self, strain_raw: str | None) -> tuple[str | None, str | None]:
        """Map raw TS STRAIN value to (canonical_strain, canonical_species) for LB.

        Returns (None, None) if no match.
        """
        if not strain_raw:
            return None, None
        conn = self._get_conn()
        if conn is None:
            return None, None
        tables = {
            r[0] for r in
            conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
        if "hcd_lb_strain_aliases" not in tables:
            return None, None
        row = conn.execute(
            "SELECT canonical_strain, canonical_species FROM hcd_lb_strain_aliases WHERE alias = ?",
            (strain_raw.strip().upper(),),
        ).fetchone()
        if row:
            return row[0], row[1]
        return None, None

    def query_lb(
        self,
        species: str,
        sex: str,
        test_code: str,
        duration_category: str,
        strain: str | None = None,
    ) -> dict | None:
        """Look up LB HCD aggregate by species/sex/test_code/duration.

        Tries strain-specific match first, then falls back to species-only.

        Returns dict with: mean, sd, geom_mean, lower, upper, n, source,
        confidence, unit, notes. Or None if no match.
        """
        conn = self._get_conn()
        if conn is None:
            return None

        tables = {
            r[0] for r in
            conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
        if "hcd_lb_aggregates" not in tables:
            return None

        sex_upper = sex.strip().upper()
        tc_upper = test_code.strip().upper()

        # Try strain-specific first
        if strain:
            row = conn.execute(
                """SELECT * FROM hcd_lb_aggregates
                   WHERE species = ? AND strain = ? AND sex = ?
                   AND test_code = ? AND duration_category = ?""",
                (species, strain, sex_upper, tc_upper, duration_category),
            ).fetchone()
            if row:
                return self._lb_row_to_dict(row, conn)

        # Fall back to any strain for this species
        row = conn.execute(
            """SELECT * FROM hcd_lb_aggregates
               WHERE species = ? AND sex = ?
               AND test_code = ? AND duration_category = ?
               ORDER BY
                   CASE confidence
                       WHEN 'HIGH' THEN 1
                       WHEN 'MODERATE' THEN 2
                       WHEN 'LOW' THEN 3
                       ELSE 4
                   END,
                   n DESC
               LIMIT 1""",
            (species, sex_upper, tc_upper, duration_category),
        ).fetchone()
        if row:
            return self._lb_row_to_dict(row, conn)

        return None

    @staticmethod
    def _lb_row_to_dict(row: sqlite3.Row, conn: sqlite3.Connection) -> dict:
        """Convert a sqlite3.Row from hcd_lb_aggregates to a dict."""
        return {
            "species": row["species"],
            "strain": row["strain"],
            "sex": row["sex"],
            "test_code": row["test_code"],
            "duration_category": row["duration_category"],
            "mean": row["mean"],
            "sd": row["sd"],
            "geom_mean": row["geom_mean"],
            "geom_sd": row["geom_sd"],
            "lower": row["lower"],
            "upper": row["upper"],
            "median": row["median"],
            "n": row["n"],
            "unit": row["unit"],
            "source": row["source"],
            "confidence": row["confidence"],
            "notes": row["notes"],
        }

    def get_lb_test_codes(self, species: str, duration_category: str) -> list[str]:
        """Get distinct LB test codes available for a species+duration."""
        conn = self._get_conn()
        if conn is None:
            return []
        tables = {
            r[0] for r in
            conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
        if "hcd_lb_aggregates" not in tables:
            return []
        rows = conn.execute(
            "SELECT DISTINCT test_code FROM hcd_lb_aggregates WHERE species = ? AND duration_category = ?",
            (species, duration_category),
        ).fetchall()
        return [r[0] for r in rows]

    def coverage_summary(self) -> dict:
        """Return a summary of what's in the database."""
        conn = self._get_conn()
        if conn is None:
            return {"available": False}

        strains = [
            r[0] for r in
            conn.execute("SELECT DISTINCT strain FROM hcd_aggregates ORDER BY strain")
        ]
        organs = [
            r[0] for r in
            conn.execute("SELECT DISTINCT organ FROM hcd_aggregates ORDER BY organ")
        ]
        durations = [
            r[0] for r in
            conn.execute("SELECT DISTINCT duration_category FROM hcd_aggregates ORDER BY duration_category")
        ]
        total_agg = conn.execute("SELECT COUNT(*) FROM hcd_aggregates").fetchone()[0]
        total_animals = conn.execute("SELECT COUNT(*) FROM animal_organ_weights").fetchone()[0]

        summary = {
            "available": True,
            "strains": strains,
            "organs": organs,
            "duration_categories": durations,
            "total_aggregates": total_agg,
            "total_animal_records": total_animals,
        }

        # LB coverage (if available)
        tables = {
            r[0] for r in
            conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
        if "hcd_lb_aggregates" in tables:
            lb_total = conn.execute("SELECT COUNT(*) FROM hcd_lb_aggregates").fetchone()[0]
            lb_species = [
                r[0] for r in
                conn.execute("SELECT DISTINCT species FROM hcd_lb_aggregates ORDER BY species")
            ]
            lb_tests = [
                r[0] for r in
                conn.execute("SELECT DISTINCT test_code FROM hcd_lb_aggregates ORDER BY test_code")
            ]
            summary["lb_available"] = lb_total > 0
            summary["lb_total_aggregates"] = lb_total
            summary["lb_species"] = lb_species
            summary["lb_test_codes"] = lb_tests
        else:
            summary["lb_available"] = False

        return summary

    # ------------------------------------------------------------------
    # BW domain queries
    # ------------------------------------------------------------------

    @property
    def bw_available(self) -> bool:
        """True if the BW HCD tables exist and have data."""
        conn = self._get_conn()
        if conn is None:
            return False
        tables = {
            r[0] for r in
            conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
        if "hcd_bw_aggregates" not in tables:
            return False
        count = conn.execute("SELECT COUNT(*) FROM hcd_bw_aggregates").fetchone()[0]
        return count > 0

    def query_bw(
        self,
        strain: str,
        sex: str,
        duration_category: str,
        species: str | None = None,
    ) -> dict | None:
        """Look up BW HCD aggregate by strain/sex/duration.

        If species is provided, uses (species, strain) as key.
        Otherwise infers species from strain (NTP strains are implicitly rodent).
        """
        conn = self._get_conn()
        if conn is None:
            return None
        tables = {
            r[0] for r in
            conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
        if "hcd_bw_aggregates" not in tables:
            return None

        sex_upper = sex.strip().upper()

        if species:
            row = conn.execute(
                """SELECT * FROM hcd_bw_aggregates
                   WHERE species = ? AND strain = ? AND sex = ?
                   AND duration_category = ?""",
                (species.upper(), strain, sex_upper, duration_category),
            ).fetchone()
        else:
            row = conn.execute(
                """SELECT * FROM hcd_bw_aggregates
                   WHERE strain = ? AND sex = ? AND duration_category = ?""",
                (strain, sex_upper, duration_category),
            ).fetchone()

        if row is None:
            return None
        return self._bw_row_to_dict(row)

    def bw_percentile_rank(
        self,
        value: float,
        strain: str,
        sex: str,
        duration_category: str,
    ) -> float | None:
        """Rank a BW value against the matched HCD distribution (0-100).

        Returns None if no individual records exist (e.g., non-rodent
        aggregate-only entries).
        """
        conn = self._get_conn()
        if conn is None:
            return None
        tables = {
            r[0] for r in
            conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
        if "hcd_bw" not in tables:
            return None

        sex_upper = sex.strip().upper()
        total = conn.execute(
            """SELECT COUNT(*) FROM hcd_bw
               WHERE strain = ? AND sex = ? AND duration_category = ?""",
            (strain, sex_upper, duration_category),
        ).fetchone()[0]

        if total < 3:
            return None

        below = conn.execute(
            """SELECT COUNT(*) FROM hcd_bw
               WHERE strain = ? AND sex = ? AND duration_category = ?
               AND body_weight_g < ?""",
            (strain, sex_upper, duration_category, value),
        ).fetchone()[0]

        return round(100.0 * below / total, 1)

    @staticmethod
    def _bw_row_to_dict(row: sqlite3.Row) -> dict:
        """Convert a sqlite3.Row from hcd_bw_aggregates to a dict."""
        return {
            "species": row["species"],
            "strain": row["strain"],
            "sex": row["sex"],
            "duration_category": row["duration_category"],
            "mean": row["mean"],
            "sd": row["sd"],
            "n": row["n"],
            "lower": row["lower_2sd"],
            "upper": row["upper_2sd"],
            "source": f"sqlite:{row['strain']}",
            "p5": row["p5"],
            "p25": row["p25"],
            "median": row["median"],
            "p75": row["p75"],
            "p95": row["p95"],
            "study_count": row["study_count"],
            "single_source": bool(row["single_source"]),
        }

    # ------------------------------------------------------------------
    # MI/MA domain queries
    # ------------------------------------------------------------------

    @property
    def mi_available(self) -> bool:
        """True if the MI HCD incidence table exists and has data."""
        conn = self._get_conn()
        if conn is None:
            return False
        tables = {
            r[0] for r in
            conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
        if "hcd_mi_incidence" not in tables:
            return False
        count = conn.execute("SELECT COUNT(*) FROM hcd_mi_incidence").fetchone()[0]
        return count > 0

    def query_mi_incidence(
        self,
        species: str,
        strain: str,
        sex: str,
        organ: str,
        finding: str,
        *,
        duration_category: str | None = None,
    ) -> dict | None:
        """Look up MI/MA HCD background incidence.

        Tries progressively relaxed matching:
        1. Exact match on all fields including duration_category
        2. NULL duration_category entries (serve as fallback)
        3. Drop strain specificity (species-only)

        Returns dict with incidence stats or None.
        """
        conn = self._get_conn()
        if conn is None:
            return None
        tables = {
            r[0] for r in
            conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
        if "hcd_mi_incidence" not in tables:
            return None

        sex_upper = sex.strip().upper()
        organ_upper = organ.strip().upper()
        finding_lower = finding.strip().lower()

        # Tier 1: exact match with duration
        if duration_category:
            row = conn.execute(
                """SELECT * FROM hcd_mi_incidence
                   WHERE species = ? AND strain = ? AND sex = ?
                   AND organ = ? AND LOWER(finding) = ?
                   AND duration_category = ?
                   ORDER BY confidence ASC LIMIT 1""",
                (species.upper(), strain.upper(), sex_upper,
                 organ_upper, finding_lower, duration_category),
            ).fetchone()
            if row:
                return self._mi_row_to_dict(row)

        # Tier 2: NULL duration (fallback entries)
        row = conn.execute(
            """SELECT * FROM hcd_mi_incidence
               WHERE species = ? AND strain = ? AND sex = ?
               AND organ = ? AND LOWER(finding) = ?
               AND duration_category IS NULL
               ORDER BY confidence ASC LIMIT 1""",
            (species.upper(), strain.upper(), sex_upper,
             organ_upper, finding_lower),
        ).fetchone()
        if row:
            return self._mi_row_to_dict(row)

        # Tier 3: any duration for this strain
        row = conn.execute(
            """SELECT * FROM hcd_mi_incidence
               WHERE species = ? AND strain = ? AND sex = ?
               AND organ = ? AND LOWER(finding) = ?
               ORDER BY confidence ASC LIMIT 1""",
            (species.upper(), strain.upper(), sex_upper,
             organ_upper, finding_lower),
        ).fetchone()
        if row:
            return self._mi_row_to_dict(row)

        # Tier 4: substring match on finding (for partial terminology alignment)
        rows = conn.execute(
            """SELECT * FROM hcd_mi_incidence
               WHERE species = ? AND strain = ? AND sex = ?
               AND organ = ?
               AND (LOWER(finding) LIKE ? OR ? LIKE '%' || LOWER(finding) || '%')
               ORDER BY confidence ASC LIMIT 1""",
            (species.upper(), strain.upper(), sex_upper,
             organ_upper, f"%{finding_lower}%", finding_lower),
        ).fetchone()
        if rows:
            return self._mi_row_to_dict(rows)

        return None

    @staticmethod
    def _mi_row_to_dict(row: sqlite3.Row) -> dict:
        """Convert a sqlite3.Row from hcd_mi_incidence to a dict."""
        return {
            "species": row["species"],
            "strain": row["strain"],
            "sex": row["sex"],
            "organ": row["organ"],
            "finding": row["finding"],
            "severity": row["severity"],
            "n_studies": row["n_studies"],
            "n_animals": row["n_animals"],
            "n_affected": row["n_affected"],
            "mean_incidence_pct": row["mean_incidence_pct"],
            "sd_incidence_pct": row["sd_incidence_pct"],
            "min_incidence_pct": row["min_incidence_pct"],
            "max_incidence_pct": row["max_incidence_pct"],
            "duration_category": row["duration_category"],
            "source": row["source"],
            "confidence": row["confidence"],
        }

    # ------------------------------------------------------------------
    # HCD domain gaps (documented, no stub methods — no Phase 1 caller)
    # ------------------------------------------------------------------
    # FW HCD: No public source available. NTP DTT IAD does not include
    #   food/water consumption. CRO handbooks are proprietary.
    # EG/VS HCD: No structured public data. Safety pharmacology CV
    #   parameters (QT, HR, BP) are mostly proprietary CRO databases.
    #   Within-subject delta analysis makes population HCD less useful
    #   for EG/VS than for other domains.
    # ------------------------------------------------------------------

    @staticmethod
    def _row_to_dict(row: sqlite3.Row) -> dict:
        """Convert a sqlite3.Row from hcd_aggregates to a dict."""
        return {
            "organ": row["organ"],
            "sex": row["sex"],
            "duration_category": row["duration_category"],
            "mean": row["mean"],
            "sd": row["sd"],
            "n": row["n"],
            "lower": row["lower_2sd"],
            "upper": row["upper_2sd"],
            "source": f"sqlite:{row['strain']}",
            "p5": row["p5"],
            "p25": row["p25"],
            "median": row["median"],
            "p75": row["p75"],
            "p95": row["p95"],
            "study_count": row["study_count"],
        }


def get_sqlite_db() -> HcdSqliteDB:
    """Get or create the singleton HcdSqliteDB instance."""
    global _INSTANCE
    if _INSTANCE is None:
        _INSTANCE = HcdSqliteDB()
    return _INSTANCE
