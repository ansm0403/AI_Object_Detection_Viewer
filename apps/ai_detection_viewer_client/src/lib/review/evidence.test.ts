import { describe, expect, it } from 'vitest';
import { getReviewBlock } from './availability';
import { WEAK_EVIDENCE_MAX_POINTS, evidenceLevel, isWeakEvidence } from './evidence';
import { verdictsOfFrame } from './progress';
import { withVerdict } from './records';
import { makeBox, makeFrame } from './test-helpers';

describe('evidenceLevel', () => {
  it('maps point counts onto four levels', () => {
    expect(evidenceLevel(0)).toBe(0);
    expect(evidenceLevel(1)).toBe(1);
    expect(evidenceLevel(WEAK_EVIDENCE_MAX_POINTS)).toBe(1);
    expect(evidenceLevel(WEAK_EVIDENCE_MAX_POINTS + 1)).toBe(2);
    expect(evidenceLevel(19)).toBe(2);
    expect(evidenceLevel(20)).toBe(3);
    expect(evidenceLevel(500)).toBe(3);
  });

  it('treats a negative count as no evidence', () => {
    expect(evidenceLevel(-1)).toBe(0);
  });
});

describe('isWeakEvidence', () => {
  it('flags boxes at or below the threshold', () => {
    expect(isWeakEvidence(0)).toBe(true);
    expect(isWeakEvidence(WEAK_EVIDENCE_MAX_POINTS)).toBe(true);
    expect(isWeakEvidence(WEAK_EVIDENCE_MAX_POINTS + 1)).toBe(false);
  });
});

describe('getReviewBlock', () => {
  const frame = makeFrame('f1', [makeBox('a'), makeBox('b')]);
  const base = { frame, selectedId: 'a', visibleIds: undefined, playing: false };

  it('allows a verdict on a selected, visible box while paused', () => {
    expect(getReviewBlock(base)).toBeNull();
    expect(getReviewBlock({ ...base, visibleIds: new Set(['a']) })).toBeNull();
  });

  it('blocks during autoplay, before anything else', () => {
    expect(getReviewBlock({ ...base, playing: true })).toBe('playing');
    expect(getReviewBlock({ ...base, playing: true, selectedId: null })).toBe('playing');
  });

  it('blocks when nothing is selected', () => {
    expect(getReviewBlock({ ...base, selectedId: null })).toBe('no-selection');
  });

  it('blocks when the selected object has no box in this frame', () => {
    expect(getReviewBlock({ ...base, selectedId: 'gone' })).toBe('not-in-frame');
  });

  it('blocks when the selected box is filtered out', () => {
    expect(getReviewBlock({ ...base, visibleIds: new Set(['b']) })).toBe('hidden');
  });
});

describe('verdictsOfFrame', () => {
  it('maps object ids to verdicts for THIS frame only', () => {
    const frame = makeFrame('f1', [makeBox('a'), makeBox('b'), makeBox('c')]);
    let reviews = withVerdict({}, 'f1', 'a', 'approved', 'T');
    reviews = withVerdict(reviews, 'f1', 'c', 'unsure', 'T');
    reviews = withVerdict(reviews, 'f2', 'b', 'rejected', 'T'); // other frame
    reviews = withVerdict(reviews, 'f1', 'ghost', 'rejected', 'T'); // not in the frame
    expect([...verdictsOfFrame(frame, reviews)]).toEqual([
      ['a', 'approved'],
      ['c', 'unsure'],
    ]);
  });

  it('is empty for an unreviewed frame', () => {
    expect(verdictsOfFrame(makeFrame('f1', [makeBox('a')]), {}).size).toBe(0);
  });
});
