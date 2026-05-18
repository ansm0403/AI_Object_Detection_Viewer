import { describe, expect, it } from 'vitest';
import type { Detection2D, Frame } from '@/lib/types';
import { selectClassCounts } from './class-counts';

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

describe('selectClassCounts', () => {
  it('empty detections produce an empty Map', () => {
    const result = selectClassCounts(frame());
    expect(result.size).toBe(0);
  });

  it('single class with N detections yields a single entry with count N', () => {
    const f = frame(
      det('a', 'car', 1),
      det('b', 'car', 1),
      det('c', 'car', 1),
    );
    const result = selectClassCounts(f);
    expect(result.size).toBe(1);
    expect(result.get('car')).toBe(3);
  });

  it('counts each class correctly across multiple classes', () => {
    const f = frame(
      det('a', 'car', 1),
      det('b', 'person', 1),
      det('c', 'car', 1),
      det('d', 'bicycle', 1),
      det('e', 'person', 1),
    );
    const result = selectClassCounts(f);
    expect(result.get('car')).toBe(2);
    expect(result.get('person')).toBe(2);
    expect(result.get('bicycle')).toBe(1);
    expect(result.size).toBe(3);
  });

  it('keys on class name, not on detection id (same class accumulates)', () => {
    // Two detections of the same class with different ids must coalesce
    // into one Map entry — otherwise rows would multiply per detection.
    const f = frame(
      det('id-1', 'car', 0.4),
      det('id-2', 'car', 0.9),
    );
    const result = selectClassCounts(f);
    expect(result.size).toBe(1);
    expect(result.get('car')).toBe(2);
  });

  it('preserves first-appearance order in Map iteration', () => {
    // ClassCountBar renders rows in iteration order. Locking this means UI
    // does not need an extra sort step and row order stays stable across
    // re-renders of the same frame.
    const f = frame(
      det('a', 'person', 1),
      det('b', 'car', 1),
      det('c', 'bicycle', 1),
      det('d', 'person', 1),
    );
    const result = selectClassCounts(f);
    expect([...result.keys()]).toEqual(['person', 'car', 'bicycle']);
  });
});
