"""Load supplemental SEND domains: RELREC (relationship records) and CO (comments).

These domains provide cross-domain linkages and narrative annotations that
enrich the findings pipeline.
"""

import pandas as pd

from services.study_discovery import StudyInfo
from services.xpt_processor import read_xpt


def load_relrec_links(study: StudyInfo) -> dict[tuple[str, str, int], list[tuple[str, int]]]:
    """Load RELREC domain and build a cross-domain linkage map.

    Returns {(domain, subject_id, seq): [(linked_domain, linked_seq), ...]} for
    all cross-domain relationships.  Keys include subject_id because SEQ values
    are per-subject, not globally unique.
    """
    if "relrec" not in study.xpt_files:
        return {}

    try:
        df, _ = read_xpt(study.xpt_files["relrec"])
        df.columns = [c.upper() for c in df.columns]
    except Exception:
        return {}

    if "RDOMAIN" not in df.columns or "IDVAR" not in df.columns or "IDVARVAL" not in df.columns:
        return {}

    # RELREC links records via RELID — records sharing the same (USUBJID, RELID) are linked.
    # Each row: (RDOMAIN, USUBJID, IDVAR, IDVARVAL, RELID) identifies one end of a link.
    if "RELID" not in df.columns:
        return {}

    has_usubjid = "USUBJID" in df.columns

    # Parse: group by (USUBJID, RELID), then create pairwise links between members
    links: dict[tuple[str, str, int], list[tuple[str, int]]] = {}

    group_cols = ["USUBJID", "RELID"] if has_usubjid else ["RELID"]
    for _key, group in df.groupby(group_cols):
        subject_id = str(group["USUBJID"].iloc[0]).strip() if has_usubjid else ""
        members: list[tuple[str, int]] = []
        for _, row in group.iterrows():
            domain = str(row["RDOMAIN"]).strip().upper()
            try:
                seq = int(float(row["IDVARVAL"]))
            except (ValueError, TypeError):
                continue
            members.append((domain, seq))

        # Create pairwise links (all members linked to all others)
        for i, src in enumerate(members):
            for j, tgt in enumerate(members):
                if i != j and src[0] != tgt[0]:  # cross-domain only
                    links.setdefault((src[0], subject_id, src[1]), []).append(tgt)

    return links


def load_comments(study: StudyInfo) -> dict[tuple[str, str, int], list[dict[str, str]]]:
    """Load CO domain comments and index by (domain, subject_id, seq).

    Key includes subject_id because SEQ values (e.g., MISEQ) are per-subject,
    not globally unique — different subjects can share the same SEQ number for
    different records.

    Returns {(domain, subject_id, seq): [{text, subject_id}, ...]}.
    """
    if "co" not in study.xpt_files:
        return {}

    try:
        df, _ = read_xpt(study.xpt_files["co"])
        df.columns = [c.upper() for c in df.columns]
    except Exception:
        return {}

    if "RDOMAIN" not in df.columns or "COVAL" not in df.columns:
        return {}

    comments: dict[tuple[str, str, int], list[dict[str, str]]] = {}

    for _, row in df.iterrows():
        rdomain = str(row.get("RDOMAIN", "")).strip().upper()
        if not rdomain:
            continue

        try:
            seq = int(float(row.get("IDVARVAL", "")))
        except (ValueError, TypeError):
            continue

        subject_id = str(row.get("USUBJID", "")).strip() if "USUBJID" in df.columns else ""
        if not subject_id or subject_id == "nan":
            continue

        coval = str(row.get("COVAL", "")).strip()
        coval1 = str(row.get("COVAL1", "")).strip() if "COVAL1" in df.columns else ""
        text = f"{coval} {coval1}".strip() if coval1 and coval1 != "nan" else coval

        if text and text != "nan":
            comments.setdefault((rdomain, subject_id, seq), []).append({
                "text": text,
                "subject_id": subject_id,
            })

    return comments
