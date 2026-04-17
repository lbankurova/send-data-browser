"""
Generate learn-more.html from capabilities.yaml.

Produces a self-contained HTML page -- plain rendered markdown with a sidebar TOC.
Linked from the app's landing page "Learn more" link.

Usage:
    cd C:/pg/pcc && backend/venv/Scripts/python.exe scripts/generate-wiki.py
"""

import html
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
INPUT = ROOT / "docs" / "_internal" / "capabilities.yaml"
OUTPUT = ROOT / "frontend" / "public" / "learn-more.html"

# ---------------------------------------------------------------------------
# TOC labels (sentence case)
# ---------------------------------------------------------------------------
PILLAR_TOC = {
    "study-design-interpretation": "Study design",
    "browse-detect-signals": "Signal detection",
    "investigate-dose-response": "Dose-response",
    "assess-cross-domain": "Cross-domain patterns",
    "determine-safety": "Weight of evidence",
    "check-recovery": "Recovery",
    "investigate-subjects": "Subject-level analysis",
    "compare-across-studies": "Cross-study comparison",
    "validate-data": "Data quality",
    "export-report": "Export and reporting",
}

# ---------------------------------------------------------------------------
# Blurbs: pain-first, then pill.
# First sentence answers "what's in it for me" or "why this matters."
# ---------------------------------------------------------------------------
PILLAR_BLURBS = {
    "study-design-interpretation": (
        "Before you can trust any analysis, you need to know the tool understood "
        "your study correctly. SENDEX parses control groups, dose groups, TK "
        "satellites, recovery arms, and multi-compound layouts from your SEND "
        "data and shows you every interpretation decision it made -- with "
        "confidence levels. When the sponsor mislabeled a control or the CRO "
        "used a non-standard arm coding, you see the flag before it corrupts "
        "every downstream comparison."
    ),
    "browse-detect-signals": (
        "Manually screening hundreds of endpoints across 15 domains for "
        "treatment-related signals is the most time-consuming part of study "
        "evaluation. SENDEX scores every finding for treatment-relatedness "
        "using a 9-dimension confidence model -- statistical significance, "
        "dose-response pattern, cross-sex concordance, historical control "
        "context, and more -- so the findings most likely to matter surface "
        "first. You still make the call; you just don't have to hunt."
    ),
    "investigate-dose-response": (
        "Deciding whether a finding is treatment-related often comes down to "
        "the dose-response pattern: is there a clear monotonic increase with "
        "dose? Does the effect appear at the same timepoint across groups? "
        "SENDEX gives you interactive dose-response charts for every endpoint "
        "-- continuous and incidence -- with per-animal traces, time-course "
        "trajectories, and distribution plots so you can see the full picture "
        "without building separate analyses."
    ),
    "assess-cross-domain": (
        "A liver signal is stronger when ALT, AST, liver weight, and "
        "hepatocellular hypertrophy all point the same direction. SENDEX "
        "detects 47 cross-domain syndromes by correlating clinical pathology, "
        "histopathology, organ weights, and body weight -- with species-specific "
        "interpretation rules for dog, NHP, rabbit, and guinea pig physiology. "
        "The patterns you would assemble mentally across spreadsheets are "
        "computed and presented as a coherent picture."
    ),
    "determine-safety": (
        "Arriving at a defensible NOAEL is the core deliverable of most "
        "preclinical studies, yet the weight-of-evidence reasoning behind it "
        "often lives only in the toxicologist's head. SENDEX makes that "
        "reasoning explicit: which findings drive the NOAEL, how robust is it "
        "to individual animal exclusion, what is the confidence across "
        "statistical, dose-response, and historical control dimensions. When "
        "your expert judgement differs, you override the computed NOAEL and the "
        "rationale is preserved alongside the data."
    ),
    "check-recovery": (
        '"Did the finding reverse?" is a question asked for every adverse '
        "effect, and answering it usually means comparing terminal and recovery "
        "group means in a spreadsheet. SENDEX computes recovery verdicts "
        "automatically -- effect-size comparisons between cohorts, species-"
        "adjusted expected durations, and per-subject tracking -- so you can "
        "assess reversibility for every finding without manual calculation."
    ),
    "investigate-subjects": (
        "When a NOAEL hinges on one or two animals, you need to know who they "
        "are and whether they're outliers or sentinels. SENDEX provides "
        "leave-one-out sensitivity analysis (exclude an animal, see how "
        "conclusions change), outlier and sentinel detection (Qn z-scores, "
        "Hamada residuals, Everds triad), similarity clustering, and per-animal "
        "profiles that show every measurement and observation for a subject in "
        'one place. The question "which animals are driving this result" gets a '
        "concrete, quantitative answer."
    ),
    "compare-across-studies": (
        "Program-level safety assessment requires comparing findings across "
        "studies -- often conducted years apart at different CROs with "
        "different pathologists using different terminology. SENDEX normalizes "
        "pathologist language through a multi-source term recognition pipeline "
        "so the same finding is recognized across studies. Cross-study views "
        "for concordance, safety margins, and program-level dashboards are in "
        "active development."
    ),
    "validate-data": (
        "Bad data produces bad conclusions, and SEND datasets frequently "
        "arrive with coding errors, missing domains, or terminology "
        "inconsistencies. SENDEX runs study design checks, FDA-style data "
        "quality rules, CDISC CORE compliance validation, and domain-specific "
        "integrity checks before analysis begins -- so you catch problems "
        "before they become wrong conclusions."
    ),
    "export-report": (
        "The analysis is only as useful as your ability to share it. SENDEX "
        "generates structured reports covering key findings, NOAEL "
        "determination, organ system synthesis, and the statistical methods "
        "used -- ready for internal review or regulatory discussion. CSV and "
        "presentation-format export are coming next."
    ),
}


