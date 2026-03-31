"""Shared helpers for validation scripts."""

TOL_PVALUE = 1e-3
TOL_STATISTIC = 1e-2


def check(name: str, our_value, ref_value, tol=TOL_STATISTIC) -> bool:
    """Compare two values; print PASS/FAIL with deviation."""
    if our_value is None and ref_value is None:
        print(f"  {name}: both None -> PASS")
        return True
    if our_value is None or ref_value is None:
        print(f"  {name}: ours={our_value}, ref={ref_value} -> FAIL (one is None)")
        return False
    dev = abs(float(our_value) - float(ref_value))
    ok = dev < tol
    status = "PASS" if ok else "FAIL"
    print(f"  {name}: ours={our_value}, ref={ref_value:.6f}, "
          f"deviation={dev:.6f} -> {status}")
    return ok


def report(section: str, all_pass: bool):
    """Print final PASS/FAIL for a section."""
    print(f"\n{section}: {'PASS' if all_pass else 'FAIL'}\n")
