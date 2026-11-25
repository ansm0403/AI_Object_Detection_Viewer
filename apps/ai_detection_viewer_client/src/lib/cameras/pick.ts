import type { Detection2D, Frame } from '@/lib/types';
import { cameraViews } from './views';

/**
 * (F6) Which camera to show for an object.
 *
 * Neighbouring cameras overlap a little at the edges of their view, so an
 * object there is in two photos — usually whole in one and cut off by the
 * image border in the other. The photo to check a box against is the one that
 * shows more of it.
 */

/**
 * How much of an object's projected box lies inside the photo, 0–1.
 *
 * `bbox` is the rectangle around the eight projected corners CUT to the image;
 * `corners` are those eight points uncut. Their area ratio is the share of the
 * box the photo actually contains: 1 = entirely in view, 0.2 = four fifths of
 * it are beyond the image edge.
 *
 * A box without corners (a hand-drawn 2D box, or data prepped before F4) is
 * taken as fully visible: nothing says it is cut.
 */
export function visibleFraction(detection: Detection2D): number {
  const corners = detection.corners;
  if (!corners || corners.length === 0) return 1;
  let minU = Infinity;
  let minV = Infinity;
  let maxU = -Infinity;
  let maxV = -Infinity;
  for (const [u, v] of corners) {
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }
  const fullArea = (maxU - minU) * (maxV - minV);
  const { width, height } = detection.bbox;
  if (!(fullArea > 0) || !(width > 0) || !(height > 0)) return 0;
  // Never above 1: rounding must not rank one whole box over another.
  return Math.min(1, (width * height) / fullArea);
}

type Ranked = { name: string; fraction: number; area: number; order: number };

/** Best view first: larger visible share, then larger on the image, then camera order. */
const byBestView = (a: Ranked, b: Ranked) =>
  b.fraction - a.fraction || b.area - a.area || a.order - b.order;

const rank = (name: string, detection: Detection2D, order: number): Ranked => ({
  name,
  fraction: visibleFraction(detection),
  area: detection.bbox.width * detection.bbox.height,
  order,
});

/**
 * The cameras that see an object, BEST VIEW FIRST: the camera showing the
 * largest share of the box (`visibleFraction`); between equals, the one where
 * the box is larger on the image; then the frame's camera order.
 *
 * Empty when no camera sees it. The first entry is the photo to check the box
 * against; lists and labels show the names in this order.
 */
export function camerasByBestView(frame: Frame, objectId: string): string[] {
  const ranked: Ranked[] = [];
  cameraViews(frame).forEach((view, order) => {
    const detection = view.detections2D.find((d) => d.id === objectId);
    if (detection) ranked.push(rank(view.name, detection, order));
  });
  return ranked.sort(byBestView).map((r) => r.name);
}

/**
 * `camerasByBestView` for every object of the frame that a camera sees, in one
 * pass — for lists that need the answer per row.
 */
export function bestViewsByObject(frame: Frame): Map<string, string[]> {
  const ranked = new Map<string, Ranked[]>();
  cameraViews(frame).forEach((view, order) => {
    for (const detection of view.detections2D) {
      const entry = rank(view.name, detection, order);
      const list = ranked.get(detection.id);
      if (list) list.push(entry);
      else ranked.set(detection.id, [entry]);
    }
  });
  const names = new Map<string, string[]>();
  for (const [id, list] of ranked) names.set(id, list.sort(byBestView).map((r) => r.name));
  return names;
}

/**
 * The camera to put on screen for `objectId`, given the camera shown now.
 *
 *  1. No object, or no camera sees it → keep `current` (nothing to look for).
 *  2. `current` sees it → keep `current`. The photo must not change under the
 *     user when the box is already in view, even if a neighbour shows more.
 *  3. Otherwise the best view (`camerasByBestView`).
 *
 * Returns a camera name of this frame, or `current` unchanged (which may be
 * `null`, or a name the frame does not have — the caller decides the fallback).
 * Pure: the page calls it when the selection or the frame changes.
 */
export function pickCamera(
  frame: Frame,
  objectId: string | null | undefined,
  current: string | null,
): string | null {
  if (!objectId) return current;
  const seeing = camerasByBestView(frame, objectId);
  if (seeing.length === 0) return current;
  return current !== null && seeing.includes(current) ? current : seeing[0];
}

/**
 * The camera next to `current` in a row of cameras (`direction` +1 = to the
 * right, −1 = to the left). The row wraps: the cameras stand in a ring around
 * the car, so going right from the last one arrives at the first.
 *
 * `current` not in the row → the first camera for +1, the last for −1. An
 * empty row → `null`.
 */
export function stepCamera(
  row: readonly string[],
  current: string | null,
  direction: 1 | -1,
): string | null {
  if (row.length === 0) return null;
  const index = current === null ? -1 : row.indexOf(current);
  if (index === -1) return direction === 1 ? row[0] : row[row.length - 1];
  return row[(index + direction + row.length) % row.length];
}
