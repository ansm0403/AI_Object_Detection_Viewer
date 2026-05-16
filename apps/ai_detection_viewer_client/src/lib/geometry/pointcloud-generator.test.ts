import { describe, expect, it } from 'vitest';
import type { Detection3D } from '@/lib/types';
import {
  generatePointCloud,
  makeRng,
} from './pointcloud-generator';

function d3(
  id: string,
  center: [number, number, number],
  size: [number, number, number],
): Detection3D {
  return {
    id,
    class: 'car',
    confidence: 0.9,
    bbox3D: { center, size },
  };
}

describe('generatePointCloud', () => {
  it('returns empty array for empty detections', () => {
    expect(generatePointCloud([])).toEqual([]);
  });

  it('returns empty array when pointsPerDetection <= 0', () => {
    const dets = [d3('1', [0, 0, 0], [1, 1, 1])];
    expect(generatePointCloud(dets, 0)).toEqual([]);
    expect(generatePointCloud(dets, -5)).toEqual([]);
  });

  it('returns N * pointsPerDetection points', () => {
    const dets = [
      d3('1', [0, 0, 0], [1, 1, 1]),
      d3('2', [10, 10, 10], [2, 2, 2]),
      d3('3', [-5, -5, -5], [0.5, 0.5, 0.5]),
    ];
    const points = generatePointCloud(dets, 50);
    expect(points).toHaveLength(150);
  });

  it('every point stays inside its source bbox volume', () => {
    const dets = [
      d3('a', [0, 0, 0], [2, 4, 6]),
      d3('b', [10, -3, 7], [1, 1, 1]),
    ];
    const perDet = 200;
    const points = generatePointCloud(dets, perDet, makeRng(123));

    for (let i = 0; i < dets.length; i++) {
      const d = dets[i];
      const slice = points.slice(i * perDet, (i + 1) * perDet);
      const [cx, cy, cz] = d.bbox3D.center;
      const [sx, sy, sz] = d.bbox3D.size;
      const minX = cx - sx / 2;
      const maxX = cx + sx / 2;
      const minY = cy - sy / 2;
      const maxY = cy + sy / 2;
      const minZ = cz - sz / 2;
      const maxZ = cz + sz / 2;
      for (const p of slice) {
        expect(p.x).toBeGreaterThanOrEqual(minX);
        expect(p.x).toBeLessThanOrEqual(maxX);
        expect(p.y).toBeGreaterThanOrEqual(minY);
        expect(p.y).toBeLessThanOrEqual(maxY);
        expect(p.z).toBeGreaterThanOrEqual(minZ);
        expect(p.z).toBeLessThanOrEqual(maxZ);
      }
    }
  });

  it('is reproducible with a seeded rng', () => {
    const dets = [d3('a', [0, 0, 0], [2, 2, 2])];
    const a = generatePointCloud(dets, 30, makeRng(42));
    const b = generatePointCloud(dets, 30, makeRng(42));
    expect(a).toEqual(b);
  });

  it('produces different output for different seeds', () => {
    const dets = [d3('a', [0, 0, 0], [2, 2, 2])];
    const a = generatePointCloud(dets, 30, makeRng(1));
    const b = generatePointCloud(dets, 30, makeRng(2));
    expect(a).not.toEqual(b);
  });

  it('point intensity carries the detection confidence', () => {
    const dets = [d3('a', [0, 0, 0], [1, 1, 1])];
    dets[0].confidence = 0.42;
    const points = generatePointCloud(dets, 5, makeRng(1));
    for (const p of points) {
      expect(p.intensity).toBe(0.42);
    }
  });
});
