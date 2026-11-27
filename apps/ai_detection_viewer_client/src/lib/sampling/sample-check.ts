import { getReview, type ReviewMap, type Verdict } from '@/lib/review';
import { estimateShare, type ShareEstimate } from './estimate';

/**
 * (F7.5) The sample check: a person judging a random sample of the false
 * alarms that have no label nearby.
 *
 * The verdicts are stored as ordinary review records (F4) in the review
 * scope `nuscenes-false-alarms`, keyed by (frame id, prediction id). What is
 * reviewed is the MODEL's box instead of a label, so the three stored verdicts
 * read naturally — and are spelled out here once, so no other code has to
 * remember what "approved" means in this scope.
 */

/** The verdict on one sampled model box. */
export type SampleVerdict =
  /** A real object is in the box and the dataset has no label for it. */
  | 'real-object'
  /** Nothing of the kind is there: the model was wrong. */
  | 'model-wrong'
  /** The photo cannot settle it. */
  | 'unclear';

export const SAMPLE_VERDICTS: readonly SampleVerdict[] = ['real-object', 'model-wrong', 'unclear'];

const FROM_REVIEW: Record<Verdict, SampleVerdict> = {
  approved: 'real-object',
  rejected: 'model-wrong',
  unsure: 'unclear',
};
const TO_REVIEW: Record<SampleVerdict, Verdict> = {
  'real-object': 'approved',
  'model-wrong': 'rejected',
  unclear: 'unsure',
};

export const toSampleVerdict = (verdict: Verdict): SampleVerdict => FROM_REVIEW[verdict];
export const toReviewVerdict = (verdict: SampleVerdict): Verdict => TO_REVIEW[verdict];

/** What identifies a sampled box in the review records. */
export type SampleKey = { frameId: string; predictionId: string };

/** The sample sizes offered. Each contains the smaller ones (see `drawOrder`). */
export const SAMPLE_SIZES: readonly number[] = [100, 200, 300];
export const DEFAULT_SAMPLE_SIZE = 100;

/** The verdict given to a sampled box, or `null` when it has not been judged. */
export function verdictOfItem(records: ReviewMap, item: SampleKey): SampleVerdict | null {
  const record = getReview(records, item.frameId, item.predictionId);
  return record ? toSampleVerdict(record.verdict) : null;
}

/** When a sampled box was judged (ISO time), or `null`. */
export function judgedAtOfItem(records: ReviewMap, item: SampleKey): string | null {
  return getReview(records, item.frameId, item.predictionId)?.reviewedAt || null;
}

export type SampleSummary = {
  /** Size of the set the sample was drawn from. */
  population: number;
  /** Size of the sample. */
  size: number;
  /** Sample items judged so far. */
  judged: number;
  counts: Record<SampleVerdict, number>;
  /**
   * Per verdict, the estimated share in the population. All three use the same
   * denominator (`judged`): "unclear" is an outcome, not a reason to drop the
   * item. `null` while nothing is judged.
   */
  estimates: Record<SampleVerdict, ShareEstimate | null>;
  /** Every item of the sample has a verdict. Until then the estimate is provisional. */
  complete: boolean;
};

/**
 * Count the verdicts of a sample and estimate each share in the population.
 * Records that are not about an item of `sample` are ignored (a verdict given
 * to a box beyond the current sample size, or left over from other data).
 */
export function summarizeSample(
  sample: readonly SampleKey[],
  records: ReviewMap,
  population: number,
): SampleSummary {
  const counts: Record<SampleVerdict, number> = { 'real-object': 0, 'model-wrong': 0, unclear: 0 };
  let judged = 0;
  for (const item of sample) {
    const verdict = verdictOfItem(records, item);
    if (!verdict) continue;
    counts[verdict] += 1;
    judged += 1;
  }
  return {
    population,
    size: sample.length,
    judged,
    counts,
    estimates: {
      'real-object': estimateShare(counts['real-object'], judged, population),
      'model-wrong': estimateShare(counts['model-wrong'], judged, population),
      unclear: estimateShare(counts.unclear, judged, population),
    },
    complete: sample.length > 0 && judged === sample.length,
  };
}

const indexOfItem = (sample: readonly SampleKey[], predictionId: string | null): number =>
  predictionId === null ? -1 : sample.findIndex((item) => item.predictionId === predictionId);

/**
 * The next item of the sample without a verdict, after `currentId` in sample
 * order, wrapping to the start. Never returns the current item; `null` when
 * every other item is judged. With no current item: the first unjudged one.
 */
export function nextUnjudged<T extends SampleKey>(
  sample: readonly T[],
  records: ReviewMap,
  currentId: string | null,
): T | null {
  const start = indexOfItem(sample, currentId);
  for (let step = 1; step <= sample.length; step += 1) {
    const item = sample[(start + step + sample.length) % sample.length];
    if (item.predictionId === currentId) continue;
    if (verdictOfItem(records, item) === null) return item;
  }
  return null;
}

/**
 * The neighbour of `currentId` in the sample (`direction` +1 = next, −1 =
 * previous). Stops at the ends (no wrapping: the sample has a first and a last
 * item). With no current item: the first for +1, the last for −1.
 */
export function stepInSample<T extends SampleKey>(
  sample: readonly T[],
  currentId: string | null,
  direction: 1 | -1,
): T | null {
  if (sample.length === 0) return null;
  const index = indexOfItem(sample, currentId);
  if (index === -1) return direction === 1 ? sample[0] : sample[sample.length - 1];
  return sample[index + direction] ?? null;
}

/**
 * The sample size to open with, given the verdicts already stored: the
 * smallest offered size that contains every judged item of the drawn order —
 * so a reload after extending to 200 does not fall back to 100 and hide half
 * of the work. Never below `fallback`; never above the largest offered size.
 */
export function sampleSizeForRecords(
  order: readonly SampleKey[],
  records: ReviewMap,
  sizes: readonly number[] = SAMPLE_SIZES,
  fallback: number = DEFAULT_SAMPLE_SIZE,
): number {
  const sorted = [...sizes].sort((a, b) => a - b);
  const largest = sorted[sorted.length - 1] ?? fallback;
  let lastJudged = -1;
  const limit = Math.min(order.length, largest);
  for (let index = 0; index < limit; index += 1) {
    if (verdictOfItem(records, order[index]) !== null) lastJudged = index;
  }
  const needed = Math.max(fallback, lastJudged + 1);
  return sorted.find((size) => size >= needed) ?? largest;
}
