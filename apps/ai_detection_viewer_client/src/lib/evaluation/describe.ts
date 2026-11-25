import { cameraShortName } from '@/lib/cameras';
import type { BoxAnnotationInfo } from '@/lib/types';
import type { ObjectOutcome } from './evaluate';
import type { EvalResult, EvaluationRules } from './types';

/**
 * The one-line explanation shown for a selected result (F5).
 *
 * Every sentence restates a FACT of the comparison — which box overlaps which,
 * by how much, with what score — so the reader can see why the result came out
 * as it did. None of it is a diagnosis of the model: a "false alarm" may be a
 * real object the label set lacks, and the labels' 2D boxes are approximate.
 */

const VISIBILITY_TEXT: Record<NonNullable<BoxAnnotationInfo['visibility']>, string> = {
  'v0-40': '0–40%',
  'v40-60': '40–60%',
  'v60-80': '60–80%',
  'v80-100': '80–100%',
};

/** nuScenes visibility bin as text, e.g. "60–80%". */
export function visibilityText(visibility: BoxAnnotationInfo['visibility']): string | null {
  return visibility ? VISIBILITY_TEXT[visibility] : null;
}

const score = (value: number): string => value.toFixed(2);
const overlap = (value: number): string => `IoU ${value.toFixed(2)}`;

const VIEW_WORD = { found: 'found', missed: 'missed', 'not-scored': 'not scored' } as const;

/**
 * (F6) What the OTHER cameras made of the same object, e.g. "other camera: F
 * missed" — or `null` when no other camera has a result for it.
 *
 * An object in the overlap of two cameras is scored once per photo, and the
 * two results often differ (it is usually cut off by the image edge in one of
 * them). Saying so next to the selected result keeps a "missed" from being
 * read as "the car never saw it".
 */
export function describeOtherViews(
  outcome: ObjectOutcome | undefined,
  camera: string | null,
): string | null {
  const others = (outcome?.views ?? []).filter((view) => view.camera !== camera);
  if (others.length === 0) return null;
  const list = others
    .map((view) => `${cameraShortName(view.camera)} ${VIEW_WORD[view.kind]}`)
    .join(', ');
  return `other camera${others.length === 1 ? '' : 's'}: ${list}`;
}

/** Why the result is what it is, as one line. */
export function describeResult(result: EvalResult, rules: EvaluationRules): string {
  switch (result.kind) {
    case 'found':
      return `matched model box: score ${score(result.score)} · ${overlap(result.iou)}`;

    case 'missed': {
      const nearest = result.nearest;
      if (!nearest) return 'no model box overlaps this label, at any score';
      const what = `closest model box: ${nearest.class} ${score(nearest.score)} · ${overlap(nearest.iou)}`;
      switch (nearest.reason) {
        case 'wrong-class':
          return `${what} — a different class`;
        case 'below-min-score':
          return `${what} — below the min score ${score(rules.minScore)}`;
        case 'low-overlap':
          return `${what} — under the IoU ${rules.iouThreshold} needed`;
        case 'matched-elsewhere':
          return `${what} — already matched to another label`;
      }
      // Unreachable while `MissReason` is exhaustive; keeps the function total.
      return what;
    }

    case 'false-alarm': {
      const nearest = result.nearest;
      if (!nearest) return 'no label overlaps this model box';
      const what = `closest label: ${nearest.class} · ${overlap(nearest.iou)}`;
      switch (nearest.relation) {
        case 'other-class':
          return `${what} — a different class`;
        case 'matched-elsewhere':
          return `${what} — already found by a higher-scoring box`;
        case 'low-overlap':
          return `${what} — under the IoU ${rules.iouThreshold} needed`;
      }
      return what;
    }

    case 'not-scored': {
      const n = result.predictionIds.length;
      const base = 'less than 40% visible — left out of the score';
      if (n === 0) return base;
      return `${base} · ${n} model box${n === 1 ? '' : 'es'} on it, not counted`;
    }
  }
}
