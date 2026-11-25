import { describe, expect, it } from 'vitest';
import { iou } from './iou';
import { box } from './test-helpers';

describe('iou', () => {
  it('is 1 for identical boxes', () => {
    expect(iou(box(10, 20, 30, 40), box(10, 20, 30, 40))).toBe(1);
  });

  it('is 0 for boxes that do not overlap', () => {
    expect(iou(box(0, 0, 10, 10), box(50, 50, 10, 10))).toBe(0);
  });

  it('is 0 for boxes that only share an edge or a corner', () => {
    expect(iou(box(0, 0, 10, 10), box(10, 0, 10, 10))).toBe(0);
    expect(iou(box(0, 0, 10, 10), box(10, 10, 10, 10))).toBe(0);
  });

  it('is intersection / union for a partial overlap', () => {
    // Two 10×10 boxes shifted by 5: they share 5×10 = 50 and cover 150.
    expect(iou(box(0, 0, 10, 10), box(5, 0, 10, 10))).toBeCloseTo(50 / 150, 10);
  });

  it('is the area ratio when one box contains the other', () => {
    // 10×10 inside 20×20 → 100 / 400. A loose label around a tight prediction
    // scores low even though the prediction is entirely inside it.
    expect(iou(box(0, 0, 20, 20), box(5, 5, 10, 10))).toBeCloseTo(0.25, 10);
  });

  it('does not depend on the argument order', () => {
    const a = box(3, 7, 40, 25);
    const b = box(20, 15, 30, 60);
    expect(iou(a, b)).toBe(iou(b, a));
  });

  it('is 0 — never NaN — for a box without area', () => {
    expect(iou(box(0, 0, 0, 10), box(0, 0, 10, 10))).toBe(0);
    expect(iou(box(0, 0, 10, 10), box(2, 2, 5, 0))).toBe(0);
    expect(iou(box(0, 0, 0, 0), box(0, 0, 0, 0))).toBe(0);
    expect(iou(box(0, 0, -10, 10), box(-10, 0, 10, 10))).toBe(0);
  });

  it('is 0 for non-finite coordinates', () => {
    expect(iou(box(Number.NaN, 0, 10, 10), box(0, 0, 10, 10))).toBe(0);
    expect(iou(box(0, 0, Number.POSITIVE_INFINITY, 10), box(0, 0, 10, 10))).toBe(0);
  });
});
