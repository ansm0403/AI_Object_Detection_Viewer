import { describe, expect, it } from 'vitest';
import { classLabel } from './class-label';

describe('classLabel', () => {
  it('drops the dataset namespace of an unmapped class', () => {
    expect(classLabel('static_object.bicycle_rack')).toBe('bicycle_rack');
    expect(classLabel('movable_object.trafficcone')).toBe('trafficcone');
  });

  it('keeps only the last part of a deeper name', () => {
    expect(classLabel('human.pedestrian.stroller')).toBe('stroller');
  });

  it('leaves the short names the parser already produces unchanged', () => {
    for (const name of ['car', 'person', 'bicycle', 'truck', 'bus', 'motorcycle']) {
      expect(classLabel(name)).toBe(name);
    }
  });

  it('never returns an empty label', () => {
    expect(classLabel('odd.')).toBe('odd.');
    expect(classLabel('.')).toBe('.');
    expect(classLabel('')).toBe('');
    expect(classLabel('.hidden')).toBe('hidden');
  });
});
