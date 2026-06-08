import * as THREE from 'three';
import type { Detection2D } from '@/lib/types';
import { quatNuToThree, type Pose, type QuatXYZW, type Vec3 } from './transforms';

/**
 * 3D → 2D projection for the nuScenes integration (F2).
 *
 * nuScenes core annotations are 3D-only — there are no 2D boxes. To keep the
 * 2D↔3D selection-sync signature, we PROJECT each 3D box into the camera image
 * and take the axis-aligned bounding box (AABB) of its eight projected corners.
 * Because the projected 2D box derives from the same `instance` annotation as the
 * 3D box, they share one id (Immutable Rule #1) — the parser wires that.
 *
 * All math here runs in the PHYSICAL nuScenes convention (ego frame is z-up).
 * The render-only z-up→y-up axis flip from `transforms.ts` must NOT be applied
 * before projection: camera intrinsics/extrinsics are defined in this convention.
 *
 * Pure math (Immutable Rule #3 — no React / Zustand). Three.js math classes are
 * used internally; the boundary returns plain numbers / `Detection2D['bbox']`.
 *
 * Camera optical frame (nuScenes): x→right, y→down, z→FORWARD (into the scene),
 * so a point in front of the camera has z > 0.
 */

/** A 3×3 camera intrinsic matrix K, row-major. */
export type Intrinsic = [
  [number, number, number],
  [number, number, number],
  [number, number, number],
];

export type PixelProjection = {
  /** Horizontal pixel coordinate (only meaningful when `inFront`). */
  u: number;
  /** Vertical pixel coordinate (only meaningful when `inFront`). */
  v: number;
  /** Camera-forward distance in metres (the optical-frame z). */
  depth: number;
  /** True when the point is in front of the camera (depth > 0). */
  inFront: boolean;
};

/**
 * EGO point (physical) → camera optical frame:  p_cam = R_sensor⁻¹ · (p_ego − t_sensor).
 * Same "into a child frame" math as `globalToEgo`, but ego→sensor.
 */
export function egoToCamera(pEgo: Vec3, sensor: Pose): Vec3 {
  const p = new THREE.Vector3(pEgo[0], pEgo[1], pEgo[2]);
  const t = new THREE.Vector3(
    sensor.translation[0],
    sensor.translation[1],
    sensor.translation[2],
  );
  const xyzw = quatNuToThree(sensor.rotation);
  const qInv = new THREE.Quaternion(xyzw[0], xyzw[1], xyzw[2], xyzw[3]).invert();
  p.sub(t).applyQuaternion(qInv);
  return [p.x, p.y, p.z];
}

/**
 * Camera-frame point → pixel via the intrinsic matrix:
 *   [u_h, v_h, w_h]ᵀ = K · p_cam,   pixel = (u_h / w_h, v_h / w_h).
 * `inFront` is keyed on the optical-frame depth (z), so a behind-camera point is
 * flagged regardless of K; the caller culls on it (u/v are meaningless then).
 */
export function cameraToPixel(pCam: Vec3, K: Intrinsic): PixelProjection {
  const [x, y, z] = pCam;
  const uh = K[0][0] * x + K[0][1] * y + K[0][2] * z;
  const vh = K[1][0] * x + K[1][1] * y + K[1][2] * z;
  const wh = K[2][0] * x + K[2][1] * y + K[2][2] * z;
  return { u: uh / wh, v: vh / wh, depth: z, inFront: z > 0 };
}

/**
 * Eight corners of a box given its EGO-frame center, local-axis extents
 * [l, w, h] (see `nuSizeToLocal`), and EGO orientation quaternion [x, y, z, w].
 * Corner order is irrelevant — only the AABB of the set is used downstream.
 */
export function boxCornersEgo(
  center: Vec3,
  localSize: Vec3,
  quat: QuatXYZW,
): Vec3[] {
  const [l, w, h] = localSize;
  const q = new THREE.Quaternion(quat[0], quat[1], quat[2], quat[3]);
  const c = new THREE.Vector3(center[0], center[1], center[2]);
  const corners: Vec3[] = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const p = new THREE.Vector3((sx * l) / 2, (sy * w) / 2, (sz * h) / 2)
          .applyQuaternion(q)
          .add(c);
        corners.push([p.x, p.y, p.z]);
      }
    }
  }
  return corners;
}

/**
 * Project EGO-frame box corners to the camera image and return the AABB as a
 * `Detection2D['bbox']`, or `null` when there is no valid 2D box:
 *   - any corner is behind the camera (depth ≤ 0) → null (3D box still renders);
 *   - the AABB, clamped to the image bounds, is empty (fully off-screen) → null.
 * The clamp keeps boxes that straddle an image edge while discarding ones that
 * fall entirely outside the frame.
 */
export function projectCornersToBbox(
  corners: Vec3[],
  sensor: Pose,
  K: Intrinsic,
  imageWidth: number,
  imageHeight: number,
): Detection2D['bbox'] | null {
  let minU = Infinity;
  let minV = Infinity;
  let maxU = -Infinity;
  let maxV = -Infinity;

  for (const corner of corners) {
    const pixel = cameraToPixel(egoToCamera(corner, sensor), K);
    if (!pixel.inFront) return null;
    minU = Math.min(minU, pixel.u);
    maxU = Math.max(maxU, pixel.u);
    minV = Math.min(minV, pixel.v);
    maxV = Math.max(maxV, pixel.v);
  }

  const x0 = Math.max(0, minU);
  const y0 = Math.max(0, minV);
  const x1 = Math.min(imageWidth, maxU);
  const y1 = Math.min(imageHeight, maxV);
  if (x1 <= x0 || y1 <= y0) return null; // fully off-screen / degenerate

  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}
