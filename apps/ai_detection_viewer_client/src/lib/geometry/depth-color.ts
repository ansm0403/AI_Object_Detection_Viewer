/**
 * Depth → color mapping for the pseudo point cloud (F1-A).
 *
 * Each point's world `z` (estimated depth, Immutable Rule #6 — NOT real depth)
 * is mapped through a two-color RAMP so the cloud reads as 3D instead of a flat
 * gray blob. Pure logic on purpose: conversion lives OUTSIDE React/Three.js
 * (Immutable Rule #3 spirit), so it is unit-testable and the component only
 * uploads the result to the GPU.
 *
 * Output is an `[r, g, b]` triple in the 0..1 range — the format a Three.js
 * `color` BufferAttribute / `vertexColors` material expects (NOT 0..255).
 *
 * Range strategy: the ramp is fit PER FRAME to the frame's actual point-z
 * `[min, max]` (see `depthRange`), NOT to the estimator's theoretical
 * `[MIN_Z=1, MAX_Z=8]`. Measured on the sample data, ~85% of detections land in
 * z∈[7,8] — coloring over [1,8] used only the top ~15% of the ramp, so the
 * gradient was invisible. Fitting per frame stretches each frame's real spread
 * across the whole ramp. Trade-off: the same object may shade differently
 * between frames (acceptable — depth is an approximation, Immutable Rule #6).
 * See Edge_F#1 Case 1.
 */

type Rgb = readonly [number, number, number];

/** Parse `#rrggbb` into a normalized 0..1 RGB triple. */
function hexToRgb01(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
}

/**
 * Color ramps (near → far). Defined as a lookup so the active palette can be
 * swapped with a single line below.
 *
 * Two constraints, both learned from render verification (Edge_F#1 Case 3):
 *   1. Both ends must be BRIGHT — a dark far end (e.g. indigo-900) vanishes into
 *      the near-black canvas bg (#0a0a0a), so the far half of every cloud
 *      disappears and the gradient dies.
 *   2. The two ends must differ in HUE, not just lightness — at small point
 *      sizes two similar light-blues read as one color. (The canvas also runs
 *      `flat` / no tone mapping so these saturated colors render true.)
 *   - cyanViolet:  cyan → violet. On-theme (cool) and clearly readable (default).
 *   - cyanMagenta: cyan → magenta. Maximum punch; less on-theme.
 *   - skyIndigo:   softer cool pair.
 */
const PALETTES = {
  cyanViolet: { near: hexToRgb01('#22d3ee'), far: hexToRgb01('#a855f7') },
  cyanMagenta: { near: hexToRgb01('#22d3ee'), far: hexToRgb01('#f472b6') },
  skyIndigo: { near: hexToRgb01('#7dd3fc'), far: hexToRgb01('#6366f1') },
} as const;

// ← To change the depth palette, swap ONLY this line.
const ACTIVE_PALETTE = PALETTES.cyanViolet;

/**
 * Min/max of the `z` values across a set of points — the per-frame domain the
 * ramp is fit to. Pure so the range derivation stays out of the component
 * (Immutable Rule #3), alongside the color math.
 *
 * @returns `[minZ, maxZ]`. Empty input returns `[0, 1]` (a stable placeholder;
 *   the caller never renders an empty cloud). All-equal z returns `[v, v]`,
 *   which `depthToColor` resolves to the ramp midpoint.
 */
export function depthRange(points: readonly { z: number }[]): [number, number] {
  if (points.length === 0) return [0, 1];
  let min = points[0].z;
  let max = points[0].z;
  for (let i = 1; i < points.length; i++) {
    const z = points[i].z;
    if (z < min) min = z;
    if (z > max) max = z;
  }
  return [min, max];
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

// a*(1-t) + b*t form (not a + (b-a)*t): it returns EXACTLY a at t=0 and b at
// t=1, so ramp endpoints land on the palette colors without float drift.
const lerp = (a: number, b: number, t: number) => a * (1 - t) + b * t;

/**
 * Map a depth `z` to a ramp color.
 *
 * @param z     point depth (world z)
 * @param minZ  near end of the range (maps to the ramp's `near` color)
 * @param maxZ  far end of the range (maps to the ramp's `far` color)
 * @returns `[r, g, b]` in 0..1
 *
 * - Smaller `z` → nearer end of the ramp (`t` toward 0).
 * - `z` outside `[minZ, maxZ]` is clamped: scattered point z can fall outside
 *   the estimator's center-z range (pointcloud-generator spreads points by
 *   ±size/2), so clamping keeps every point on-ramp. See Edge_F#1.
 * - Degenerate `minZ === maxZ` (single detection / all-equal z) would divide by
 *   zero; we return the ramp midpoint (`t = 0.5`) — a stable, honest "no depth
 *   spread" color. See Edge_F#1.
 */
export function depthToColor(
  z: number,
  minZ: number,
  maxZ: number,
): [number, number, number] {
  const denom = maxZ - minZ;
  const t = denom <= 0 ? 0.5 : clamp01((z - minZ) / denom);

  const { near, far } = ACTIVE_PALETTE;
  return [
    lerp(near[0], far[0], t),
    lerp(near[1], far[1], t),
    lerp(near[2], far[2], t),
  ];
}

export const __testing = {
  PALETTES,
  ACTIVE_PALETTE,
  hexToRgb01,
};
