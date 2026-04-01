"""Adapter selection — routes studies to the correct design adapter.

Priority:
  1. Semicolon-delimited TRTDOS in TX domain -> crossover/escalation
  2. study_type_config.statistical_mode from shared/study-types/*.json matched via TS.STYPE
  3. Default: ParallelDesignAdapter
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from services.study_discovery import StudyInfo
from services.xpt_processor import read_xpt
from generator.adapters.base import StudyDesignAdapter

log = logging.getLogger(__name__)

_STUDY_TYPE_CONFIGS_DIR = Path(__file__).parent.parent.parent.parent / "shared" / "study-types"


def _has_semicolon_trtdos(study: StudyInfo) -> bool:
    """Check if any TX.TRTDOS value contains semicolons (crossover/escalation signal)."""
    if "tx" not in study.xpt_files:
        return False
    try:
        tx_df, _ = read_xpt(study.xpt_files["tx"])
        tx_df.columns = [c.upper() for c in tx_df.columns]
        trtdos_rows = tx_df[tx_df["TXPARMCD"].str.upper() == "TRTDOS"]
        if trtdos_rows.empty:
            return False
        return trtdos_rows["TXVAL"].str.contains(";").any()
    except Exception:
        return False


def _is_escalation(study: StudyInfo) -> bool:
    """Check if crossover study is actually dose-escalation (all subjects share one sequence).

    Escalation: every SETCD has the same TRTDOS sequence.
    Latin square crossover: SETCDs have different sequences.
    """
    if "tx" not in study.xpt_files:
        return False
    try:
        tx_df, _ = read_xpt(study.xpt_files["tx"])
        tx_df.columns = [c.upper() for c in tx_df.columns]
        trtdos_rows = tx_df[tx_df["TXPARMCD"].str.upper() == "TRTDOS"]
        if trtdos_rows.empty:
            return False
        sequences = set(trtdos_rows["TXVAL"].str.strip())
        return len(sequences) == 1
    except Exception:
        return False


def _get_statistical_mode_from_config(study: StudyInfo) -> str | None:
    """Match TS.STYPE against shared/study-types/*.json configs.

    Returns the statistical_mode if a matching config is found, else None.
    """
    if not _STUDY_TYPE_CONFIGS_DIR.is_dir():
        return None

    # Read TS.STYPE from study
    if "ts" not in study.xpt_files:
        return None

    try:
        ts_df, _ = read_xpt(study.xpt_files["ts"])
        ts_df.columns = [c.upper() for c in ts_df.columns]
        stype_rows = ts_df[ts_df["TSPARMCD"].str.upper().isin(("STYPE", "SSTYP"))]
        if stype_rows.empty:
            return None
        stype_val = str(stype_rows["TSVAL"].iloc[0]).strip().upper()
    except Exception:
        return None

    # Match against each config file
    for config_path in _STUDY_TYPE_CONFIGS_DIR.glob("*.json"):
        try:
            with open(config_path) as f:
                config = json.load(f)
            ts_values = [v.upper() for v in config.get("ts_stype_values", [])]
            if stype_val in ts_values:
                mode = config.get("statistical_mode")
                if mode:
                    log.info("Study type config match: %s -> %s", config_path.stem, mode)
                    return mode
        except Exception:
            continue

    return None


def get_classification_framework(study: StudyInfo) -> str | None:
    """Return the classification_framework from the matching study type config.

    Returns "noel" for safety pharmacology studies, None for standard tox
    (which uses the default ECETOC/NOAEL framework).
    """
    if not _STUDY_TYPE_CONFIGS_DIR.is_dir():
        return None
    if "ts" not in study.xpt_files:
        return None
    try:
        ts_df, _ = read_xpt(study.xpt_files["ts"])
        ts_df.columns = [c.upper() for c in ts_df.columns]
        stype_rows = ts_df[ts_df["TSPARMCD"].str.upper().isin(("STYPE", "SSTYP"))]
        if stype_rows.empty:
            return None
        stype_val = str(stype_rows["TSVAL"].iloc[0]).strip().upper()
    except Exception:
        return None
    for config_path in _STUDY_TYPE_CONFIGS_DIR.glob("*.json"):
        try:
            with open(config_path) as f:
                config = json.load(f)
            ts_values = [v.upper() for v in config.get("ts_stype_values", [])]
            if stype_val in ts_values:
                return config.get("classification_framework")
        except Exception:
            continue
    return None


def select_adapter(study: StudyInfo) -> StudyDesignAdapter:
    """Select design adapter based on study metadata.

    Priority:
      1. Semicolon-delimited TRTDOS in TX domain (strongest signal)
      2. study_type_config.statistical_mode matched via TS.STYPE
      3. Default: ParallelDesignAdapter
    """
    # Priority 1: TX domain heuristic
    if _has_semicolon_trtdos(study):
        from generator.adapters.crossover import CrossoverDesignAdapter
        return CrossoverDesignAdapter(is_escalation=_is_escalation(study))

    # Priority 2: study_type_config match
    mode = _get_statistical_mode_from_config(study)
    if mode == "within_animal_crossover":
        from generator.adapters.crossover import CrossoverDesignAdapter
        return CrossoverDesignAdapter(is_escalation=False)

    from generator.adapters.parallel import ParallelDesignAdapter
    return ParallelDesignAdapter()
