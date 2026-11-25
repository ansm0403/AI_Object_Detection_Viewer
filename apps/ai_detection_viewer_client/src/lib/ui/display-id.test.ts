import { describe, expect, it } from 'vitest';
import { DISPLAY_ID_LENGTH, displayId } from './display-id';

describe('displayId', () => {
  it('shortens a 32-char nuScenes instance token to its first 6 characters', () => {
    expect(displayId('cb5fdffa966345cdb9c7c186143b7857')).toBe('cb5fdf');
    expect(DISPLAY_ID_LENGTH).toBe(6);
  });

  it('keeps short COCO ids unchanged', () => {
    expect(displayId('1-3')).toBe('1-3');
    expect(displayId('10-104')).toBe('10-104');
  });

  it('keeps ids up to 8 characters in full (shortening would gain nothing)', () => {
    expect(displayId('abcdefgh')).toBe('abcdefgh');
  });

  it('shortens ids longer than 8 characters', () => {
    expect(displayId('abcdefghi')).toBe('abcdef');
  });

  it('returns an empty id unchanged', () => {
    expect(displayId('')).toBe('');
  });
});
