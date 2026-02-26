"""Shared day-extraction helpers for domain finding modules."""
import pandas as pd


def mode_day(grp: pd.DataFrame, col: str) -> int | None:
    """Most common day value in *col*, or None."""
    if col not in grp.columns:
        return None
    vals = pd.to_numeric(grp[col], errors="coerce").dropna()
    if vals.empty:
        return None
    return int(vals.mode().iloc[0])


def min_day(grp: pd.DataFrame, col: str) -> int | None:
    """Earliest day value in *col*, or None."""
    if col not in grp.columns:
        return None
    vals = pd.to_numeric(grp[col], errors="coerce").dropna()
    if vals.empty:
        return None
    return int(vals.min())
