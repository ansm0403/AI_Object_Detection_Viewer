import { describe, expect, it } from 'vitest';
import { footprintOf, makeBevProjector } from './bev';
import { CAR, LEVEL_POSE } from './test-helpers';
import {
  MAX_METRES_PER_PIXEL,
  MIN_METRES_PER_PIXEL,
  bevToPixel,
  fitViewTo,
  panView,
  pixelToBev,
  scaleBarMetres,
  viewBoxOf,
  zoomView,
  type BevView,
} from './view';

const SIZE = { width: 800, height: 500 };
const VIEW: BevView = { centre: [-3, -10], metresPerPixel: 0.04 };

describe('top-view viewport', () => {
  it('the middle pixel shows the centre, and pixels convert both ways', () => {
    expect(pixelToBev(VIEW, SIZE, [400, 250])).toEqual([-3, -10]);
    const p = pixelToBev(VIEW, SIZE, [130, 420]);
    const back = bevToPixel(VIEW, SIZE, p);
    expect(back[0]).toBeCloseTo(130, 9);
    expect(back[1]).toBeCloseTo(420, 9);
  });

  it('viewBoxOf covers exactly the element, in metres', () => {
    const box = viewBoxOf(VIEW, SIZE);
    expect(box.width).toBeCloseTo(32, 12);
    expect(box.height).toBeCloseTo(20, 12);
    expect(box.x).toBeCloseTo(-19, 12);
    expect(box.y).toBeCloseTo(-20, 12);
    // its corners are the element's corner pixels
    const corner = pixelToBev(VIEW, SIZE, [0, 0]);
    expect(corner[0]).toBeCloseTo(box.x, 12);
    expect(corner[1]).toBeCloseTo(box.y, 12);
  });

  it('fitViewTo centres on the box and shows it with room around it', () => {
    const footprint = footprintOf(CAR, makeBevProjector(LEVEL_POSE));
    const view = fitViewTo(footprint, SIZE);
    expect(view.centre).toEqual(footprint.center);
    // every corner is inside the element, with a margin
    for (const corner of footprint.corners) {
      const [x, y] = bevToPixel(view, SIZE, corner);
      expect(x).toBeGreaterThan(40);
      expect(x).toBeLessThan(SIZE.width - 40);
      expect(y).toBeGreaterThan(40);
      expect(y).toBeLessThan(SIZE.height - 40);
    }
    // and the box is large enough to grab: its length is at least 100 px
    expect(CAR.size[1] / view.metresPerPixel).toBeGreaterThan(100);
  });

  it('fitViewTo zooms in further on a small box, so a pedestrian can be grabbed too', () => {
    const person = { translation: [10, 3, 0.9] as [number, number, number], size: [0.75, 0.82, 1.64] as [number, number, number], yaw: 0.4 };
    const view = fitViewTo(footprintOf(person, makeBevProjector(LEVEL_POSE)), SIZE);
    expect(person.size[1] / view.metresPerPixel).toBeGreaterThan(100);
    // and a long bus still fits with its neighbours around it
    const bus = { translation: [10, 3, 1.7] as [number, number, number], size: [2.9, 12.1, 3.4] as [number, number, number], yaw: 0.4 };
    const busView = fitViewTo(footprintOf(bus, makeBevProjector(LEVEL_POSE)), SIZE);
    for (const corner of footprintOf(bus, makeBevProjector(LEVEL_POSE)).corners) {
      const [x, y] = bevToPixel(busView, SIZE, corner);
      expect(x).toBeGreaterThan(40);
      expect(y).toBeGreaterThan(40);
      expect(y).toBeLessThan(SIZE.height - 40);
    }
  });

  it('fitViewTo does not divide by zero for an element with no size yet', () => {
    const footprint = footprintOf(CAR, makeBevProjector(LEVEL_POSE));
    const view = fitViewTo(footprint, { width: 0, height: 0 });
    expect(Number.isFinite(view.metresPerPixel)).toBe(true);
    expect(view.metresPerPixel).toBeLessThanOrEqual(MAX_METRES_PER_PIXEL);
  });

  it('zoomView keeps the point under the pointer where it is', () => {
    const anchor: [number, number] = [620, 90];
    const under = pixelToBev(VIEW, SIZE, anchor);
    const zoomed = zoomView(VIEW, SIZE, 0.5, anchor);
    expect(zoomed.metresPerPixel).toBeCloseTo(0.02, 12);
    const after = pixelToBev(zoomed, SIZE, anchor);
    expect(after[0]).toBeCloseTo(under[0], 9);
    expect(after[1]).toBeCloseTo(under[1], 9);
  });

  it('zoomView stops at the closest and farthest zoom', () => {
    expect(zoomView(VIEW, SIZE, 1e-6, [0, 0]).metresPerPixel).toBe(MIN_METRES_PER_PIXEL);
    expect(zoomView(VIEW, SIZE, 1e6, [0, 0]).metresPerPixel).toBe(MAX_METRES_PER_PIXEL);
    const atLimit: BevView = { centre: [0, 0], metresPerPixel: MAX_METRES_PER_PIXEL };
    expect(zoomView(atLimit, SIZE, 2, [10, 10])).toBe(atLimit);
  });

  it('panView makes the content follow the pointer', () => {
    const before = bevToPixel(VIEW, SIZE, [1, 2]);
    const after = bevToPixel(panView(VIEW, [25, -10]), SIZE, [1, 2]);
    expect(after[0] - before[0]).toBeCloseTo(25, 9);
    expect(after[1] - before[1]).toBeCloseTo(-10, 9);
    expect(panView(VIEW, [0, 0])).toBe(VIEW);
  });

  it('scaleBarMetres picks a round length near the wanted width', () => {
    expect(scaleBarMetres({ centre: [0, 0], metresPerPixel: 0.04 })).toBe(2); // 80 px = 3.2 m -> 2 m
    expect(scaleBarMetres({ centre: [0, 0], metresPerPixel: 0.1 })).toBe(5); // 8 m -> 5 m
    expect(scaleBarMetres({ centre: [0, 0], metresPerPixel: 0.015 })).toBe(1); // 1.2 m -> 1 m
    expect(scaleBarMetres({ centre: [0, 0], metresPerPixel: 0.3 })).toBe(20); // 24 m -> 20 m
  });
});
