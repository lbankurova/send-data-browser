"""Public tokenization helper for MI/MA/CL finding terms.

Standalone module extracted per R1 F3 so that `term_suggestions.py` and
`term_collisions.py` can share a single tokenizer without private
cross-module imports or circular-import risk.
"""

from __future__ import annotations

import re

# Split on whitespace and all punctuation; drop empty tokens. Matches the
# tokenizer assumed by research section 3.2 / 5.2.
_TOKEN_SPLIT_RE = re.compile(r"[^A-Z0-9]+")


def _depluralize(token: str) -> str:
    """Trailing-S stemmer used by tokenize_term.

    Only applied to tokens of length >= 4 so that short words like 'IS',
    'OS', 'NOS' are preserved. No dictionary lookup — a pure syntactic
    rule. Intent: FOLDS -> FOLD so "RETINAL FOLDS" and "RETINAL FOLD"
    share tokens under Jaccard.
    """
    if len(token) >= 4 and token.endswith("S") and not token.endswith("SS"):
        return token[:-1]
    return token


def tokenize_term(raw: str) -> list[str]:
    """Return the normalized token list for a MI/MA/CL term.

    Upper-cases, strips, splits on non-alphanumeric runs, drops empties,
    applies a light trailing-S stemmer per token (len>=4, non-'SS' endings).
    Deterministic — same input returns same token list every call.
    """
    if not raw:
        return []
    upper = raw.upper().strip()
    if not upper:
        return []
    return [_depluralize(tok) for tok in _TOKEN_SPLIT_RE.split(upper) if tok]
