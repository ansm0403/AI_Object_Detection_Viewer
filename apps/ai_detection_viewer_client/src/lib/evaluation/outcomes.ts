import type { EvalCounts, EvalKind } from './types';

/**
 * How the four outcomes are named, ordered and coloured everywhere they are
 * shown (panel, list, camera image, 3D view, timeline) — one table so the
 * surfaces cannot drift apart.
 */

/**
 * Display order: what needs attention first. Misses are the point of the tool,
 * then false alarms; found and not-scored results are context.
 */
export const EVAL_KINDS: readonly EvalKind[] = ['missed', 'false-alarm', 'found', 'not-scored'];

export const OUTCOME_LABEL: Record<EvalKind, string> = {
  found: 'Found',
  missed: 'Missed',
  'false-alarm': 'False alarm',
  'not-scored': 'Not scored',
};

/** One-line meaning, for tooltips. Facts about the comparison, not verdicts on the model. */
export const OUTCOME_HINT: Record<EvalKind, string> = {
  found: 'A model box of the same class overlaps this label enough (true positive)',
  missed: 'No model box of the same class overlaps this label enough (false negative)',
  'false-alarm': 'A model box with no label of its class under it (false positive)',
  'not-scored': 'Label less than 40% visible — left out of the score either way',
};

/** emerald-400 / rose-400 / amber-400 / zinc-500. */
export const OUTCOME_COLOR: Record<EvalKind, string> = {
  found: '#34d399',
  missed: '#fb7185',
  'false-alarm': '#fbbf24',
  'not-scored': '#71717a',
};

/**
 * A box that takes no part in the evaluation (no camera's photo shows it, or it
 * is of a class the model cannot name). Same grey as "not scored": neither counts.
 */
export const NOT_EVALUATED_COLOR = '#71717a';

/** A box shown only as context for the selected result (e.g. a model box below the minimum score). */
export const CONTEXT_COLOR = '#d4d4d8'; // zinc-300

/** The count of one outcome (bridges the kebab-case kind and the camelCase counter). */
export function countOf(counts: EvalCounts, kind: EvalKind): number {
  switch (kind) {
    case 'found':
      return counts.found;
    case 'missed':
      return counts.missed;
    case 'false-alarm':
      return counts.falseAlarm;
    case 'not-scored':
      return counts.notScored;
  }
}

/**
 * A ratio as a whole percentage, or "—" when there is none.
 *
 * `null` means the denominator was 0 ("the model reported nothing", "no object
 * in this distance band"). That is not 0% and must not be shown as 0%.
 */
export function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${Math.round(value * 100)}%`;
}
