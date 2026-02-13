# **Histopathology UX fix**

Right now the view answers:

“What are the microscopic findings and how severe are they across dose groups?”

But cognitively, the user workflow is actually:

1. Which organ/specimen is most concerning?

2. Is it treatment-related?

3. Is it dose-related?

4. Is it sex-specific?

5. What is the regulatory implication?

Your layout already supports this — but the **signal hierarchy isn’t fully aligned with that mental flow**.

The biggest opportunity:

Make “is this treatment-related and dose-driven?” visually obvious within 3 seconds.

---

# **2️⃣ Specimen Rail – Improve Risk Scanning**

### **Current**

* Sorted by maxSeverity → adverseCount → findingCount

* Neutral severity bar (gray)

* Left border intentionally neutral

This is clean — but slightly under-signaled.

---

## **🔧 Improvements**

### **A. Add Micro-Dose Signal Indicator**

Right now, rail sorting uses maxSeverity. But regulatory concern is more about:

* Dose consistency

* Adverse \+ dose-driven

👉 Add a tiny **dose-trend glyph** on the right side of each rail row:

* ▲ Strong monotonic trend

* ▴ Moderate

* · Weak

Color:

* Strong → dark neutral

* Weak → muted

This doesn’t break your neutral aesthetic but adds directionality.

---

### **B. Make Severity Bar Meaningful (Without Going Red)**

Currently:

* Gray fill for severity

Instead of red, use **neutral contrast scaling**:

| Severity | Rail bar |
| ----- | ----- |
| 1 | very light gray |
| 5 | dark gray |

This preserves your “no alarmism” philosophy but improves pre-attentive scanning.

---

### **C. Add Quick Adverse Ratio Cue**

Instead of:

`{N} findings · {M} adverse`

Add:

`3 findings · 1 adverse (33%)`

Pathologists think in proportions.

---

# **3️⃣ Specimen Header – Strong Opportunity**

This is where your UX can become world-class.

Current:

* 1-line deterministic conclusion

* Compact metrics

It’s clean but slightly passive.

---

## **🔥 Upgrade: Structured Clinical Summary Row**

Instead of pure sentence:

“Low-incidence, non-adverse, male only…”

Consider splitting into structured summary blocks:

`Incidence: Low (12%)`  
`Severity: Max 3 (Moderate)`  
`Sex: Male only`  
`Dose trend: Weak`  
`Assessment: Non-adverse`

Then below that, keep the narrative sentence.

Why?

* Structured summary improves regulatory defensibility

* It allows scanning across specimens

* It aligns with how pathologists actually think

---

## **Add One More Field: “Treatment-related?”**

Even if stubbed initially:

`Treatment-related: Likely | Possible | Unlikely`

This becomes central over time.

---

# **4️⃣ Overview Tab – Improve Finding Selection UX**

Currently:

* Findings sorted by max avg severity

* Click to select

* Heatmap style selection

This is good.

---

## **🔧 Improvements**

### **A. Add Finding Severity Icon**

Instead of small text severity:

Add left-side tiny severity chip:

`[3] Hepatocellular hypertrophy`

Where `[3]` is a small rounded square using neutral heat scale.

Much faster scanning.

---

### **B. Highlight Dose-Driven Findings**

If `getDoseConsistency()` is Strong:

Add subtle badge:

`Dose-driven`

Muted but visible.

Pathologists care deeply about monotonicity.

---

### **C. Cross-Organ Coherence – Elevate It**

Currently it’s a single muted text line.

This is actually powerful signal.

Instead of:

Convergent findings…

Use a small collapsible info card:

`⚠ Cross-organ coherence detected`  
`- Liver and Kidney share degenerative pattern`

This makes R16-based insight feel important rather than decorative.

---

# **5️⃣ Severity Matrix Tab – Where the Real Work Happens**

This is the heart of the view.

You already did something strong:

* Group vs Subject toggle

* Heatmap

* Collapsible grid

Now let's improve interpretation speed.

---

## **🔥 A. Add Incidence Overlay Mode**

Currently group heatmap shows severity.

But pathologists think in:

Incidence first, severity second.

Add small toggle:

`View: [ Severity | Incidence ]`

Incidence mode:

* Cell shows % instead of avg severity

* Color based on % (neutral grayscale)

This dramatically improves signal.

---

## **🔥 B. Improve Dose Consistency Badge**

Current:

`Dose consistency: Strong`

Upgrade to visual ramp:

`Dose consistency: Strong ▲▲▲`

Or tiny monotonic sparkline per finding.

This avoids users needing to mentally compute trend.

---

## **🔥 C. Subject Mode – Very Strong, One Enhancement**

Currently:

* Subject ID columns

* Severity blocks

* Sex row

Add:

👉 Toggle: “Show only affected subjects”

This reduces clutter in large studies.

---

# **6️⃣ Lesion Severity Grid – Reduce It Slightly**

Right now:

* 9 columns

* 200 row cap

* Resizable

This is fine.

But consider:

### **Hide "domain" column**

It’s redundant inside specimen view.

### **Make Incidence clickable**

Clicking incidence % could:

* Highlight heatmap row

* Jump to subject mode filtered

---

# **7️⃣ Hypotheses Tab – Needs One Conceptual Upgrade**

This tab is powerful but slightly under-integrated.

Right now tools feel separate from the matrix.

Instead:

👉 When user selects finding in heatmap,  
 Auto-load relevant hypothesis tool context.

For example:

* Selecting finding auto-opens Severity Distribution tool with that finding pre-loaded.

This reduces mode switching.

---

# **8️⃣ Context Panel – One High-Impact Change**

Current:  
 Panes ordered well (insights \> stats \> related \> annotation).

But selection UX could improve.

### **🔥 Add Severity Timeline Mini Chart**

In Dose detail pane:

Add tiny horizontal severity trend bar:

`Control ░`  
`Low     ▒`  
`Mid     ▓`  
`High    █`

Even ASCII-style visually communicates ramp.

No need for full viewer — micro visualization works.

---

# **9️⃣ Missing UX Layer: Risk Framing**

Your UI is scientifically rigorous — but not yet decision-optimized.

Consider adding at top of header:

`Overall risk signal: Low / Moderate / High`

Computed from:

* Max severity

* Dose consistency

* Adverse count

* Incidence

This becomes extremely powerful in regulatory settings.

---

# **10️⃣ Advanced Structural Suggestion**

Right now specimen is the primary axis.

Long term you may want two modes:

`View by:`  
`● Specimen`  
`○ Finding`

Finding-centric mode lets users ask:

Where else does hepatocellular hypertrophy appear?

But this is v2.

