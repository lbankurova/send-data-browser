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

        return {
            "available": True,
            "strains": strains,
            "organs": organs,
            "duration_categories": durations,
            "total_aggregates": total_agg,
            "total_animal_records": total_animals,
        }

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
