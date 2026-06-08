import type { Frame } from '@/lib/types';
import { estimateDetections3D } from './bbox-estimator';
import { generatePointCloud, type Rng } from './pointcloud-generator';

/**
 * Fill a parsed Frame's ESTIMATED 3D fields (`detections3D`, `pointCloud`).
 *
 * COCO is 2D-only (Immutable Rule #7); these fields are derived from the 2D
 * bboxes (Immutable Rule #6). The parser leaves them empty so this enrichment
 * stays outside `lib/coco/`.
 */
export function enrichFrame(
  frame: Frame,
  options: { pointsPerDetection?: number; rng?: Rng } = {},
): Frame {
  const detections3D = estimateDetections3D(
    frame.detections2D,
    frame.imageWidth,
    frame.imageHeight,
  );
  const pointCloud = generatePointCloud(
    detections3D,
    options.pointsPerDetection,
    options.rng,
  );

  // Mark provenance so the UI badges these frames "Estimated" (Immutable Rule
  // #6): their 3D is inferred from 2D, never measured. nuScenes frames set
  // 'nuscenes-measured' in their own parser instead.
  return { ...frame, detections3D, pointCloud, source: 'coco-estimated' };
}
