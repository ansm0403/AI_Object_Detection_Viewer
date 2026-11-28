import { describe, expect, it } from 'vitest';
import type { BoxValues } from './box';
import { boxChange, boxDistance, describeChange } from './diff';

const LABEL: BoxValues = { translation: [10, 3, 0.8], size: [1.8, 4.5, 1.6], yaw: 0.4 };

describe('boxChange', () => {
  it('is all zeros for the same box', () => {
    const change = boxChange(LABEL, { ...LABEL });
    expect(change.moved).toBe(0);
    expect(change.lift).toBe(0);
    expect(change.sizeDelta).toEqual([0, 0, 0]);
    expect(change.turned).toBe(0);
  });

  it('reports the level distance moved, not the height', () => {
    const change = boxChange(LABEL, { ...LABEL, translation: [10.3, 3.4, 0.8] });
    expect(change.moved).toBeCloseTo(0.5, 12);
    expect(change.lift).toBeCloseTo(0, 12);
  });

  it('reports lift at the bottom: a taller box on the same ground is not lifted', () => {
    // height 1.6 -> 2.0 with the bottom kept: the centre is 0.2 higher.
    const taller: BoxValues = { translation: [10, 3, 1.0], size: [1.8, 4.5, 2.0], yaw: 0.4 };
    const change = boxChange(LABEL, taller);
    expect(change.sizeDelta[2]).toBeCloseTo(0.4, 12);
    expect(change.lift).toBeCloseTo(0, 12);
    expect(boxChange(LABEL, { ...LABEL, translation: [10, 3, 1.1] }).lift).toBeCloseTo(0.3, 12);
  });

  it('reports the turn in degrees, the short way round', () => {
    expect(boxChange(LABEL, { ...LABEL, yaw: 0.4 + Math.PI / 6 }).turned).toBeCloseTo(30, 9);
    expect(boxChange({ ...LABEL, yaw: 3 }, { ...LABEL, yaw: -3 }).turned).toBeCloseTo(
      ((2 * Math.PI - 6) * 180) / Math.PI,
      9,
    );
  });
});

describe('describeChange', () => {
  it('says nothing when nothing changed', () => {
    expect(describeChange(boxChange(LABEL, LABEL))).toEqual([]);
  });

  it('lists what changed, in a fixed order, with units', () => {
    const edited: BoxValues = {
      translation: [10.3, 3.4, 0.8],
      size: [1.8, 4.85, 1.6],
      yaw: 0.4 + (6 * Math.PI) / 180,
    };
    expect(describeChange(boxChange(LABEL, edited))).toEqual([
      'moved 0.50 m',
      'length +0.35 m',
      'turned +6.0°',
    ]);
  });

  it('words lift as raised / lowered and shrinking with a minus', () => {
    const edited: BoxValues = { translation: [10, 3, 0.55], size: [1.6, 4.5, 1.6], yaw: 0.4 };
    expect(describeChange(boxChange(LABEL, edited))).toEqual(['lowered 0.25 m', 'width −0.20 m']);
  });

  it('leaves out differences too small for the text to show', () => {
    const edited: BoxValues = { translation: [10.001, 3, 0.8], size: [1.8, 4.502, 1.6], yaw: 0.4001 };
    expect(describeChange(boxChange(LABEL, edited))).toEqual([]);
  });

  it('never calls an edit a correction', () => {
    const text = describeChange(
      boxChange(LABEL, { translation: [11, 4, 1], size: [2, 5, 2], yaw: 1 }),
    ).join(' ');
    expect(text).not.toMatch(/correct|fix|truth/i);
  });
});

describe('boxDistance', () => {
  it('is zero for the same box', () => {
    expect(boxDistance(LABEL, LABEL)).toEqual({ centre: 0, size: 0, heading: 0 });
  });

  it('measures centre distance in 3D, the largest size difference, and the heading gap', () => {
    const other: BoxValues = {
      translation: [10.3, 3.4, 2.0],
      size: [1.9, 4.2, 1.65],
      yaw: 0.4 - Math.PI / 4,
    };
    const d = boxDistance(LABEL, other);
    expect(d.centre).toBeCloseTo(1.3, 12);
    expect(d.size).toBeCloseTo(0.3, 12);
    expect(d.heading).toBeCloseTo(45, 9);
  });
});
