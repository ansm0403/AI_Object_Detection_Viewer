import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@/lib/geometry/transforms';
import { footprintOf, makeBevProjector } from './bev';
import { sameBoxValues, type BoxValues } from './box';
import {
  MAX_BOX_SIZE,
  MAX_LIFT,
  MIN_BOX_SIZE,
  dragBox,
  nudgeBox,
  readBoxField,
  setBoxField,
} from './gestures';
import { CAR, LEVEL_POSE, tiltedPose } from './test-helpers';

// A box facing along +x on the map, so "front" is +x and "left" is +y.
const BOX: BoxValues = { translation: [10, 3, 0.8], size: [1.8, 4.5, 1.6], yaw: 0 };
const at = (x: number, y: number): Vec3 => [x, y, 0.8];

/** The four corners of a box on the map: front-left, front-right, back-right, back-left. */
function corners(values: BoxValues): [number, number][] {
  const [cx, cy] = values.translation;
  const [w, l] = values.size;
  const ax = Math.cos(values.yaw);
  const ay = Math.sin(values.yaw);
  return (
    [
      [l / 2, w / 2],
      [l / 2, -w / 2],
      [-l / 2, -w / 2],
      [-l / 2, w / 2],
    ] as const
  ).map(([f, s]) => [cx + f * ax - s * ay, cy + f * ay + s * ax]);
}
const closePoint = (a: readonly number[], b: readonly number[]) => {
  expect(a[0]).toBeCloseTo(b[0], 9);
  expect(a[1]).toBeCloseTo(b[1], 9);
};

describe('dragBox: move', () => {
  it('moves the centre by exactly how far the pointer went, and nothing else', () => {
    const moved = dragBox(BOX, 'move', at(10.2, 3.1), at(11.7, 2.6));
    closePoint(moved.translation, [11.5, 2.5]);
    expect(moved.translation[2]).toBe(0.8);
    expect(moved.size).toEqual(BOX.size);
    expect(moved.yaw).toBe(BOX.yaw);
  });

  it('gives the start box back when the pointer returns to where it started', () => {
    const there = at(10.2, 3.1);
    expect(sameBoxValues(dragBox(BOX, 'move', there, there), BOX, 0)).toBe(true);
  });
});

describe('dragBox: sides keep the opposite side where it is', () => {
  it('front: the box gets longer and its back stays', () => {
    const before = corners(BOX);
    const after = dragBox(BOX, 'front', at(12.25, 3), at(13.25, 3));
    expect(after.size[1]).toBeCloseTo(5.5, 12);
    const c = corners(after);
    closePoint(c[2], before[2]); // back-right did not move
    closePoint(c[3], before[3]); // back-left did not move
    closePoint(c[0], [before[0][0] + 1, before[0][1]]);
  });

  it('back, left and right do the same for their side', () => {
    const before = corners(BOX);
    const back = corners(dragBox(BOX, 'back', at(7.75, 3), at(7.25, 3)));
    closePoint(back[0], before[0]);
    closePoint(back[1], before[1]);
    const left = corners(dragBox(BOX, 'left', at(10, 3.9), at(10, 4.4)));
    closePoint(left[1], before[1]);
    closePoint(left[2], before[2]);
    const right = corners(dragBox(BOX, 'right', at(10, 2.1), at(10, 1.8)));
    closePoint(right[0], before[0]);
    closePoint(right[3], before[3]);
    expect(dragBox(BOX, 'right', at(10, 2.1), at(10, 1.8)).size[0]).toBeCloseTo(2.1, 12);
  });

  it('ignores pointer movement across the side (only the part along the box axis counts)', () => {
    const after = dragBox(BOX, 'front', at(12.25, 3), at(12.25, 9));
    expect(sameBoxValues(after, BOX)).toBe(true);
  });

  it('works on a turned box', () => {
    const turned: BoxValues = { ...BOX, yaw: 1.1 };
    const before = corners(turned);
    // Drag the front 0.8 m further along the box's own front direction.
    const from = at(0, 0);
    const to = at(0.8 * Math.cos(1.1), 0.8 * Math.sin(1.1));
    const after = dragBox(turned, 'front', from, to);
    expect(after.size[1]).toBeCloseTo(5.3, 12);
    const c = corners(after);
    closePoint(c[2], before[2]);
    closePoint(c[3], before[3]);
  });
});

