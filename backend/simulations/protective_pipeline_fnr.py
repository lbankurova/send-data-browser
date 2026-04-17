"""Full-pipeline FNR simulation for the protective syndrome engine.

Models the complete R18-R25 detection path:
  term match -> PEX filter -> magnitude floor -> Boschloo+Bayesian AND-gate

Each stage is a filter with a miss/exclusion probability. The AND-gate uses
exact Boschloo + Bayesian posterior (Jeffreys Beta(0.5,0.5)) + spared-cases,
same as the shipped engine.

Run via:
  C:/pg/pcc/backend/venv/Scripts/python.exe backend/simulations/protective_pipeline_fnr.py
"""

import sys
import numpy as np
from scipy.stats import boschloo_exact


def bayes_p_less(c_pos, c_n, t_pos, t_n, draws=100_000, seed=42):
    """P(treat rate < ctrl rate) under Jeffreys Beta(0.5,0.5) prior."""
    rng = np.random.default_rng(seed)
    c = rng.beta(0.5 + c_pos, 0.5 + c_n - c_pos, draws)
    t = rng.beta(0.5 + t_pos, 0.5 + t_n - t_pos, draws)
    return float(np.mean(t < c))


def and_gate(c_pos, c_n, t_pos, t_n):
    """AND-gate: Boschloo p<0.05 AND Bayesian P>0.95 AND spared >= threshold.

    Returns (passes, reject_reason) where reject_reason is None if passes,
    or one of 'spared', 'boschloo', 'bayesian'.
    """
    spared = c_pos - t_pos
    spared_min = 3 if c_n >= 10 else 2

    # Fast reject: spared cases (cheapest check)
    if spared < spared_min:
        return False, "spared"

    # Boschloo (expensive)
    tbl = [[c_pos, c_n - c_pos], [t_pos, t_n - t_pos]]
    try:
        p_bosch = boschloo_exact(tbl, alternative="greater").pvalue
        if np.isnan(p_bosch):
            p_bosch = 1.0
    except (ValueError, ZeroDivisionError):
        p_bosch = 1.0

    if p_bosch >= 0.05:
        return False, "boschloo"

    # Bayesian
    p_bayes = bayes_p_less(c_pos, c_n, t_pos, t_n)
    if p_bayes <= 0.95:
        return False, "bayesian"

    return True, None


