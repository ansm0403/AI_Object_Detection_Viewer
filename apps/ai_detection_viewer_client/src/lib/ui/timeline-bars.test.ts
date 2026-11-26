import { describe, expect, it } from 'vitest';
import { timelineBars, timelineTicks } from './timeline-bars';

const frames = [
  { id: 'a', boxCount: 10 },
  { id: 'b', boxCount: 40 },
  { id: 'c', boxCount: 0 },
  { id: 'd', boxCount: 20 },
];

describe('timelineBars — box counts and review progress', () => {
  it('scales each bar to the tallest in the scene', () => {
    expect(timelineBars(frames).map((b) => b.height)).toEqual([0.25, 1, 0, 0.5]);
  });

  it('without review data the text is the box count, with no fill', () => {
    const bars = timelineBars(frames);
    expect(bars.map((b) => b.text)).toEqual(['10 boxes', '40 boxes', '0 boxes', '20 boxes']);
    expect(bars.every((b) => b.fill === 0 && b.tone === 'boxes')).toBe(true);
    expect(timelineBars([{ id: 'x', boxCount: 1 }])[0].text).toBe('1 box');
  });

  it('with review data the fill is reviewed / total and the text says so', () => {
    const reviewCounts = new Map([
      ['a', { reviewed: 5, total: 10 }],
      ['b', { reviewed: 40, total: 40 }],
      ['c', { reviewed: 0, total: 0 }],
    ]);
    const bars = timelineBars(frames, { reviewCounts });
    expect(bars.map((b) => b.fill)).toEqual([0.5, 1, 0, 0]);
    expect(bars.map((b) => b.text)).toEqual(['5/10 reviewed', '40/40 reviewed', '0/0 reviewed', '20 boxes']);
  });

  it('a scene with no boxes at all has every bar at 0 (no division by zero)', () => {
    const bars = timelineBars([{ id: 'a', boxCount: 0 }, { id: 'b', boxCount: 0 }]);
    expect(bars.map((b) => b.height)).toEqual([0, 0]);
  });

  it('no frames → no bars', () => {
    expect(timelineBars([])).toEqual([]);
  });

  it('a nonsense review count cannot push the fill outside 0–1', () => {
    const reviewCounts = new Map([['a', { reviewed: 99, total: 10 }]]);
    expect(timelineBars(frames, { reviewCounts })[0].fill).toBe(1);
  });
});

describe('timelineBars — badges (evaluate mode)', () => {
  const badges = new Map([
    ['a', { text: '23 missed', tone: 'alert' as const, value: 23 }],
    ['b', { text: '0 missed', tone: 'good' as const, value: 0 }],
    ['c', { text: 'not evaluated', tone: 'muted' as const }],
    ['d', { text: '46 missed', tone: 'alert' as const, value: 46 }],
  ]);

  it('the bar is the badge value relative to the largest, in the badge tone', () => {
    const bars = timelineBars(frames, { badges });
    expect(bars.map((b) => b.height)).toEqual([0.5, 0, 0, 1]);
    expect(bars.map((b) => b.tone)).toEqual(['alert', 'good', 'muted', 'alert']);
    expect(bars.map((b) => b.text)).toEqual(['23 missed', '0 missed', 'not evaluated', '46 missed']);
  });

  it('badges win over review counts', () => {
    const reviewCounts = new Map([['a', { reviewed: 5, total: 10 }]]);
    expect(timelineBars(frames, { badges, reviewCounts })[0]).toEqual({
      height: 0.5,
      fill: 0,
      tone: 'alert',
      text: '23 missed',
    });
  });

  it('a frame without a badge falls back to its box count, scaled among such frames only', () => {
    const some = new Map([['a', { text: '2 missed', tone: 'alert' as const, value: 2 }]]);
    const bars = timelineBars(frames, { badges: some });
    expect(bars[0]).toMatchObject({ height: 1, tone: 'alert' });
    // b, c, d have no badge: 40, 0, 20 boxes → 1, 0, 0.5
    expect(bars.slice(1).map((b) => [b.height, b.tone])).toEqual([
      [1, 'boxes'],
      [0, 'boxes'],
      [0.5, 'boxes'],
    ]);
  });

  it('when every badge value is 0 the bars are 0', () => {
    const zeros = new Map(frames.map((f) => [f.id, { text: '0 missed', tone: 'good' as const, value: 0 }]));
    expect(timelineBars(frames, { badges: zeros }).map((b) => b.height)).toEqual([0, 0, 0, 0]);
  });

  it('a negative or non-numeric badge value counts as 0', () => {
    const odd = new Map([
      ['a', { text: 'x', tone: 'alert' as const, value: -3 }],
      ['b', { text: 'y', tone: 'alert' as const, value: Number.NaN }],
      ['d', { text: 'z', tone: 'alert' as const, value: 4 }],
    ]);
    expect(timelineBars(frames, { badges: odd }).map((b) => b.height)).toEqual([0, 0, 0, 1]);
  });
});

describe('timelineTicks', () => {
  it('numbers the first frame and every fifth', () => {
    expect(timelineTicks(41, -1)).toEqual([1, 5, 10, 15, 20, 25, 30, 35, 40]);
  });

  it('adds the active frame and drops the regular numbers right next to it', () => {
    expect(timelineTicks(41, 10)).toEqual([1, 5, 11, 15, 20, 25, 30, 35, 40]); // 11 active, 10 dropped
    expect(timelineTicks(41, 8)).toEqual([1, 5, 9, 15, 20, 25, 30, 35, 40]); // 9 active, 10 dropped
    expect(timelineTicks(41, 0)).toEqual([1, 5, 10, 15, 20, 25, 30, 35, 40]); // 1 is active itself
    expect(timelineTicks(41, 1)).toEqual([2, 5, 10, 15, 20, 25, 30, 35, 40]); // 2 active, 1 dropped
  });

  it('an active regular number is listed once', () => {
    expect(timelineTicks(12, 4)).toEqual([1, 5, 10]);
  });

  it('short scenes and odd input', () => {
    expect(timelineTicks(3, 2)).toEqual([1, 3]);
    expect(timelineTicks(1, 0)).toEqual([1]);
    expect(timelineTicks(0, 0)).toEqual([]);
    expect(timelineTicks(-4, 0)).toEqual([]);
    expect(timelineTicks(10, 99)).toEqual([1, 5, 10]);
    expect(timelineTicks(10, 2, 0)).toEqual([1, 3, 5, 10]);
  });
});
