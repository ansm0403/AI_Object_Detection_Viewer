import { describe, expect, it } from 'vitest';
import type { Detection2D, Detection3D, Frame } from '@/lib/types';
import { selectClassCounts } from './class-counts';

function det3(id: string, klass: string): Detection3D {
  return {
    id,
    class: klass,
    confidence: 1,
    bbox3D: { center: [0, 0, -10], size: [1, 1, 1] },
  };
}

function det2(id: string, klass: string): Detection2D {
  return {
    id,
    class: klass,
    confidence: 1,
    bbox: { x: 0, y: 0, width: 10, height: 10 },
  };
}

function frame(detections3D: Detection3D[], detections2D: Detection2D[] = []): Frame {
  return {
    id: 'f1',
    imageUrl: '/x.jpg',
    imageWidth: 100,
    imageHeight: 100,
    detections2D,
    detections3D,
    pointCloud: [],
  };
}

describe('selectClassCounts', () => {
  it('empty detections produce an empty Map', () => {
    const result = selectClassCounts(frame([]));
    expect(result.size).toBe(0);
  });

  it('single class with N detections yields a single entry with count N', () => {
    const f = frame([det3('a', 'car'), det3('b', 'car'), det3('c', 'car')]);
    const result = selectClassCounts(f);
    expect(result.size).toBe(1);
    expect(result.get('car')).toBe(3);
  });

  it('counts each class correctly across multiple classes', () => {
    const f = frame([
      det3('a', 'car'),
      det3('b', 'person'),
      det3('c', 'car'),
      det3('d', 'bicycle'),
      det3('e', 'person'),
    ]);
    const result = selectClassCounts(f);
    expect(result.get('car')).toBe(2);
    expect(result.get('person')).toBe(2);
    expect(result.get('bicycle')).toBe(1);
    expect(result.size).toBe(3);
  });

  it('keys on class name, not on detection id (same class accumulates)', () => {
    // Two detections of the same class with different ids must coalesce
    // into one Map entry — otherwise rows would multiply per detection.
    const f = frame([det3('id-1', 'car'), det3('id-2', 'car')]);
    const result = selectClassCounts(f);
    expect(result.size).toBe(1);
    expect(result.get('car')).toBe(2);
  });

  it('preserves first-appearance order in Map iteration', () => {
    // ClassCountBar renders rows in iteration order. Locking this means UI
    // does not need an extra sort step and row order stays stable across
    // re-renders of the same frame.
    const f = frame([
      det3('a', 'person'),
      det3('b', 'car'),
      det3('c', 'bicycle'),
      det3('d', 'person'),
    ]);
    const result = selectClassCounts(f);
    expect([...result.keys()]).toEqual(['person', 'car', 'bicycle']);
  });

  it('counts 3D boxes that have no 2D projection (F3 decision 4)', () => {
    // nuScenes: a box behind the front camera exists only in detections3D.
    // It must still be counted, so the chart matches the header / list count.
    const f = frame(
      [det3('a', 'car'), det3('b', 'car'), det3('c', 'truck')],
      [det2('a', 'car')],
    );
    const result = selectClassCounts(f);
    expect(result.get('car')).toBe(2);
    expect(result.get('truck')).toBe(1);
  });

  it('ignores detections2D entirely (3D is the counting basis)', () => {
    const f = frame([], [det2('a', 'car'), det2('b', 'person')]);
    expect(selectClassCounts(f).size).toBe(0);
  });
});
