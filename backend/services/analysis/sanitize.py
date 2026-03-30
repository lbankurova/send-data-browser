"""Shared NaN/Inf sanitization for JSON serialization.

Replaces NaN/Inf with None and converts numpy types to Python types.
Used by generate.py (pre-generation) and parameterized_pipeline.py (on-demand).
"""

import math

import numpy as np


def sanitize(obj):
    """Replace NaN/Inf with None, convert numpy types to Python natives.

    Handles: np.integer, np.bool_, np.floating, np.ndarray, float,
    dict, list, tuple, set. Returns input unchanged for other types.
    """
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.bool_,)):
        return bool(obj)
    if isinstance(obj, (float, np.floating)):
        val = float(obj)
        return None if (math.isnan(val) or math.isinf(val)) else val
    if isinstance(obj, np.ndarray):
        return sanitize(obj.tolist())
    if isinstance(obj, dict):
        return {k: sanitize(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [sanitize(v) for v in obj]
    if isinstance(obj, set):
        return sorted(sanitize(v) for v in obj)
    return obj