describe('dragBox: corners keep the opposite corner where it is', () => {
  it('front-left changes length and width; back-right stays', () => {
    const before = corners(BOX);
    const after = dragBox(BOX, 'front-left', at(12.25, 3.9), at(12.75, 4.2));
    expect(after.size[1]).toBeCloseTo(5, 12);
    expect(after.size[0]).toBeCloseTo(2.1, 12);
    closePoint(corners(after)[2], before[2]);
  });

  it('every corner keeps its opposite', () => {
    const before = corners(BOX);
    const cases = [
      ['front-left', 2],
      ['front-right', 3],
      ['back-right', 0],
      ['back-left', 1],
    ] as const;
    for (const [handle, opposite] of cases) {
      const after = dragBox(BOX, handle, at(0, 0), at(0.37, -0.21));
      closePoint(corners(after)[opposite], before[opposite]);
    }
  });
});

describe('dragBox: size limits', () => {
  it('cannot make a side shorter than the minimum, and the far side still stays', () => {
    const before = corners(BOX);
    const after = dragBox(BOX, 'front', at(12.25, 3), at(-50, 3));
    expect(after.size[1]).toBe(MIN_BOX_SIZE);
    closePoint(corners(after)[2], before[2]);
  });

  it('cannot make a side longer than the maximum', () => {
    expect(dragBox(BOX, 'left', at(10, 3.9), at(10, 500)).size[0]).toBe(MAX_BOX_SIZE);
  });
});

describe('dragBox: rotate', () => {
  it('turns the box by the angle the pointer swept about the centre', () => {
    // From straight ahead of the centre to straight left of it: a quarter turn.
    const after = dragBox(BOX, 'rotate', at(15, 3), at(10, 8));
    expect(after.yaw).toBeCloseTo(Math.PI / 2, 12);
    expect(after.translation).toEqual(BOX.translation);
    expect(after.size).toEqual(BOX.size);
  });

  it('does not depend on how far from the centre the knob was grabbed', () => {
    const near = dragBox(BOX, 'rotate', at(11, 3), at(10, 4));
    const far = dragBox(BOX, 'rotate', at(30, 3), at(10, 23));
    expect(near.yaw).toBeCloseTo(far.yaw, 12);
  });

  it('keeps the angle in (-pi, pi] and leaves the box alone when the pointer is on the centre', () => {
    const start: BoxValues = { ...BOX, yaw: 3 };
    const after = dragBox(start, 'rotate', at(15, 3), at(10, 8));
    expect(after.yaw).toBeCloseTo(3 + Math.PI / 2 - 2 * Math.PI, 12);
    expect(dragBox(BOX, 'rotate', at(15, 3), at(10, 3))).toBe(BOX);
  });
});

describe('dragBox never changes what the top view cannot show', () => {
  it('keeps z and the height for every handle', () => {
    const handles = ['move', 'rotate', 'front', 'back', 'left', 'right', 'front-left', 'front-right', 'back-left', 'back-right'] as const;
    for (const handle of handles) {
      const after = dragBox(CAR, handle, at(11, 4), at(12.3, 2.2));
      expect(after.translation[2]).toBe(CAR.translation[2]);
      expect(after.size[2]).toBe(CAR.size[2]);
    }
  });
});

