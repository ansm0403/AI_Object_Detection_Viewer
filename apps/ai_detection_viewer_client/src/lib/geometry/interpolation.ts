/**
 * Pose interpolation for inter-frame box tween (F2-D-2).
 *
 * nuScenes keyframes are ~0.5 s apart, but the scene renders at ~60 fps. To make
 * autoplay motion continuous instead of snapping every keyframe, a tracked box is
 * blended from its CURRENT keyframe pose toward its NEXT keyframe pose over the
 * 0.5 s interval. These are the pure blend functions behind that; the per-frame
 * clock + the keyframe data live in the components (Immutable Rule #3: the math
 * is here, pure and unit-tested).
 *
 * Honesty note (Immutable Rule #6): an interpolated in-between pose is NOT a
 * measured value — only the keyframe-snapped poses are. The component tweens ONLY
 * while autoplay is running; paused / scrubbing shows the exact measured keyframe
 * (these functions return the exact endpoint at t=0 / t=1). The "Measured" badge
 * always refers to the keyframe data.
 */

import * as THREE from 'three';
import type { Vec3, QuatXYZW } from './transforms';

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

/**
 * Linear interpolation between two 3D positions: `a + (b − a) · t`.
 * `t` is clamped to `[0, 1]`, so `t ≤ 0 → a` and `t ≥ 1 → b` exactly (the box
 * sits on its real measured endpoint at the keyframe boundaries).
 */
export function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  const tc = clamp01(t);
  return [
    a[0] + (b[0] - a[0]) * tc,
    a[1] + (b[1] - a[1]) * tc,
    a[2] + (b[2] - a[2]) * tc,
  ];
}

// Reused scratch quaternions — slerp is called once per tweened box per frame, so
// avoiding a fresh allocation each call keeps the hot path cheap. Pure: inputs are
// copied in, a plain array is copied out; no shared state leaks between calls.
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();

/**
 * Spherical linear interpolation between two rotations (quaternions `[x,y,z,w]`).
 * Unlike a plain component-wise lerp, slerp follows the shortest arc at constant
 * angular speed, so the box rotates naturally. Delegates to Three.js'
 * `Quaternion.slerp` (the correct, well-tested implementation — Rule #3 keeps the
 * thin wrapper pure + tested rather than re-deriving the math). `t` clamped to
 * `[0, 1]` so the endpoints are the exact measured orientations.
 */
export function slerpQuat(a: QuatXYZW, b: QuatXYZW, t: number): QuatXYZW {
  _qa.set(a[0], a[1], a[2], a[3]);
  _qb.set(b[0], b[1], b[2], b[3]);
  _qa.slerp(_qb, clamp01(t));
  return [_qa.x, _qa.y, _qa.z, _qa.w];
}
