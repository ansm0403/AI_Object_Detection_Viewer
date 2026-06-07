import { describe, expect, it } from 'vitest';
import { depthToColor, depthRange, __testing } from './depth-color';

const { ACTIVE_PALETTE } = __testing;
const { near, far } = ACTIVE_PALETTE;

// Fixed range mirroring the estimator's MIN_Z..MAX_Z (the real caller's range).
const MIN_Z = 1;
const MAX_Z = 8;

describe('depthToColor', () => {
  describe('ramp endpoints', () => {
    it('maps z = minZ to the ramp near color', () => {
      expect(depthToColor(MIN_Z, MIN_Z, MAX_Z)).toEqual([near[0], near[1], near[2]]);
    });

    it('maps z = maxZ to the ramp far color', () => {
      expect(depthToColor(MAX_Z, MIN_Z, MAX_Z)).toEqual([far[0], far[1], far[2]]);
    });

    it('maps the midpoint to the channel-wise average of near and far', () => {
      const mid = depthToColor((MIN_Z + MAX_Z) / 2, MIN_Z, MAX_Z);
      for (let c = 0; c < 3; c++) {
        expect(mid[c]).toBeCloseTo((near[c] + far[c]) / 2, 10);
      }
    });
  });

  describe('monotonicity (smaller z → nearer end of ramp)', () => {
    it('moves each channel monotonically from near toward far as z increases', () => {
      const samples = [1, 2, 3, 4, 5, 6, 7, 8].map((z) =>
        depthToColor(z, MIN_Z, MAX_Z),
      );
      for (let c = 0; c < 3; c++) {
        const increasing = far[c] >= near[c];
        for (let i = 1; i < samples.length; i++) {
          if (increasing) {
            expect(samples[i][c]).toBeGreaterThanOrEqual(samples[i - 1][c]);
          } else {
            expect(samples[i][c]).toBeLessThanOrEqual(samples[i - 1][c]);
          }
        }
      }
    });
  });

  describe('clamping outside [minZ, maxZ]', () => {
    it('clamps z below minZ to the near color', () => {
      expect(depthToColor(-5, MIN_Z, MAX_Z)).toEqual(depthToColor(MIN_Z, MIN_Z, MAX_Z));
    });

    it('clamps z above maxZ to the far color', () => {
      expect(depthToColor(100, MIN_Z, MAX_Z)).toEqual(depthToColor(MAX_Z, MIN_Z, MAX_Z));
    });
  });

  describe('degenerate range (minZ === maxZ)', () => {
    it('returns the ramp midpoint instead of dividing by zero', () => {
      const result = depthToColor(5, 5, 5);
      for (let c = 0; c < 3; c++) {
        expect(result[c]).toBeCloseTo((near[c] + far[c]) / 2, 10);
      }
    });

    it('is stable: same degenerate input → same output', () => {
      expect(depthToColor(5, 5, 5)).toEqual(depthToColor(5, 5, 5));
    });

    it('ignores z value when the range is degenerate', () => {
      expect(depthToColor(0, 3, 3)).toEqual(depthToColor(999, 3, 3));
    });
  });

  describe('output range', () => {
    it('returns every channel within [0, 1]', () => {
      for (const z of [-10, 1, 4.5, 8, 50]) {
        for (const c of depthToColor(z, MIN_Z, MAX_Z)) {
          expect(c).toBeGreaterThanOrEqual(0);
          expect(c).toBeLessThanOrEqual(1);
        }
      }
    });
  });
});

describe('depthRange', () => {
  it('returns [min, max] of the points z', () => {
    expect(depthRange([{ z: 5 }, { z: 2 }, { z: 8 }, { z: 3 }])).toEqual([2, 8]);
  });

  it('handles a single point (min === max)', () => {
    expect(depthRange([{ z: 7.5 }])).toEqual([7.5, 7.5]);
  });

  it('returns equal min/max for all-equal z (degenerate → depthToColor midpoint)', () => {
    const [min, max] = depthRange([{ z: 4 }, { z: 4 }, { z: 4 }]);
    expect(min).toBe(max);
    const color = depthToColor(4, min, max);
    for (let c = 0; c < 3; c++) {
      expect(color[c]).toBeCloseTo((near[c] + far[c]) / 2, 10);
    }
  });

  it('handles negative z values', () => {
    expect(depthRange([{ z: -2 }, { z: 5 }, { z: -7 }])).toEqual([-7, 5]);
  });

  it('returns a stable [0, 1] placeholder for empty input', () => {
    expect(depthRange([])).toEqual([0, 1]);
  });
});
