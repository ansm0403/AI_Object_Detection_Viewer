import { describe, expect, it } from 'vitest';
import {
  BOX_EDGES,
  BOX_FRONT_FACE,
  boxCornersEgo,
  cameraToPixel,
  egoToCamera,
  projectBoxCorners,
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

// F4 — the camera view draws the projected 3D box itself, so the ORDER of the
// corners (and the edge / front-face tables written against it) is a contract.
describe('box corner order, BOX_EDGES, BOX_FRONT_FACE', () => {
  // Identity orientation, [l,w,h] = [4,2,1] at the origin.
  const corners = boxCornersEgo([0, 0, 0], [4, 2, 1], [0, 0, 0, 1]);

  it('orders corners as index = 4·ix + 2·iy + iz (− side = 0, + side = 1)', () => {
    expect(corners[0]).toEqual([-2, -1, -0.5]);
    expect(corners[1]).toEqual([-2, -1, 0.5]);
    expect(corners[2]).toEqual([-2, 1, -0.5]);
    expect(corners[4]).toEqual([2, -1, -0.5]);
    expect(corners[7]).toEqual([2, 1, 0.5]);
  });

  it('has 12 distinct edges, each joining corners that differ along exactly one axis', () => {
    expect(BOX_EDGES).toHaveLength(12);
    expect(new Set(BOX_EDGES.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`)).size).toBe(12);
    for (const [a, b] of BOX_EDGES) {
      const differing = [0, 1, 2].filter((axis) => corners[a][axis] !== corners[b][axis]);
      expect(differing).toHaveLength(1);
    }
  });

  it('front face = the four corners on the +x (heading) side, as a closed loop', () => {
    expect(BOX_FRONT_FACE).toHaveLength(4);
    for (const index of BOX_FRONT_FACE) expect(corners[index][0]).toBe(2);
    // Consecutive loop corners share an edge (so it draws a rectangle, not an X).
    BOX_FRONT_FACE.forEach((a, i) => {
      const b = BOX_FRONT_FACE[(i + 1) % 4];
      const isEdge = BOX_EDGES.some(([p, q]) => (p === a && q === b) || (p === b && q === a));
      expect(isEdge).toBe(true);
    });
  });

  it('the front face follows the box heading when the box is rotated', () => {
    // Yaw +90° about z: the local +x (front) axis now points along ego +y.
    const yawed = boxCornersEgo([0, 0, 0], [4, 2, 1], [0, 0, Math.SQRT1_2, Math.SQRT1_2]);
    for (const index of BOX_FRONT_FACE) expect(yawed[index][1]).toBeCloseTo(2, 10);
  });
});

describe('projectBoxCorners', () => {
  it('returns the pixel of every corner, in corner order', () => {
    // [l,w,h] = [2,2,2] centred at (0,0,10): the near face is at z=9, the far at z=11.
    const corners = boxCornersEgo([0, 0, 10], [2, 2, 2], [0, 0, 0, 1]);
    const pixels = projectBoxCorners(corners, IDENTITY_SENSOR, K);
    expect(pixels).toHaveLength(8);
    // corner 0 = (-1,-1,9) → u = 800 − 1000/9, v = 450 − 1000/9
    expect(pixels![0][0]).toBeCloseTo(800 - 1000 / 9, 6);
    expect(pixels![0][1]).toBeCloseTo(450 - 1000 / 9, 6);
    // corner 7 = (1,1,11) → u = 800 + 1000/11, v = 450 + 1000/11
    expect(pixels![7][0]).toBeCloseTo(800 + 1000 / 11, 6);
    expect(pixels![7][1]).toBeCloseTo(450 + 1000 / 11, 6);
  });

  it('agrees with projectCornersToBbox: the rectangle is the bounds of the corners', () => {
    const corners = boxCornersEgo([1, 0.5, 12], [4, 2, 1.5], [0, 0, 0.3826834, 0.9238795]);
    const pixels = projectBoxCorners(corners, IDENTITY_SENSOR, K)!;
    const bbox = projectCornersToBbox(corners, IDENTITY_SENSOR, K, IMAGE_W, IMAGE_H)!;
    const us = pixels.map((p) => p[0]);
    const vs = pixels.map((p) => p[1]);
    expect(bbox.x).toBeCloseTo(Math.min(...us), 6);
    expect(bbox.y).toBeCloseTo(Math.min(...vs), 6);
    expect(bbox.x + bbox.width).toBeCloseTo(Math.max(...us), 6);
    expect(bbox.y + bbox.height).toBeCloseTo(Math.max(...vs), 6);
  });

  it('returns null when any corner is behind the camera', () => {
    const straddling = boxCornersEgo([0, 0, 0.5], [2, 2, 2], [0, 0, 0, 1]); // z from −0.5 to 1.5
    expect(projectBoxCorners(straddling, IDENTITY_SENSOR, K)).toBeNull();
  });

  it('does not clamp to the image (the viewer clips)', () => {
    const corners = boxCornersEgo([-7.9, 0, 10], [2, 2, 0], [0, 0, 0, 1]);
    const pixels = projectBoxCorners(corners, IDENTITY_SENSOR, K)!;
    expect(Math.min(...pixels.map((p) => p[0]))).toBeLessThan(0);
  });
});
