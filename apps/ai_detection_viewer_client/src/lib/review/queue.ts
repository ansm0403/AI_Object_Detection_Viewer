import type { Detection3D, Frame } from '@/lib/types';
import { CAMERA_DISPLAY_ORDER, bestViewsByObject } from '@/lib/cameras';
import { getReview } from './records';
import type { ReviewMap } from './types';

/**
 * How the object list — and therefore the review queue — is ordered.
 *  - `scene`:    the dataset's own order.
 *  - `evidence`: fewest LiDAR points first, so the boxes with the weakest
 *                sensor evidence are looked at first.
 *  - `camera`:   (F6) grouped by the camera that shows each box best, the
 *                groups in look-around order (rear-left → front → rear), boxes
 *                no camera sees last. Walking the queue then stays on one photo
 *                for a run of boxes instead of jumping between cameras. With a
 *                single camera this is the pre-F6 "in camera first".
 *  - `unsure`:   (F6) boxes marked "unsure" first. Most of them were marked so
 *                because the front camera did not show them; with six cameras
 *                they can be looked at again.
 */
export type QueueOrder = 'scene' | 'evidence' | 'camera' | 'unsure';

export const QUEUE_ORDERS: readonly QueueOrder[] = ['scene', 'evidence', 'camera', 'unsure'];

/**
 * The frame's 3D boxes in list order.
 *
 * Every ordering is a STABLE sort over the dataset order, so boxes that tie
 * keep their relative position and the list does not reshuffle between renders.
 * A box without a LiDAR count (older sample file) sorts after all counted ones
 * under `evidence` — "unknown" must not masquerade as "no points".
 *
 * `reviews` is only read by the `unsure` order (it sorts by the current
 * verdicts); without it that order is the dataset order.
 */
export function orderBoxes(frame: Frame, order: QueueOrder, reviews?: ReviewMap): Detection3D[] {
  const boxes = frame.detections3D;
  if (order === 'scene') return boxes;
  if (order === 'unsure' && !reviews) return boxes;

  const indexed = boxes.map((box, index) => ({ box, index }));
  if (order === 'evidence') {
    const points = (b: Detection3D) => b.annotation?.lidarPoints ?? Number.POSITIVE_INFINITY;
    indexed.sort((a, b) => {
      const pa = points(a.box);
      const pb = points(b.box);
      // Infinity - Infinity is NaN, so compare instead of subtracting.
      if (pa !== pb) return pa < pb ? -1 : 1;
      return a.index - b.index;
    });
  } else if (order === 'unsure') {
    const rank = (b: Detection3D) =>
      reviews && getReview(reviews, frame.id, b.id)?.verdict === 'unsure' ? 0 : 1;
    indexed.sort((a, b) => rank(a.box) - rank(b.box) || a.index - b.index);
  } else {
    // The camera a box is checked against is its best view — the same camera
    // the page switches to when the box is selected (`pickCamera`).
    const bestViews = bestViewsByObject(frame);
    const UNKNOWN_CAMERA = CAMERA_DISPLAY_ORDER.length;
    const NOT_SEEN = UNKNOWN_CAMERA + 1;
    const rank = (b: Detection3D) => {
      const best = bestViews.get(b.id)?.[0];
      if (best === undefined) return NOT_SEEN;
      const position = CAMERA_DISPLAY_ORDER.indexOf(best);
      return position === -1 ? UNKNOWN_CAMERA : position;
    };
    indexed.sort((a, b) => rank(a.box) - rank(b.box) || a.index - b.index);
  }
  return indexed.map((entry) => entry.box);
}

/**
 * The review queue: the ordered boxes that are currently VISIBLE (pass the
 * filters), as ids. A filtered-out box is not drawn in the 3D view, so stepping
 * onto it would ask for a verdict on something the reviewer cannot see.
 * `visibleIds === undefined` means "no filter".
 */
