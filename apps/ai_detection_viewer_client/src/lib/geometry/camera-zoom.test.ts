import { describe, expect, it } from 'vitest';
import { zoomRegion } from './camera-zoom';

const W = 1600;
const H = 900;
const ASPECT = W / H;

const contains = (
  outer: { x: number; y: number; width: number; height: number },
  inner: { x: number; y: number; width: number; height: number },
) =>
  inner.x >= outer.x - 1e-9 &&
  inner.y >= outer.y - 1e-9 &&
  inner.x + inner.width <= outer.x + outer.width + 1e-9 &&
  inner.y + inner.height <= outer.y + outer.height + 1e-9;

describe('zoomRegion', () => {
  it('keeps the image aspect ratio', () => {
    for (const bbox of [
      { x: 700, y: 400, width: 55, height: 95 }, // far pedestrian
      { x: 600, y: 400, width: 300, height: 100 }, // car from the side
      { x: 100, y: 100, width: 20, height: 20 }, // tiny box
    ]) {
      const r = zoomRegion(bbox, W, H);
      expect(r.width / r.height).toBeCloseTo(ASPECT, 9);
    }
  });

  it('contains the whole box, centred on it when there is room', () => {
    const bbox = { x: 700, y: 400, width: 55, height: 95 };
    const r = zoomRegion(bbox, W, H);
    expect(contains(r, bbox)).toBe(true);
    expect(r.x + r.width / 2).toBeCloseTo(bbox.x + bbox.width / 2, 9);
    expect(r.y + r.height / 2).toBeCloseTo(bbox.y + bbox.height / 2, 9);
  });

  it('sizes the region from the box height (2.4×)', () => {
    const r = zoomRegion({ x: 700, y: 400, width: 55, height: 95 }, W, H);
    expect(r.height).toBeCloseTo(95 * 2.4, 9);
  });

  it('widens for a box that is much wider than tall', () => {
    const bbox = { x: 400, y: 400, width: 600, height: 100 };
    const r = zoomRegion(bbox, W, H);
    expect(r.width).toBeCloseTo(600 * 1.8, 9);
    expect(contains(r, bbox)).toBe(true);
  });

  it('never crops tighter than the minimum height', () => {
    const r = zoomRegion({ x: 800, y: 450, width: 6, height: 10 }, W, H);
    expect(r.height).toBe(140);
  });

  it('shifts the region to stay inside the image near an edge', () => {
    const bbox = { x: 1560, y: 860, width: 40, height: 40 }; // bottom-right corner
    const r = zoomRegion(bbox, W, H);
    expect(r.x + r.width).toBeCloseTo(W, 9);
    expect(r.y + r.height).toBeCloseTo(H, 9);
    expect(contains(r, bbox)).toBe(true);
    const topLeft = zoomRegion({ x: 0, y: 0, width: 40, height: 40 }, W, H);
    expect(topLeft.x).toBe(0);
    expect(topLeft.y).toBe(0);
  });

  it('returns the whole image when the box already fills most of it', () => {
    const whole = { x: 0, y: 0, width: W, height: H };
    expect(zoomRegion({ x: 100, y: 50, width: 1400, height: 800 }, W, H)).toEqual(whole);
    expect(zoomRegion({ x: 0, y: 300, width: 1000, height: 200 }, W, H)).toEqual(whole);
  });

  it('returns the whole image for a degenerate box or image', () => {
    const whole = { x: 0, y: 0, width: W, height: H };
    expect(zoomRegion({ x: 10, y: 10, width: 0, height: 50 }, W, H)).toEqual(whole);
    expect(zoomRegion({ x: NaN, y: 10, width: 20, height: 50 }, W, H)).toEqual(whole);
    expect(zoomRegion({ x: 10, y: 10, width: 20, height: 50 }, 0, 0)).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });
  });
});
