import { describe, expect, it } from 'vitest';
import { estimateShare } from './estimate';

describe('estimateShare', () => {
  it('has no estimate when nothing was judged (null, not 0 %)', () => {
    expect(estimateShare(0, 0, 1452)).toBeNull();
    expect(estimateShare(3, 0, 1452)).toBeNull();
    expect(estimateShare(0, -1, 1452)).toBeNull();
    expect(estimateShare(0, Number.NaN, 1452)).toBeNull();
  });

  it('reports the count, the sample size and the plain share', () => {
    const estimate = estimateShare(41, 100, 1452);
    expect(estimate).toMatchObject({ count: 41, judged: 100, share: 0.41 });
  });

  it('41 of 100 from 1,452 → about 32–50 %', () => {
    const estimate = estimateShare(41, 100, 1452);
    expect(estimate?.low).toBeCloseTo(0.32163, 4);
    expect(estimate?.high).toBeCloseTo(0.50459, 4);
  });

  it('without a population size it is the standard Wilson interval (5 of 10 → 23.7–76.3 %)', () => {
    const estimate = estimateShare(5, 10, 0);
    expect(estimate?.low).toBeCloseTo(0.2366, 3);
    expect(estimate?.high).toBeCloseTo(0.7634, 3);
  });

  it('a small sample gives a wide range, a larger one a narrower range', () => {
    const width = (count: number, judged: number) => {
      const e = estimateShare(count, judged, 1452);
      if (!e) throw new Error('no estimate');
      return e.high - e.low;
    };
    expect(width(5, 12)).toBeGreaterThan(width(40, 100));
    expect(width(40, 100)).toBeGreaterThan(width(80, 200));
    expect(width(80, 200)).toBeGreaterThan(width(120, 300));
    // The design doc's table (F7.5 §2.2): ±9, ±6, ±5 percentage points at 40 %.
    expect(width(40, 100) / 2).toBeCloseTo(0.091, 2);
    expect(width(80, 200) / 2).toBeCloseTo(0.063, 2);
    expect(width(120, 300) / 2).toBeCloseTo(0.049, 2);
  });

  it('never leaves 0–1, also at the extremes', () => {
    const none = estimateShare(0, 100, 1452);
    expect(none?.low).toBe(0);
    expect(none?.high).toBeCloseTo(0.03456, 4);
    const all = estimateShare(100, 100, 1452);
    expect(all?.low).toBeCloseTo(0.96544, 4);
    expect(all?.high).toBe(1);
  });

  it('0 of N is not "certainly none": the upper end stays above 0', () => {
    expect(estimateShare(0, 100, 1452)?.high).toBeGreaterThan(0);
  });

  it('once the whole population is judged the range is the count itself', () => {
    const estimate = estimateShare(50, 100, 100);
    expect(estimate?.low).toBeCloseTo(0.5, 10);
    expect(estimate?.high).toBeCloseTo(0.5, 10);
  });

  it('a larger share of the population judged narrows the range (finite population)', () => {
    const fromLarge = estimateShare(40, 100, 100000);
    const fromSmall = estimateShare(40, 100, 150);
    if (!fromLarge || !fromSmall) throw new Error('no estimate');
    expect(fromSmall.high - fromSmall.low).toBeLessThan(fromLarge.high - fromLarge.low);
  });

  it('clamps impossible input instead of throwing', () => {
    expect(estimateShare(150, 100, 1452)).toMatchObject({ count: 100, share: 1 });
    expect(estimateShare(-5, 100, 1452)).toMatchObject({ count: 0, share: 0 });
    // A population smaller than what was judged is treated as fully judged.
    const estimate = estimateShare(40, 100, 60);
    expect(estimate?.low).toBeCloseTo(0.4, 10);
    expect(estimate?.high).toBeCloseTo(0.4, 10);
  });
});
