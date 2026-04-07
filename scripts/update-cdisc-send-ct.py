"""Download and extract CDISC SEND Controlled Terminology from NCI-EVS.

Run manually or via cron to pick up quarterly releases.
Compares the downloaded version against metadata.json and exits early
if already up to date.

Usage:
    python scripts/update-cdisc-send-ct.py [--force]

Output:
    - scripts/data/source/cdisc-send-ct/SEND_Terminology_full.txt (raw download)
    - scripts/data/source/cdisc-send-ct/*.tsv (extracted codelists)
    - scripts/data/source/cdisc-send-ct/metadata.json (updated)
"""

import csv
import json
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

SEND_CT_URL = "https://evs.nci.nih.gov/ftp1/CDISC/SEND/SEND%20Terminology.txt"
BASE_DIR = Path(__file__).parent / "data" / "source" / "cdisc-send-ct"
META_PATH = BASE_DIR / "metadata.json"
FULL_FILE = BASE_DIR / "SEND_Terminology_full.txt"

# Codelists to extract and their output filenames.
CODELISTS = {
    "NONNEO.tsv": "Non-Neoplastic Finding Type",
    "NEOPLASM.tsv": "Neoplasm Type",
    "MI_MODIFIER.tsv": "Microscopic Findings Result Modifier",
    "LBTESTCD.tsv": "Laboratory Test Code",
    "EGTESTCD.tsv": "ECG Test Code",
    "VSTESTCD.tsv": "Vital Signs Test Code",
    "OMTESTCD.tsv": "Organ Measurement Test Code",
    "BWTESTCD.tsv": "Body Weight Test Code",
    "FWTESTCD.tsv": "Food and Water Consumption Test Code",
    "BGTESTCD.tsv": "Body Weight Gain Test Code",
    "CVTESTCD.tsv": "SEND Cardiovascular Test Code",
    "RETESTCD.tsv": "SEND Respiratory Test Code",
    "SPECIMEN.tsv": "Specimen",
    "FETAL_PATH.tsv": "Fetal Pathology Findings Result",
    "TFTESTCD.tsv": "Tumor Findings Test Code",
}


def download(url: str, dest: Path) -> int:
    """Download url to dest, return byte count."""
    print(f"Downloading {url} ...")
    urllib.request.urlretrieve(url, dest)
    size = dest.stat().st_size
    print(f"  -> {dest.name} ({size:,} bytes)")
    return size


def detect_version(full_path: Path) -> str:
    """Heuristic: first row's Codelist Name often contains the version date.

    Fallback: scan for a version pattern in the first 20 rows.
    """
    with open(full_path, encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter="\t")
        for i, row in enumerate(reader):
            # The NCI-EVS file sometimes has a preamble row with the version
            val = row.get("CDISC Submission Value", "")
            if val and "terminology" in val.lower():
                # e.g. "SEND Terminology 2026-03-27"
                parts = val.split()
                for p in parts:
                    if len(p) == 10 and p[4] == "-" and p[7] == "-":
                        return p
            if i > 20:
                break
    # Fallback: use file modification time
    return datetime.fromtimestamp(full_path.stat().st_mtime).strftime("%Y-%m-%d")


def extract_codelists(full_path: Path) -> dict[str, int]:
    """Read the full file and write per-codelist TSVs. Return {fname: count}."""
    rows: list[dict] = []
    with open(full_path, encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter="\t")
        fieldnames = reader.fieldnames
        for row in reader:
            rows.append(row)

    counts = {}
    for fname, codelist_name in CODELISTS.items():
        matching = [r for r in rows if r["Codelist Name"] == codelist_name]
        if not matching:
            print(f"  WARNING: codelist '{codelist_name}' not found")
            continue
        out_path = BASE_DIR / fname
        with open(out_path, "w", encoding="utf-8", newline="") as out:
            writer = csv.DictWriter(out, fieldnames=fieldnames, delimiter="\t")
            writer.writeheader()
            for r in matching:
                writer.writerow(r)
        counts[fname] = len(matching)
        print(f"  {fname}: {len(matching)} entries")
    return counts


def update_metadata(version: str, row_count: int, counts: dict[str, int]) -> None:
    """Write metadata.json with version, download info, and codelist counts."""
    # Compute next expected release (quarterly: +3 months from version date)
    try:
        vdate = datetime.strptime(version, "%Y-%m-%d")
        month = vdate.month + 3
        year = vdate.year + (month - 1) // 12
        month = (month - 1) % 12 + 1
        next_release = f"{year}-{month:02d}-{vdate.day:02d}"
    except ValueError:
        next_release = "unknown"

    meta = {
        "source": "NCI Enterprise Vocabulary Services (NCI-EVS)",
        "standard": "CDISC SEND Controlled Terminology",
        "version": version,
        "download_url": SEND_CT_URL,
        "download_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "full_file": "SEND_Terminology_full.txt",
        "full_file_rows": row_count,
        "release_cadence": "quarterly (March, June, September, December)",
        "next_expected_release": next_release,
        "license": "Public domain (NCI/NIH)",
        "update_command": "python scripts/update-cdisc-send-ct.py",
        "extracted_codelists": {
            fname: {
                "codelist": CODELISTS[fname],
                "entries": count,
            }
            for fname, count in sorted(counts.items())
        },
    }
    with open(META_PATH, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)
        f.write("\n")
    print(f"  metadata.json updated (version {version})")


def main() -> None:
    force = "--force" in sys.argv

    # Check current version
    current_version = None
    if META_PATH.exists():
        with open(META_PATH) as f:
            current_version = json.load(f).get("version")

    # Download
    download(SEND_CT_URL, FULL_FILE)

    # Detect version
    version = detect_version(FULL_FILE)
    row_count = sum(1 for _ in open(FULL_FILE, encoding="utf-8")) - 1  # minus header

    if version == current_version and not force:
        print(f"Already up to date (version {version}). Use --force to re-extract.")
        return

    if current_version:
        print(f"Updating: {current_version} -> {version}")
    else:
        print(f"Initial download: version {version}")

    # Extract codelists
    print("Extracting codelists:")
    counts = extract_codelists(FULL_FILE)

    # Update metadata
    update_metadata(version, row_count, counts)

    print(f"\nDone. {len(counts)} codelists extracted, {sum(counts.values())} total entries.")
    print("Next step: run `python scripts/build_synonym_dictionary.py` to rebuild finding-synonyms.json")


if __name__ == "__main__":
    main()
