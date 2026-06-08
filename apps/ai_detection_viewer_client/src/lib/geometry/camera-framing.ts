/**
 * Pure camera-framing helper for the 3D viewer (F2-A).
 *
 * nuScenes boxes live at their real measured positions: spread tens of metres
 * ahead of the car (Three.js forward = −z) and laterally, unlike COCO's
 * estimator which packs boxes into a small, fixed `z∈[1,8]` band that the
 * hard-coded COCO camera was tuned for. So nuScenes needs a camera fit to the
 * actual box cloud, or the default COCO camera ends up looking the wrong way
 * (away from −z) with most boxes behind it. The math is kept here (pure,
 * testable) rather than in the R3F component (Immutable Rule #3 spirit).
 *
 * The returned camera sits BEHIND (+z) and ABOVE (+y) the box cloud's
 * horizontal centre, looking forward/down at it — a chase-cam framing of the
 * scene ahead of the ego vehicle.
 */

import type { Detection3D } from '@/lib/types';

export type Vec3 = [number, number, number];
export type CameraFraming = { position: Vec3; target: Vec3 };

// Used when a frame has no 3D boxes — a sane forward-looking overview so the
// empty scene still faces −z (where boxes would be) instead of the COCO +z.
const FALLBACK: CameraFraming = { position: [0, 12, 28], target: [0, 0, -8] };

// Keep the look target near the ground rather than at the vertical centre of
// the (very flat) box cloud, so the camera tilts down onto the scene.
const MAX_TARGET_Y = 2;

export function frameBoxesForCamera(
  centers: ReadonlyArray<readonly [number, number, number]>,
): CameraFraming {
  if (centers.length === 0) return FALLBACK;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, y, z] of centers) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const cz = (minZ + maxZ) / 2;

  // Pull the camera back proportionally to the larger horizontal extent so the
  // whole cloud fits; the constants add a floor for tight/near-degenerate
  // clouds (a single box still gets a reasonable standoff).
  const radius = Math.max(maxX - minX, maxZ - minZ) / 2;
  const back = radius * 1.6 + 12;
  const up = radius * 0.5 + 8;

  return {
    position: [cx, cy + up, cz + back],
    target: [cx, Math.min(cy, MAX_TARGET_Y), cz],
  };
}

/**
 * The OrbitControls look target for **camera-follow mode** (F2-D-1): the current
 * center of the selected object, or `null` when there is nothing to follow.
 *
 * Camera follow keeps the SELECTED object centered as it moves across keyframes
 * by aiming the OrbitControls pivot (`target`) at it each frame — the camera
 * stays 3rd-person and user-orbitable (only the aim point tracks). This helper
 * is the pure lookup behind that; the component passes the result as `target`
 * and snaps to it (decision Q2). Kept pure + tested (Immutable Rule #3).
 *
 * Returns `null` when:
 * - `selectedId` is null/undefined (nothing selected), or
 * - the selected id is not present in this frame's `detections3D` (the object
 *   left the camera / was filtered out). The caller then falls back to the fixed
 *   framing — so follow degrades gracefully to the F2-C fixed camera, never
 *   aiming at empty space.
 */
export function selectFollowTarget(
  detections3D: ReadonlyArray<Detection3D>,
  selectedId: string | null | undefined,
): Vec3 | null {
  if (!selectedId) return null;
  const hit = detections3D.find((d) => d.id === selectedId);
  return hit ? hit.bbox3D.center : null;
}
