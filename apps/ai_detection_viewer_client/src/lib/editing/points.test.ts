import { describe, expect, it } from 'vitest';
import { boxInFrame } from '@/lib/nuscenes/box-views';
import type { Detection3D, Point3D } from '@/lib/types';
import { toGlobalGeometry } from './box';
import { countInside, makeInsideTest } from './points';
import { LEVEL_POSE } from './test-helpers';

// Render frame: x right, y up, z towards the viewer (forward is -z).
// An unrotated render box: size is [length, width, height] along its x, y, z.
const PLAIN: Detection3D['bbox3D'] = { center: [0, 1, -10], size: [4, 2, 1] };
const p = (x: number, y: number, z: number): Point3D => ({ x, y, z });

describe('makeInsideTest', () => {
  it('accepts points inside and on the faces, rejects points outside', () => {
    const inside = makeInsideTest(PLAIN);
    expect(inside(p(0, 1, -10))).toBe(true); // the centre
    expect(inside(p(1.9, 1.9, -9.6))).toBe(true);
    expect(inside(p(2, 2, -9.5))).toBe(true); // on a corner
    expect(inside(p(2.1, 1, -10))).toBe(false); // past the length
    expect(inside(p(0, 2.1, -10))).toBe(false); // past the width
    expect(inside(p(0, 1, -9.4))).toBe(false); // past the height
  });

  it('follows the rotation of a real box: a point ahead of a turned car', () => {
    // A 4.5 m long car, 10 m ahead of a level ego, turned to face the ego's left.
    const car = boxInFrame(
      toGlobalGeometry({ translation: [10, 0, 0.8], size: [1.8, 4.5, 1.6], yaw: Math.PI / 2 }),
      LEVEL_POSE,
    );
    const inside = makeInsideTest(car);
    // 2 m to the LEFT of its centre is inside (its length runs left-right now):
    // ego (10, 2, 0.8) -> render (-2, 0.8, -10)
    expect(inside(p(-2, 0.8, -10))).toBe(true);
    // 2 m AHEAD of its centre is outside (its width is only 1.8):
    // ego (12, 0, 0.8) -> render (0, 0.8, -12)
    expect(inside(p(0, 0.8, -12))).toBe(false);
  });

  it('countInside counts them', () => {
    const points = [p(0, 1, -10), p(1, 1.5, -10.2), p(9, 9, 9), p(-2.5, 1, -10)];
    expect(countInside(points, PLAIN)).toBe(2);
    expect(countInside([], PLAIN)).toBe(0);
  });
});
