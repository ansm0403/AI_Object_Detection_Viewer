import { describe, expect, it } from 'vitest';
import { reviewKey } from '@/lib/review';
import type { BoxValues } from './box';
import {
  createEmptyEdits,
  editKey,
  getEdit,
  valuesOfEdit,
  withEdit,
  withoutEdit,
  type EditMap,
} from './records';

const VALUES: BoxValues = { translation: [10, 3, 0.8], size: [1.8, 4.5, 1.6], yaw: 0.4 };
const AT = '2026-11-27T08:00:00.000Z';

describe('edit records', () => {
  it('starts with two empty scopes', () => {
    expect(createEmptyEdits()).toEqual({ nuscenes: {}, 'nuscenes-practice': {} });
  });

  it('keys an edit like a review, so the two line up box by box', () => {
    expect(editKey('frame-1', 'obj-a')).toBe(reviewKey('frame-1', 'obj-a'));
  });

  it('withEdit stores the seven numbers with the ids and the time', () => {
    const edits = withEdit({}, 'f1', 'a', VALUES, AT);
    expect(getEdit(edits, 'f1', 'a')).toEqual({
      frameId: 'f1',
      objectId: 'a',
      translation: [10, 3, 0.8],
      size: [1.8, 4.5, 1.6],
      yaw: 0.4,
      editedAt: AT,
    });
    const stored = getEdit(edits, 'f1', 'a');
    expect(stored && valuesOfEdit(stored)).toEqual(VALUES);
  });

  it('copies the arrays: changing the values later does not change the record', () => {
    const values: BoxValues = { translation: [1, 2, 3], size: [1, 2, 3], yaw: 0 };
    const edits = withEdit({}, 'f1', 'a', values, AT);
    values.translation[0] = 99;
    expect(getEdit(edits, 'f1', 'a')?.translation[0]).toBe(1);
  });

  it('keeps edits per frame for the same object id', () => {
    let edits: EditMap = withEdit({}, 'f1', 'a', VALUES, AT);
    edits = withEdit(edits, 'f2', 'a', { ...VALUES, yaw: 1 }, AT);
    expect(getEdit(edits, 'f1', 'a')?.yaw).toBe(0.4);
    expect(getEdit(edits, 'f2', 'a')?.yaw).toBe(1);
  });

  it('returns the same map when the values are the ones already stored', () => {
    const edits = withEdit({}, 'f1', 'a', VALUES, AT);
    expect(withEdit(edits, 'f1', 'a', { ...VALUES }, '2026-11-28T00:00:00.000Z')).toBe(edits);
  });

  it('replaces the values and the time when they differ', () => {
    const edits = withEdit({}, 'f1', 'a', VALUES, AT);
    const later = withEdit(edits, 'f1', 'a', { ...VALUES, yaw: 0.5 }, '2026-11-28T00:00:00.000Z');
    expect(later).not.toBe(edits);
    expect(getEdit(later, 'f1', 'a')).toMatchObject({ yaw: 0.5, editedAt: '2026-11-28T00:00:00.000Z' });
  });

  it('withoutEdit removes one edit and is a no-op for a box without one', () => {
    let edits: EditMap = withEdit({}, 'f1', 'a', VALUES, AT);
    edits = withEdit(edits, 'f1', 'b', VALUES, AT);
    const removed = withoutEdit(edits, 'f1', 'a');
    expect(getEdit(removed, 'f1', 'a')).toBeUndefined();
    expect(getEdit(removed, 'f1', 'b')).toBeDefined();
    expect(withoutEdit(removed, 'f1', 'a')).toBe(removed);
  });
});
