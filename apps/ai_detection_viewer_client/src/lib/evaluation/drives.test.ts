import { describe, expect, it } from 'vitest';
import { summarizeDrives } from './drives';
import type { SceneScore } from './scenes';

const score = (
  scene: string,
  drive: string | null,
  date: string,
  options: { night?: boolean; found?: number; missed?: number; objects?: string[] } = {},
): SceneScore => {
  const found = options.found ?? 10;
  const missed = options.missed ?? 10;
  const objects = options.objects ?? [`${scene}-a`, `${scene}-b`];
  return {
    scene,
    night: options.night ?? false,
    drive,
    driveDate: date,
    driveLocation: `place of ${drive ?? scene}`,
    counts: { found, missed, falseAlarm: 4, notScored: 2 },
    precision: found / (found + 4),
    recall: found / (found + missed),
    photos: 60,
    frames: 10,
    byDistance: [{ from: 0, to: 10, found, total: found + missed }],
    scoredObjects: objects.length,
    scoredObjectIds: new Set(objects),
  };
};

describe('summarizeDrives', () => {
  it('gives one row per drive and adds up the scenes cut from the same drive', () => {
    const rows = summarizeDrives([
      score('s1', 'drive-A', '2018-08-01', { found: 10, missed: 10 }),
      score('s2', 'drive-B', '2018-11-21', { night: true, found: 5, missed: 15 }),
      score('s3', 'drive-B', '2018-11-21', { night: true, found: 5, missed: 5 }),
    ]);
    expect(rows.map((row) => [row.drive, row.scenes])).toEqual([
      ['drive-A', ['s1']],
      ['drive-B', ['s2', 's3']],
    ]);
    expect(rows[1].counts).toEqual({ found: 10, missed: 20, falseAlarm: 8, notScored: 4 });
    expect(rows[1].recall).toBeCloseTo(10 / 30, 10);
    expect(rows[1].precision).toBeCloseTo(10 / 18, 10);
    expect([rows[1].photos, rows[1].frames]).toEqual([120, 20]);
    expect(rows[1].byDistance).toEqual([{ from: 0, to: 10, found: 10, total: 30 }]);
  });

  it('recall of a drive comes from the summed counts, not from averaging its scenes', () => {
    const [row] = summarizeDrives([
      score('s1', 'd', '2018-01-01', { found: 1, missed: 0 }), // 100 %
      score('s2', 'd', '2018-01-01', { found: 0, missed: 99 }), // 0 %
    ]);
    expect(row.recall).toBeCloseTo(0.01, 10);
  });

  it('counts DISTINCT objects over the drive (an object in two scenes counts once)', () => {
    const [row] = summarizeDrives([
      score('s1', 'd', '2018-01-01', { objects: ['a', 'b'] }),
      score('s2', 'd', '2018-01-01', { objects: ['b', 'c'] }),
    ]);
    expect(row.scoredObjects).toBe(3);
  });

  it('orders the rows by date, oldest first; rows without a date go last', () => {
    const rows = summarizeDrives([
      score('s1', 'late', '2018-10-08'),
      score('s2', 'undated', ''),
      score('s3', 'early', '2018-07-24'),
    ]);
    expect(rows.map((row) => row.drive)).toEqual(['early', 'late', 'undated']);
  });

  it('carries the date and place of the drive', () => {
    const [row] = summarizeDrives([score('s1', 'drive-A', '2018-08-01')]);
    expect(row).toMatchObject({ date: '2018-08-01', location: 'place of drive-A' });
  });

  it('a scene whose drive is unknown is its own row', () => {
    const rows = summarizeDrives([score('s1', null, ''), score('s2', null, '')]);
    expect(rows.map((row) => [row.drive, row.scenes])).toEqual([
      [null, ['s1']],
      [null, ['s2']],
    ]);
  });

  it('is a night drive only when all its scenes are night scenes', () => {
    const rows = summarizeDrives([
      score('s1', 'mixed', '2018-01-01', { night: true }),
      score('s2', 'mixed', '2018-01-01', { night: false }),
      score('s3', 'night', '2018-01-02', { night: true }),
    ]);
    expect(rows.map((row) => row.night)).toEqual([false, true]);
  });

  it('no scores → no rows', () => {
    expect(summarizeDrives([])).toEqual([]);
  });
});
