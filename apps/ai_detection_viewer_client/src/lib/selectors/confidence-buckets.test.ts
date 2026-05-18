import { describe, expect, it } from 'vitest';
import type { Detection2D, Frame } from '@/lib/types';
import {
  BUCKET_COUNT,
  selectConfidenceBuckets,
} from './confidence-buckets';

function det(id: string, klass: string, confidence: number): Detection2D {
  return {
    id,
    class: klass,
    confidence,
    bbox: { x: 0, y: 0, width: 10, height: 10 },
  };
}

function frame(...detections: Detection2D[]): Frame {
  return {
    id: 'f1',
    imageUrl: '/x.jpg',
    imageWidth: 100,
    imageHeight: 100,
    detections2D: detections,
    detections3D: [],
    pointCloud: [],
  };
}

describe('selectConfidenceBuckets', () => {
  it('BUCKET_COUNT is locked at 10 (UI contract)', () => {
    // ConfidenceHistogram paints exactly BUCKET_COUNT bars. Changing this
    // constant is a deliberate UI change and must update both ends together.
    expect(BUCKET_COUNT).toBe(10);
  });

  it('empty detections produce all-zero buckets', () => {
    const result = selectConfidenceBuckets(frame());
    expect(result).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('output length is always BUCKET_COUNT regardless of input', () => {
    expect(selectConfidenceBuckets(frame()).length).toBe(BUCKET_COUNT);
    expect(
      selectConfidenceBuckets(frame(det('a', 'car', 0.4))).length,
    ).toBe(BUCKET_COUNT);
  });

  it('distributes detections into the correct buckets', () => {
    const f = frame(
      det('a', 'car', 0.05),    // bucket 0
      det('b', 'car', 0.15),    // bucket 1
      det('c', 'car', 0.25),    // bucket 2
      det('d', 'car', 0.85),    // bucket 8
      det('e', 'car', 0.95),    // bucket 9
      det('f', 'car', 0.92),    // bucket 9
    );
    const result = selectConfidenceBuckets(f);
    expect(result).toEqual([1, 1, 1, 0, 0, 0, 0, 0, 1, 2]);
  });

  it('half-open boundary: value exactly on bucket edge goes into the upper bucket', () => {
    // 0.5 belongs to [0.5, 0.6) → bucket 5, NOT bucket 4.
    const f = frame(det('a', 'car', 0.5));
    const result = selectConfidenceBuckets(f);
    expect(result[5]).toBe(1);
    expect(result[4]).toBe(0);
  });

  it('upper bound: confidence === 1.0 lands in the last bucket (closed right)', () => {
    // Without the closed-right rule, Math.floor(1.0 * 10) === 10 would write
    // out of range and silently drop the detection from the chart.
    const f = frame(det('a', 'car', 1.0));
    const result = selectConfidenceBuckets(f);
    expect(result[BUCKET_COUNT - 1]).toBe(1);
    expect(result.reduce((a, b) => a + b, 0)).toBe(1);
  });

  it('lower bound: confidence === 0.0 lands in the first bucket', () => {
    const f = frame(det('a', 'car', 0.0));
    const result = selectConfidenceBuckets(f);
    expect(result[0]).toBe(1);
    expect(result.reduce((a, b) => a + b, 0)).toBe(1);
  });
});
