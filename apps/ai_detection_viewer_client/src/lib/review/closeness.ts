import {
  boxDistance,
  getEdit,
  labelValuesOf,
  valuesOfEdit,
  type BoxDistance,
  type EditMap,
} from '@/lib/editing';
import type { Frame } from '@/lib/types';
import type { PlantedError, PracticeErrorKind } from './practice';

/**
 * (F8) Practice mode: how close did an edit bring a box to the REAL label?
 *
 * The practice set is the real sample with a few boxes deliberately made
 * wrong (`practice.ts`). The app still has the real boxes in memory, so an
 * edit made on the practice set can be measured against them — the one place
 * in this tool where an edit can be scored at all. (On the real data there is
 * nothing to score an edit against: the label is the thing being questioned.)
 *
 * One row per EDITED box of the frame:
 *  - `before`: how far the box was from the real label as the practice set
 *    showed it — the planted error itself (all zero when nothing was planted
 *    on this box, or when only its class was swapped);
 *  - `after`: how far the box is from the real label now, with the edit.
 *
 * Pure (Immutable Rule #3). It reads boxes only; ids are untouched (Rule #1).
 */
export type EditCloseness = {
  objectId: string;
  /** What was planted on this box; `null` = nothing (the box was the real label). */
  planted: PracticeErrorKind | null;
  before: BoxDistance;
  after: BoxDistance;
};

/**
 * @param realFrame      The frame with the dataset's own boxes.
 * @param practiceFrame  The same frame of the practice set (same frame id, same
 *                       object ids), WITHOUT the edits laid over.
 * @param edits          The edits of the practice scope.
 * @param planted        The answer key (any frames; only this frame's lines are read).
 * @returns Rows in the practice frame's box order. A box that is missing from
 *          either frame, or a frame boxes cannot be measured in, gives no row.
 */
export function editCloseness(
  realFrame: Frame,
  practiceFrame: Frame,
  edits: EditMap,
  planted: readonly PlantedError[],
): EditCloseness[] {
  if (realFrame.id !== practiceFrame.id) return [];
  const kinds = new Map<string, PracticeErrorKind>();
  for (const error of planted) {
    if (error.frameId === practiceFrame.id) kinds.set(error.objectId, error.kind);
  }
  const rows: EditCloseness[] = [];
  for (const box of practiceFrame.detections3D) {
    const edit = getEdit(edits, practiceFrame.id, box.id);
    if (!edit) continue;
    const real = labelValuesOf(realFrame, box.id);
    const shown = labelValuesOf(practiceFrame, box.id);
    if (!real || !shown) continue;
    rows.push({
      objectId: box.id,
      planted: kinds.get(box.id) ?? null,
      before: boxDistance(shown, real),
      after: boxDistance(valuesOfEdit(edit), real),
    });
  }
  return rows;
}
