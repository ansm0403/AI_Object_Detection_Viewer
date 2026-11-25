import { describe, expect, it } from 'vitest';
import { countFrameReviews, summarizeProgress } from './progress';
import { withVerdict } from './records';
import { makeBox, makeFrame } from './test-helpers';
import type { ReviewMap, Verdict } from './types';

const T = '2026-11-25T10:00:00.000Z';
const f1 = makeFrame('f1', [makeBox('a'), makeBox('b'), makeBox('c')]);
const f2 = makeFrame('f2', [makeBox('a'), makeBox('d')]);

function reviewsOf(entries: [string, string, Verdict][]): ReviewMap {
  return entries.reduce<ReviewMap>(
    (map, [frameId, objectId, verdict]) => withVerdict(map, frameId, objectId, verdict, T),
    {},
  );
}

describe('countFrameReviews', () => {
  it('counts nothing reviewed for an empty map', () => {
    expect(countFrameReviews(f1, {})).toEqual({
      total: 3,
      reviewed: 0,
      approved: 0,
      rejected: 0,
      unsure: 0,
    });
  });

  it('splits reviewed boxes by verdict; unsure counts as reviewed', () => {
    const reviews = reviewsOf([
      ['f1', 'a', 'approved'],
      ['f1', 'b', 'rejected'],
      ['f1', 'c', 'unsure'],
    ]);
    expect(countFrameReviews(f1, reviews)).toEqual({
      total: 3,
      reviewed: 3,
      approved: 1,
      rejected: 1,
      unsure: 1,
    });
  });

  it('does not count the same object reviewed in another frame', () => {
    const reviews = reviewsOf([['f1', 'a', 'approved']]);
    expect(countFrameReviews(f2, reviews).reviewed).toBe(0);
  });

  it('ignores records whose box is not in the frame (stale data)', () => {
    const reviews = reviewsOf([
      ['f1', 'gone', 'rejected'],
      ['other-frame', 'a', 'approved'],
    ]);
    expect(countFrameReviews(f1, reviews)).toMatchObject({ total: 3, reviewed: 0 });
  });

  it('handles a frame with zero boxes', () => {
    expect(countFrameReviews(makeFrame('empty', []), {})).toMatchObject({
      total: 0,
      reviewed: 0,
    });
  });
});

describe('summarizeProgress', () => {
  it('sums the frames into the overall counts and keeps the per-frame split', () => {
    const reviews = reviewsOf([
      ['f1', 'a', 'approved'],
      ['f1', 'b', 'rejected'],
      ['f2', 'a', 'unsure'],
    ]);
    const { overall, byFrame } = summarizeProgress([f1, f2], reviews);
    expect(overall).toEqual({ total: 5, reviewed: 3, approved: 1, rejected: 1, unsure: 1 });
    expect(byFrame.get('f1')).toMatchObject({ total: 3, reviewed: 2 });
    expect(byFrame.get('f2')).toMatchObject({ total: 2, reviewed: 1 });
  });

  it('returns zeros for no frames', () => {
    const { overall, byFrame } = summarizeProgress([], {});
    expect(overall.total).toBe(0);
    expect(byFrame.size).toBe(0);
  });
});
