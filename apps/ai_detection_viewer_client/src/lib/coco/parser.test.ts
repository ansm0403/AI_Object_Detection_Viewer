import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { parseCoco } from './parser';

describe('parseCoco', () => {
  let warnSpy: MockInstance<(...args: unknown[]) => void>;

  beforeEach(() => {
    warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined) as unknown as MockInstance<
      (...args: unknown[]) => void
    >;
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe('valid input', () => {
    it('converts well-formed COCO JSON into Frame[]', () => {
      const raw = {
        images: [
          { id: 1, file_name: 'frame_001.jpg', width: 640, height: 480 },
          { id: 2, file_name: 'frame_002.jpg', width: 640, height: 480 },
        ],
        categories: [
          { id: 1, name: 'car' },
          { id: 2, name: 'person' },
        ],
        annotations: [
          { id: 1, image_id: 1, category_id: 1, bbox: [10, 20, 30, 40], score: 0.9 },
          { id: 2, image_id: 1, category_id: 2, bbox: [50, 60, 70, 80], score: 0.8 },
          { id: 3, image_id: 2, category_id: 1, bbox: [100, 110, 120, 130] },
        ],
      };

      const frames = parseCoco(raw);

      expect(frames).toHaveLength(2);
      expect(frames[0].id).toBe('1');
      expect(frames[0].imageUrl).toBe('/sample-data/frame_001.jpg');
      expect(frames[0].imageWidth).toBe(640);
      expect(frames[0].imageHeight).toBe(480);
      expect(frames[0].detections2D).toHaveLength(2);
      expect(frames[1].detections2D).toHaveLength(1);
      expect(frames[0].detections3D).toEqual([]);
      expect(frames[0].pointCloud).toEqual([]);
    });

    it('maps class, confidence, and bbox fields correctly', () => {
      const raw = {
        images: [{ id: 1, file_name: 'a.jpg', width: 100, height: 100 }],
        categories: [{ id: 7, name: 'car' }],
        annotations: [
          { id: 99, image_id: 1, category_id: 7, bbox: [10, 20, 30, 40], score: 0.75 },
        ],
      };

      const det = parseCoco(raw)[0].detections2D[0];

      expect(det.class).toBe('car');
      expect(det.confidence).toBe(0.75);
      expect(det.bbox).toEqual({ x: 10, y: 20, width: 30, height: 40 });
    });

    it('defaults confidence to 1.0 when score is missing', () => {
      const raw = {
        images: [{ id: 1, file_name: 'a.jpg', width: 100, height: 100 }],
        categories: [{ id: 1, name: 'car' }],
        annotations: [{ id: 1, image_id: 1, category_id: 1, bbox: [0, 0, 10, 10] }],
      };

      expect(parseCoco(raw)[0].detections2D[0].confidence).toBe(1.0);
    });
  });

  describe('invalid root', () => {
    it.each([
      ['null', null],
      ['undefined', undefined],
      ['empty object', {}],
      ['missing images', { annotations: [], categories: [] }],
      ['missing annotations', { images: [], categories: [] }],
      ['missing categories', { images: [], annotations: [] }],
      ['images not array', { images: 'x', annotations: [], categories: [] }],
      ['primitive number', 42],
      ['primitive string', 'coco'],
    ])('returns [] with warn for %s', (_label, input) => {
      expect(parseCoco(input)).toEqual([]);
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  describe('empty dataset (valid)', () => {
    it('returns [] without warn for { images:[], annotations:[], categories:[] }', () => {
      const result = parseCoco({ images: [], annotations: [], categories: [] });
      expect(result).toEqual([]);
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('unknown category', () => {
    it('skips annotations whose category_id has no matching category', () => {
      const raw = {
        images: [{ id: 1, file_name: 'a.jpg', width: 100, height: 100 }],
        categories: [{ id: 1, name: 'car' }],
        annotations: [
          { id: 1, image_id: 1, category_id: 1, bbox: [10, 20, 30, 40] },
          { id: 2, image_id: 1, category_id: 999, bbox: [50, 60, 70, 80] },
        ],
      };

      const frames = parseCoco(raw);

      expect(frames[0].detections2D).toHaveLength(1);
      expect(frames[0].detections2D[0].id).toBe('1-1');
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  describe('invalid bbox', () => {
    it('skips annotations with bbox length != 4', () => {
      const raw = {
        images: [{ id: 1, file_name: 'a.jpg', width: 100, height: 100 }],
        categories: [{ id: 1, name: 'car' }],
        annotations: [{ id: 1, image_id: 1, category_id: 1, bbox: [10, 20, 30] }],
      };

      expect(parseCoco(raw)[0].detections2D).toHaveLength(0);
      expect(warnSpy).toHaveBeenCalled();
    });

    it('skips annotations with non-numeric bbox entries', () => {
      const raw = {
        images: [{ id: 1, file_name: 'a.jpg', width: 100, height: 100 }],
        categories: [{ id: 1, name: 'car' }],
        annotations: [{ id: 1, image_id: 1, category_id: 1, bbox: [10, '20', 30, 40] }],
      };

      expect(parseCoco(raw)[0].detections2D).toHaveLength(0);
      expect(warnSpy).toHaveBeenCalled();
    });

    it('skips annotations where bbox is not an array', () => {
      const raw = {
        images: [{ id: 1, file_name: 'a.jpg', width: 100, height: 100 }],
        categories: [{ id: 1, name: 'car' }],
        annotations: [{ id: 1, image_id: 1, category_id: 1, bbox: 'invalid' }],
      };

      expect(parseCoco(raw)[0].detections2D).toHaveLength(0);
      expect(warnSpy).toHaveBeenCalled();
    });

    // Edge case — NaN passes `typeof x === 'number'` and would silently propagate
    // through 3D conversion downstream. Must be rejected.
    it('skips annotations with NaN bbox entries', () => {
      const raw = {
        images: [{ id: 1, file_name: 'a.jpg', width: 100, height: 100 }],
        categories: [{ id: 1, name: 'car' }],
        annotations: [{ id: 1, image_id: 1, category_id: 1, bbox: [10, NaN, 30, 40] }],
      };

      expect(parseCoco(raw)[0].detections2D).toHaveLength(0);
      expect(warnSpy).toHaveBeenCalled();
    });

    it('skips annotations with Infinity bbox entries', () => {
      const raw = {
        images: [{ id: 1, file_name: 'a.jpg', width: 100, height: 100 }],
        categories: [{ id: 1, name: 'car' }],
        annotations: [{ id: 1, image_id: 1, category_id: 1, bbox: [10, Infinity, 30, 40] }],
      };

      expect(parseCoco(raw)[0].detections2D).toHaveLength(0);
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  describe('invalid score', () => {
    // Edge case — NaN score would pollute confidence-threshold filtering downstream.
    it('falls back to 1.0 when score is NaN', () => {
      const raw = {
        images: [{ id: 1, file_name: 'a.jpg', width: 100, height: 100 }],
        categories: [{ id: 1, name: 'car' }],
        annotations: [{ id: 1, image_id: 1, category_id: 1, bbox: [0, 0, 10, 10], score: NaN }],
      };

      expect(parseCoco(raw)[0].detections2D[0].confidence).toBe(1.0);
    });
  });

  describe('zero-annotation frame', () => {
    it('creates a Frame with detections2D=[] for image with no annotations', () => {
      const raw = {
        images: [
          { id: 1, file_name: 'a.jpg', width: 100, height: 100 },
          { id: 2, file_name: 'b.jpg', width: 100, height: 100 },
        ],
        categories: [{ id: 1, name: 'car' }],
        annotations: [{ id: 1, image_id: 1, category_id: 1, bbox: [10, 20, 30, 40] }],
      };

      const frames = parseCoco(raw);

      expect(frames).toHaveLength(2);
      expect(frames[1].id).toBe('2');
      expect(frames[1].detections2D).toEqual([]);
    });
  });

  describe('id uniqueness and format', () => {
    it('generates unique ids within a single frame', () => {
      const raw = {
        images: [{ id: 1, file_name: 'a.jpg', width: 100, height: 100 }],
        categories: [{ id: 1, name: 'car' }],
        annotations: [
          { id: 1, image_id: 1, category_id: 1, bbox: [10, 20, 30, 40] },
          { id: 2, image_id: 1, category_id: 1, bbox: [50, 60, 70, 80] },
          { id: 3, image_id: 1, category_id: 1, bbox: [90, 100, 110, 120] },
        ],
      };

      const ids = parseCoco(raw)[0].detections2D.map((d) => d.id);

      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toEqual(['1-1', '1-2', '1-3']);
    });

    it('formats id as `${imageId}-${annotationId}`', () => {
      const raw = {
        images: [{ id: 42, file_name: 'a.jpg', width: 100, height: 100 }],
        categories: [{ id: 1, name: 'car' }],
        annotations: [{ id: 99, image_id: 42, category_id: 1, bbox: [10, 20, 30, 40] }],
      };

      expect(parseCoco(raw)[0].detections2D[0].id).toBe('42-99');
    });

    it('skips duplicate detection ids within a frame and warns', () => {
      const raw = {
        images: [{ id: 1, file_name: 'a.jpg', width: 100, height: 100 }],
        categories: [{ id: 1, name: 'car' }],
        annotations: [
          { id: 1, image_id: 1, category_id: 1, bbox: [10, 20, 30, 40] },
          { id: 1, image_id: 1, category_id: 1, bbox: [50, 60, 70, 80] },
        ],
      };

      expect(parseCoco(raw)[0].detections2D).toHaveLength(1);
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  describe('duplicate image ids', () => {
    // Edge case — Frame.id is the selectedFrameId key. Duplicates would create
    // ambiguous frame selection in Step 8 (timeline).
    it('skips duplicate image ids and warns', () => {
      const raw = {
        images: [
          { id: 1, file_name: 'a.jpg', width: 100, height: 100 },
          { id: 1, file_name: 'b.jpg', width: 100, height: 100 },
        ],
        categories: [{ id: 1, name: 'car' }],
        annotations: [],
      };

      const frames = parseCoco(raw);

      expect(frames).toHaveLength(1);
      expect(frames[0].imageUrl).toBe('/sample-data/a.jpg');
      expect(warnSpy).toHaveBeenCalled();
    });
  });
});
