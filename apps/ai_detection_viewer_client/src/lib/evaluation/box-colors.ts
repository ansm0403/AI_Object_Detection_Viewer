import type { Frame } from '@/lib/types';
import { NOT_EVALUATED_COLOR, OUTCOME_COLOR } from './outcomes';
import type { FrameEvaluation } from './types';

/**
 * The colour of every 3D box of a frame in evaluate mode (F5): where in space
 * the model found objects and where it missed them.
 *
 *  - found  → green, missed → red (`OUTCOME_COLOR`);
 *  - everything else → grey: labels that are not scored, and boxes that take
 *    no part at all (outside the camera image, or a class the model cannot
 *    name). Grey means "says nothing about the model" in both cases.
 *
 * Every box of the frame gets an entry, so the 3D view never mixes outcome
 * colours with class colours. A false alarm has no entry and is not drawn in
 * 3D: a model box is a 2D rectangle with no depth, and no 3D position is made
 * up for it (Immutable Rule #6).
 */
export function boxOutcomeColors(frame: Frame, evaluation: FrameEvaluation): Map<string, string> {
  const colors = new Map<string, string>();
  for (const box of frame.detections3D) colors.set(box.id, NOT_EVALUATED_COLOR);
  for (const result of evaluation.results) {
    if (result.kind === 'false-alarm') continue;
    // Only boxes that exist in this frame (defensive: an evaluation of another frame).
    if (colors.has(result.objectId)) colors.set(result.objectId, OUTCOME_COLOR[result.kind]);
  }
  return colors;
}
