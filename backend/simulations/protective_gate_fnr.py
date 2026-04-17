"""FNR power table for the protective syndrome gate (NF4).

Quantifies: at N=5, 8, 10, 15, 20 per group, what fraction of pre-defined
effect-size patterns fire under the AND-gate
  (Boschloo p<0.05 AND Bayesian P>0.95 AND >=2 spared cases).

Run via: C:/pg/pcc/backend/venv/Scripts/python.exe backend/simulations/protective_gate_fnr.py
"""

import numpy as np
from scipy.stats import boschloo_exact


def bayes_p(c_pos, c_n, t_pos, t_n, n=1_000_000, seed=42):
    rng = np.random.default_rng(seed)
    c = rng.beta(0.5 + c_pos, 0.5 + c_n - c_pos, n)
    t = rng.beta(0.5 + t_pos, 0.5 + t_n - t_pos, n)
    return float(np.mean(t < c))


def gate(c_pos, c_n, t_pos, t_n):
    tbl = [[c_pos, c_n - c_pos], [t_pos, t_n - t_pos]]
    p_bosch = boschloo_exact(tbl, alternative="greater").pvalue
    p_bayes = bayes_p(c_pos, c_n, t_pos, t_n)
    spared = c_pos - t_pos
    passes = (p_bosch < 0.05) and (p_bayes > 0.95) and (spared >= 2)
    return p_bosch, p_bayes, spared, passes


def main():
    print("=== Protective gate FNR power table ===")
    print("Gate: Boschloo p<0.05 AND Bayesian P>0.95 AND spared>=2")
    print()

    ns = [5, 8, 10, 15, 20]

    # Rounded canonical patterns at each N (incidence endpoint)
    cases = [
        ("30pp drop, baseline 40%", 0.40, 0.10),
        ("30pp drop, baseline 60%", 0.60, 0.30),
        ("30pp drop, baseline 80%", 0.80, 0.50),
        ("40pp drop, baseline 50%", 0.50, 0.10),
        ("40pp drop, baseline 70%", 0.70, 0.30),
        ("50pp drop, baseline 60%", 0.60, 0.10),
        ("50pp drop, baseline 80%", 0.80, 0.30),
        ("70pp drop, baseline 90%", 0.90, 0.20),
    ]

    header = "Case".ljust(32) + "  " + "  ".join(f"N={n:<12}" for n in ns)
    print(header)
    print("-" * len(header))

    rows = []
    for name, base, treat in cases:
        row = [name]
        for n in ns:
            c_pos = round(base * n)
            t_pos = round(treat * n)
            p_bosch, p_bayes, spared, passes = gate(c_pos, n, t_pos, n)
            mark = "PASS" if passes else "FAIL"
            row.append(f"{mark} {c_pos}/{n}v{t_pos}/{n}")
        print(name.ljust(32) + "  " + "  ".join(c.ljust(14) for c in row[1:]))
        rows.append((name, row[1:]))

    # Summary: fraction of the 8 effect-size cases that fire at each N
    print()
    print("=== Summary: fraction of 8 canonical effect-size patterns firing ===")
    for i, n in enumerate(ns):
        passes = sum(1 for _, cells in rows if cells[i].startswith("PASS"))
        print(f"  N={n:<3}  {passes}/8 = {passes/8*100:.0f}%  fire")

    # Additional: per-rule realistic scenarios
    print()
    print("=== Realistic per-rule scenarios at N=5 (non-rodent) and N=10 (rodent small) ===")
    per_rule_cases = [
        ("R20 mammary adenoma (25% ctrl -> 5% treat, 20pp)", 0.25, 0.05),
        ("R20 pituitary adenoma (35% ctrl -> 15% treat, 20pp)", 0.35, 0.15),
        ("R21 CPN 13w SD M (35% ctrl -> 15% treat, 20pp)", 0.35, 0.15),
        ("R21 CPN 13w SD M (40% ctrl -> 10% treat, 30pp)", 0.40, 0.10),
        ("R21 CPN chronic SD M (80% -> 50%, 30pp)", 0.80, 0.50),
        ("R21 CPN F344 M 90d (100% -> 60%, 40pp)", 1.00, 0.60),
        ("R22 CMP SD M (25% -> 10%, 15pp)", 0.25, 0.10),
        ("R22 CMP SD M (30% -> 5%, 25pp)", 0.30, 0.05),
    ]
    for name, base, treat in per_rule_cases:
        results = []
        for n in [5, 10, 15, 20]:
            c_pos = round(base * n)
            t_pos = round(treat * n)
            _, _, spared, passes = gate(c_pos, n, t_pos, n)
            mark = "PASS" if passes else "FAIL"
            results.append(f"N={n}: {mark} ({c_pos}/{t_pos}, spared={spared})")
        print(f"  {name}")
        for r in results:
            print(f"    {r}")

    # Power at realistic effect sizes (Monte Carlo over sampled outcomes at each N)
    print()
    print("=== Monte Carlo power estimate (fraction of samples firing at each N) ===")
    print("Draws=2000 per cell; samples drawn from Bernoulli(p_ctrl), Bernoulli(p_treat)")
    rng = np.random.default_rng(2026)
    power_cases = [
        ("30pp, ctrl=0.60, treat=0.30 (R20 tumor)", 0.60, 0.30),
        ("40pp, ctrl=0.50, treat=0.10 (R21 CPN)", 0.50, 0.10),
        ("40pp, ctrl=0.70, treat=0.30 (R21 CPN)", 0.70, 0.30),
        ("50pp, ctrl=0.60, treat=0.10 (large effect)", 0.60, 0.10),
        ("70pp, ctrl=0.90, treat=0.20 (R21 chronic CPN)", 0.90, 0.20),
    ]
    nsim = 400  # kept small because each iter calls boschloo
    for name, pc, pt in power_cases:
        print(f"  {name}")
        for n in [5, 8, 10, 15, 20]:
            hits = 0
            for _ in range(nsim):
                c_pos = int(rng.binomial(n, pc))
                t_pos = int(rng.binomial(n, pt))
                # Fast reject if spared < 2
                if c_pos - t_pos < 2:
                    continue
                tbl = [[c_pos, n - c_pos], [t_pos, n - t_pos]]
                p_b = boschloo_exact(tbl, alternative="greater").pvalue
                if p_b >= 0.05:
                    continue
                # Bayesian — use smaller draws for speed
                rng2 = np.random.default_rng(42)
                cc = rng2.beta(0.5 + c_pos, 0.5 + n - c_pos, 100_000)
                tt = rng2.beta(0.5 + t_pos, 0.5 + n - t_pos, 100_000)
                if float(np.mean(tt < cc)) > 0.95:
                    hits += 1
            print(f"    N={n:<3}  power = {hits/nsim*100:.0f}%  ({hits}/{nsim})")


if __name__ == "__main__":
    main()