describe('nudgeBox', () => {
  it('moves the box by a step as the top view shows it (up = the way the car faces)', () => {
    const p = makeBevProjector(LEVEL_POSE);
    const up = nudgeBox(BOX, [0, -0.05], p);
    closePoint(up.translation, [10.05, 3]); // forward on the map for a level car facing +x
    const right = nudgeBox(BOX, [0.05, 0], p);
    closePoint(right.translation, [10, 2.95]);
  });

  it('moves the footprint by exactly that step on a car that is not level, and keeps the height', () => {
    const p = makeBevProjector(tiltedPose());
    const box: BoxValues = { translation: [420, 1175, 1], size: [1.8, 4.5, 1.6], yaw: 1.3 };
    const before = footprintOf(box, p).center;
    const after = nudgeBox(box, [0.5, -0.25], p);
    const now = footprintOf(after, p).center;
    expect(now[0] - before[0]).toBeCloseTo(0.5, 9);
    expect(now[1] - before[1]).toBeCloseTo(-0.25, 9);
    expect(after.translation[2]).toBe(1);
  });
});

describe('readBoxField / setBoxField', () => {
  const context = { projector: makeBevProjector(LEVEL_POSE), label: BOX };

  it('reads the five numbers of the panel', () => {
    expect(readBoxField(BOX, 'length', context)).toBe(4.5);
    expect(readBoxField(BOX, 'width', context)).toBe(1.8);
    expect(readBoxField(BOX, 'height', context)).toBe(1.6);
    expect(readBoxField(BOX, 'heading', context)).toBeCloseTo(0, 12);
    expect(readBoxField(BOX, 'lift', context)).toBe(0);
    expect(readBoxField({ ...BOX, yaw: Math.PI / 2 }, 'heading', context)).toBeCloseTo(90, 9);
  });

  it('length and width keep the centre', () => {
    const longer = setBoxField(BOX, 'length', 5.2, context);
    expect(longer.size).toEqual([1.8, 5.2, 1.6]);
    expect(longer.translation).toEqual(BOX.translation);
    expect(setBoxField(BOX, 'width', 2, context).size).toEqual([2, 4.5, 1.6]);
  });

  it('height keeps the bottom: the centre rises by half the difference', () => {
    const taller = setBoxField(BOX, 'height', 2, context);
    expect(taller.size[2]).toBe(2);
    expect(taller.translation[2] - taller.size[2] / 2).toBeCloseTo(0.8 - 0.8, 12);
    // so a taller box is not also a lifted one
    expect(readBoxField(taller, 'lift', context)).toBeCloseTo(0, 12);
  });

  it('lift moves the box straight up or down, measured at its bottom from the label', () => {
    const raised = setBoxField(BOX, 'lift', 0.3, context);
    expect(raised.translation[2]).toBeCloseTo(1.1, 12);
    expect(raised.translation.slice(0, 2)).toEqual([10, 3]);
    expect(readBoxField(raised, 'lift', context)).toBeCloseTo(0.3, 12);
    // after a height change the same lift still means the same bottom
    const tallAndRaised = setBoxField(setBoxField(BOX, 'height', 2, context), 'lift', 0.3, context);
    expect(tallAndRaised.translation[2] - 1).toBeCloseTo(0.3, 12);
  });

  it('heading is typed in degrees relative to the car and read back the same', () => {
    const turned = setBoxField(BOX, 'heading', -135, context);
    expect(readBoxField(turned, 'heading', context)).toBeCloseTo(-135, 9);
    const tilted = { projector: makeBevProjector(tiltedPose()), label: BOX };
    expect(readBoxField(setBoxField(BOX, 'heading', 72.5, tilted), 'heading', tilted)).toBeCloseTo(72.5, 9);
  });

  it('keeps sizes and lift within their limits', () => {
    expect(setBoxField(BOX, 'length', 0, context).size[1]).toBe(MIN_BOX_SIZE);
    expect(setBoxField(BOX, 'width', -3, context).size[0]).toBe(MIN_BOX_SIZE);
    expect(setBoxField(BOX, 'height', 999, context).size[2]).toBe(MAX_BOX_SIZE);
    expect(readBoxField(setBoxField(BOX, 'lift', 999, context), 'lift', context)).toBeCloseTo(MAX_LIFT, 9);
  });

  it('ignores a value that is not a number', () => {
    expect(setBoxField(BOX, 'length', Number.NaN, context)).toBe(BOX);
    expect(setBoxField(BOX, 'heading', Infinity, context)).toBe(BOX);
  });
});
