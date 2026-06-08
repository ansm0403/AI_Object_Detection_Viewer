import { describe, expect, it } from 'vitest';
import {
  boxCornersEgo,
  cameraToPixel,
  egoToCamera,
  projectCornersToBbox,
  type Intrinsic,
} from './projection';
import type { Pose, Vec3 } from './transforms';

// A simple pinhole intrinsic for a 1600×900 image: focal 1000 px, principal
// point at the image centre (800, 450).
const K: Intrinsic = [
  [1000, 0, 800],
  [0, 1000, 450],
  [0, 0, 1],
];
const IMAGE_W = 1600;
const IMAGE_H = 900;

const IDENTITY_WXYZ: [number, number, number, number] = [1, 0, 0, 0];
const YAW90_WXYZ: [number, number, number, number] = [
  Math.SQRT1_2,
  0,
  0,
  Math.SQRT1_2,
];
const IDENTITY_SENSOR: Pose = {
  translation: [0, 0, 0],
  rotation: IDENTITY_WXYZ,
};

describe('cameraToPixel', () => {
  it('projects a point dead ahead to the principal point', () => {
    // (0,0,10): straight in front, 10 m away → image centre, depth 10.
    const p = cameraToPixel([0, 0, 10], K);
    expect(p.u).toBeCloseTo(800, 10);
    expect(p.v).toBeCloseTo(450, 10);
    expect(p.depth).toBe(10);
    expect(p.inFront).toBe(true);
  });

  it('shifts by f·x/z off-centre', () => {
    // x=1 m at z=10 m → u = 1000·1/10 + 800 = 900.
    const p = cameraToPixel([1, 0, 10], K);
    expect(p.u).toBeCloseTo(900, 10);
    expect(p.v).toBeCloseTo(450, 10);
  });

  it('flags points behind the camera (z ≤ 0) as not in front', () => {
    const p = cameraToPixel([0, 0, -5], K);
    expect(p.inFront).toBe(false);
    expect(p.depth).toBe(-5);
  });
});

describe('egoToCamera', () => {
  it('with identity sensor, subtracts only the sensor translation', () => {
    expect(egoToCamera([3, 0, 10], { translation: [1, 0, 0], rotation: IDENTITY_WXYZ }))
      .toEqual([2, 0, 10]);
  });

  it('undoes a +90°-yaw sensor mounting', () => {
    // Sensor yawed +90° about z; a point at ego (0,1,0) lands at camera (1,0,0)
    // — same inverse-yaw reasoning as globalToEgo.
    const cam = egoToCamera([0, 1, 0], { translation: [0, 0, 0], rotation: YAW90_WXYZ });
    expect(cam[0]).toBeCloseTo(1, 10);
    expect(cam[1]).toBeCloseTo(0, 10);
    expect(cam[2]).toBeCloseTo(0, 10);
  });
});

describe('boxCornersEgo', () => {
  it('returns eight corners spanning the local extents about the center', () => {
    // Identity orientation, size [l,w,h] = [4,2,1] centred at (0,0,10):
    // x∈[-2,2], y∈[-1,1], z∈[9.5,10.5].
    const corners = boxCornersEgo([0, 0, 10], [4, 2, 1], [0, 0, 0, 1]);
    expect(corners).toHaveLength(8);
    const xs = corners.map((c) => c[0]);
    const ys = corners.map((c) => c[1]);
    const zs = corners.map((c) => c[2]);
    expect(Math.min(...xs)).toBeCloseTo(-2, 10);
    expect(Math.max(...xs)).toBeCloseTo(2, 10);
    expect(Math.min(...ys)).toBeCloseTo(-1, 10);
    expect(Math.max(...ys)).toBeCloseTo(1, 10);
    expect(Math.min(...zs)).toBeCloseTo(9.5, 10);
    expect(Math.max(...zs)).toBeCloseTo(10.5, 10);
  });
});

describe('projectCornersToBbox', () => {
  it('returns the AABB of the projected corners for a box in front', () => {
    // Flat box (h=0) so all corners sit at z=10: x∈[-1,1], y∈[-1,1].
    // u = 1000·(±1)/10 + 800 = 700..900;  v = 350..550.
    const corners = boxCornersEgo([0, 0, 10], [2, 2, 0], [0, 0, 0, 1]);
    const bbox = projectCornersToBbox(corners, IDENTITY_SENSOR, K, IMAGE_W, IMAGE_H);
    expect(bbox).not.toBeNull();
    expect(bbox!.x).toBeCloseTo(700, 6);
    expect(bbox!.y).toBeCloseTo(350, 6);
    expect(bbox!.width).toBeCloseTo(200, 6);
    expect(bbox!.height).toBeCloseTo(200, 6);
  });

  it('returns null when any corner is behind the camera', () => {
    const corners = boxCornersEgo([0, 0, -10], [2, 2, 2], [0, 0, 0, 1]);
    expect(projectCornersToBbox(corners, IDENTITY_SENSOR, K, IMAGE_W, IMAGE_H)).toBeNull();
  });

  it('returns null when the box projects fully off-screen', () => {
    // Far to the left: every corner u ≪ 0, so the image-clamped AABB is empty.
    const corners = boxCornersEgo([-100, 0, 10], [2, 2, 0], [0, 0, 0, 1]);
    expect(projectCornersToBbox(corners, IDENTITY_SENSOR, K, IMAGE_W, IMAGE_H)).toBeNull();
  });

  it('clamps an edge-straddling box to the image bounds', () => {
    // Centre near the left edge so the AABB would extend past u=0; clamp to 0.
    const corners = boxCornersEgo([-7.9, 0, 10], [2, 2, 0], [0, 0, 0, 1]);
    const bbox = projectCornersToBbox(corners, IDENTITY_SENSOR, K, IMAGE_W, IMAGE_H);
    expect(bbox).not.toBeNull();
    expect(bbox!.x).toBe(0); // clamped left edge
    expect(bbox!.x + bbox!.width).toBeLessThanOrEqual(IMAGE_W);
  });
});
