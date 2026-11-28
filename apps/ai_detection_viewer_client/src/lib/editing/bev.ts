import * as THREE from 'three';
import type { Detection3D } from '@/lib/types';
import type { Pose, Vec3 } from '@/lib/geometry/transforms';
import type { BoxValues } from './box';

/**
 * The top view (bird's-eye view, BEV) of a frame (F8).
 *
 * A top-view point is `[x, y]` in METRES with the car at the origin: x grows to
 * the car's right, y grows BEHIND the car — so on screen (y down) the front of
 * the car points up. These are the render frame's (X, Z): a LiDAR point `p`
 * (already in the render frame) is simply at `[p.x, p.z]`, with no conversion.
 *
 * The view looks straight down the CAR's vertical axis — that is what the
 * points and boxes of a frame are expressed in. The car is not always level
 * (up to 4.59° on the shipped data), so that axis is not always the direction
 * of gravity. Boxes, though, are edited in the dataset's terms: they move in a
 * level (horizontal) plane and turn about gravity. `toGlobal` is where the two
 * meet: a point of the screen is taken to the point of a level plane that
 * appears there.
 *
 * Pure math (Immutable Rule #3).
 */
export type BevPoint = readonly [number, number];

export type BevProjector = {
  /** Where a global point appears in the top view. */
  toBev(global: Vec3): BevPoint;
  /**
   * The global point that appears at `point` and lies on the level plane
   * `z = planeZ` (the height of the box being edited). Moving a box by
   * following the pointer with this keeps its height unchanged.
   */
  toGlobal(point: BevPoint, planeZ: number): Vec3;
  /**
   * Heading as the top view shows it: the angle (radians, counter-clockwise)
   * of a box's front relative to the car's forward direction.
   */
  headingOfYaw(yaw: number): number;
  /** The yaw whose front appears at `heading` in the top view. Inverse of `headingOfYaw`. */
  yawOfHeading(heading: number): number;
};

export function makeBevProjector(egoPose: Pose): BevProjector {
  const [w, x, y, z] = egoPose.rotation;
  const rotation = new THREE.Quaternion(x, y, z, w);
  const inverse = rotation.clone().invert();
  const origin = new THREE.Vector3(...egoPose.translation);
  // The car's vertical axis, in the global frame. Its z part is cos(tilt) —
  // never near zero for a car that is on its wheels.
  const up = new THREE.Vector3(0, 0, 1).applyQuaternion(rotation);
  const scratch = new THREE.Vector3();

  const toGlobal = (point: BevPoint, planeZ: number): Vec3 => {
    // Top view [x, y] → ego (forward, left, 0) → global, then slide along the
    // car's vertical axis until the level plane is reached.
    scratch.set(-point[1], -point[0], 0).applyQuaternion(rotation).add(origin);
    const t = (planeZ - scratch.z) / up.z;
    return [scratch.x + t * up.x, scratch.y + t * up.y, planeZ];
  };

  return {
    toBev(global) {
      scratch.set(global[0], global[1], global[2]).sub(origin).applyQuaternion(inverse);
      return [-scratch.y, -scratch.x];
    },
    toGlobal,
    headingOfYaw(yaw) {
      scratch.set(Math.cos(yaw), Math.sin(yaw), 0).applyQuaternion(inverse);
      return Math.atan2(scratch.y, scratch.x);
    },
    yawOfHeading(heading) {
      // The direction on screen, lifted to the level plane: where the point one
      // metre along that direction appears from, minus where the origin does.
      const a = toGlobal([-Math.sin(heading), -Math.cos(heading)], 0);
      const o = toGlobal([0, 0], 0);
      return Math.atan2(a[1] - o[1], a[0] - o[0]);
    },
  };
}

/**
 * The footprint of a box that is already in the render frame (any box of a
 * parsed frame), as four top-view corners in drawing order: front-left,
 * front-right, back-right, back-left. Used to draw the boxes that are NOT
 * being edited — no conversion to the global frame is needed for those. For
 * the same box this gives the same corners as `footprintOf`.
 */
export function footprintOfRendered(
  bbox3D: Detection3D['bbox3D'],
): [BevPoint, BevPoint, BevPoint, BevPoint] {
  const [cx, , cz] = bbox3D.center;
  const [length, width] = bbox3D.size;
  const r = bbox3D.rotation ?? [0, 0, 0, 1];
  const q = new THREE.Quaternion(r[0], r[1], r[2], r[3]);
  // The box's own front (+x) and left (+y) axes in the render frame; only
  // their (x, z) parts show in the top view.
  const front = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
  const left = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  const at = (f: number, l: number): BevPoint => [
    cx + f * front.x + l * left.x,
    cz + f * front.z + l * left.z,
  ];
  const halfL = length / 2;
  const halfW = width / 2;
  return [at(halfL, halfW), at(halfL, -halfW), at(-halfL, -halfW), at(-halfL, halfW)];
}

/** The four corners and four side midpoints of a box, and its centre, in the top view. */
export type Footprint = {
  center: BevPoint;
  /** In drawing order: front-left, front-right, back-right, back-left. */
  corners: readonly [BevPoint, BevPoint, BevPoint, BevPoint];
  /** Midpoints of the four sides. */
  sides: { front: BevPoint; right: BevPoint; back: BevPoint; left: BevPoint };
  /** Unit vector, in the top view, pointing out of the box's front. */
  forward: BevPoint;
};

/**
 * The rectangle a box makes in the top view (its footprint) and where its
 * handles sit.
 *
 * The box's local axes: +x = front (along its length), +y = left (along its
 * width) — the nuScenes convention, the same one `boxCornersEgo` uses.
 */
export function footprintOf(values: BoxValues, projector: BevProjector): Footprint {
  const [cx, cy, cz] = values.translation;
  const [width, length] = values.size;
  const ax = Math.cos(values.yaw);
  const ay = Math.sin(values.yaw);
  // front direction a = (ax, ay); left direction b = (−ay, ax)
  const at = (alongFront: number, alongLeft: number): BevPoint =>
    projector.toBev([
      cx + alongFront * ax - alongLeft * ay,
      cy + alongFront * ay + alongLeft * ax,
      cz,
    ]);
  const halfL = length / 2;
  const halfW = width / 2;
  const center = at(0, 0);
  const front = at(halfL, 0);
  const dx = front[0] - center[0];
  const dy = front[1] - center[1];
  const norm = Math.hypot(dx, dy) || 1;
  return {
    center,
    corners: [at(halfL, halfW), at(halfL, -halfW), at(-halfL, -halfW), at(-halfL, halfW)],
    sides: { front, right: at(0, -halfW), back: at(-halfL, 0), left: at(0, halfW) },
    forward: [dx / norm, dy / norm],
  };
}
