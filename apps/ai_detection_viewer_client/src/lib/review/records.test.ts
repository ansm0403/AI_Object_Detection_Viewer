import { describe, expect, it } from 'vitest';
import {
  getReview,
  reviewKey,
  withNote,
  withReasonToggled,
  withVerdict,
  withoutReview,
} from './records';
import { NOTE_MAX_LENGTH, type ReviewMap } from './types';

const T1 = '2026-11-25T10:00:00.000Z';
const T2 = '2026-11-25T10:05:00.000Z';

describe('reviewKey', () => {
  it('differs for the same object in two frames (one box per frame)', () => {
    expect(reviewKey('frame-1', 'obj')).not.toBe(reviewKey('frame-2', 'obj'));
  });

  it('differs for two objects in the same frame', () => {
    expect(reviewKey('frame-1', 'a')).not.toBe(reviewKey('frame-1', 'b'));
  });
});

describe('withVerdict', () => {
  it('creates a record carrying both ids, the verdict and the time', () => {
    const map = withVerdict({}, 'f1', 'a', 'approved', T1);
    expect(getReview(map, 'f1', 'a')).toEqual({
      frameId: 'f1',
      objectId: 'a',
      verdict: 'approved',
      reasons: [],
      note: '',
      reviewedAt: T1,
    });
  });

  it('does not mutate the input map', () => {
    const before: ReviewMap = {};
    withVerdict(before, 'f1', 'a', 'approved', T1);
    expect(before).toEqual({});
  });

  it('keeps the verdict per frame: frame 2 of the same object stays unreviewed', () => {
    const map = withVerdict({}, 'f1', 'a', 'approved', T1);
    expect(getReview(map, 'f2', 'a')).toBeUndefined();
  });

  it('is a no-op (same map, same time) when the verdict is unchanged', () => {
    const map = withVerdict({}, 'f1', 'a', 'rejected', T1);
    const again = withVerdict(map, 'f1', 'a', 'rejected', T2);
    expect(again).toBe(map);
    expect(getReview(again, 'f1', 'a')?.reviewedAt).toBe(T1);
  });

  it('drops reasons and note when a rejected box is approved', () => {
    let map = withVerdict({}, 'f1', 'a', 'rejected', T1);
    map = withReasonToggled(map, 'f1', 'a', 'wrong_size');
    map = withNote(map, 'f1', 'a', 'too tall');
    map = withVerdict(map, 'f1', 'a', 'approved', T2);
    expect(getReview(map, 'f1', 'a')).toMatchObject({
      verdict: 'approved',
      reasons: [],
      note: '',
      reviewedAt: T2,
    });
  });

  it('keeps the note but drops reasons when a rejected box becomes unsure', () => {
    let map = withVerdict({}, 'f1', 'a', 'rejected', T1);
    map = withReasonToggled(map, 'f1', 'a', 'wrong_size');
    map = withNote(map, 'f1', 'a', 'hidden behind the bus');
    map = withVerdict(map, 'f1', 'a', 'unsure', T2);
    expect(getReview(map, 'f1', 'a')).toMatchObject({
      verdict: 'unsure',
      reasons: [],
      note: 'hidden behind the bus',
    });
  });
});

describe('withReasonToggled', () => {
  it('adds a reason, then removes it again', () => {
    let map = withVerdict({}, 'f1', 'a', 'rejected', T1);
    map = withReasonToggled(map, 'f1', 'a', 'wrong_heading');
    expect(getReview(map, 'f1', 'a')?.reasons).toEqual(['wrong_heading']);
    map = withReasonToggled(map, 'f1', 'a', 'wrong_heading');
    expect(getReview(map, 'f1', 'a')?.reasons).toEqual([]);
  });

  it('allows several reasons on one box', () => {
    let map = withVerdict({}, 'f1', 'a', 'rejected', T1);
    map = withReasonToggled(map, 'f1', 'a', 'wrong_size');
    map = withReasonToggled(map, 'f1', 'a', 'wrong_position');
    expect(getReview(map, 'f1', 'a')?.reasons).toEqual(['wrong_size', 'wrong_position']);
  });

  it('ignores boxes that are not rejected or not reviewed', () => {
    const approved = withVerdict({}, 'f1', 'a', 'approved', T1);
    expect(withReasonToggled(approved, 'f1', 'a', 'other')).toBe(approved);
    expect(withReasonToggled(approved, 'f1', 'missing', 'other')).toBe(approved);
  });
});

describe('withNote', () => {
  it('sets the note on a rejected and on an unsure box', () => {
    let map = withVerdict({}, 'f1', 'a', 'rejected', T1);
    map = withVerdict(map, 'f1', 'b', 'unsure', T1);
    map = withNote(map, 'f1', 'a', 'shifted left');
    map = withNote(map, 'f1', 'b', 'cannot see it');
    expect(getReview(map, 'f1', 'a')?.note).toBe('shifted left');
    expect(getReview(map, 'f1', 'b')?.note).toBe('cannot see it');
  });

  it('clips the note to NOTE_MAX_LENGTH', () => {
    let map = withVerdict({}, 'f1', 'a', 'rejected', T1);
    map = withNote(map, 'f1', 'a', 'x'.repeat(NOTE_MAX_LENGTH + 50));
    expect(getReview(map, 'f1', 'a')?.note).toHaveLength(NOTE_MAX_LENGTH);
  });

  it('ignores approved and unreviewed boxes, and unchanged text', () => {
    const approved = withVerdict({}, 'f1', 'a', 'approved', T1);
    expect(withNote(approved, 'f1', 'a', 'hello')).toBe(approved);
    expect(withNote(approved, 'f1', 'missing', 'hello')).toBe(approved);
    const rejected = withNote(withVerdict({}, 'f1', 'a', 'rejected', T1), 'f1', 'a', 'same');
    expect(withNote(rejected, 'f1', 'a', 'same')).toBe(rejected);
  });
});

describe('withoutReview', () => {
  it('removes only the targeted record', () => {
    let map = withVerdict({}, 'f1', 'a', 'approved', T1);
    map = withVerdict(map, 'f1', 'b', 'rejected', T1);
    map = withoutReview(map, 'f1', 'a');
    expect(getReview(map, 'f1', 'a')).toBeUndefined();
    expect(getReview(map, 'f1', 'b')?.verdict).toBe('rejected');
  });

  it('is a no-op for a box with no review', () => {
    const map = withVerdict({}, 'f1', 'a', 'approved', T1);
    expect(withoutReview(map, 'f1', 'zzz')).toBe(map);
  });
});
