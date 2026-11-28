import { describe, expect, it } from 'vitest';
import type { Pose } from '@/lib/geometry/transforms';
import { boxInCamera, boxInFrame, type GlobalBoxGeometry, type ProjectionCamera } from './box-views';

// A car standing level at the map origin, facing +x.
const LEVEL: Pose = { translation: [0, 0, 0], rotation: [1, 0, 0, 0] };

// A camera at the car origin looking along the car's forward axis. nuScenes
// camera axes: x right, y down, z forward — so the camera's z is the car's x.
// The rotation that takes camera axes to car axes: z_cam -> x_car, x_cam -> -y_car, y_cam -> -z_car.
const FORWARD_CAMERA: ProjectionCamera = {
  egoPose: LEVEL,
  sensor: { translation: [0, 0, 1.5], rotation: [0.5, -0.5, 0.5, -0.5] },
  intrinsic: [
    [1000, 0, 800],
    [0, 1000, 450],
    [0, 0, 1],
  ],
  imageWidth: 1600,
  imageHeight: 900,
};

// A 2 m cube, 20 m straight ahead, at the camera's height.
const CUBE: GlobalBoxGeometry = { translation: [20, 0, 1.5], size: [2, 2, 2], rotation: [1, 0, 0, 0] };

describe('boxInFrame', () => {
  it('puts a box ahead of the car at render -z, with the size as [length, width, height]', () => {
    const box = boxInFrame({ translation: [20, 3, 1], size: [1.8, 4.5, 1.6], rotation: [1, 0, 0, 0] }, LEVEL);
    // ego (20, 3, 1) -> render (-3, 1, -20)
    expect(box.center[0]).toBeCloseTo(-3, 12);
    expect(box.center[1]).toBeCloseTo(1, 12);
    expect(box.center[2]).toBeCloseTo(-20, 12);
    expect(box.size).toEqual([4.5, 1.8, 1.6]);
    expect(box.rotation).toHaveLength(4);
  });

  it('expresses the box relative to the car: the same box, a car further on', () => {
    const near = boxInFrame(CUBE, LEVEL);
    const further = boxInFrame(CUBE, { translation: [5, 0, 0], rotation: [1, 0, 0, 0] });
    expect(further.center[2] - near.center[2]).toBeCloseTo(5, 12); // 5 m closer
  });
});

describe('boxInCamera', () => {
  it('projects a box ahead of the camera to a rectangle around the image centre', () => {
    const projected = boxInCamera(CUBE, FORWARD_CAMERA);
    if (!projected) throw new Error('the cube should be in the photo');
    const { bbox, corners } = projected;
    // The near face is 19 m away: 2 m * 1000 / 19 = 105.3 px wide, centred on (800, 450).
    expect(bbox.width).toBeCloseTo(2000 / 19, 6);
    expect(bbox.height).toBeCloseTo(2000 / 19, 6);
    expect(bbox.x + bbox.width / 2).toBeCloseTo(800, 6);
    expect(bbox.y + bbox.height / 2).toBeCloseTo(450, 6);
    expect(corners).toHaveLength(8);
  });

  it('returns null for a box behind the camera', () => {
    expect(boxInCamera({ ...CUBE, translation: [-20, 0, 1.5] }, FORWARD_CAMERA)).toBeNull();
  });

  it('returns null for a box entirely outside the image', () => {
    expect(boxInCamera({ ...CUBE, translation: [20, 60, 1.5] }, FORWARD_CAMERA)).toBeNull();
  });

  it('uses the ego pose of THIS photo: the same box, photographed a moment later', () => {
    // The car has moved 1 m forward when this camera fires: the box is 1 m nearer and looks larger.
    const later: ProjectionCamera = { ...FORWARD_CAMERA, egoPose: { translation: [1, 0, 0], rotation: [1, 0, 0, 0] } };
    const before = boxInCamera(CUBE, FORWARD_CAMERA);
    const after = boxInCamera(CUBE, later);
    if (!before || !after) throw new Error('the cube should be in both photos');
    expect(after.bbox.width).toBeCloseTo(2000 / 18, 6);
    expect(after.bbox.width).toBeGreaterThan(before.bbox.width);
  });
});
