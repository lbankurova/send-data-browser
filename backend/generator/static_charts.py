"""Generate styled HTML for static visualizations.

Produces self-contained HTML files with inline CSS that can be embedded
in the frontend via dangerouslySetInnerHTML.
"""

import html


def generate_target_organ_bar_chart(target_organs: list[dict]) -> str:
    """Generate a styled horizontal bar chart of target organ evidence scores.

    Args:
        target_organs: list from build_target_organ_summary()

    Returns:
        HTML string with inline CSS.
    """
    if not target_organs:
        return "<div style='padding:16px;color:#888;font-size:13px;'>No target organ data available.</div>"

    # Sort by evidence_score descending
    sorted_organs = sorted(target_organs, key=lambda o: o["evidence_score"], reverse=True)
    max_score = max(o["evidence_score"] for o in sorted_organs) if sorted_organs else 1

    threshold = 0.3  # target organ threshold

    rows_html = []
    for organ in sorted_organs:
        score = organ["evidence_score"]
        pct = (score / max_score * 100) if max_score > 0 else 0

        # Color: green below threshold, red above
        if score >= threshold:
            bar_color = "#ef4444"  # red-500
            label_color = "#dc2626"
        else:
            bar_color = "#22c55e"  # green-500
            label_color = "#16a34a"

        # Flag indicator
        flag = " *" if organ.get("target_organ_flag") else ""

        organ_name = html.escape(organ["organ_system"].replace("_", " ").title())
        detail = f"{organ['n_endpoints']} endpoints, {organ['n_domains']} domains"

        rows_html.append(f"""
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <div style="width:120px;text-align:right;font-size:12px;color:#374151;font-weight:500;flex-shrink:0;">
            {organ_name}{flag}
          </div>
          <div style="flex:1;background:#f3f4f6;border-radius:4px;height:22px;position:relative;overflow:hidden;">
            <div style="width:{pct:.1f}%;background:{bar_color};height:100%;border-radius:4px;transition:width 0.3s;"></div>
            <span style="position:absolute;right:6px;top:3px;font-size:10px;color:#6b7280;">
              {score:.2f}
            </span>
          </div>
          <div style="width:140px;font-size:10px;color:#9ca3af;flex-shrink:0;">
            {detail}
          </div>
        </div>""")

    return f"""<div style="font-family:system-ui,-apple-system,sans-serif;padding:12px 0;">
  <div style="font-size:13px;font-weight:600;color:#1f2937;margin-bottom:12px;">
    Target Organ Evidence Scores
  </div>
  <div style="font-size:10px;color:#9ca3af;margin-bottom:8px;">
    Threshold for target organ designation: {threshold} &nbsp;|&nbsp;
    <span style="color:{bar_color};">&#9632;</span> Above threshold &nbsp;
    <span style="color:#22c55e;">&#9632;</span> Below threshold
  </div>
  {"".join(rows_html)}
</div>"""
