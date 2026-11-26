import { describe, expect, it } from 'vitest';
import { DEFAULT_MIN_BAND_LABELS, compareByDistance } from './distance-compare';
import type { RecallBin } from './types';

const bin = (from: number, found: number, total: number): RecallBin => ({ from, to: from + 10, found, total });

describe('compareByDistance', () => {
  it('pairs the two groups band by band', () => {
    const result = compareByDistance(
      [bin(0, 80, 100), bin(10, 60, 100)],
      [bin(0, 40, 100), bin(10, 30, 100)],
    );
    expect(result.rows).toEqual([
      { from: 0, to: 10, a: { found: 80, total: 100 }, b: { found: 40, total: 100 }, comparable: true },
      { from: 10, to: 20, a: { found: 60, total: 100 }, b: { found: 30, total: 100 }, comparable: true },
    ]);
    expect(result.minLabels).toBe(DEFAULT_MIN_BAND_LABELS);
  });

  it('adds every band beyond the last comparable one into one open-ended row', () => {
    const result = compareByDistance(
      [bin(0, 80, 100), bin(10, 5, 20), bin(20, 1, 10)],
      [bin(0, 40, 100), bin(10, 2, 60), bin(30, 0, 5)],
    );
    expect(result.rows).toHaveLength(2);
    expect(result.rows[1]).toEqual({
      from: 10,
      to: null,
      a: { found: 6, total: 30 },
      b: { found: 2, total: 65 },
      comparable: false, // A has only 30 labels out there
    });
  });

  it('keeps a thin band BEFORE the last comparable one, flagged as not comparable', () => {
    const result = compareByDistance(
      [bin(0, 80, 100), bin(10, 5, 10), bin(20, 50, 100)],
      [bin(0, 40, 100), bin(10, 30, 100), bin(20, 20, 100)],
    );
    expect(result.rows.map((row) => [row.from, row.to, row.comparable])).toEqual([
      [0, 10, true],
      [10, 20, false],
      [20, 30, true],
    ]);
  });

  it('a band one group does not have at all counts as zero labels there', () => {
    const result = compareByDistance([bin(0, 80, 100), bin(10, 60, 100)], [bin(10, 30, 100)]);
    expect(result.rows[0]).toMatchObject({ from: 0, to: 10, b: { found: 0, total: 0 }, comparable: false });
  });

  it('uses the given floor', () => {
    const a = [bin(0, 8, 10)];
    const b = [bin(0, 4, 10)];
    expect(compareByDistance(a, b).rows[0]).toMatchObject({ to: null, comparable: false });
    expect(compareByDistance(a, b, { minLabels: 10 }).rows[0]).toMatchObject({ to: 10, comparable: true });
  });

  it('with no bands at all there is nothing to compare', () => {
    expect(compareByDistance([], [])).toMatchObject({ rows: [], bAtMixOfA: null, aAtMixOfB: null });
  });

  describe('standardised recall (the other group’s distance mix)', () => {
    it('is the plain recall when both groups have the same distance mix', () => {
      // Same label counts per band, so re-weighting changes nothing.
      const result = compareByDistance(
        [bin(0, 80, 100), bin(10, 40, 100)],
        [bin(0, 50, 100), bin(10, 10, 100)],
      );
      expect(result.bAtMixOfA).toBeCloseTo(60 / 200, 10);
      expect(result.aAtMixOfB).toBeCloseTo(120 / 200, 10);
    });

    it('removes a difference that is ONLY a difference in distance', () => {
      // Both groups find 80 % near and 20 % far; B just has most labels far away.
      const a = [bin(0, 80, 100), bin(10, 2, 10)];
      const b = [bin(0, 8, 10), bin(10, 20, 100)];
      // Plain recall: A 82/110 = 75 %, B 28/110 = 25 %.
      const result = compareByDistance(a, b, { minLabels: 1 });
      expect(result.bAtMixOfA).toBeCloseTo(82 / 110, 10);
      expect(result.aAtMixOfB).toBeCloseTo(28 / 110, 10);
    });

    it('keeps a difference that exists at the same distance', () => {
      const result = compareByDistance(
        [bin(0, 80, 100), bin(10, 60, 100)],
        [bin(0, 40, 50), bin(10, 30, 150)],
      );
      // B at A's mix: (100 × 0.8 + 100 × 0.2) / 200 = 0.5 — still below A's 0.7.
      expect(result.bAtMixOfA).toBeCloseTo(0.5, 10);
    });

    it('only uses bands both groups have labels in, and says how much that covers', () => {
      const result = compareByDistance(
        [bin(0, 80, 100), bin(10, 30, 100)],
        [bin(0, 40, 100)],
      );
      expect(result.bAtMixOfA).toBeCloseTo(0.4, 10);
      expect(result.coverageA).toBeCloseTo(0.5, 10);
      expect(result.coverageB).toBe(1);
    });
  });
});
