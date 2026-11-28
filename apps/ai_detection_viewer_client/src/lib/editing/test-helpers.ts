/**
 * Test support (not shipped code) for `lib/editing`.
 */
import * as THREE from 'three';
import type { Pose } from '@/lib/geometry/transforms';
import { parseNuScenes } from '@/lib/nuscenes';
import { readReferenceFramesRaw } from '@/lib/nuscenes/test-helpers';
import type { Frame } from '@/lib/types';
import type { BoxValues } from './box';

/** A car standing level at the map origin, facing along +x. Top view = the map, turned. */
export const LEVEL_POSE: Pose = { translation: [0, 0, 0], rotation: [1, 0, 0, 0] };

/**
 * A car somewhere on the map, turned 40° and NOT level (a few degrees of pitch
 * and roll) — the case that separates "the car's up" from "gravity".
 */
export function tiltedPose(): Pose {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.03, -0.05, 0.7, 'ZYX'));
  return { translation: [411.3, 1180.6, 0], rotation: [q.w, q.x, q.y, q.z] };
}

/** A car-sized box 10 m ahead and 3 m to the left of a level car at the origin. */
export const CAR: BoxValues = { translation: [10, 3, 0.8], size: [1.8, 4.5, 1.6], yaw: 0.4 };

/** The value, or a thrown error naming what was missing (tests: instead of `!`). */
export function must<T>(value: T | null | undefined, what = 'value'): T {
  if (value === null || value === undefined) throw new Error(`missing ${what}`);
  return value;
}

let reference: Frame[] | null = null;

/** The first ten frames of scene-0916, parsed (real boxes, real calibration). Parsed once. */
export function referenceFrames(): Frame[] {
  reference ??= parseNuScenes(readReferenceFramesRaw());
  return reference;
}
