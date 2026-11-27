import { describe, expect, it } from 'vitest';
import { withVerdict, type ReviewMap, type Verdict } from '@/lib/review';
import {
  DEFAULT_SAMPLE_SIZE,
  SAMPLE_SIZES,
  nextUnjudged,
  sampleSizeForRecords,
  stepInSample,
  summarizeSample,
  toReviewVerdict,
  toSampleVerdict,
  verdictOfItem,
  type SampleKey,
} from './sample-check';

const NOW = '2026-11-27T00:00:00.000Z';
const item = (n: number): SampleKey => ({ frameId: `f${n}`, predictionId: `pred:f${n}:CAM_FRONT:0` });
const sample = [item(1), item(2), item(3), item(4), item(5)];
const judge = (records: ReviewMap, key: SampleKey, verdict: Verdict): ReviewMap =>
  withVerdict(records, key.frameId, key.predictionId, verdict, NOW);

describe('verdict mapping', () => {
  it('reads the stored review verdicts as verdicts on the model box, both ways', () => {
    expect(toSampleVerdict('approved')).toBe('real-object');
    expect(toSampleVerdict('rejected')).toBe('model-wrong');
    expect(toSampleVerdict('unsure')).toBe('unclear');
    for (const verdict of ['approved', 'rejected', 'unsure'] as const) {
      expect(toReviewVerdict(toSampleVerdict(verdict))).toBe(verdict);
    }
  });

  it('verdictOfItem is null for a box that was not judged', () => {
    expect(verdictOfItem({}, item(1))).toBeNull();
    expect(verdictOfItem(judge({}, item(1), 'approved'), item(1))).toBe('real-object');
  });

  it('a verdict on the same prediction index in ANOTHER frame is not this box', () => {
    const other: SampleKey = { frameId: 'f9', predictionId: item(1).predictionId };
    expect(verdictOfItem(judge({}, other, 'approved'), item(1))).toBeNull();
  });
});

describe('summarizeSample', () => {
  it('starts with nothing judged and no estimate', () => {
    const summary = summarizeSample(sample, {}, 1452);
    expect(summary).toMatchObject({ population: 1452, size: 5, judged: 0, complete: false });
    expect(summary.counts).toEqual({ 'real-object': 0, 'model-wrong': 0, unclear: 0 });
    expect(summary.estimates['real-object']).toBeNull();
  });

  it('counts each verdict and estimates all three over the same denominator', () => {
    let records = judge({}, item(1), 'approved');
    records = judge(records, item(2), 'approved');
    records = judge(records, item(3), 'rejected');
    records = judge(records, item(4), 'unsure');
    const summary = summarizeSample(sample, records, 1452);
    expect(summary.judged).toBe(4);
    expect(summary.counts).toEqual({ 'real-object': 2, 'model-wrong': 1, unclear: 1 });
    expect(summary.estimates['real-object']).toMatchObject({ count: 2, judged: 4, share: 0.5 });
    expect(summary.estimates.unclear).toMatchObject({ count: 1, judged: 4, share: 0.25 });
    expect(summary.complete).toBe(false);
  });

  it('is complete only when every item of the sample has a verdict', () => {
    let records: ReviewMap = {};
    for (const key of sample) records = judge(records, key, 'rejected');
    expect(summarizeSample(sample, records, 1452).complete).toBe(true);
    expect(summarizeSample([], records, 1452).complete).toBe(false);
  });

  it('ignores verdicts on boxes that are not in the sample', () => {
    const records = judge(judge({}, item(1), 'approved'), item(99), 'approved');
    expect(summarizeSample(sample, records, 1452).judged).toBe(1);
  });
});

describe('nextUnjudged', () => {
  it('with nothing selected: the first unjudged item', () => {
    expect(nextUnjudged(sample, {}, null)).toBe(sample[0]);
    expect(nextUnjudged(sample, judge({}, item(1), 'approved'), null)).toBe(sample[1]);
  });

  it('moves on from the current item, skipping judged ones', () => {
    const records = judge(judge({}, item(1), 'approved'), item(2), 'rejected');
    expect(nextUnjudged(sample, records, item(1).predictionId)).toBe(sample[2]);
  });

  it('wraps to the start when the rest of the sample is judged', () => {
    let records: ReviewMap = {};
    for (const key of [item(3), item(4), item(5)]) records = judge(records, key, 'approved');
    expect(nextUnjudged(sample, records, item(4).predictionId)).toBe(sample[0]);
  });

  it('never returns the current item, and is null when nothing else is left', () => {
    let records: ReviewMap = {};
    for (const key of [item(1), item(2), item(4), item(5)]) records = judge(records, key, 'approved');
    // item 3 is the only unjudged one and it is current.
    expect(nextUnjudged(sample, records, item(3).predictionId)).toBeNull();
    for (const key of sample) records = judge(records, key, 'approved');
    expect(nextUnjudged(sample, records, null)).toBeNull();
  });

  it('a current id that is not in the sample behaves like no selection', () => {
    expect(nextUnjudged(sample, {}, 'pred:elsewhere:CAM_BACK:3')).toBe(sample[0]);
  });

  it('an empty sample has no next item', () => {
    expect(nextUnjudged([], {}, null)).toBeNull();
  });
});

describe('stepInSample', () => {
  it('steps to the neighbour and stops at both ends', () => {
    expect(stepInSample(sample, item(2).predictionId, 1)).toBe(sample[2]);
    expect(stepInSample(sample, item(2).predictionId, -1)).toBe(sample[0]);
    expect(stepInSample(sample, item(5).predictionId, 1)).toBeNull();
    expect(stepInSample(sample, item(1).predictionId, -1)).toBeNull();
  });

  it('with nothing selected: the first item going forward, the last going back', () => {
    expect(stepInSample(sample, null, 1)).toBe(sample[0]);
    expect(stepInSample(sample, null, -1)).toBe(sample[4]);
    expect(stepInSample([], null, 1)).toBeNull();
  });
});

describe('sampleSizeForRecords', () => {
  const order = Array.from({ length: 1452 }, (_, i) => item(i));

  it('is the default size when nothing (or only the first hundred) is judged', () => {
    expect(sampleSizeForRecords(order, {})).toBe(DEFAULT_SAMPLE_SIZE);
    expect(sampleSizeForRecords(order, judge({}, order[99], 'approved'))).toBe(100);
  });

  it('grows to the size that contains every judged box, so a reload does not hide work', () => {
    expect(sampleSizeForRecords(order, judge({}, order[100], 'approved'))).toBe(200);
    expect(sampleSizeForRecords(order, judge({}, order[250], 'unsure'))).toBe(300);
  });

  it('never exceeds the largest offered size', () => {
    expect(sampleSizeForRecords(order, judge({}, order[900], 'approved'))).toBe(100);
    expect(Math.max(...SAMPLE_SIZES)).toBe(300);
  });
});
