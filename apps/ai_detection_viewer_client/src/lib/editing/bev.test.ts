import { describe, expect, it } from 'vitest';
import { egoToThree, globalToEgo } from '@/lib/geometry/transforms';
import { boxInFrame } from '@/lib/nuscenes/box-views';
import { footprintOf, footprintOfRendered, makeBevProjector } from './bev';
import { toGlobalGeometry } from './box';
import { CAR, LEVEL_POSE, tiltedPose } from './test-helpers';

const close = (actual: readonly number[], expected: readonly number[], digits = 9) =>
  actual.forEach((value, i) => expect(value).toBeCloseTo(expected[i], digits));

describe('makeBevProjector', () => {
  it('puts the front of the car up and its right to the right', () => {
    const p = makeBevProjector(LEVEL_POSE);
    close(p.toBev([10, 0, 0]), [0, -10]); // 10 m ahead -> up (negative y)
    close(p.toBev([0, -4, 0]), [4, 0]); // 4 m to the right -> +x
    close(p.toBev([0, 0, 7]), [0, 0]); // height is not shown
  });

  it('agrees with the render frame: a point appears at its render (x, z)', () => {
    const pose = tiltedPose();
    const p = makeBevProjector(pose);
    const g: [number, number, number] = [423.7, 1171.2, 1.4];
    const rendered = egoToThree(globalToEgo(g, pose));
    close(p.toBev(g), [rendered[0], rendered[2]]);
  });

  it('toGlobal finds the point of a level plane that appears at a screen point', () => {
    const pose = tiltedPose();
    const p = makeBevProjector(pose);
    const g = p.toGlobal([3.5, -12], 1.25);
    expect(g[2]).toBe(1.25); // on the plane asked for
    close(p.toBev(g), [3.5, -12]); // and it appears where it was asked to
  });

  it('toGlobal is the inverse of toBev for a point of that plane', () => {
    const pose = tiltedPose();
    const p = makeBevProjector(pose);
    const g: [number, number, number] = [419.2, 1186.4, 0.6];
    close(p.toGlobal(p.toBev(g), g[2]), g);
  });

  it('heading: 0 = the way the car faces, +90 degrees = to its left', () => {
    const p = makeBevProjector(LEVEL_POSE);
    expect(p.headingOfYaw(0)).toBeCloseTo(0, 12);
    expect(p.headingOfYaw(Math.PI / 2)).toBeCloseTo(Math.PI / 2, 12);
    expect(p.yawOfHeading(Math.PI / 2)).toBeCloseTo(Math.PI / 2, 12);
  });

  it('heading and yaw convert back and forth on a car that is not level', () => {
    const p = makeBevProjector(tiltedPose());
    for (const yaw of [-2.5, -0.3, 0, 1.1, 3]) {
      expect(p.yawOfHeading(p.headingOfYaw(yaw))).toBeCloseTo(yaw, 9);
    }
  });

  it('on a turned car the heading is the yaw minus (about) the car yaw', () => {
    const p = makeBevProjector(tiltedPose()); // the car is turned 0.7 rad
    // Not exactly yaw - 0.7: the car is tipped, so the top view is slightly skewed.
    expect(p.headingOfYaw(0.7)).toBeCloseTo(0, 2);
  });
});

describe('footprintOfRendered', () => {
  it('gives the same corners as footprintOf for the same box, also on a car that is not level', () => {
    for (const pose of [LEVEL_POSE, tiltedPose()]) {
      const box = {
        translation: [pose.translation[0] + 9, pose.translation[1] - 4, 1.1] as [number, number, number],
        size: [1.9, 4.7, 1.5] as [number, number, number],
        yaw: 2.1,
      };
      const viaGlobal = footprintOf(box, makeBevProjector(pose)).corners;
      const viaRender = footprintOfRendered(boxInFrame(toGlobalGeometry(box), pose));
      viaRender.forEach((corner, i) => close(corner, viaGlobal[i], 9));
    }
  });
});

describe('footprintOf', () => {
  const p = makeBevProjector(LEVEL_POSE);
  const straight = { ...CAR, yaw: 0 }; // facing the same way as the car

  it('gives the four corners in drawing order, front first', () => {
    const f = footprintOf(straight, p);
    // centre 10 m ahead, 3 m left -> top view (-3, -10); length 4.5 along "up".
    close(f.center, [-3, -10]);
    close(f.corners[0], [-3.9, -12.25]); // front-left
    close(f.corners[1], [-2.1, -12.25]); // front-right
    close(f.corners[2], [-2.1, -7.75]); // back-right
    close(f.corners[3], [-3.9, -7.75]); // back-left
  });

  it('puts the side handles at the middle of each side and points forward', () => {
    const f = footprintOf(straight, p);
    close(f.sides.front, [-3, -12.25]);
    close(f.sides.back, [-3, -7.75]);
    close(f.sides.left, [-3.9, -10]);
    close(f.sides.right, [-2.1, -10]);
    close(f.forward, [0, -1]);
  });

  it('turns with the yaw', () => {
    const f = footprintOf({ ...CAR, yaw: Math.PI / 2 }, p); // facing the car's left
    close(f.forward, [-1, 0]);
    close(f.sides.front, [-3 - 2.25, -10]);
  });

  it('keeps side lengths on a car that is not level (to about a centimetre)', () => {
    const pose = tiltedPose();
    const f = footprintOf({ translation: [420, 1175, 1], size: [1.8, 4.5, 1.6], yaw: 1.3 }, makeBevProjector(pose));
    const side = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    // Seen down the tipped car axis a level rectangle is foreshortened by at
    // most 1 - cos(tilt): under 0.2 % for this car (tipped by about 3 degrees).
    expect(Math.abs(side(f.corners[0], f.corners[1]) - 1.8)).toBeLessThan(0.01);
    expect(Math.abs(side(f.corners[1], f.corners[2]) - 4.5)).toBeLessThan(0.01);
  });
});
