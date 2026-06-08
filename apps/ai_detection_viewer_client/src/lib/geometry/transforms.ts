import * as THREE from 'three';

/**
 * Coordinate-frame transforms for the nuScenes integration (F2).
 *
 * nuScenes annotations live in the GLOBAL frame (fixed to the map), so even
 * "boxes only" needs a real transform before we can render relative to the car.
 * This module is pure math (Immutable Rule #3 — no React / Zustand). It uses
 * Three.js's pure math classes (`Vector3`, `Quaternion`, `Matrix4`) internally
 * but returns plain tuples at the boundary, so the internal `Detection3D` type
 * stays free of Three.js objects.
 *
 * Frames involved (all right-handed):
 *   GLOBAL  — fixed to the world/map. Coordinates can be hundreds of metres.
 *   EGO     — fixed to the car (car at origin). x→forward, y→left, z→UP.
 *   THREE   — the render frame for the 3D viewer. y→UP (Three.js convention).
 *
 * Two distinct outputs are built from one annotation:
 *   1) 3D render coords:  global → ego (`globalToEgo`) → axis flip (`egoToThree`).
 *   2) 2D projection:     stays in the PHYSICAL ego frame (z-up) and is handed to
 *      `projection.ts`. The axis flip below is render-only and must NOT be applied
 *      before projection, because camera intrinsics/extrinsics are defined in the
 *      physical nuScenes convention.
 *
 * Quaternion order caution: nuScenes stores quaternions as [w, x, y, z] (w first,
 * pyquaternion convention). Three.js and our `Detection3D.rotation` use
 * [x, y, z, w] (w last). `quatNuToThree` is the single conversion point.
 */

export type Vec3 = [number, number, number];
/** Quaternion in Three.js order [x, y, z, w]. */
export type QuatXYZW = [number, number, number, number];
/** Quaternion in nuScenes order [w, x, y, z]. */
export type QuatWXYZ = [number, number, number, number];

export type Pose = {
  /** Translation [x, y, z] in metres. */
  translation: Vec3;
  /** Orientation quaternion in nuScenes order [w, x, y, z]. */
  rotation: QuatWXYZ;
};

/**
 * Reorder a nuScenes quaternion [w, x, y, z] → Three.js [x, y, z, w].
 * `undefined` (an annotation with no rotation) → identity, so COCO estimated
 * boxes / F1 / existing tests stay valid (Immutable Rule D in F2 plan).
 */
export function quatNuToThree(q?: QuatWXYZ): QuatXYZW {
  if (!q) return [0, 0, 0, 1];
  const [w, x, y, z] = q;
  return [x, y, z, w];
}

/**
 * GLOBAL point → EGO point (physical, z-up):  p_ego = R_ego⁻¹ · (p_global − t_ego).
 * "Subtract the car's position, then undo the car's rotation."
 */
export function globalToEgo(pGlobal: Vec3, egoPose: Pose): Vec3 {
  const p = new THREE.Vector3(pGlobal[0], pGlobal[1], pGlobal[2]);
  const t = new THREE.Vector3(
    egoPose.translation[0],
    egoPose.translation[1],
    egoPose.translation[2],
  );
  const qEgoInv = toThreeQuat(quatNuToThree(egoPose.rotation)).invert();
  p.sub(t).applyQuaternion(qEgoInv);
  return [p.x, p.y, p.z];
}

/**
 * Box orientation in GLOBAL → EGO (physical):  q_ego = q_ego_pose⁻¹ · q_box.
 * Inputs are nuScenes-order [w, x, y, z]; result is Three.js-order [x, y, z, w].
 */
export function globalQuatToEgo(qBoxNu: QuatWXYZ, egoRotationNu: QuatWXYZ): QuatXYZW {
  const qBox = toThreeQuat(quatNuToThree(qBoxNu));
  const qEgoInv = toThreeQuat(quatNuToThree(egoRotationNu)).invert();
  const result = qEgoInv.multiply(qBox); // q_ego⁻¹ · q_box
  return [result.x, result.y, result.z, result.w];
}

/**
 * EGO point (physical, z-up) → THREE render point (y-up).
 * Axis rule: (x, y, z) → (-y, z, -x).
 *   up (ego z)      → up (three y)
 *   forward (ego x) → into the screen (three -z)
 *   left (ego y)    → left (three -x)
 * This is a pure rotation (det = +1), so it never mirrors handedness — quaternions
 * and box orientations stay correct. The residual choice of "which way forward
 * initially points" is a camera-framing concern handled in the UI session.
 */
export function egoToThree(p: Vec3): Vec3 {
  const [x, y, z] = p;
  return [-y, z, -x];
}

/**
 * Box orientation in EGO → THREE render frame:  q_three = q_flip · q_ego.
 * The whole scene is rotated by the axis flip, so each box's orientation is
 * pre-multiplied by the flip quaternion. Local box extents (size) are unchanged.
 */
export function egoQuatToThree(qEgo: QuatXYZW): QuatXYZW {
  const result = AXIS_FLIP_QUAT.clone().multiply(toThreeQuat(qEgo));
  return [result.x, result.y, result.z, result.w];
}

/**
 * nuScenes box `size` [w, l, h] (width, length, height) → local-axis extents
 * [l, w, h] for a Three.js boxGeometry, whose local axes are x, y, z.
 * nuScenes box local axes are x=length, y=width, z=height; mapping straight
 * across would distort the box (the F-doc "size axis order" trap).
 */
export function nuSizeToLocal(size: Vec3): Vec3 {
  const [w, l, h] = size;
  return [l, w, h];
}

// --- internal helpers -------------------------------------------------------

function toThreeQuat(q: QuatXYZW): THREE.Quaternion {
  return new THREE.Quaternion(q[0], q[1], q[2], q[3]);
}

// Rotation matrix for the EGO → THREE axis flip (x,y,z)→(-y,z,-x), row-major.
// Columns are the images of the ego basis vectors:
//   ego x (fwd)  → (0, 0, -1)
//   ego y (left) → (-1, 0, 0)
//   ego z (up)   → (0, 1, 0)
const AXIS_FLIP_MATRIX = new THREE.Matrix4().set(
  0, -1, 0, 0,
  0, 0, 1, 0,
  -1, 0, 0, 0,
  0, 0, 0, 1,
);
const AXIS_FLIP_QUAT = new THREE.Quaternion().setFromRotationMatrix(AXIS_FLIP_MATRIX);

export const __testing = {
  AXIS_FLIP_MATRIX,
  AXIS_FLIP_QUAT,
  toThreeQuat,
};
