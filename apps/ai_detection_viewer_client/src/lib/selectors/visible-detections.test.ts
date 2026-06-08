import { describe, expect, it } from 'vitest';
import type { Detection2D, Frame, Point3D } from '@/lib/types';
import {
  selectVisibleDetections,
  selectVisibleDetectionIds,
  selectVisiblePoints,
} from './visible-detections';

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

describe('selectVisibleDetections', () => {
  it('threshold=0 + visibleClasses=∅ returns all detections (permissive empty)', () => {
    // Locks the semantic: empty visibleClasses means "show all classes",
    // matching the store's initial state.
    const f = frame(det('a', 'car', 0.1), det('b', 'person', 0.5), det('c', 'bicycle', 0.9));
    const result = selectVisibleDetections(f, 0, new Set());
    expect(result.map((d) => d.id)).toEqual(['a', 'b', 'c']);
  });

  it('threshold=1 returns only detections with confidence === 1.0', () => {
    const f = frame(
      det('a', 'car', 0.99),
      det('b', 'car', 1.0),
      det('c', 'car', 0.5),
    );
    const result = selectVisibleDetections(f, 1, new Set());
    expect(result.map((d) => d.id)).toEqual(['b']);
  });

  it('drops detections with confidence < threshold', () => {
    const f = frame(det('a', 'car', 0.3), det('b', 'car', 0.6), det('c', 'car', 0.8));
    const result = selectVisibleDetections(f, 0.5, new Set());
    expect(result.map((d) => d.id)).toEqual(['b', 'c']);
  });

  it('keeps only classes in visibleClasses when the set is non-empty', () => {
    const f = frame(
      det('a', 'car', 1),
      det('b', 'person', 1),
      det('c', 'bicycle', 1),
    );
    const result = selectVisibleDetections(f, 0, new Set(['car']));
    expect(result.map((d) => d.id)).toEqual(['a']);
  });

  it('supports multi-class visibility (union)', () => {
    const f = frame(
      det('a', 'car', 1),
      det('b', 'person', 1),
      det('c', 'bicycle', 1),
    );
    const result = selectVisibleDetections(f, 0, new Set(['car', 'bicycle']));
    expect(result.map((d) => d.id)).toEqual(['a', 'c']);
  });

  it('applies threshold AND class filters together', () => {
    const f = frame(
      det('a', 'car', 0.3),
      det('b', 'car', 0.7),
      det('c', 'person', 0.7),
    );
    const result = selectVisibleDetections(f, 0.5, new Set(['car']));
    expect(result.map((d) => d.id)).toEqual(['b']);
  });

  it('returns empty array when visibleClasses contains no matching class', () => {
    const f = frame(det('a', 'car', 1), det('b', 'person', 1));
    const result = selectVisibleDetections(f, 0, new Set(['truck']));
    expect(result).toEqual([]);
  });

  it('returns empty array when frame.detections2D is empty', () => {
    const result = selectVisibleDetections(frame(), 0, new Set());
    expect(result).toEqual([]);
  });

  it('preserves detection identity (returns the same object refs, no copies)', () => {
    const f = frame(det('a', 'car', 1));
    const result = selectVisibleDetections(f, 0, new Set());
    expect(result[0]).toBe(f.detections2D[0]);
  });
});

describe('selectVisibleDetectionIds', () => {
  it('returns the id Set of visible detections', () => {
    const f = frame(
      det('a', 'car', 0.3),
      det('b', 'car', 0.7),
      det('c', 'person', 0.7),
    );
    const ids = selectVisibleDetectionIds(f, 0.5, new Set(['car']));
    expect(ids).toEqual(new Set(['b']));
  });

  it('returns empty Set when nothing is visible', () => {
    const f = frame(det('a', 'car', 0.1));
    const ids = selectVisibleDetectionIds(f, 0.9, new Set());
    expect(ids).toEqual(new Set());
  });
});

describe('selectVisiblePoints (F2-B — env points always show)', () => {
  const owned = (id: string): Point3D => ({ x: 0, y: 0, z: 0, detectionId: id });
  const env: Point3D = { x: 1, y: 2, z: 3 }; // LiDAR point, no detectionId

  it('keeps COCO points whose detectionId is in visibleIds, drops the rest', () => {
    const pts = [owned('a'), owned('b'), owned('c')];
    const result = selectVisiblePoints(pts, new Set(['a', 'c']));
    expect(result).toEqual([owned('a'), owned('c')]);
  });

  it('always keeps LiDAR points (no detectionId) regardless of the set', () => {
    const pts = [env, owned('a')];
    // 'a' not in the set, but the env point survives.
    expect(selectVisiblePoints(pts, new Set(['z']))).toEqual([env]);
    // even an empty set keeps env points.
    expect(selectVisiblePoints(pts, new Set())).toEqual([env]);
  });

  it('mixes both: env points pass, owned points obey the set', () => {
    const pts = [env, owned('a'), owned('b')];
    expect(selectVisiblePoints(pts, new Set(['b']))).toEqual([env, owned('b')]);
  });

  it('undefined visibleIds keeps every point (no filtering wired)', () => {
    const pts = [env, owned('a')];
    expect(selectVisiblePoints(pts, undefined)).toBe(pts);
  });
});
