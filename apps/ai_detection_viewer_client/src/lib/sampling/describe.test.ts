import { describe, expect, it } from 'vitest';
import { sampleAvailability } from './availability';
import { describeEstimate, describeProgress, describeSampleCount, formatShareRange } from './describe';
import { estimateShare } from './estimate';
import type { SampleSummary } from './sample-check';

describe('wording of a sample result', () => {
  const estimate = estimateShare(41, 100, 1452);
  if (!estimate) throw new Error('no estimate');

  it('the range is given in whole percent', () => {
    expect(formatShareRange(estimate)).toBe('32–50%');
  });

  it('what was seen always carries the sample size', () => {
    expect(describeSampleCount(estimate)).toBe('41 of 100 (41%)');
    expect(describeSampleCount(null)).toBe('—');
  });

  it('what it says about the population is "about", a range, and the sample size — never a bare count', () => {
    const text = describeEstimate(estimate, 1452);
    expect(text).toBe('41 of 100 sampled boxes → about 32–50% of all 1,452');
    expect(text).toContain('of 100');
    expect(text).toContain('about');
  });

  it('has no estimate to word when nothing was judged', () => {
    expect(describeEstimate(null, 1452)).toBe('Nothing judged yet — no estimate.');
  });

  it('progress says "not final" until every sampled box is judged', () => {
    const summary = (judged: number, complete: boolean) =>
      ({ size: 100, judged, complete }) as SampleSummary;
    expect(describeProgress(summary(0, false))).toBe('0 of 100 judged');
    expect(describeProgress(summary(12, false))).toBe('12 of 100 judged — not final');
    expect(describeProgress(summary(100, true))).toBe('100 of 100 judged');
  });
});

describe('sampleAvailability', () => {
  const scenes = (...states: ('loaded' | 'no-predictions' | 'failed' | 'pending')[]) =>
    states.map((state, index) => ({ name: `scene-${index + 1}`, state }));

  it('is ready only when every scene is loaded with predictions', () => {
    expect(sampleAvailability(scenes('loaded', 'loaded', 'loaded'))).toEqual({ status: 'ready' });
  });

  it('is loading while scenes are still on their way, and says how many are in', () => {
    expect(sampleAvailability(scenes('loaded', 'pending', 'pending'))).toEqual({
      status: 'loading',
      loaded: 1,
      total: 3,
    });
  });

  it('is unavailable — not a smaller sample — when a scene failed to load', () => {
    const result = sampleAvailability(scenes('loaded', 'failed', 'pending'));
    expect(result.status).toBe('unavailable');
    expect(result).toMatchObject({ reason: expect.stringContaining('scene-2 could not be loaded') });
  });

  it('is unavailable when a scene has no predictions', () => {
    const result = sampleAvailability(scenes('loaded', 'no-predictions'));
    expect(result).toMatchObject({ status: 'unavailable', reason: expect.stringContaining('scene-2 has no model predictions') });
  });

  it('is unavailable without any scene', () => {
    expect(sampleAvailability([]).status).toBe('unavailable');
  });
});
