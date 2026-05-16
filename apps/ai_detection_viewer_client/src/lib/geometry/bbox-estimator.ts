import type { Detection2D, Detection3D } from '@/lib/types';

/**
 * 2D bbox → 3D bbox ESTIMATION.
 *
 * COCO is a 2D-only dataset (Immutable Rule #7); these 3D coordinates are
 * inferred from 2D bbox geometry, NOT measured depth. The mapping below is a
 * visualization trick (Immutable Rule #6).
 *
 * Coordinate systems
 *   Image:  x→right, y→DOWN, origin top-left.
 *   World:  x→right, y→UP,   origin at scene center. (Three.js convention.)
 *
 * Mapping (per detection)
 *   cxN = ((bbox.x + bbox.width  / 2) / W) * 2 - 1     // image x → [-1, 1]
 *   cyN = ((bbox.y + bbox.height / 2) / H) * 2 - 1     // image y → [-1, 1]
 *   x_world  =  cxN * SCENE_HALF_Y * aspect
 *   y_world  = -cyN * SCENE_HALF_Y                     // flip image y
 *   area     = (bbox.width / W) * (bbox.height / H)    // [0, 1]
 *   z_world  = MAX_Z - area * (MAX_Z - MIN_Z)          // larger area → smaller z
 *
 * Size (3D bbox extent)
 *   sx = (bbox.width  / W) * 2 * SCENE_HALF_Y * aspect
 *   sy = (bbox.height / H) * 2 * SCENE_HALF_Y
 *   sz = (sx + sy) / 2                                  // pseudo depth thickness
 *   Each of sx/sy/sz is then clamped to MIN_SIZE_WORLD so 0-width/0-height
 *   COCO bboxes (which the Step 1 parser permits) still render as a visible
 *   wireframe. The center/area/depth are NOT clamped — only the rendered size.
 */

const SCENE_HALF_Y = 5;
const MIN_Z = 1;
const MAX_Z = 8;
const MIN_SIZE_WORLD = 0.05;

type Bbox = Detection2D['bbox'];

export function estimateDetection3D(
  detection: Detection2D,
  imageWidth: number,
  imageHeight: number,
): Detection3D {
  const center = estimateCenter(detection.bbox, imageWidth, imageHeight);
  const size = estimateSize(detection.bbox, imageWidth, imageHeight);

  return {
    id: detection.id,
    class: detection.class,
    confidence: detection.confidence,
    bbox3D: { center, size },
  };
}

export function estimateDetections3D(
  detections: Detection2D[],
  imageWidth: number,
  imageHeight: number,
): Detection3D[] {
  return detections.map((d) => estimateDetection3D(d, imageWidth, imageHeight));
}

function estimateCenter(
  bbox: Bbox,
  W: number,
  H: number,
): [number, number, number] {
  const aspect = W / H;
  const cxN = ((bbox.x + bbox.width / 2) / W) * 2 - 1;
  const cyN = ((bbox.y + bbox.height / 2) / H) * 2 - 1;

  const x = cxN * SCENE_HALF_Y * aspect;
  const y = -cyN * SCENE_HALF_Y;

  const areaRatio = (bbox.width * bbox.height) / (W * H);
  const z = MAX_Z - areaRatio * (MAX_Z - MIN_Z);

  return [x, y, z];
}

function estimateSize(
  bbox: Bbox,
  W: number,
  H: number,
): [number, number, number] {
  const aspect = W / H;
  const sx = (bbox.width / W) * 2 * SCENE_HALF_Y * aspect;
  const sy = (bbox.height / H) * 2 * SCENE_HALF_Y;
  const sz = (sx + sy) / 2;

  return [
    Math.max(sx, MIN_SIZE_WORLD),
    Math.max(sy, MIN_SIZE_WORLD),
    Math.max(sz, MIN_SIZE_WORLD),
  ];
}

export const __testing = {
  SCENE_HALF_Y,
  MIN_Z,
  MAX_Z,
  MIN_SIZE_WORLD,
};
