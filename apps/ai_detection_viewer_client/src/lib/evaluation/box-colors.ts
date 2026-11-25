import type { Frame } from '@/lib/types';
import type { ObjectOutcome } from './evaluate';
import { NOT_EVALUATED_COLOR, OUTCOME_COLOR } from './outcomes';

/**
 * The colour of every 3D box of a frame in evaluate mode: where in space the
 * model found objects and where it missed them.
 *
 * (F6) A 3D box is one object, but with several cameras it can have a result
 * in more than one photo. The box takes the per-OBJECT outcome
 * (`mergeObjectOutcomes`):
 *  - found by AT LEAST ONE camera → green;
 *  - scored, but found by none    → red;
 *  - everything else → grey: labels that are not scored, and boxes that take no
 *    part at all (no camera sees them, or a class the model cannot name). Grey
 *    means "says nothing about the model" in both cases.
 *
 * "Any camera" because the 3D view answers "where around the car did the
 * cameras fail to see something" — and for a car with six cameras, an object
 * one of them found has been seen. What each single photo did is in the list
 * and in the panel.
 *
 * Every box of the frame gets an entry, so the 3D view never mixes outcome
 * colours with class colours. A false alarm has no entry and is not drawn in
 * 3D: a model box is a 2D rectangle with no depth, and no 3D position is made
 * up for it (Immutable Rule #6).
 */
export function boxOutcomeColors(
  frame: Frame,
  objects: ReadonlyMap<string, Pick<ObjectOutcome, 'kind'>>,
): Map<string, string> {
  const colors = new Map<string, string>();
  for (const box of frame.detections3D) {
    const outcome = objects.get(box.id);
    colors.set(box.id, outcome ? OUTCOME_COLOR[outcome.kind] : NOT_EVALUATED_COLOR);
  }
  return colors;
}