def esc(text: str) -> str:
    return html.escape(str(text), quote=True)


def sentence_label(key: str) -> str:
    s = key.replace("_", " ").replace("-", " ")
    return s[0].upper() + s[1:] if s else s


def strain_label(key: str) -> str:
    labels = {
        "rat_sd": "Rat (Sprague Dawley)",
        "rat_f344": "Rat (F344)",
        "rat_wistar": "Rat (Wistar)",
        "dog_beagle": "Dog (Beagle)",
        "nhp_cyno": "NHP (Cynomolgus)",
        "mouse_b6c3f1": "Mouse (B6C3F1)",
        "mouse_c57bl6": "Mouse (C57BL/6)",
        "mouse_cd1": "Mouse (CD-1)",
        "rabbit_nzw": "Rabbit (NZW)",
        "guinea_pig": "Guinea pig",
    }
    return labels.get(key, sentence_label(key))


# ---------------------------------------------------------------------------
# Minimal CSS -- just typography, tables, layout. No decoration.
# ---------------------------------------------------------------------------
CSS = """\
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
               "Helvetica Neue", Arial, sans-serif;
  color: #374151;
  background: #fff;
  line-height: 1.6;
  font-size: 14px;
}

a { color: #2083d5; text-decoration: none; }
a:hover { text-decoration: underline; }

/* Sidebar */
nav {
  position: fixed;
  top: 0; left: 0;
  width: 220px;
  height: 100vh;
  overflow-y: auto;
  border-right: 1px solid #d7dfe7;
  background: #fafbfc;
  padding: 20px 0;
  font-size: 13px;
}
nav .brand {
  padding: 0 16px 16px;
  font-weight: 700;
  font-size: 12px;
  color: #2083d5;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
nav ul { list-style: none; }
nav li a {
  display: block;
  padding: 3px 16px;
  color: #6b7280;
  border-left: 2px solid transparent;
}
nav li a:hover { color: #2083d5; text-decoration: none; }
nav li a.active { color: #2083d5; font-weight: 600; border-left-color: #2083d5; }
nav .sep { margin: 8px 16px; border-top: 1px solid #e5e7eb; }
nav .label {
  padding: 10px 16px 2px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #9ca3af;
}
nav .sub { padding-left: 28px; font-size: 12px; }

/* Main */
main {
  margin-left: 220px;
  max-width: 780px;
  padding: 32px 40px 64px;
}

h1 { font-size: 22px; font-weight: 700; color: #111827; margin: 0 0 4px; }
h2 { font-size: 17px; font-weight: 600; color: #111827; margin: 32px 0 6px; padding-top: 20px; border-top: 1px solid #e5e7eb; }
h3 { font-size: 14px; font-weight: 600; color: #374151; margin: 16px 0 4px; }
h2:first-child { border-top: none; padding-top: 0; margin-top: 0; }

p { margin: 6px 0; }
.lead { color: #6b7280; margin-bottom: 16px; }

ul, ol { margin: 4px 0 8px 20px; }
li { margin: 2px 0; }

/* Tables */
table { width: 100%; border-collapse: collapse; margin: 8px 0 12px; font-size: 13px; }
th { text-align: left; padding: 6px 10px; font-weight: 600; color: #6b7280; border-bottom: 1px solid #d7dfe7; background: #fafbfc; }
td { padding: 5px 10px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
td:first-child { font-weight: 500; white-space: nowrap; }

/* Coverage details */
details { margin: 6px 0; }
summary { font-size: 13px; color: #6b7280; cursor: pointer; }
summary:hover { color: #2083d5; }
details .inner { padding: 8px 0 4px 12px; border-left: 2px solid #e5e7eb; margin-top: 4px; }
details .inner table { font-size: 12px; }
details .inner p { font-size: 13px; }

/* Decisions table */
.decisions td:nth-child(2) { white-space: normal; }

.footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; }

@media (max-width: 800px) {
  nav { display: none; }
  main { margin-left: 0; padding: 20px 16px 40px; }
}
"""

