import { describe, expect, it } from 'vitest';
import { BoundedCache } from './bounded-cache';

describe('BoundedCache', () => {
  it('keeps what was stored, up to the limit', () => {
    const cache = new BoundedCache<string, number>(3);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    expect(cache.size).toBe(3);
    expect([cache.get('a'), cache.get('b'), cache.get('c')]).toEqual([1, 2, 3]);
  });

  it('drops the entry unused for the longest when a new one exceeds the limit', () => {
    const cache = new BoundedCache<string, number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.set('c', 3)).toEqual(['a']);
    expect(cache.has('a')).toBe(false);
    expect(cache.keys()).toEqual(['b', 'c']);
  });

  it('reading an entry counts as a use, so it outlives one that was only stored', () => {
    const cache = new BoundedCache<string, number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a'); // a is now the most recent
    expect(cache.set('c', 3)).toEqual(['b']);
    expect(cache.keys()).toEqual(['a', 'c']);
  });

  it('has() and peek() do not count as a use', () => {
    const cache = new BoundedCache<string, number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.has('a');
    expect(cache.peek('a')).toBe(1);
    expect(cache.peek('zzz')).toBeUndefined();
    expect(cache.set('c', 3)).toEqual(['a']);
  });

  it('storing an existing key replaces the value and makes it the most recent, without dropping', () => {
    const cache = new BoundedCache<string, number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.set('a', 10)).toEqual([]);
    expect(cache.get('a')).toBe(10);
    expect(cache.size).toBe(2);
    expect(cache.set('c', 3)).toEqual(['b']);
  });

  it('a stored `undefined` value is still an entry', () => {
    const cache = new BoundedCache<string, undefined>(2);
    cache.set('a', undefined);
    expect(cache.has('a')).toBe(true);
    expect(cache.size).toBe(1);
  });

  it('get() of a missing key is undefined and changes nothing', () => {
    const cache = new BoundedCache<string, number>(2);
    cache.set('a', 1);
    expect(cache.get('zzz')).toBeUndefined();
    expect(cache.keys()).toEqual(['a']);
  });

  it('delete() and clear() remove entries', () => {
    const cache = new BoundedCache<string, number>(3);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.delete('a')).toBe(true);
    expect(cache.delete('a')).toBe(false);
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('a limit that is not a positive number still holds the newest entry', () => {
    for (const limit of [0, -5, Number.NaN, 0.4]) {
      const cache = new BoundedCache<string, number>(limit);
      cache.set('a', 1);
      expect(cache.set('b', 2)).toEqual(['a']);
      expect(cache.get('b')).toBe(2);
    }
  });

  it('a fractional limit is rounded down', () => {
    const cache = new BoundedCache<string, number>(2.9);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.set('c', 3)).toEqual(['a']);
  });
});
