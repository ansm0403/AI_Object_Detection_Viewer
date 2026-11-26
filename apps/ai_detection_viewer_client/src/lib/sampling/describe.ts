import type { ShareEstimate } from './estimate';
import type { SampleSummary, SampleVerdict } from './sample-check';

/**
 * (F7.5) The words the sample check is reported in.
 *
 * One place decides the wording, because the wording is the point: a sample
 * result must never read as a count of the whole set. Every sentence built
 * here carries the sample size ("41 of 100") and, when it speaks about the
 * population, a RANGE and the word "about" (Immutable Rule #6).
 */

const number = (n: number) => n.toLocaleString('en-US');
const percent = (share: number) => `${Math.round(share * 100)}%`;

/** Short names — button captions (three buttons share a 360 px panel). */
export const SAMPLE_VERDICT_LABEL: Record<SampleVerdict, string> = {
  'real-object': 'Real object',
  'model-wrong': 'Model wrong',
  unclear: 'Unclear',
};

/** Full names — tooltips, status lines, anywhere there is room. */
export const SAMPLE_VERDICT_NAME: Record<SampleVerdict, string> = {
  'real-object': 'Real object, label missing',
  'model-wrong': 'Model is wrong',
  unclear: 'Unclear',
};

/** What each verdict asserts — shown as the buttons' tooltips. */
export const SAMPLE_VERDICT_HINT: Record<SampleVerdict, string> = {
  'real-object':
    'A real vehicle or person is in the box and the dataset has no label for it. (Not a statement that the model named its exact class.)',
  'model-wrong': 'No such object is there: background, a reflection, a picture of a person, something else.',
  unclear: 'The photo cannot settle it: too small, too dark, mostly hidden.',
};

/** "32–50%" — the interval of an estimate, in whole percent. */
export function formatShareRange(estimate: ShareEstimate): string {
  return `${Math.round(estimate.low * 100)}–${percent(estimate.high)}`;
}

/** "41 of 100 (41%)" — what was seen in the sample. `null` → "—". */
export function describeSampleCount(estimate: ShareEstimate | null): string {
  if (!estimate) return '—';
  return `${estimate.count} of ${estimate.judged} (${percent(estimate.share)})`;
}

/**
 * What the sample says about the whole population, for one verdict:
 * "41 of 100 sampled boxes → about 32–50% of all 1,452".
 */
export function describeEstimate(estimate: ShareEstimate | null, population: number): string {
  if (!estimate) return 'Nothing judged yet — no estimate.';
  return `${estimate.count} of ${estimate.judged} sampled boxes → about ${formatShareRange(estimate)} of all ${number(population)}`;
}

/** "12 of 100 judged — not final" / "100 of 100 judged". */
export function describeProgress(summary: SampleSummary): string {
  const base = `${summary.judged} of ${summary.size} judged`;
  return summary.complete || summary.judged === 0 ? base : `${base} — not final`;
}
