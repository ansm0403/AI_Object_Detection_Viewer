/**
 * (F7.5) From a sample to an ESTIMATE about the whole set.
 *
 * "41 of the 100 sampled boxes were real objects" is a count. What it says
 * about all 1,452 boxes is an estimate: about 41 %, give or take. The "give or
 * take" is the INTERVAL — a range that, built this way, contains the true
 * share in about 95 of 100 samples. A small sample gives a wide range, a large
 * one a narrow range; a number without its range and sample size reads as a
 * count of the whole set, which it is not (Immutable Rule #6).
 *
 * Method: the Wilson score interval (unlike the textbook ± formula it never
 * leaves 0–100 % and behaves for shares near 0 or 1), with the finite
 * population correction — the sample is drawn WITHOUT replacement from a set of
 * known size, so the more of the set has been looked at, the less is left to be
 * uncertain about. With the whole set judged the interval is the count itself.
 *
 * Limit, stated in the UI: the interval assumes the items are independent. The
 * boxes are not quite — the same parked car is often boxed again in the next
 * frame — so the true uncertainty is somewhat larger than the range shown.
 */

/** 95 % two-sided. */
export const Z_95 = 1.959964;

export type ShareEstimate = {
  /** Items with the property, among the judged ones. */
  count: number;
  /** Items judged so far (the sample size the estimate rests on). */
  judged: number;
  /** `count / judged`. */
  share: number;
  /** The interval for the share in the WHOLE population, each within 0–1. */
  low: number;
  high: number;
};

/**
 * The share of a property in a population of `population` items, estimated
 * from `count` hits among `judged` randomly drawn items.
 *
 * Returns `null` when nothing was judged — there is no estimate then, and "0 %"
 * would be a claim. Out-of-range inputs are clamped rather than thrown on:
 * `count` into 0…judged, and a `population` smaller than `judged` (or unknown,
 * ≤ 0) is treated as "at least what was judged" / "very large" respectively.
 */
export function estimateShare(
  count: number,
  judged: number,
  population: number,
  z: number = Z_95,
): ShareEstimate | null {
  const n = Math.floor(judged);
  if (!(n > 0)) return null;
  const k = Math.min(Math.max(0, Math.floor(count)), n);
  const share = k / n;

  // Finite population correction: 1 for a very large population, 0 once every
  // item has been judged.
  let correction = 1;
  if (Number.isFinite(population) && population > 0) {
    const size = Math.max(Math.floor(population), n);
    correction = size > 1 ? (size - n) / (size - 1) : 0;
  }

  const z2 = z * z * correction;
  const denominator = 1 + z2 / n;
  const centre = (share + z2 / (2 * n)) / denominator;
  const half = Math.sqrt(z2 * ((share * (1 - share)) / n + z2 / (4 * n * n))) / denominator;
  return {
    count: k,
    judged: n,
    share,
    low: Math.max(0, centre - half),
    high: Math.min(1, centre + half),
  };
}
