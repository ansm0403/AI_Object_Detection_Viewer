import type { CameraView, Detection2D, Detection3D, Frame } from '@/lib/types';

/** Tiny builders shared by the camera tests. */

export type TestBox = {
  id: string;
  /** Rectangle in the photo: [x, y, width, height]. Default: a 100×100 box. */
  bbox?: [number, number, number, number];
  /** Uncut projected corners; default none (treated as fully visible). */
  corners?: [number, number][];
};

export function det(box: TestBox): Detection2D {
  const [x, y, width, height] = box.bbox ?? [100, 100, 100, 100];
  return {
    id: box.id,
    class: 'car',
    confidence: 1,
    bbox: { x, y, width, height },
    ...(box.corners ? { corners: box.corners } : {}),
  };
}

export function view(name: string, boxes: TestBox[] = []): CameraView {
  return {
    name,
    imageUrl: `/img/${name}.jpg`,
    imageWidth: 1600,
    imageHeight: 900,
    detections2D: boxes.map(det),
  };
}

const box3D = (id: string): Detection3D => ({
  id,
  class: 'car',
  confidence: 1,
  bbox3D: { center: [0, 0, -10], size: [1, 1, 1] },
});

/**
 * A multi-camera frame. The top-level image fields are the first view's, as
 * the parser guarantees. `ids3D` defaults to every id any view shows.
 */
export function multiCameraFrame(views: CameraView[], id = 'frame-1', ids3D?: string[]): Frame {
  const ids = ids3D ?? [...new Set(views.flatMap((v) => v.detections2D.map((d) => d.id)))];
  const main = views[0];
  return {
    id,
    imageUrl: main.imageUrl,
    imageWidth: main.imageWidth,
    imageHeight: main.imageHeight,
    detections2D: main.detections2D,
    detections3D: ids.map(box3D),
    pointCloud: [],
    source: 'nuscenes-measured',
    cameras: views,
  };
}

/** A frame with ONE image and no `cameras` (the COCO shape). */
export function singleImageFrame(boxes: TestBox[] = [], id = 'coco-1'): Frame {
  return {
    id,
    imageUrl: `/img/${id}.jpg`,
    imageWidth: 640,
    imageHeight: 480,
    detections2D: boxes.map(det),
    detections3D: boxes.map((b) => box3D(b.id)),
    pointCloud: [],
  };
}

/**
 * The eight "corners" of a box whose uncut outline is the given rectangle —
 * enough for `visibleFraction`, which only looks at their extent.
 */
export function cornersOf(x: number, y: number, width: number, height: number): [number, number][] {
  return [
    [x, y],
    [x + width, y],
    [x, y + height],
    [x + width, y + height],
    [x, y],
    [x + width, y],
    [x, y + height],
    [x + width, y + height],
  ];
}
