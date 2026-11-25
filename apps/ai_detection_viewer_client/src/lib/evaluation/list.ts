import { selectionIdOf } from './match';
import { EVAL_KINDS } from './outcomes';
import type { EvalKind, EvalResult } from './types';

/**
 * The result list of one frame (F5): order, and which results are shown.
 */

/**
 * Results in the order the list shows them: by outcome (`EVAL_KINDS`: missed,
 * false alarm, found, not scored), and inside an outcome
 *  - labels nearest first (distance from the ego vehicle), and
 *  - false alarms by score, highest first (they have no measured distance).
 * Ties keep the evaluation's own order, so the list is stable between renders.
 */
export function orderResults(results: readonly EvalResult[]): EvalResult[] {
  const rank = new Map<EvalKind, number>(EVAL_KINDS.map((kind, i) => [kind, i]));
  return results
    .map((result, index) => ({ result, index }))
    .sort((a, b) => {
      const byKind = (rank.get(a.result.kind) ?? 0) - (rank.get(b.result.kind) ?? 0);
      if (byKind !== 0) return byKind;
      const within =
        a.result.kind === 'false-alarm' && b.result.kind === 'false-alarm'
          ? b.result.score - a.result.score
          : a.result.kind !== 'false-alarm' && b.result.kind !== 'false-alarm'
            ? a.result.distance - b.result.distance
            : 0;
      return within || a.index - b.index;
    })
    .map((entry) => entry.result);
}

/**
 * What the user chose to look at. Both sets use the app's "empty = everything"
 * convention (the same as the class chips in the filter bar).
 */
export type ResultFilter = {
  /** Outcomes to show; empty = all four. */
  kinds: ReadonlySet<EvalKind>;
  /** Classes to show; empty = all. */
  classes: ReadonlySet<string>;
};

/** A false alarm is filtered by the class the MODEL named; a label by its own class. */
export function passesClassFilter(result: EvalResult, classes: ReadonlySet<string>): boolean {
  return classes.size === 0 || classes.has(result.class);
}

export function passesKindFilter(result: EvalResult, kinds: ReadonlySet<EvalKind>): boolean {
  return kinds.size === 0 || kinds.has(result.kind);
}

/** True when the result is shown: its outcome and its class are both switched on. */
export function isResultVisible(result: EvalResult, filter: ResultFilter): boolean {
  return passesKindFilter(result, filter.kinds) && passesClassFilter(result, filter.classes);
}

/**
 * The ids J / K walk through: the visible results, in list order. Each id is
 * what `selectedObjectId` holds for that result (`selectionIdOf`).
 */
export function resultQueue(ordered: readonly EvalResult[], filter: ResultFilter): string[] {
  return ordered.filter((result) => isResultVisible(result, filter)).map(selectionIdOf);
}
