import type { BoxAnnotationInfo, Detection3D, Frame } from '@/lib/types';

/**
 * Tiny builders shared by the review tests. Only the fields the review logic
 * reads are meaningful; geometry is a placeholder.
 */
export function makeBox(
  id: string,
  options: { class?: string; annotation?: BoxAnnotationInfo } = {},
): Detection3D {
  return {
    id,
    class: options.class ?? 'car',
    confidence: 1,
    bbox3D: { center: [0, 0, 0], size: [1, 1, 1] },
    ...(options.annotation ? { annotation: options.annotation } : {}),
  };
}

/** `inCameraIds`: the boxes that also have a 2D projection (same id, Rule #1). */
export function makeFrame(
  id: string,
  boxes: Detection3D[],
  inCameraIds: string[] = [],
): Frame {
  return {
    id,
    imageUrl: '',
    imageWidth: 1600,
    imageHeight: 900,
    detections2D: inCameraIds.map((boxId) => ({
      id: boxId,
      class: 'car',
      confidence: 1,
      bbox: { x: 0, y: 0, width: 10, height: 10 },
    })),
    detections3D: boxes,
    pointCloud: [],
    source: 'nuscenes-measured',
  };
}
