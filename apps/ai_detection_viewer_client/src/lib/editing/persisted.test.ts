import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sanitizeEdits } from './persisted';
import { editKey } from './records';

const good = (over: Record<string, unknown> = {}) => ({
  frameId: 'f1',
  objectId: 'a',
  translation: [10, 3, 0.8],
  size: [1.8, 4.5, 1.6],
  yaw: 0.4,
  editedAt: '2026-11-27T08:00:00.000Z',
  ...over,
});

describe('sanitizeEdits', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  it('returns empty scopes when nothing was stored', () => {
    expect(sanitizeEdits(undefined)).toEqual({ nuscenes: {}, 'nuscenes-practice': {} });
    expect(sanitizeEdits(null)).toEqual({ nuscenes: {}, 'nuscenes-practice': {} });
    expect(warn).not.toHaveBeenCalled();
  });

  it('keeps valid records and rebuilds their keys from their own ids', () => {
    const result = sanitizeEdits({ nuscenes: { 'some-stale-key': good() } });
    expect(Object.keys(result.nuscenes)).toEqual([editKey('f1', 'a')]);
    expect(result.nuscenes[editKey('f1', 'a')]).toEqual(good());
    expect(warn).not.toHaveBeenCalled();
  });

  it('reads a value that has only one of the scopes', () => {
    const result = sanitizeEdits({ 'nuscenes-practice': { k: good() } });
    expect(result.nuscenes).toEqual({});
    expect(Object.keys(result['nuscenes-practice'])).toHaveLength(1);
  });

  it('drops a record whose numbers could put a box in the wrong place', () => {
    const bad = [
      good({ translation: [10, 3] }),
      good({ translation: [10, 3, 'x'] }),
      good({ translation: [10, 3, null] }),
      good({ size: [1.8, 0, 1.6] }),
      good({ size: [1.8, -4.5, 1.6] }),
      good({ yaw: '0.4' }),
      good({ yaw: null }),
      good({ frameId: '' }),
      good({ objectId: 7 }),
      'not an object',
      null,
    ];
    const stored = Object.fromEntries(bad.map((record, i) => [`k${i}`, record]));
    const result = sanitizeEdits({ nuscenes: { ...stored, ok: good({ objectId: 'b' }) } });
    expect(Object.keys(result.nuscenes)).toEqual([editKey('f1', 'b')]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain(`${bad.length} invalid`);
  });

  it('drops NaN and Infinity (what JSON turns into null)', () => {
    const result = sanitizeEdits({
      nuscenes: { a: good({ yaw: Number.NaN }), b: good({ translation: [Infinity, 0, 0] }) },
    });
    expect(result.nuscenes).toEqual({});
  });

  it('blanks a missing date instead of dropping the record', () => {
    const result = sanitizeEdits({ nuscenes: { k: good({ editedAt: 5 }) } });
    expect(result.nuscenes[editKey('f1', 'a')].editedAt).toBe('');
  });

  it('ignores a stored value that is not an object, and a scope that is not one', () => {
    expect(sanitizeEdits('garbage')).toEqual({ nuscenes: {}, 'nuscenes-practice': {} });
    expect(sanitizeEdits({ nuscenes: [good()] }).nuscenes).toEqual({});
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('ignores scopes it does not know (review scopes are not edit scopes)', () => {
    const result = sanitizeEdits({ 'nuscenes-false-alarms': { k: good() }, nuscenes: { k: good() } });
    expect(Object.keys(result)).toEqual(['nuscenes', 'nuscenes-practice']);
  });
});
