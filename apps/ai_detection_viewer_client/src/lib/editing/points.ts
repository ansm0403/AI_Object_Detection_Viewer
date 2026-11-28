import * as THREE from 'three';
import type { Detection3D, Point3D } from '@/lib/types';

/**
 * Which LiDAR points are inside a box (F8).
 *
 * The points of a frame are what a box is checked against, so the top view
 * draws the ones inside the box being edited in another colour and counts
 * them. Both the points and the box are in the render frame, so no frame
 * conversion is involved: a point is brought into the box's own axes and
 * compared with half the box's size.
 *
 * The count is of the points THIS APP carries — a thinned copy of the sweep —
 * and is therefore not the dataset's `num_lidar_pts`, which nuScenes counted on
 * the original sweep, for the original box. The UI names the two differently.
 */

/** A test "is this point inside the box?", prepared once and then cheap per point. */
export function makeInsideTest(bbox3D: Detection3D['bbox3D']): (point: Point3D) => boolean {
  const [cx, cy, cz] = bbox3D.center;
  const [length, width, height] = bbox3D.size;
  const r = bbox3D.rotation ?? [0, 0, 0, 1];
  // The inverse rotation as a matrix: three dot products per point instead of
  // a quaternion product.
  const e = new THREE.Matrix4().makeRotationFromQuaternion(
    new THREE.Quaternion(r[0], r[1], r[2], r[3]).invert(),
  ).elements;
  const hx = length / 2;
  const hy = width / 2;
  const hz = height / 2;
  return (point) => {
    const dx = point.x - cx;
    const dy = point.y - cy;
    const dz = point.z - cz;
    // Column-major 4×4: row i of the rotation is (e[i], e[i + 4], e[i + 8]).
    return (
      Math.abs(e[0] * dx + e[4] * dy + e[8] * dz) <= hx &&
      Math.abs(e[1] * dx + e[5] * dy + e[9] * dz) <= hy &&
      Math.abs(e[2] * dx + e[6] * dy + e[10] * dz) <= hz
    );
  };
}

/** How many of `points` are inside the box. */
export function countInside(points: readonly Point3D[], bbox3D: Detection3D['bbox3D']): number {
  const inside = makeInsideTest(bbox3D);
  let count = 0;
  for (const point of points) if (inside(point)) count += 1;
  return count;
}
