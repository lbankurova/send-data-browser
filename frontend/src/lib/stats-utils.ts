/**
 * Half-width of a 95% confidence interval using t-distribution critical values.
 * Tabulated for sample sizes typical in pre-clinical tox studies (N=2–30).
 */
export function ci95Half(sd: number, n: number): number {
  if (n < 2 || sd <= 0) return 0;
  const tCrit = n >= 30 ? 1.96
    : n >= 20 ? 2.09
    : n >= 15 ? 2.14
    : n >= 10 ? 2.26
    : n >= 8  ? 2.36
    : n >= 6  ? 2.57
    : n >= 5  ? 2.78
    : n >= 4  ? 3.18
    : n >= 3  ? 4.30
    : 12.71; // n=2
  return tCrit * sd / Math.sqrt(n);
}
