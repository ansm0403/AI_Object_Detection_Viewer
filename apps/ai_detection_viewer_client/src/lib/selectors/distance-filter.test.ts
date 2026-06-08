import { describe, it, expect } from 'vitest';
import type { Detection3D } from '@/lib/types';
import { detectionDistance, selectIdsWithinDistance } from './distance-filter';

function det(id: string, center: [number, number, number]): Detection3D {
  return {
    id,
    class: 'car',
    confidence: 1.0,
    bbox3D: { center, size: [1, 1, 1] },
  };
}

describe('detectionDistance', () => {
  it('returns the euclidean magnitude of the center', () => {
    expect(detectionDistance(det('a', [3, 0, 4]))).toBe(5); // 3-4-5
  });

  it('is zero at the origin', () => {
    expect(detectionDistance(det('o', [0, 0, 0]))).toBe(0);
  });

  it('uses all three axes, not just the ground plane', () => {
    // |[2,3,6]| = 7 — the y (height) component participates.
    expect(detectionDistance(det('a', [2, 3, 6]))).toBe(7);
  });

  it('is sign-independent (uses magnitude)', () => {
    expect(detectionDistance(det('neg', [-3, 0, -4]))).toBe(5);
  });
});

describe('selectIdsWithinDistance', () => {
  const detections: Detection3D[] = [
    det('near', [3, 0, 4]), // 5 m
    det('mid', [0, 0, 20]), // 20 m
    det('far', [0, 0, 50]), // 50 m
  ];

  it('keeps only ids within the threshold', () => {
    const ids = selectIdsWithinDistance(detections, 25);
    expect([...ids].sort()).toEqual(['mid', 'near']);
  });

  it('is inclusive at the boundary', () => {
    // 'mid' sits exactly at 20 m and must survive a 20 m threshold.
    const ids = selectIdsWithinDistance(detections, 20);
    expect(ids.has('mid')).toBe(true);
    expect(ids.has('far')).toBe(false);
  });

  it('returns every id when the threshold exceeds the farthest box (filter off)', () => {
    const ids = selectIdsWithinDistance(detections, 90);
    expect(ids.size).toBe(3);
  });

  it('returns an empty set for an empty input', () => {
    expect(selectIdsWithinDistance([], 90).size).toBe(0);
  });

  it('hides everything when maxDistance is NaN (non-finite)', () => {
    // distance <= NaN is always false — no garbage passes through.
    expect(selectIdsWithinDistance(detections, Number.NaN).size).toBe(0);
  });
});
