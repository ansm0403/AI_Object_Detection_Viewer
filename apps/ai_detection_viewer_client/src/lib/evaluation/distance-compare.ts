import { ratio } from './metrics';
import type { RecallBin } from './types';

/**
 * (F7.5) Two groups of labels compared band by band: is the recall of group B
 * lower than group A's AT THE SAME DISTANCE?
 *
 * Why: far objects are found less often than near ones. If one group simply
 * has its objects farther away (night scenes on a wide road, say), its overall
 * recall is lower for that reason alone. Comparing inside each distance band —
 * and re-weighting one group to the other's distance mix — separates "it is
 * farther" from "it is found less at the same distance".
 *
 * What this does NOT do: name the cause of what remains. The groups still
 * differ in everything else (place, traffic, the one drive a group may consist
 * of). The UI says so next to the table.
 */

/** Labels of one group inside one band. */
export type BandCount = { found: number; total: number };

export type DistanceRow = {
  from: number;
  /** `null` = open-ended: every band from `from` outward, added up. */
  to: number | null;
  a: BandCount;
  b: BandCount;
  /**
   * False when either group has fewer than `minLabels` labels here: the two
   * percentages are shown, but are too thin to be read as a comparison.
   */
  comparable: boolean;
};

export type DistanceComparison = {
  rows: DistanceRow[];
  /** Smallest label count a band needs in BOTH groups to be listed on its own. */
  minLabels: number;
  /**
   * Recall B would have with A's distance mix (direct standardisation): each
   * band's B recall weighted by A's label count in that band. Over the bands
   * where both groups have labels. `null` when there is no such band.
   */
  bAtMixOfA: number | null;
  /** The reverse: A's recall with B's distance mix. */
  aAtMixOfB: number | null;
  /** Share of A's / B's labels inside the bands the two standardised values use. */
  coverageA: number | null;
  coverageB: number | null;
};

/** Default floor: with fewer labels a band's percentage moves by whole points per label. */
export const DEFAULT_MIN_BAND_LABELS = 50;

const NONE: BandCount = { found: 0, total: 0 };

/**
 * Compare two groups' recall bands (as `summarize` / `evaluateScenes` produce
 * them: `[from, to)`, nearest first, equal widths).
 *
 * Rows: every band up to the LAST one in which both groups have at least
 * `minLabels` labels is listed on its own; all bands beyond it are added into
 * one open-ended row. A band before that point that is thin in one group is
 * still listed, flagged `comparable: false`.
 */
export function compareByDistance(
  a: readonly RecallBin[],
  b: readonly RecallBin[],
  options: { minLabels?: number } = {},
): DistanceComparison {
  const minLabels = Math.max(1, Math.floor(options.minLabels ?? DEFAULT_MIN_BAND_LABELS));
  const byFromA = new Map(a.map((bin) => [bin.from, bin]));
  const byFromB = new Map(b.map((bin) => [bin.from, bin]));
  const anyBin = a[0] ?? b[0];
  const width = anyBin ? anyBin.to - anyBin.from : 0;
  const starts = [...new Set([...byFromA.keys(), ...byFromB.keys()])].sort((x, y) => x - y);

  const count = (bin: RecallBin | undefined): BandCount =>
    bin ? { found: bin.found, total: bin.total } : { ...NONE };
  const enough = (from: number): boolean =>
    (byFromA.get(from)?.total ?? 0) >= minLabels && (byFromB.get(from)?.total ?? 0) >= minLabels;

  let lastComparable = -1;
  starts.forEach((from, index) => {
    if (enough(from)) lastComparable = index;
  });

  const rows: DistanceRow[] = [];
  const rest: DistanceRow = { from: 0, to: null, a: { ...NONE }, b: { ...NONE }, comparable: false };
  let restUsed = false;
  starts.forEach((from, index) => {
    const binA = byFromA.get(from);
    const binB = byFromB.get(from);
    if (index <= lastComparable) {
      rows.push({ from, to: from + width, a: count(binA), b: count(binB), comparable: enough(from) });
      return;
    }
    if (!restUsed) {
      rest.from = from;
      restUsed = true;
    }
    rest.a.found += binA?.found ?? 0;
    rest.a.total += binA?.total ?? 0;
    rest.b.found += binB?.found ?? 0;
    rest.b.total += binB?.total ?? 0;
  });
  if (restUsed) {
    rest.comparable = rest.a.total >= minLabels && rest.b.total >= minLabels;
    rows.push(rest);
  }

  // Standardisation over the bands both groups have labels in.
  let weightA = 0;
  let weightB = 0;
  let bAtA = 0;
  let aAtB = 0;
  for (const from of starts) {
    const binA = byFromA.get(from);
    const binB = byFromB.get(from);
    if (!binA || !binB || binA.total === 0 || binB.total === 0) continue;
    weightA += binA.total;
    weightB += binB.total;
    bAtA += binA.total * (binB.found / binB.total);
    aAtB += binB.total * (binA.found / binA.total);
  }
  const totalA = a.reduce((sum, bin) => sum + bin.total, 0);
  const totalB = b.reduce((sum, bin) => sum + bin.total, 0);

  return {
    rows,
    minLabels,
    bAtMixOfA: weightA > 0 ? bAtA / weightA : null,
    aAtMixOfB: weightB > 0 ? aAtB / weightB : null,
    coverageA: ratio(weightA, totalA),
    coverageB: ratio(weightB, totalB),
  };
}
