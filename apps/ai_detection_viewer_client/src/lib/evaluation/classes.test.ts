import { describe, expect, it } from 'vitest';
import { __testing as nuscenesParser } from '@/lib/nuscenes/parser';
import { EVALUATED_CLASSES, isEvaluatedClass, toEvaluatedClass } from './classes';

describe('evaluated classes', () => {
  it('maps the model classes that have a counterpart', () => {
    for (const cls of ['person', 'bicycle', 'car', 'motorcycle', 'bus', 'truck']) {
      expect(toEvaluatedClass(cls)).toBe(cls);
    }
  });

  it('leaves out model classes without a counterpart', () => {
    expect(toEvaluatedClass('traffic light')).toBeNull();
    expect(toEvaluatedClass('handbag')).toBeNull();
    expect(toEvaluatedClass('')).toBeNull();
  });

  it('does not resolve names inherited from Object.prototype', () => {
    expect(toEvaluatedClass('constructor')).toBeNull();
    expect(toEvaluatedClass('toString')).toBeNull();
  });

  it('leaves out label classes the model cannot name', () => {
    expect(isEvaluatedClass('person')).toBe(true);
    expect(isEvaluatedClass('static_object.bicycle_rack')).toBe(false);
    expect(isEvaluatedClass('movable_object.trafficcone')).toBe(false);
  });

  it('every evaluated class is one the model can report and the nuScenes parser can produce', () => {
    const appClasses = new Set(Object.values(nuscenesParser.CATEGORY_MAP));
    for (const cls of EVALUATED_CLASSES) {
      expect(toEvaluatedClass(cls)).toBe(cls);
      expect(appClasses.has(cls)).toBe(true);
    }
  });
});
