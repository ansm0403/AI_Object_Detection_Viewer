import type { Detection3D } from '@/lib/types';

/**
 * Euclidean distance of a 3D detection's center from the scene origin, in the
 * same units as `bbox3D.center`.
 *
 * For nuScenes (measured) frames this is a **real distance in metres from the
 * ego vehicle**: the global→ego transform puts the car at the origin, and the
 * ego→Three.js axis flip is a pure rotation (det = +1), so it preserves vector
 * magnitude. `|center|` therefore stays the true metric distance after both
 * steps. For COCO (estimated) frames the value is meaningless metres — which is
 * why the distance filter is only surfaced in the UI for measured frames.
 */
export function detectionDistance(d: Detection3D): number {
  const [x, y, z] = d.bbox3D.center;
  return Math.hypot(x, y, z);
}

/**
 * Returns the ids of the 3D detections within `maxDistance` of the origin.
 *
 * Pure function (lives outside React/Zustand, Immutable Rule #3) so the filter
 * is unit-tested without a store or Three.js. Boundary is inclusive
 * (`distance <= maxDistance`), so a slider parked at its max (≥ every box's
 * distance) returns all ids — i.e. the filter is "off" there. A non-finite
 * `maxDistance` (NaN) hides everything; callers pass a clamped finite value.
 */
export function selectIdsWithinDistance(
  detections3D: Detection3D[],
  maxDistance: number,
): Set<string> {
  const ids = new Set<string>();
  for (const d of detections3D) {
    if (detectionDistance(d) <= maxDistance) ids.add(d.id);
  }
  return ids;
}
