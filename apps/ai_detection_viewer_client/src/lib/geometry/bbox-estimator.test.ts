import { describe, expect, it } from 'vitest';
import type { Detection2D } from '@/lib/types';
import {
  estimateDetection3D,
  estimateDetections3D,
  __testing,
} from './bbox-estimator';

const { MIN_Z, MAX_Z, MIN_SIZE_WORLD, SCENE_HALF_Y } = __testing;

function det(
  id: string,
  bbox: { x: number; y: number; width: number; height: number },
  overrides: Partial<Detection2D> = {},
): Detection2D {
  return {
    id,
    class: 'car',
    confidence: 0.9,
    bbox,
    ...overrides,
  };
}

const W = 640;
const H = 480;
const ASPECT = W / H;

describe('estimateDetection3D', () => {
  describe('id, class, confidence passthrough', () => {
    it('preserves id (Immutable Rule #1)', () => {
      const d2d = det('frame7-ann42', { x: 0, y: 0, width: 10, height: 10 });
      const d3d = estimateDetection3D(d2d, W, H);
      expect(d3d.id).toBe('frame7-ann42');
    });

    it('passes class through unchanged', () => {
      const d2d = det('1-1', { x: 0, y: 0, width: 10, height: 10 }, { class: 'person' });
      const d3d = estimateDetection3D(d2d, W, H);
      expect(d3d.class).toBe('person');
    });

    it('passes confidence through unchanged', () => {
      const d2d = det('1-1', { x: 0, y: 0, width: 10, height: 10 }, { confidence: 0.42 });
      const d3d = estimateDetection3D(d2d, W, H);
      expect(d3d.confidence).toBe(0.42);
    });
  });

  describe('center mapping (documented in bbox-estimator.ts header)', () => {
    it('image center maps to world origin in (x, y)', () => {
      const d2d = det('1-1', {
        x: W / 2 - 10,
        y: H / 2 - 10,
        width: 20,
        height: 20,
      });
      const [x, y] = estimateDetection3D(d2d, W, H).bbox3D.center;
      expect(x).toBeCloseTo(0, 6);
      expect(y).toBeCloseTo(0, 6);
    });

    it('top-left bbox maps to negative x, positive y (y flipped)', () => {
      const d2d = det('1-1', { x: 0, y: 0, width: 2, height: 2 });
      const [x, y] = estimateDetection3D(d2d, W, H).bbox3D.center;
      expect(x).toBeLessThan(0);
      expect(y).toBeGreaterThan(0);
    });

    it('bottom-right bbox maps to positive x, negative y', () => {
      const d2d = det('1-1', { x: W - 2, y: H - 2, width: 2, height: 2 });
      const [x, y] = estimateDetection3D(d2d, W, H).bbox3D.center;
      expect(x).toBeGreaterThan(0);
      expect(y).toBeLessThan(0);
    });

    it('respects aspect ratio: |x| extent > |y| extent for the same normalized offset', () => {
      const left = det('1-1', { x: 0, y: H / 2, width: 0, height: 0 });
      const top = det('1-2', { x: W / 2, y: 0, width: 0, height: 0 });
      const xExtent = Math.abs(estimateDetection3D(left, W, H).bbox3D.center[0]);
      const yExtent = Math.abs(estimateDetection3D(top, W, H).bbox3D.center[1]);
      expect(xExtent).toBeCloseTo(SCENE_HALF_Y * ASPECT, 6);
      expect(yExtent).toBeCloseTo(SCENE_HALF_Y, 6);
      expect(xExtent).toBeGreaterThan(yExtent);
    });
  });

  describe('depth (z) from bbox area', () => {
    it('larger area produces smaller z (closer to camera)', () => {
      const small = det('1-1', { x: 0, y: 0, width: 10, height: 10 });
      const large = det('1-2', { x: 0, y: 0, width: 200, height: 200 });
      const zSmall = estimateDetection3D(small, W, H).bbox3D.center[2];
      const zLarge = estimateDetection3D(large, W, H).bbox3D.center[2];
      expect(zLarge).toBeLessThan(zSmall);
    });

    it('zero-area bbox places object at MAX_Z (farthest)', () => {
      const d2d = det('1-1', { x: 100, y: 100, width: 0, height: 0 });
      const z = estimateDetection3D(d2d, W, H).bbox3D.center[2];
      expect(z).toBeCloseTo(MAX_Z, 6);
    });

    it('full-image bbox places object at MIN_Z (closest)', () => {
      const d2d = det('1-1', { x: 0, y: 0, width: W, height: H });
      const z = estimateDetection3D(d2d, W, H).bbox3D.center[2];
      expect(z).toBeCloseTo(MIN_Z, 6);
    });

    it('z is monotonic in area across many sizes', () => {
      const sizes = [5, 20, 50, 100, 200, 400];
      const zs = sizes.map(
        (s) =>
          estimateDetection3D(
            det(`s-${s}`, { x: 0, y: 0, width: s, height: s }),
            W,
            H,
          ).bbox3D.center[2],
      );
      for (let i = 1; i < zs.length; i++) {
        expect(zs[i]).toBeLessThan(zs[i - 1]);
      }
    });
  });

  describe('size clamp for degenerate bboxes', () => {
    it('zero-width / zero-height bbox is rendered at MIN_SIZE_WORLD on all axes', () => {
      const d2d = det('1-1', { x: 100, y: 100, width: 0, height: 0 });
      const [sx, sy, sz] = estimateDetection3D(d2d, W, H).bbox3D.size;
      expect(sx).toBe(MIN_SIZE_WORLD);
      expect(sy).toBe(MIN_SIZE_WORLD);
      expect(sz).toBe(MIN_SIZE_WORLD);
    });

    it('non-degenerate bbox is NOT clamped', () => {
      const d2d = det('1-1', { x: 0, y: 0, width: W / 2, height: H / 2 });
      const [sx, sy] = estimateDetection3D(d2d, W, H).bbox3D.size;
      expect(sx).toBeGreaterThan(MIN_SIZE_WORLD);
      expect(sy).toBeGreaterThan(MIN_SIZE_WORLD);
    });
  });
});

describe('estimateDetections3D', () => {
  it('returns empty array for empty input', () => {
    expect(estimateDetections3D([], W, H)).toEqual([]);
  });

  it('preserves order and ids 1:1 with input', () => {
    const inputs = [
      det('1-1', { x: 0, y: 0, width: 10, height: 10 }),
      det('1-2', { x: 100, y: 100, width: 50, height: 50 }),
      det('1-3', { x: 200, y: 200, width: 80, height: 80 }),
    ];
    const out = estimateDetections3D(inputs, W, H);
    expect(out.map((d) => d.id)).toEqual(['1-1', '1-2', '1-3']);
  });
});
