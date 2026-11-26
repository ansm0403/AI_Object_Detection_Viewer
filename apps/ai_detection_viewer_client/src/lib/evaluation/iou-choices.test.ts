import { describe, expect, it } from 'vitest';
import { BENCHMARK_IOU, IOU_CHOICES, describeIouChoice, isIouChoice } from './iou-choices';
import { IOU_THRESHOLD } from './match';

describe('IoU choices', () => {
  it('offers this tool’s default first, then the benchmark value', () => {
    expect(IOU_CHOICES).toEqual([0.3, 0.5]);
    expect(IOU_CHOICES[0]).toBe(IOU_THRESHOLD);
    expect(BENCHMARK_IOU).toBe(0.5);
  });

  it('the default has not moved (every locked number is measured at it)', () => {
    expect(IOU_THRESHOLD).toBe(0.3);
  });

  it('knows which values are on offer', () => {
    expect(isIouChoice(0.3)).toBe(true);
    expect(isIouChoice(0.5)).toBe(true);
    expect(isIouChoice(0.4)).toBe(false);
  });

  it('says what each value is', () => {
    expect(describeIouChoice(0.3)).toEqual({ note: 'this tool’s default', isDefault: true });
    expect(describeIouChoice(0.5)).toMatchObject({ isDefault: false });
    expect(describeIouChoice(0.5).note).toContain('benchmark');
    expect(describeIouChoice(0.42)).toEqual({ note: '', isDefault: false });
  });
});
