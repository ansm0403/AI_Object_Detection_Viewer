import { describe, expect, it } from 'vitest';
import { withVerdict } from './records';
import { positionOf, rejectedBoxes, rejectedIndexAt, stepRejected, type SceneFrames } from './rejected';
import { makeBox, makeFrame } from './test-helpers';
import type { ReviewMap } from './types';

const T = '2026-11-28T10:00:00.000Z';

// Two scenes. The same OBJECT id ("a") appears in several frames — a box is a
// (frame, object) pair, and the walk must keep them apart.
const scenes: SceneFrames[] = [
  {
    name: 'scene-A',
    frames: [
      makeFrame('a1', [makeBox('a'), makeBox('b'), makeBox('c')]),
      makeFrame('a2', [makeBox('a'), makeBox('d')]),
      makeFrame('a3', [makeBox('e')]),
    ],
  },
  {
    name: 'scene-B',
    frames: [makeFrame('b1', [makeBox('x'), makeBox('y')]), makeFrame('b2', [makeBox('a')])],
  },
];

const reject = (map: ReviewMap, frameId: string, objectId: string) =>
  withVerdict(map, frameId, objectId, 'rejected', T);

/** Rejected, recorded in an order that is NOT the walking order. */
function sample(): ReviewMap {
  let map = reject({}, 'b2', 'a');
  map = reject(map, 'a2', 'd');
  map = reject(map, 'a1', 'c');
  map = reject(map, 'b1', 'x');
  map = reject(map, 'a1', 'a');
  map = withVerdict(map, 'a1', 'b', 'approved', T);
  map = withVerdict(map, 'a3', 'e', 'unsure', T);
  return map;
}
const ids = (boxes: { frameId: string; objectId: string }[]) => boxes.map((b) => `${b.frameId}/${b.objectId}`);

describe('rejectedBoxes', () => {
  it('lists rejected boxes only: scene order, then frame order, then the frame’s box order', () => {
    expect(ids(rejectedBoxes(scenes, sample()))).toEqual(['a1/a', 'a1/c', 'a2/d', 'b1/x', 'b2/a']);
  });

  it('does not depend on the order the verdicts were made in', () => {
    let other = reject({}, 'a1', 'a');
    for (const [f, o] of [['a1', 'c'], ['a2', 'd'], ['b1', 'x'], ['b2', 'a']] as const) other = reject(other, f, o);
    expect(rejectedBoxes(scenes, other)).toEqual(
      rejectedBoxes(scenes, sample()),
    );
  });

  it('names the scene and the position of each box', () => {
    const [first, , , fourth] = rejectedBoxes(scenes, sample());
    expect(first).toEqual({ scene: 'scene-A', frameId: 'a1', objectId: 'a', at: [0, 0, 0] });
    expect(fourth).toEqual({ scene: 'scene-B', frameId: 'b1', objectId: 'x', at: [1, 0, 0] });
  });

  it('nothing rejected → an empty list', () => {
    expect(rejectedBoxes(scenes, {})).toEqual([]);
    expect(rejectedBoxes(scenes, withVerdict({}, 'a1', 'a', 'approved', T))).toEqual([]);
  });

  it('leaves out a record whose box is not in the scenes given (a scene not loaded, a stale record)', () => {
    const map = reject(reject(sample(), 'gone', 'a'), 'a1', 'no-such-box');
    expect(ids(rejectedBoxes(scenes, map))).toEqual(['a1/a', 'a1/c', 'a2/d', 'b1/x', 'b2/a']);
    expect(ids(rejectedBoxes([scenes[1]], map))).toEqual(['b1/x', 'b2/a']);
  });

  it('leaves out a box the filters hide — the editor could not work on it', () => {
    // hide object "a" everywhere and everything in frame b1
    const visible = (frame: { id: string; detections3D: { id: string }[] }) =>
      new Set(frame.id === 'b1' ? [] : frame.detections3D.map((d) => d.id).filter((id) => id !== 'a'));
    expect(ids(rejectedBoxes(scenes, sample(), visible))).toEqual(['a1/c', 'a2/d']);
  });
});

