import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sanitizeReviews } from './persisted';
import { NOTE_MAX_LENGTH, createEmptyReviews } from './types';

const VALID = {
  frameId: 'f1',
  objectId: 'a',
  verdict: 'rejected',
  reasons: ['wrong_size'],
  note: 'too tall',
  reviewedAt: '2026-11-25T10:00:00.000Z',
};

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  warn.mockRestore();
});

describe('sanitizeReviews', () => {
  it('returns empty scopes, silently, when nothing was stored', () => {
    expect(sanitizeReviews(undefined)).toEqual(createEmptyReviews());
    expect(sanitizeReviews(null)).toEqual(createEmptyReviews());
    expect(warn).not.toHaveBeenCalled();
  });

  it('keeps a valid record under its scope', () => {
    const result = sanitizeReviews({ nuscenes: { 'f1/a': VALID } });
    expect(result.nuscenes['f1/a']).toEqual(VALID);
    expect(result['nuscenes-practice']).toEqual({});
    expect(warn).not.toHaveBeenCalled();
  });

  it('keeps the two scopes apart', () => {
    const result = sanitizeReviews({
      nuscenes: { 'f1/a': VALID },
      'nuscenes-practice': { 'f1/b': { ...VALID, objectId: 'b', verdict: 'approved' } },
    });
    expect(Object.keys(result.nuscenes)).toEqual(['f1/a']);
    expect(Object.keys(result['nuscenes-practice'])).toEqual(['f1/b']);
  });

  it('(F7.5) keeps verdicts on model boxes in their own scope, keyed by the prediction id', () => {
    const onModelBox = { ...VALID, objectId: 'pred:f1:CAM_FRONT:3', verdict: 'approved' };
    const result = sanitizeReviews({
      nuscenes: { 'f1/a': VALID },
      'nuscenes-false-alarms': { anything: onModelBox },
    });
    expect(Object.keys(result['nuscenes-false-alarms'])).toEqual(['f1/pred:f1:CAM_FRONT:3']);
    expect(result['nuscenes-false-alarms']['f1/pred:f1:CAM_FRONT:3'].verdict).toBe('approved');
    // …and the label scopes are untouched by it.
    expect(Object.keys(result.nuscenes)).toEqual(['f1/a']);
    expect(result['nuscenes-practice']).toEqual({});
  });

  it('(F7.5) data saved before the third scope existed loads with that scope empty', () => {
    const result = sanitizeReviews({ nuscenes: { 'f1/a': VALID }, 'nuscenes-practice': {} });
    expect(result.nuscenes['f1/a']).toEqual(VALID);
    expect(result['nuscenes-false-alarms']).toEqual({});
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns and returns empty scopes for a non-object root', () => {
    for (const bad of ['oops', 42, [VALID], true]) {
      expect(sanitizeReviews(bad)).toEqual(createEmptyReviews());
    }
    expect(warn).toHaveBeenCalledTimes(4);
  });

  it('rebuilds the key from the record ids instead of trusting the stored key', () => {
    const result = sanitizeReviews({ nuscenes: { 'wrong-key': VALID } });
    expect(Object.keys(result.nuscenes)).toEqual(['f1/a']);
  });

  it('drops records with a missing id or an unknown verdict, with one warning', () => {
    const result = sanitizeReviews({
      nuscenes: {
        ok: VALID,
        noFrame: { ...VALID, frameId: '' },
        noObject: { ...VALID, objectId: 7 },
        badVerdict: { ...VALID, objectId: 'b', verdict: 'maybe' },
        notARecord: 'x',
        nothing: null,
      },
    });
    expect(Object.keys(result.nuscenes)).toEqual(['f1/a']);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('5');
  });

  it('repairs soft fields: unknown / duplicate reasons, long note, missing date', () => {
    const result = sanitizeReviews({
      nuscenes: {
        k: {
          ...VALID,
          reasons: ['other', 'made_up', 'wrong_size', 'wrong_size', 3],
          note: 'n'.repeat(NOTE_MAX_LENGTH + 10),
          reviewedAt: 12345,
        },
      },
    });
    const record = result.nuscenes['f1/a'];
    expect(record.reasons).toEqual(['wrong_size', 'other']); // canonical order, once each
    expect(record.note).toHaveLength(NOTE_MAX_LENGTH);
    expect(record.reviewedAt).toBe('');
  });

  it('strips reasons from non-rejected records and the note from approved ones', () => {
    const result = sanitizeReviews({
      nuscenes: {
        a: { ...VALID, objectId: 'a', verdict: 'approved' },
        b: { ...VALID, objectId: 'b', verdict: 'unsure' },
      },
    });
    expect(result.nuscenes['f1/a']).toMatchObject({ reasons: [], note: '' });
    expect(result.nuscenes['f1/b']).toMatchObject({ reasons: [], note: 'too tall' });
  });

  it('ignores unknown scopes and non-object scope values', () => {
    const result = sanitizeReviews({ coco: { k: VALID }, nuscenes: 'broken' });
    expect(result).toEqual(createEmptyReviews());
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