JS = """\
document.addEventListener('DOMContentLoaded', function() {
  var links = document.querySelectorAll('nav a');
  var sections = [];
  links.forEach(function(a) {
    var id = a.getAttribute('href');
    if (id && id.startsWith('#')) {
      var el = document.getElementById(id.slice(1));
      if (el) sections.push({ el: el, link: a });
    }
  });
  if (!sections.length) return;
  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      var match = sections.find(function(s) { return s.el === entry.target; });
      if (match && entry.isIntersecting) {
        links.forEach(function(l) { l.classList.remove('active'); });
        match.link.classList.add('active');
      }
    });
  }, { rootMargin: '-10% 0px -80% 0px' });
  sections.forEach(function(s) { observer.observe(s.el); });
  links.forEach(function(a) {
    a.addEventListener('click', function(e) {
      var id = a.getAttribute('href');
      if (id && id.startsWith('#')) {
        e.preventDefault();
        var t = document.getElementById(id.slice(1));
        if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
});
"""


# ---------------------------------------------------------------------------
# Renderers
# ---------------------------------------------------------------------------

def render_sidebar(pillars: dict, dimensions: dict) -> str:
    o = ['<nav>', '  <div class="brand">SENDEX</div>', "  <ul>"]
    o.append('    <li><a href="#overview">Overview</a></li>')
    o.append('    <li class="sep"></li>')
    o.append('    <li class="label">Workflows</li>')
    for key in pillars:
        label = PILLAR_TOC.get(key, sentence_label(key))
        o.append(f'    <li><a href="#{esc(key)}">{esc(label)}</a></li>')
    o.append('    <li class="sep"></li>')
    o.append('    <li class="label">Reference</li>')
    ref_labels = {
        "hcd_matrix": "HCD coverage",
        "species_overrides": "Species overrides",
        "compound_profiles": "Compound classes",
        "study_type_routing": "Study types",
        "validation_studies": "Validation studies",
    }
    for key in dimensions:
        label = ref_labels.get(key, sentence_label(key))
        o.append(f'    <li><a class="sub" href="#ref-{esc(key)}">{esc(label)}</a></li>')
    o += ["  </ul>", "</nav>"]
    return "\n".join(o)


def render_hero() -> str:
    return """<h1 id="overview">SENDEX</h1>
<p class="lead">From SEND data to a defensible safety conclusion -- faster</p>
<p>Preclinical toxicologists spend days manually screening endpoints,
building dose-response charts, cross-referencing clinical path with
histopath, and assembling the weight-of-evidence narrative that
ultimately supports a NOAEL. Most of that work is mechanical -- and
most of it can be automated without taking the scientist out of the loop.</p>
<p><strong>SENDEX does the heavy lifting.</strong> Load your SEND data and
get automated signal detection, dose-response analysis, syndrome identification,
NOAEL determination, and recovery assessment -- all with transparent reasoning
you can inspect, challenge, and override. The expert judgement is yours.
The computation is ours.</p>
<p>15 SEND domains analyzed. 47 cross-domain syndromes.
30 compound class profiles. 9 confidence dimensions per finding.
6 species with interpretation rules. 5 study type adapters.</p>
"""


def render_pillar(key: str, data: dict) -> str:
    toc_label = PILLAR_TOC.get(key, sentence_label(key))
    question = data.get("question", "")
    blurb = PILLAR_BLURBS.get(key, "")
    workflow = data.get("workflow", [])
    decisions = data.get("decisions", {})
    sbd = data.get("state_by_dimension", {})

    o = [f'<h2 id="{esc(key)}">{esc(toc_label)}</h2>']

    if blurb:
        o.append(f"<p>{esc(blurb)}</p>")

    if workflow:
        o.append("<ol>")
        for step in workflow:
            o.append(f"  <li>{esc(step)}</li>")
        o.append("</ol>")

    if decisions:
        o.append("<h3>Automated decisions</h3>")
        o.append('<table class="decisions">')
        o.append("  <tr><th>Decision</th><th>What the engine does</th><th>Visible in UI</th></tr>")
        for dk, dv in decisions.items():
            label = sentence_label(dk)
            what = dv.get("what", "")
            ui = dv.get("ui_visible", "")
            o.append(
                f"  <tr><td>{esc(label)}</td>"
                f"<td>{esc(what)}</td>"
                f"<td>{esc(ui)}</td></tr>"
            )
        o.append("</table>")

    if sbd:
        o.append("<details>")
        o.append("  <summary>Coverage details</summary>")
        o.append('  <div class="inner">')
        o.append(render_state_by_dimension(sbd))
        o.append("  </div>")
        o.append("</details>")

    return "\n".join(o)