export function buildQueue(
  orderedBoxes: Detection3D[],
  visibleIds: Set<string> | undefined,
): string[] {
  const ids: string[] = [];
  for (const box of orderedBoxes) {
    if (!visibleIds || visibleIds.has(box.id)) ids.push(box.id);
  }
  return ids;
}

/**
 * The neighbour of `currentId` in the queue (`direction` +1 = next, −1 =
 * previous). Returns `null` when there is nowhere to go — the queue is empty,
 * or `currentId` is already at that end (no wrap-around: wrapping silently
 * restarts the frame, which reads as "there is more to do").
 *
 * When nothing in the queue is selected (no selection, or the selected box is
 * filtered out) "next" enters at the first box and "previous" at the last.
 */
export function stepInQueue(
  queue: string[],
  currentId: string | null,
  direction: 1 | -1,
): string | null {
  if (queue.length === 0) return null;
  const index = currentId === null ? -1 : queue.indexOf(currentId);
  if (index === -1) return direction === 1 ? queue[0] : queue[queue.length - 1];
  return queue[index + direction] ?? null;
}

/**
 * The next box in the queue that has no verdict yet, searching forward from
 * `currentId` and then wrapping to the start — so boxes skipped earlier are
 * still found before the frame counts as finished. `currentId` itself is never
 * returned. `null` means every box in the queue has a verdict.
 */
export function nextUnreviewed(
  queue: string[],
  reviews: ReviewMap,
  frameId: string,
  currentId: string | null,
): string | null {
  if (queue.length === 0) return null;
  const start = currentId === null ? -1 : queue.indexOf(currentId);
  for (let step = 1; step <= queue.length; step += 1) {
    // start = -1 (nothing selected) → begins at index 0.
    const id = queue[(start + step + queue.length) % queue.length];
    if (id === currentId) continue;
    if (!getReview(reviews, frameId, id)) return id;
  }
  return null;
}

/**
 * (F6) The next box in the queue whose verdict is "unsure", searching forward
 * from `currentId` and wrapping. `currentId` itself is never returned. `null`
 * when no other box is marked unsure.
 *
 * Used while the list is ordered "unsure first": after re-judging one of those
 * boxes the reviewer wants the next one of them, not the next unreviewed box.
 */
export function nextUnsure(
  queue: string[],
  reviews: ReviewMap,
  frameId: string,
  currentId: string | null,
): string | null {
  if (queue.length === 0) return null;
  const start = currentId === null ? -1 : queue.indexOf(currentId);
  for (let step = 1; step <= queue.length; step += 1) {
    const id = queue[(start + step + queue.length) % queue.length];
    if (id === currentId) continue;
    if (getReview(reviews, frameId, id)?.verdict === 'unsure') return id;
  }
  return null;
}

/**
 * The id of the next frame (after `currentFrameId`, wrapping) that still has an
 * unreviewed box the reviewer could actually work on.
 *
 * `visibleIdsOf` gives, per frame, the ids that pass the current filters — the
 * same rule that builds the queue. With it, a frame whose only unreviewed boxes
 * are filtered out is skipped: jumping there would land on an empty queue and
 * offer the jump again, bouncing between frames. Without it every box counts.
 * `null` when no other frame qualifies.
 */
export function nextFrameWithUnreviewed(
  frames: Frame[],
  reviews: ReviewMap,
  currentFrameId: string | null,
  visibleIdsOf?: (frame: Frame) => Set<string>,
): string | null {
  if (frames.length === 0) return null;
  const start = frames.findIndex((f) => f.id === currentFrameId);
  for (let step = 1; step <= frames.length; step += 1) {
    const frame = frames[(start + step + frames.length) % frames.length];
    if (frame.id === currentFrameId) continue;
    const visible = visibleIdsOf?.(frame);
    const hasUnreviewed = frame.detections3D.some(
      (box) => (!visible || visible.has(box.id)) && !getReview(reviews, frame.id, box.id),
    );
    if (hasUnreviewed) return frame.id;
  }
  return null;
}
