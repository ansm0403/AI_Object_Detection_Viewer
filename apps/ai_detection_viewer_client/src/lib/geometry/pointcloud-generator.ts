import type { Detection3D, Point3D } from '@/lib/types';

/**
 * Pseudo point cloud generator.
 *
 * COCO has no real depth (Immutable Rule #7); these points are a visualization
 * trick (Immutable Rule #6) that scatters samples uniformly inside each
 * ESTIMATED 3D bbox volume. There is no LiDAR involved.
 *
 * The `rng` parameter is a 0-to-1 generator (default `Math.random`). Pass a
 * deterministic generator in tests to lock sampling output.
 */

const DEFAULT_POINTS_PER_DETECTION = 80;

export type Rng = () => number;

export function generatePointCloud(
  detections: Detection3D[],
  pointsPerDetection: number = DEFAULT_POINTS_PER_DETECTION,
  rng: Rng = Math.random,
): Point3D[] {
  if (pointsPerDetection <= 0 || detections.length === 0) return [];

  const points: Point3D[] = [];
  for (const d of detections) {
    for (let i = 0; i < pointsPerDetection; i++) {
      points.push(samplePointInBbox(d, rng));
    }
  }
  return points;
}

function samplePointInBbox(d: Detection3D, rng: Rng): Point3D {
  const [cx, cy, cz] = d.bbox3D.center;
  const [sx, sy, sz] = d.bbox3D.size;
  return {
    x: cx + (rng() - 0.5) * sx,
    y: cy + (rng() - 0.5) * sy,
    z: cz + (rng() - 0.5) * sz,
    detectionId: d.id,
    intensity: d.confidence,
  };
}

/**
 * Seedable PRNG (mulberry32). Pure JS, no deps. Use in tests for reproducible
 * sampling output without touching the runtime default of Math.random.
 */
export function makeRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const __testing = {
  DEFAULT_POINTS_PER_DETECTION,
};