def run_pipeline_simulation():
    rng = np.random.default_rng(2026)
    nsim = 300

    # Effect-size scenarios: (label, ctrl_rate, treat_rate)
    scenarios = [
        ("30pp drop, ctrl=0.50", 0.50, 0.20),
        ("30pp drop, ctrl=0.70", 0.70, 0.40),
        ("40pp drop, ctrl=0.60", 0.60, 0.20),
        ("40pp drop, ctrl=0.80", 0.80, 0.40),
        ("50pp drop, ctrl=0.70", 0.70, 0.20),
        ("50pp drop, ctrl=0.90", 0.90, 0.40),
    ]

    sample_sizes = [8, 10, 15, 20]

    stage_configs = [
        ("optimistic",  {"p_term": 0.95, "p_pex_pass": 0.95, "p_mag_pass": 0.90}),
        ("realistic",   {"p_term": 0.85, "p_pex_pass": 0.90, "p_mag_pass": 0.80}),
        ("pessimistic", {"p_term": 0.75, "p_pex_pass": 0.85, "p_mag_pass": 0.70}),
    ]

    W = sys.stdout.write
    W("=" * 90 + "\n")
    W("Protective syndrome full-pipeline FNR simulation\n")
    W("Pipeline: term_match -> PEX -> magnitude_floor -> AND-gate\n")
    W("AND-gate: Boschloo p<0.05 AND Bayesian P>0.95 AND spared>=2 (>=3 at N>=10)\n")
    W("Draws per cell: %d\n" % nsim)
    W("=" * 90 + "\n")

    all_configs_data = {}

    for config_name, cfg in stage_configs:
        W("\n" + "-" * 90 + "\n")
        W("Stage config: %s\n" % config_name)
        W("  p_term_match=%.2f  p_pex_pass=%.2f  p_mag_pass=%.2f\n" % (
            cfg["p_term"], cfg["p_pex_pass"], cfg["p_mag_pass"]))
        W("-" * 90 + "\n")

        hdr = "%-28s" % "Scenario"
        for n in sample_sizes:
            hdr += "  N=%-20d" % n
        W(hdr + "\n")
        W("-" * len(hdr) + "\n")

        summary_by_n = {n: [] for n in sample_sizes}

        for label, pc, pt in scenarios:
            row = "%-28s" % label
            for n in sample_sizes:
                survived_term = 0
                survived_pex = 0
                survived_mag = 0
                survived_gate = 0

                for _ in range(nsim):
                    if rng.random() > cfg["p_term"]:
                        continue
                    survived_term += 1

                    if rng.random() > cfg["p_pex_pass"]:
                        continue
                    survived_pex += 1

                    if rng.random() > cfg["p_mag_pass"]:
                        continue
                    survived_mag += 1

                    c_pos = int(rng.binomial(n, pc))
                    t_pos = int(rng.binomial(n, pt))
                    passes, _ = and_gate(c_pos, n, t_pos, n)
                    if passes:
                        survived_gate += 1

                power = survived_gate / nsim
                summary_by_n[n].append(power)

                kill_term = nsim - survived_term
                kill_pex = survived_term - survived_pex
                kill_mag = survived_pex - survived_mag
                kill_gate = survived_mag - survived_gate
                row += "  %4.0f%% (%3d/%3d/%3d/%3d)" % (
                    power * 100, kill_term, kill_pex, kill_mag, kill_gate)

            W(row + "\n")
            sys.stdout.flush()

        W("\n")
        means = {}
        summary_row = "%-28s" % "MEAN POWER"
        for n in sample_sizes:
            m = np.mean(summary_by_n[n])
            means[n] = m
            summary_row += "  %4.0f%%                   " % (m * 100)
        W(summary_row + "\n")

        fnr_row = "%-28s" % "MEAN FNR"
        for n in sample_sizes:
            fnr_row += "  %4.0f%%                   " % ((1 - means[n]) * 100)
        W(fnr_row + "\n")

        all_configs_data[config_name] = means

    # --- Gate-only comparison ---
    W("\n" + "=" * 90 + "\n")
    W("COMPARISON: AND-gate only (no term/PEX/magnitude filtering)\n")
    W("=" * 90 + "\n")

    hdr = "%-28s" % "Scenario"
    for n in sample_sizes:
        hdr += "  N=%-6d" % n
    W(hdr + "\n")
    W("-" * len(hdr) + "\n")

    gate_summary = {n: [] for n in sample_sizes}
    for label, pc, pt in scenarios:
        row = "%-28s" % label
        for n in sample_sizes:
            hits = 0
            for _ in range(nsim):
                c_pos = int(rng.binomial(n, pc))
                t_pos = int(rng.binomial(n, pt))
                passes, _ = and_gate(c_pos, n, t_pos, n)
                if passes:
                    hits += 1
            power = hits / nsim
            gate_summary[n].append(power)
            row += "  %4.0f%%  " % (power * 100)
        W(row + "\n")
        sys.stdout.flush()

    W("\n")
    gate_means = {}
    gate_row = "%-28s" % "MEAN GATE-ONLY POWER"
    for n in sample_sizes:
        m = np.mean(gate_summary[n])
        gate_means[n] = m
        gate_row += "  %4.0f%%  " % (m * 100)
    W(gate_row + "\n")

    # --- Delta ---
    W("\n" + "-" * 90 + "\n")
    W("PRE-GATE STAGE TAX (percentage points of power lost to term/PEX/mag)\n")
    W("-" * 90 + "\n")
    for config_name in ("optimistic", "realistic", "pessimistic"):
        pipe = all_configs_data[config_name]
        row = "%-28s" % config_name
        for n in sample_sizes:
            delta = (gate_means[n] - pipe[n]) * 100
            row += "  %+5.1fpp " % delta
        W(row + "\n")

    W("\nLegend:\n")
    W("  kill columns = (term_miss / pex_kill / mag_kill / gate_kill)\n")
    W("  Each number = how many of %d draws that stage removed.\n" % nsim)
    W("  FNR > 50%% at N=10 with 40pp effect -> gate too conservative.\n")
    W("  FNR < 20%% -> engine viable for that scenario.\n")


if __name__ == "__main__":
    run_pipeline_simulation()
