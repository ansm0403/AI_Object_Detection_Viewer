import { describe, expect, it } from 'vitest';
import { boxInFrame } from '@/lib/nuscenes/box-views';
import {
  boxValuesOf,
  isValidBoxValues,
  normalizeAngle,
  quatToYaw,
  sameBoxValues,
  toGlobalGeometry,
  yawToQuat,
  type BoxValues,
} from './box';
import { CAR, LEVEL_POSE, tiltedPose } from './test-helpers';

describe('yaw <-> quaternion', () => {
  it('yawToQuat is a rotation about the vertical axis only', () => {
    const [w, x, y, z] = yawToQuat(Math.PI / 2);
    expect(w).toBeCloseTo(Math.SQRT1_2, 12);
    expect(x).toBe(0);
    expect(y).toBe(0);
    expect(z).toBeCloseTo(Math.SQRT1_2, 12);
  });

  it('quatToYaw reads back what yawToQuat wrote', () => {
    for (const yaw of [-3, -1.2, 0, 0.4, 2.9]) {
      expect(quatToYaw(yawToQuat(yaw))).toBeCloseTo(yaw, 12);
    }
  });

  it('normalizeAngle brings any angle into (-pi, pi]', () => {
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(normalizeAngle(-Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(normalizeAngle(3 * Math.PI + 0.25)).toBeCloseTo(-Math.PI + 0.25, 12);
    expect(normalizeAngle(-7)).toBeCloseTo(-7 + 2 * Math.PI, 12);
  });
});

describe('boxValuesOf: the render-frame box back to the seven numbers', () => {
  it('is the inverse of boxInFrame on a level car', () => {
    const back = boxValuesOf(boxInFrame(toGlobalGeometry(CAR), LEVEL_POSE), LEVEL_POSE);
    expect(sameBoxValues(back, CAR, 1e-12)).toBe(true);
  });

  it('is the inverse of boxInFrame when the car is turned and not level', () => {
    const pose = tiltedPose();
    const box: BoxValues = { translation: [420.5, 1175.25, 1.1], size: [2.1, 5.3, 1.9], yaw: -2.2 };
    const back = boxValuesOf(boxInFrame(toGlobalGeometry(box), pose), pose);
    expect(sameBoxValues(back, box, 1e-9)).toBe(true);
  });

  it('returns the size in nuScenes order [width, length, height]', () => {
    const rendered = boxInFrame(toGlobalGeometry(CAR), LEVEL_POSE);
    expect(rendered.size).toEqual([4.5, 1.8, 1.6]); // render order: length first
    expect(boxValuesOf(rendered, LEVEL_POSE).size).toEqual([1.8, 4.5, 1.6]);
  });

  it('takes the centre back to the map: 5 m ahead of a level car at the origin', () => {
    const rendered = boxInFrame(toGlobalGeometry({ ...CAR, translation: [5, 0, 0.8] }), LEVEL_POSE);
    expect(rendered.center[2]).toBeCloseTo(-5, 12); // render -z = forward
    expect(boxValuesOf(rendered, LEVEL_POSE).translation[0]).toBeCloseTo(5, 12);
  });
});

describe('sameBoxValues / isValidBoxValues', () => {
  it('compares angles around the wrap', () => {
    expect(sameBoxValues({ ...CAR, yaw: Math.PI }, { ...CAR, yaw: -Math.PI })).toBe(true);
  });

  it('tells a moved, resized or turned box apart', () => {
    expect(sameBoxValues(CAR, { ...CAR, translation: [10, 3, 0.8001] })).toBe(false);
    expect(sameBoxValues(CAR, { ...CAR, size: [1.8, 4.5001, 1.6] })).toBe(false);
    expect(sameBoxValues(CAR, { ...CAR, yaw: 0.4001 })).toBe(false);
    expect(sameBoxValues(CAR, { ...CAR })).toBe(true);
  });

  it('rejects boxes that cannot be drawn', () => {
    expect(isValidBoxValues(CAR)).toBe(true);
    expect(isValidBoxValues({ ...CAR, size: [0, 4.5, 1.6] })).toBe(false);
    expect(isValidBoxValues({ ...CAR, size: [-1, 4.5, 1.6] })).toBe(false);
    expect(isValidBoxValues({ ...CAR, yaw: Number.NaN })).toBe(false);
    expect(isValidBoxValues({ ...CAR, translation: [Infinity, 0, 0] })).toBe(false);
  });
});
