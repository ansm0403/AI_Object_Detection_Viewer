import type { Frame } from '@/lib/types';
import { getReview } from './records';
import type { ReviewMap } from './types';

/**
 * (F8) Walking through the REJECTED boxes — across frames and scenes.
 *
 * A reviewer first judges boxes (F4) and later comes back to the rejected ones
 * to edit them. This gives that second pass an order: scene by scene (the
 * order the scenes are given in), frame by frame, and within a frame in the
 * frame's own box order. The order depends only on the data and the records,
 * never on what is on screen, so "next" always means the same box.
 *
 * Pure (Immutable Rule #3). It reads ids only — which box is selected stays
 * the page's one `selectedObjectId` (Rule #2).
 */

/** A scene's frames, as the caller has them in memory. */
export type SceneFrames = { name: string; frames: readonly Frame[] };

/** Where a box is: [scene index, frame index, box index]. Compared left to right. */
export type BoxPosition = readonly [number, number, number];

export type RejectedBox = {
  scene: string;
  frameId: string;
  objectId: string;
  at: BoxPosition;
};

const compare = (a: BoxPosition, b: BoxPosition): number =>
  a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/**
 * Every rejected box of the given scenes, in walking order.
 *
 * `isVisible` is the page's filter rule (class chips, distance): a box it
 * hides cannot be worked on, so it is left out — otherwise "next" would land
 * on a box the editor refuses. Records whose box is not in the given scenes
 * (a scene that is not loaded, a stale record) are left out as well.
 */
export function rejectedBoxes(
  scenes: readonly SceneFrames[],
  reviews: ReviewMap,
  isVisible?: (frame: Frame) => ReadonlySet<string>,
): RejectedBox[] {
  // Nothing rejected → nothing to look for (the common case; skips the walk).
  let any = false;
  for (const key in reviews) {
    if (reviews[key].verdict === 'rejected') {
      any = true;
      break;
    }
  }
  if (!any) return [];

  const boxes: RejectedBox[] = [];
  scenes.forEach((scene, s) => {
    scene.frames.forEach((frame, f) => {
      let visible: ReadonlySet<string> | undefined;
      frame.detections3D.forEach((box, b) => {
        if (getReview(reviews, frame.id, box.id)?.verdict !== 'rejected') return;
        if (isVisible) {
          visible ??= isVisible(frame);
          if (!visible.has(box.id)) return;
        }
        boxes.push({ scene: scene.name, frameId: frame.id, objectId: box.id, at: [s, f, b] });
      });
    });
  });
  return boxes;
}

/**
 * Where the reviewer is: the position of the selected box, or — with nothing
 * selected, or a selection that has no box in the frame — just BEFORE the
 * frame's first box (so "next" finds the frame's own rejected boxes first).
 * `null` when the frame is not in the given scenes.
 */
export function positionOf(
  scenes: readonly SceneFrames[],
  frameId: string | null,
  objectId: string | null,
): BoxPosition | null {
  if (frameId === null) return null;
  for (let s = 0; s < scenes.length; s += 1) {
    const f = scenes[s].frames.findIndex((frame) => frame.id === frameId);
    if (f === -1) continue;
    const b =
      objectId === null
        ? -1
        : scenes[s].frames[f].detections3D.findIndex((box) => box.id === objectId);
    return [s, f, b];
  }
  return null;
}

/** 0-based place of the box at `position` among the rejected ones; -1 when it is not one of them. */
export function rejectedIndexAt(boxes: readonly RejectedBox[], position: BoxPosition | null): number {
  if (!position) return -1;
  return boxes.findIndex((box) => compare(box.at, position) === 0);
}

/**
 * The rejected box after (`1`) or before (`-1`) `position`, wrapping around.
 * `null` when there is none to go to: no rejected box at all, or the only one
 * is the box the reviewer is already on. With no position (a frame that is not
 * in the scenes) the walk starts at the first / last one.
 */
export function stepRejected(
  boxes: readonly RejectedBox[],
  position: BoxPosition | null,
  direction: 1 | -1,
): RejectedBox | null {
  if (boxes.length === 0) return null;
  const first = boxes[0];
  const last = boxes[boxes.length - 1];
  if (!position) return direction === 1 ? first : last;
  let target: RejectedBox;
  if (direction === 1) {
    target = boxes.find((box) => compare(box.at, position) > 0) ?? first;
  } else {
    let before: RejectedBox | undefined;
    for (const box of boxes) {
      if (compare(box.at, position) < 0) before = box;
      else break;
    }
    target = before ?? last;
  }
  return compare(target.at, position) === 0 ? null : target;
}
