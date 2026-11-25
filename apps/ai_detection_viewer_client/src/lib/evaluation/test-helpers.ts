import type { BoxAnnotationInfo, Detection2D, Detection3D, Frame } from '@/lib/types';
import { predictionId } from './parse';
import type { Box2D, Prediction2D } from './types';

/** Tiny builders shared by the evaluation tests. */

/**
 * Camera name in the ids of test predictions. `evaluateFrame` scores ONE photo
 * and does not read it; it only has to be the same wherever an id is spelled out.
 */
export const TEST_CAMERA = 'CAM_TEST';

export const box = (x: number, y: number, width: number, height: number): Box2D => ({
  x,
  y,
  width,
  height,
});

export type TestLabel = {
  id: string;
  class?: string;
  bbox?: Box2D;
  /** Distance from the ego vehicle in metres (placed straight ahead). */
  distance?: number;
  visibility?: BoxAnnotationInfo['visibility'];
  /** false → a 3D box with no projection in the camera image. */
  inCamera?: boolean;
};

/** A frame whose labels are given as one list; each becomes a 3D box and (if in camera) a 2D box. */
export function makeFrame(labels: TestLabel[], id = 'frame-1'): Frame {
  const detections2D: Detection2D[] = [];
  const detections3D: Detection3D[] = [];
  for (const label of labels) {
    const cls = label.class ?? 'person';
    detections3D.push({
      id: label.id,
      class: cls,
      confidence: 1,
      bbox3D: { center: [0, 0, -(label.distance ?? 15)], size: [1, 1, 1] },
      ...(label.visibility ? { annotation: { visibility: label.visibility } } : {}),
    });
    if (label.inCamera !== false) {
      detections2D.push({
        id: label.id,
        class: cls,
        confidence: 1,
        bbox: label.bbox ?? box(0, 0, 10, 10),
      });
    }
  }
  return {
    id,
    imageUrl: '',
    imageWidth: 1600,
    imageHeight: 900,
    detections2D,
    detections3D,
    pointCloud: [],
    source: 'nuscenes-measured',
  };
}

export function makePrediction(
  index: number,
  cls: string,
  score: number,
  bbox: Box2D,
  frameId = 'frame-1',
  camera = TEST_CAMERA,
): Prediction2D {
  return { id: predictionId(frameId, camera, index), class: cls, score, bbox };
}
