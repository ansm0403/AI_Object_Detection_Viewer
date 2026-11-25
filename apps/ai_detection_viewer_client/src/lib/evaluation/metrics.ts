import type {
  ClassRecall,
  EvalCounts,
  EvalSummary,
  FrameEvaluation,
  RecallBin,
} from './types';

/** Width of a distance band in metres. */
export const DISTANCE_BIN_METRES = 10;

/**
 * `part / whole`, or `null` when `whole` is 0.
 *
 * Null, not 0: "the model made no prediction" is not "0% precision", and a
 * distance band without objects has no recall at all. The UI shows "—".
 */
export function ratio(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

/** Precision = found / (found + false alarms): how much of what the model reported was right. */
export function precisionOf(counts: EvalCounts): number | null {
  return ratio(counts.found, counts.found + counts.falseAlarm);
}

/** Recall = found / (found + missed): how much of what was there the model found. */
export function recallOf(counts: EvalCounts): number | null {
  return ratio(counts.found, counts.found + counts.missed);
}

/**
 * Totals and breakdowns over any number of evaluated frames.
 *
 * Breakdowns are RECALL only. A false alarm has no matched label, hence no
 * measured distance and no label class, so precision cannot be split the same
 * way. Labels that are not scored are counted in `notScored` and nowhere else.
 */
export function summarize(evaluations: readonly FrameEvaluation[]): EvalSummary {
  const counts: EvalCounts = { found: 0, missed: 0, falseAlarm: 0, notScored: 0 };
  const bins = new Map<number, RecallBin>();
  const classes = new Map<string, ClassRecall>();

  for (const evaluation of evaluations) {
    for (const result of evaluation.results) {
      if (result.kind === 'false-alarm') {
        counts.falseAlarm += 1;
        continue;
      }
      if (result.kind === 'not-scored') {
        counts.notScored += 1;
        continue;
      }
      const found = result.kind === 'found';
      if (found) counts.found += 1;
      else counts.missed += 1;

      // [0, 10), [10, 20), … — a label at exactly 20 m is in the 20–30 band.
      const index = Math.max(0, Math.floor(result.distance / DISTANCE_BIN_METRES));
      const bin = bins.get(index) ?? {
        from: index * DISTANCE_BIN_METRES,
        to: (index + 1) * DISTANCE_BIN_METRES,
        found: 0,
        total: 0,
      };
      bin.total += 1;
      if (found) bin.found += 1;
      bins.set(index, bin);

      const cls = classes.get(result.class) ?? { class: result.class, found: 0, total: 0 };
      cls.total += 1;
      if (found) cls.found += 1;
      classes.set(result.class, cls);
    }
  }

  return {
    ...counts,
    precision: precisionOf(counts),
    recall: recallOf(counts),
    byDistance: [...bins.values()].sort((a, b) => a.from - b.from),
    byClass: [...classes.values()].sort(
      (a, b) => b.total - a.total || a.class.localeCompare(b.class),
    ),
  };
}
