import type { Detection3D, Frame } from '@/lib/types';
import { getReview } from './records';
import type { ReviewMap } from './types';

/**
 * How the object list — and therefore the review queue — is ordered.
 *  - `scene`:    the dataset's own order.
 *  - `evidence`: fewest LiDAR points first, so the boxes with the weakest
 *                sensor evidence are looked at first.
 *  - `camera`:   boxes visible in the camera image first (they can be checked
 *                against the photo), the rest after.
 */
export type QueueOrder = 'scene' | 'evidence' | 'camera';

export const QUEUE_ORDERS: readonly QueueOrder[] = ['scene', 'evidence', 'camera'];

/**
 * The frame's 3D boxes in list order.
 *
 * Every ordering is a STABLE sort over the dataset order, so boxes that tie
 * keep their relative position and the list does not reshuffle between renders.
 * A box without a LiDAR count (older sample file) sorts after all counted ones
 * under `evidence` — "unknown" must not masquerade as "no points".
 */
export function orderBoxes(frame: Frame, order: QueueOrder): Detection3D[] {
  const boxes = frame.detections3D;
  if (order === 'scene') return boxes;

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
  } else {
    const inCamera = new Set(frame.detections2D.map((d) => d.id));
    const rank = (b: Detection3D) => (inCamera.has(b.id) ? 0 : 1);
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
 * The id of the next frame (after `currentFrameId`, wrapping) that still has an
 * unreviewed box. Looks at ALL boxes of each frame, not at the filtered queue:
 * "is this frame finished" is a fact about the data, not about the current
 * filter. `null` when every other frame is fully reviewed.
 */
export function nextFrameWithUnreviewed(
  frames: Frame[],
  reviews: ReviewMap,
  currentFrameId: string | null,
): string | null {
  if (frames.length === 0) return null;
  const start = frames.findIndex((f) => f.id === currentFrameId);
  for (let step = 1; step <= frames.length; step += 1) {
    const frame = frames[(start + step + frames.length) % frames.length];
    if (frame.id === currentFrameId) continue;
    const hasUnreviewed = frame.detections3D.some(
      (box) => !getReview(reviews, frame.id, box.id),
    );
    if (hasUnreviewed) return frame.id;
  }
  return null;
}
