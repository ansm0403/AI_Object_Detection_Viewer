import type { Detection3D } from '@/lib/types';
import {
  egoQuatToGlobal,
  egoToGlobal,
  threeQuatToEgo,
  threeToEgo,
  type Pose,
  type QuatWXYZ,
  type QuatXYZW,
  type Vec3,
} from '@/lib/geometry/transforms';
import type { GlobalBoxGeometry } from '@/lib/nuscenes/box-views';

/**
 * The seven numbers of a box (F8).
 *
 * This is how nuScenes writes a box — centre in the GLOBAL frame, size as
 * width / length / height, and ONE angle — and it is how an edit is stored.
 *
 * Why one angle is enough: nuScenes turns its boxes about the vertical (gravity)
 * axis only. Measured on all 18,538 shipped boxes, the box's own vertical axis
 * is off the global vertical by at most 0.000001°. So `yaw` loses nothing, and
 * an edited box stays a box nuScenes itself could have written.
 *
 * The top view edits five of the seven (x, y, width, length, yaw); z and the
 * height are edited by number. Nothing here knows about React or the store
 * (Immutable Rule #3).
 */
export type BoxValues = {
  /** Centre in the GLOBAL frame [x, y, z], metres. z is up (gravity). */
  translation: Vec3;
  /** [width, length, height] in metres — nuScenes order. */
  size: Vec3;
  /** Rotation about the global vertical axis, radians, counter-clockwise seen from above. */
  yaw: number;
};

const IDENTITY_XYZW: QuatXYZW = [0, 0, 0, 1];

/** The quaternion [w, x, y, z] of a rotation by `yaw` about the vertical axis. */
export function yawToQuat(yaw: number): QuatWXYZ {
  return [Math.cos(yaw / 2), 0, 0, Math.sin(yaw / 2)];
}

/**
 * The yaw of a quaternion [w, x, y, z]: the direction, seen from above, in
 * which the rotated x axis (the box's front) points. For a pure-yaw quaternion
 * this is the whole rotation.
 */
export function quatToYaw(q: QuatWXYZ): number {
  const [w, x, y, z] = q;
  return Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
}

/** An angle brought into (−π, π]. */
export function normalizeAngle(radians: number): number {
  const turn = 2 * Math.PI;
  const wrapped = ((radians % turn) + turn) % turn; // [0, 2π)
  return wrapped > Math.PI ? wrapped - turn : wrapped;
}

/** The box in the dataset's own terms (what `lib/nuscenes/box-views` takes). */
export function toGlobalGeometry(values: BoxValues): GlobalBoxGeometry {
  return { translation: values.translation, size: values.size, rotation: yawToQuat(values.yaw) };
}

/**
 * The seven numbers of a box the parser made: the render-frame box taken back
 * through the frame's ego pose to the global frame — the inverse of
 * `boxInFrame`.
 *
 * On the shipped data the result equals the file's own values to 2.3e-13 m
 * (centre), exactly (size) and 0.000006° (rotation, the noise floor of the
 * angle computation).
 *
 * Only for MEASURED boxes (nuScenes), whose rotation is a yaw: anything else in
 * the rotation is not representable in `BoxValues` and would be lost. A COCO
 * box has no measured rotation at all (its box is an estimate laid along the
 * render axes) — such frames cannot be edited, see `canEditFrame`.
 */
export function boxValuesOf(bbox3D: Detection3D['bbox3D'], frameEgoPose: Pose): BoxValues {
  const [length, width, height] = bbox3D.size;
  const rotation = egoQuatToGlobal(
    threeQuatToEgo(bbox3D.rotation ?? IDENTITY_XYZW),
    frameEgoPose.rotation,
  );
  return {
    translation: egoToGlobal(threeToEgo(bbox3D.center), frameEgoPose),
    size: [width, length, height],
    yaw: quatToYaw(rotation),
  };
}

/** Same box, to within `epsilon` (metres / radians)? */
export function sameBoxValues(a: BoxValues, b: BoxValues, epsilon = 1e-9): boolean {
  for (let i = 0; i < 3; i += 1) {
    if (Math.abs(a.translation[i] - b.translation[i]) > epsilon) return false;
    if (Math.abs(a.size[i] - b.size[i]) > epsilon) return false;
  }
  return Math.abs(normalizeAngle(a.yaw - b.yaw)) <= epsilon;
}

/** Every number finite, every size positive — a box that can be drawn. */
export function isValidBoxValues(value: BoxValues): boolean {
  return (
    value.translation.length === 3 &&
    value.size.length === 3 &&
    value.translation.every((n) => Number.isFinite(n)) &&
    value.size.every((n) => Number.isFinite(n) && n > 0) &&
    Number.isFinite(value.yaw)
  );
}
