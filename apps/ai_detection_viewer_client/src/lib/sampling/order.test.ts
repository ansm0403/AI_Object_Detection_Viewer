import { describe, expect, it } from 'vitest';
import { SAMPLE_SEED, drawOrder, sampleOf } from './order';

const items = Array.from({ length: 50 }, (_, i) => `item-${i}`);

describe('drawOrder', () => {
  it('is a rearrangement: every item once, none added', () => {
    const order = drawOrder(items);
    expect(order).toHaveLength(items.length);
    expect([...order].sort()).toEqual([...items].sort());
  });

  it('gives the same order every time for the same seed (a reopened sample is the same sample)', () => {
    expect(drawOrder(items)).toEqual(drawOrder(items));
    expect(drawOrder(items, 7)).toEqual(drawOrder(items, 7));
    expect(drawOrder(items)).toEqual(drawOrder(items, SAMPLE_SEED));
  });

  it('gives a different order for a different seed', () => {
    expect(drawOrder(items, 1)).not.toEqual(drawOrder(items, 2));
  });

  it('actually shuffles (the input order is not kept)', () => {
    expect(drawOrder(items)).not.toEqual(items);
  });

  it('does not modify its input', () => {
    const copy = [...items];
    drawOrder(items);
    expect(items).toEqual(copy);
  });

  it('handles the empty and the single-item list', () => {
    expect(drawOrder([])).toEqual([]);
    expect(drawOrder(['only'])).toEqual(['only']);
  });

  it('depends on the ORDER of the input — which is why the population list has a fixed order', () => {
    expect(drawOrder([...items].reverse())).not.toEqual(drawOrder(items));
  });

  it('puts every item in every position about equally often (no position is favoured)', () => {
    // 4 items, 2,400 seeds: each item should be first about 600 times.
    const first = new Map<string, number>();
    for (let seed = 1; seed <= 2400; seed += 1) {
      const head = drawOrder(['a', 'b', 'c', 'd'], seed)[0];
      first.set(head, (first.get(head) ?? 0) + 1);
    }
    for (const name of ['a', 'b', 'c', 'd']) {
      expect(first.get(name)).toBeGreaterThan(520);
      expect(first.get(name)).toBeLessThan(680);
    }
  });
});

describe('sampleOf', () => {
  const order = drawOrder(items);

  it('is the first N of the drawn order', () => {
    expect(sampleOf(order, 10)).toEqual(order.slice(0, 10));
  });

  it('a larger sample starts with the smaller one (extending keeps what was judged)', () => {
    expect(sampleOf(order, 20).slice(0, 10)).toEqual(sampleOf(order, 10));
  });

  it('is the whole list when the size is larger than the list', () => {
    expect(sampleOf(order, 500)).toEqual(order);
  });

  it('is empty for a size that is not a positive number', () => {
    expect(sampleOf(order, 0)).toEqual([]);
    expect(sampleOf(order, -3)).toEqual([]);
    expect(sampleOf(order, Number.NaN)).toEqual([]);
  });

  it('rounds a fractional size down', () => {
    expect(sampleOf(order, 3.9)).toHaveLength(3);
  });
});
