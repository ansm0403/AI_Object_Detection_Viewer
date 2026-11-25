import { describe, expect, it } from 'vitest';
import { CAMERA_DISPLAY_ORDER, DEFAULT_CAMERA, cameraShortName, inDisplayOrder } from './names';

describe('camera names', () => {
  it('the default camera is one of the six', () => {
    expect(CAMERA_DISPLAY_ORDER).toContain(DEFAULT_CAMERA);
    expect(CAMERA_DISPLAY_ORDER).toHaveLength(6);
    expect(new Set(CAMERA_DISPLAY_ORDER).size).toBe(6);
  });

  it('shortens the six nuScenes channels', () => {
    expect(CAMERA_DISPLAY_ORDER.map(cameraShortName)).toEqual(['BL', 'FL', 'F', 'FR', 'BR', 'B']);
  });

  it('keeps an unknown camera recognisable instead of guessing an abbreviation', () => {
    expect(cameraShortName('CAM_ROOF')).toBe('ROOF');
    expect(cameraShortName('thermal')).toBe('thermal');
    expect(cameraShortName('CAM_')).toBe('CAM_');
    expect(cameraShortName('')).toBe('');
  });
});

describe('inDisplayOrder', () => {
  const name = (s: string) => s;

  it('puts the dataset order into the look-around order', () => {
    const datasetOrder = [
      'CAM_FRONT',
      'CAM_FRONT_LEFT',
      'CAM_FRONT_RIGHT',
      'CAM_BACK',
      'CAM_BACK_LEFT',
      'CAM_BACK_RIGHT',
    ];
    expect(inDisplayOrder(datasetOrder, name)).toEqual([...CAMERA_DISPLAY_ORDER]);
  });

  it('neighbours in the row are neighbouring cameras', () => {
    // Every pair of cameras that shares objects in the sample (measured
    // 2026-11-26) except rear-left + rear, which are the two ends of the row.
    const row = [...CAMERA_DISPLAY_ORDER];
    const adjacent = (a: string, b: string) => Math.abs(row.indexOf(a) - row.indexOf(b)) === 1;
    expect(adjacent('CAM_FRONT_RIGHT', 'CAM_BACK_RIGHT')).toBe(true);
    expect(adjacent('CAM_FRONT', 'CAM_FRONT_RIGHT')).toBe(true);
    expect(adjacent('CAM_FRONT', 'CAM_FRONT_LEFT')).toBe(true);
    expect(adjacent('CAM_BACK', 'CAM_BACK_RIGHT')).toBe(true);
    expect(adjacent('CAM_FRONT_LEFT', 'CAM_BACK_LEFT')).toBe(true);
    expect(adjacent('CAM_BACK', 'CAM_BACK_LEFT')).toBe(false);
  });

  it('keeps unknown names last, in their given order, and does not mutate the input', () => {
    const input = ['zeta', 'CAM_BACK', 'alpha', 'CAM_FRONT'];
    const copy = [...input];
    expect(inDisplayOrder(input, name)).toEqual(['CAM_FRONT', 'CAM_BACK', 'zeta', 'alpha']);
    expect(input).toEqual(copy);
  });

  it('handles a subset and an empty list', () => {
    expect(inDisplayOrder(['CAM_BACK', 'CAM_BACK_LEFT'], name)).toEqual(['CAM_BACK_LEFT', 'CAM_BACK']);
    expect(inDisplayOrder([], name)).toEqual([]);
  });
});