def render_state_by_dimension(sbd: dict) -> str:
    o = []
    for dim_key, dim_val in sbd.items():
        label = sentence_label(dim_key)
        if isinstance(dim_val, str):
            o.append(f"<p><strong>{esc(label)}:</strong> {esc(dim_val)}</p>")
        elif isinstance(dim_val, dict):
            o.append("<table>")
            o.append(f"  <tr><th>{esc(label)}</th><th>Coverage</th></tr>")
            for k, v in dim_val.items():
                o.append(f"  <tr><td>{esc(sentence_label(k))}</td><td>{esc(str(v))}</td></tr>")
            o.append("</table>")
        elif isinstance(dim_val, list):
            o.append(f"<p><strong>{esc(label)}:</strong></p><ul>")
            for item in dim_val:
                o.append(f"  <li>{esc(str(item))}</li>")
            o.append("</ul>")
    return "\n".join(o)


# ---------------------------------------------------------------------------
# Reference
# ---------------------------------------------------------------------------

def render_reference(dimensions: dict) -> str:
    o = ['<h2 id="reference">Reference</h2>']

    if "hcd_matrix" in dimensions:
        o.append(render_hcd_matrix(dimensions["hcd_matrix"]))
    if "species_overrides" in dimensions:
        o.append(render_kv_table("ref-species_overrides", "Species interpretation overrides",
                                 "Species", "Overrides", dimensions["species_overrides"]))
    if "compound_profiles" in dimensions:
        o.append(render_kv_table("ref-compound_profiles", "Compound class profiles",
                                 "Modality", "Coverage", dimensions["compound_profiles"]))
    if "study_type_routing" in dimensions:
        o.append(render_kv_table("ref-study_type_routing", "Study type routing",
                                 "Study type", "Configuration", dimensions["study_type_routing"]))
    if "validation_studies" in dimensions:
        o.append(render_kv_table("ref-validation_studies", "Validation studies",
                                 "Species", "Studies", dimensions["validation_studies"]))
    return "\n".join(o)


def render_hcd_matrix(data: dict) -> str:
    desc = data.get("description", "")
    note = data.get("note", "")
    headers = ["Strain", "Organ weights", "Clinical pathology", "Body weight", "MI/MA"]
    o = [f'<h3 id="ref-hcd_matrix">Historical control data coverage</h3>']
    if desc:
        o.append(f"<p>{esc(desc)}</p>")
    if note:
        o.append(f"<p>{esc(note)}</p>")
    o.append("<table>")
    o.append("  <tr>" + "".join(f"<th>{esc(h)}</th>" for h in headers) + "</tr>")
    for key, vals in data.items():
        if not isinstance(vals, list):
            continue
        label = strain_label(key)
        cells = "".join(f"<td>{esc(v)}</td>" for v in vals)
        o.append(f"  <tr><td>{esc(label)}</td>{cells}</tr>")
    o.append("</table>")
    return "\n".join(o)


def render_kv_table(id_: str, title: str, col1: str, col2: str, data: dict) -> str:
    desc = data.get("description", "")
    o = [f'<h3 id="{esc(id_)}">{esc(title)}</h3>']
    if desc:
        o.append(f"<p>{esc(desc)}</p>")
    o.append("<table>")
    o.append(f"  <tr><th>{esc(col1)}</th><th>{esc(col2)}</th></tr>")
    for key, val in data.items():
        if key == "description":
            continue
        if not isinstance(val, str):
            continue
        o.append(f"  <tr><td>{esc(sentence_label(key))}</td><td>{esc(val)}</td></tr>")
    o.append("</table>")
    return "\n".join(o)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    raw = yaml.safe_load(INPUT.read_text(encoding="utf-8"))
    pillars = raw.get("pillars", {})
    dimensions = raw.get("dimensions", {})

    parts = [
        "<!DOCTYPE html>",
        '<html lang="en">',
        "<head>",
        '  <meta charset="UTF-8">',
        '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
        "  <title>SENDEX capabilities</title>",
        f"  <style>\n{CSS}\n  </style>",
        "</head>",
        "<body>",
        render_sidebar(pillars, dimensions),
        "<main>",
        render_hero(),
    ]

    for key, data in pillars.items():
        parts.append(render_pillar(key, data))

    parts.append(render_reference(dimensions))

    parts += [
        '<div class="footer">Generated from capabilities.yaml</div>',
        "</main>",
        f"<script>\n{JS}\n</script>",
        "</body>",
        "</html>",
    ]

    html_out = "\n".join(parts)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(html_out, encoding="utf-8")
    print(f"Generated {OUTPUT} ({len(html_out):,} bytes, {len(pillars)} pillars, {len(dimensions)} dimensions)")


if __name__ == "__main__":
    main()