describe('positionOf', () => {
  it('the selected box: [scene, frame, box]', () => {
    expect(positionOf(scenes, 'a2', 'd')).toEqual([0, 1, 1]);
    expect(positionOf(scenes, 'b2', 'a')).toEqual([1, 1, 0]);
  });

  it('nothing selected, or an object that has no box in the frame: just before the frame’s first box', () => {
    expect(positionOf(scenes, 'a2', null)).toEqual([0, 1, -1]);
    expect(positionOf(scenes, 'a2', 'x')).toEqual([0, 1, -1]);
  });

  it('a frame that is not in the scenes → null', () => {
    expect(positionOf(scenes, 'nope', 'a')).toBeNull();
    expect(positionOf(scenes, null, 'a')).toBeNull();
  });
});

describe('stepRejected', () => {
  const boxes = rejectedBoxes(scenes, sample());
  const from = (frameId: string, objectId: string | null, direction: 1 | -1) => {
    const target = stepRejected(boxes, positionOf(scenes, frameId, objectId), direction);
    return target ? `${target.frameId}/${target.objectId}` : null;
  };

  it('forward: within the frame, then the next frame, then the next scene', () => {
    expect(from('a1', 'a', 1)).toBe('a1/c');
    expect(from('a1', 'c', 1)).toBe('a2/d');
    expect(from('a2', 'd', 1)).toBe('b1/x');
    expect(from('b1', 'x', 1)).toBe('b2/a');
  });

  it('wraps around: after the last comes the first, before the first the last', () => {
    expect(from('b2', 'a', 1)).toBe('a1/a');
    expect(from('a1', 'a', -1)).toBe('b2/a');
  });

  it('backward is the same walk in reverse', () => {
    expect(from('b2', 'a', -1)).toBe('b1/x');
    expect(from('b1', 'x', -1)).toBe('a2/d');
    expect(from('a2', 'd', -1)).toBe('a1/c');
    expect(from('a1', 'c', -1)).toBe('a1/a');
  });

  it('from a box that is NOT rejected: the nearest rejected one in that direction', () => {
    expect(from('a1', 'b', 1)).toBe('a1/c');
    expect(from('a1', 'b', -1)).toBe('a1/a');
    expect(from('a3', 'e', 1)).toBe('b1/x'); // a frame with no rejected box
    expect(from('a3', 'e', -1)).toBe('a2/d');
  });

  it('with nothing selected, "next" finds the frame’s own rejected boxes first', () => {
    expect(from('a1', null, 1)).toBe('a1/a');
    expect(from('a2', null, 1)).toBe('a2/d');
    expect(from('a2', null, -1)).toBe('a1/c');
  });

  it('the same object id in another frame is another box', () => {
    // "a" is rejected in a1 and in b2, not in a2
    expect(from('a2', 'a', 1)).toBe('a2/d');
    expect(rejectedIndexAt(boxes, positionOf(scenes, 'a2', 'a'))).toBe(-1);
  });

  it('nothing to go to: no rejected box, or the only one is where the reviewer already is', () => {
    expect(stepRejected([], [0, 0, 0], 1)).toBeNull();
    const only = rejectedBoxes(scenes, reject({}, 'a2', 'd'));
    expect(stepRejected(only, positionOf(scenes, 'a2', 'd'), 1)).toBeNull();
    expect(stepRejected(only, positionOf(scenes, 'a2', 'd'), -1)).toBeNull();
    // … but from anywhere else it is reachable, in both directions
    expect(stepRejected(only, positionOf(scenes, 'b1', 'y'), 1)?.frameId).toBe('a2');
    expect(stepRejected(only, positionOf(scenes, 'a1', 'a'), -1)?.frameId).toBe('a2');
  });

  it('without a position (the frame is not in the scenes) the walk starts at an end', () => {
    expect(stepRejected(boxes, null, 1)).toBe(boxes[0]);
    expect(stepRejected(boxes, null, -1)).toBe(boxes[boxes.length - 1]);
  });
});

describe('rejectedIndexAt', () => {
  const boxes = rejectedBoxes(scenes, sample());
  it('the place of the box among the rejected ones (0-based), -1 when it is not one', () => {
    expect(rejectedIndexAt(boxes, positionOf(scenes, 'a1', 'a'))).toBe(0);
    expect(rejectedIndexAt(boxes, positionOf(scenes, 'b1', 'x'))).toBe(3);
    expect(rejectedIndexAt(boxes, positionOf(scenes, 'a1', 'b'))).toBe(-1);
    expect(rejectedIndexAt(boxes, positionOf(scenes, 'a1', null))).toBe(-1);
    expect(rejectedIndexAt(boxes, null)).toBe(-1);
  });
});
