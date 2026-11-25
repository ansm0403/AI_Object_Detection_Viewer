import { describe, expect, it } from 'vitest';
import {
  buildQueue,
  nextFrameWithUnreviewed,
  nextUnreviewed,
  orderBoxes,
  stepInQueue,
} from './queue';
import { withVerdict } from './records';
import { makeBox, makeFrame } from './test-helpers';
import type { ReviewMap } from './types';

const T = '2026-11-25T10:00:00.000Z';
const ids = (boxes: { id: string }[]) => boxes.map((b) => b.id);
const approve = (map: ReviewMap, frameId: string, ...objectIds: string[]) =>
  objectIds.reduce((m, id) => withVerdict(m, frameId, id, 'approved', T), map);

describe('orderBoxes', () => {
  const frame = makeFrame(
    'f1',
    [
      makeBox('a', { annotation: { lidarPoints: 30 } }),
      makeBox('b', { annotation: { lidarPoints: 0 } }),
      makeBox('c'), // no LiDAR count (older sample file)
      makeBox('d', { annotation: { lidarPoints: 3 } }),
      makeBox('e', { annotation: { lidarPoints: 3 } }),
    ],
    ['d', 'a'], // boxes with a 2D projection
  );

  it('scene: keeps the dataset order', () => {
    expect(ids(orderBoxes(frame, 'scene'))).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('evidence: fewest LiDAR points first, ties in dataset order, unknown last', () => {
    expect(ids(orderBoxes(frame, 'evidence'))).toEqual(['b', 'd', 'e', 'a', 'c']);
  });

  it('camera: boxes in the camera image first, each group in dataset order', () => {
    expect(ids(orderBoxes(frame, 'camera'))).toEqual(['a', 'd', 'b', 'c', 'e']);
  });

  it('never reorders the frame itself', () => {
    orderBoxes(frame, 'evidence');
    orderBoxes(frame, 'camera');
    expect(ids(frame.detections3D)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('returns an empty list for a frame with zero boxes', () => {
    expect(orderBoxes(makeFrame('empty', []), 'evidence')).toEqual([]);
  });
});

describe('buildQueue', () => {
  const boxes = [makeBox('a'), makeBox('b'), makeBox('c')];

  it('keeps every box when there is no filter', () => {
    expect(buildQueue(boxes, undefined)).toEqual(['a', 'b', 'c']);
  });

  it('keeps only the boxes that pass the filters, in order', () => {
    expect(buildQueue(boxes, new Set(['c', 'a']))).toEqual(['a', 'c']);
  });

  it('is empty when everything is filtered out', () => {
    expect(buildQueue(boxes, new Set())).toEqual([]);
  });
});

describe('stepInQueue', () => {
  const queue = ['a', 'b', 'c'];

  it('moves to the next / previous box', () => {
    expect(stepInQueue(queue, 'a', 1)).toBe('b');
    expect(stepInQueue(queue, 'c', -1)).toBe('b');
  });

  it('does not wrap at either end', () => {
    expect(stepInQueue(queue, 'c', 1)).toBeNull();
    expect(stepInQueue(queue, 'a', -1)).toBeNull();
  });

  it('enters at the first (next) or last (previous) box when nothing is selected', () => {
    expect(stepInQueue(queue, null, 1)).toBe('a');
    expect(stepInQueue(queue, null, -1)).toBe('c');
  });

  it('treats a selection outside the queue (filtered out) like no selection', () => {
    expect(stepInQueue(queue, 'hidden', 1)).toBe('a');
    expect(stepInQueue(queue, 'hidden', -1)).toBe('c');
  });

  it('returns null for an empty queue', () => {
    expect(stepInQueue([], 'a', 1)).toBeNull();
    expect(stepInQueue([], null, -1)).toBeNull();
  });
});

describe('nextUnreviewed', () => {
  const queue = ['a', 'b', 'c', 'd'];

  it('returns the first box when nothing is selected or reviewed', () => {
    expect(nextUnreviewed(queue, {}, 'f1', null)).toBe('a');
  });

  it('skips reviewed boxes after the current one', () => {
    const reviews = approve({}, 'f1', 'a', 'b');
    expect(nextUnreviewed(queue, reviews, 'f1', 'a')).toBe('c');
  });

  it('wraps to boxes skipped earlier in the queue', () => {
    const reviews = approve({}, 'f1', 'c', 'd');
    expect(nextUnreviewed(queue, reviews, 'f1', 'd')).toBe('a');
  });

  it('never returns the current box, even if it is unreviewed', () => {
    const reviews = approve({}, 'f1', 'a', 'c', 'd');
    expect(nextUnreviewed(queue, reviews, 'f1', 'b')).toBeNull();
  });

  it('returns null when every box in the queue has a verdict', () => {
    const reviews = approve({}, 'f1', 'a', 'b', 'c', 'd');
    expect(nextUnreviewed(queue, reviews, 'f1', 'b')).toBeNull();
  });

  it('counts only verdicts of THIS frame (same object id, other frame)', () => {
    const reviews = approve({}, 'f2', 'a', 'b', 'c', 'd');
    expect(nextUnreviewed(queue, reviews, 'f1', null)).toBe('a');
  });

  it('counts unsure and rejected as reviewed', () => {
    let reviews = withVerdict({}, 'f1', 'a', 'unsure', T);
    reviews = withVerdict(reviews, 'f1', 'b', 'rejected', T);
    expect(nextUnreviewed(queue, reviews, 'f1', null)).toBe('c');
  });

  it('starts from the top when the current box is outside the queue', () => {
    const reviews = approve({}, 'f1', 'a');
    expect(nextUnreviewed(queue, reviews, 'f1', 'hidden')).toBe('b');
  });

  it('returns null for an empty queue', () => {
    expect(nextUnreviewed([], {}, 'f1', null)).toBeNull();
  });
});

describe('nextFrameWithUnreviewed', () => {
  const f1 = makeFrame('f1', [makeBox('a'), makeBox('b')]);
  const f2 = makeFrame('f2', [makeBox('a')]);
  const f3 = makeFrame('f3', [makeBox('c')]);
  const frames = [f1, f2, f3];

  it('returns the following frame when it has unreviewed boxes', () => {
    expect(nextFrameWithUnreviewed(frames, {}, 'f1')).toBe('f2');
  });

  it('skips frames that are fully reviewed', () => {
    const reviews = approve({}, 'f2', 'a');
    expect(nextFrameWithUnreviewed(frames, reviews, 'f1')).toBe('f3');
  });

  it('wraps around to earlier frames', () => {
    expect(nextFrameWithUnreviewed(frames, {}, 'f3')).toBe('f1');
  });

  it('never returns the current frame; null when all others are done', () => {
    let reviews = approve({}, 'f2', 'a');
    reviews = approve(reviews, 'f3', 'c');
    expect(nextFrameWithUnreviewed(frames, reviews, 'f1')).toBeNull();
  });

  it('treats a frame with zero boxes as finished', () => {
    const empty = makeFrame('empty', []);
    expect(nextFrameWithUnreviewed([f1, empty, f3], {}, 'f1')).toBe('f3');
  });

  it('with filters: skips a frame whose unreviewed boxes are all filtered out', () => {
    // f2's only box is hidden by the filter; f3's is visible.
    const visibleIdsOf = (frame: { id: string }) => new Set(frame.id === 'f2' ? [] : ['a', 'b', 'c']);
    expect(nextFrameWithUnreviewed(frames, {}, 'f1', visibleIdsOf)).toBe('f3');
  });

  it('with filters: null when what is left everywhere is hidden (no bouncing)', () => {
    const reviews = approve({}, 'f3', 'c');
    const visibleIdsOf = () => new Set(['c']); // f1 and f2 have nothing visible
    expect(nextFrameWithUnreviewed(frames, reviews, 'f3', visibleIdsOf)).toBeNull();
    // Without the filter those frames do count.
    expect(nextFrameWithUnreviewed(frames, reviews, 'f3')).toBe('f1');
  });

  it('starts from the first frame when the current id is unknown', () => {
    expect(nextFrameWithUnreviewed(frames, {}, null)).toBe('f1');
    expect(nextFrameWithUnreviewed([], {}, null)).toBeNull();
  });
});
