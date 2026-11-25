import { describe, expect, it } from 'vitest';
import { evaluateFrame } from './match';
import { precisionOf, ratio, recallOf, summarize } from './metrics';
import { box, makeFrame, makePrediction } from './test-helpers';
import type { EvaluationRules } from './types';

const RULES: EvaluationRules = { minScore: 0.25, iouThreshold: 0.3 };
const at = (i: number) => box(i * 200, 0, 100, 100);

describe('ratio / precision / recall', () => {
  it('is null — not 0 — when there is nothing to divide by', () => {
    expect(ratio(0, 0)).toBeNull();
    expect(precisionOf({ found: 0, missed: 3, falseAlarm: 0, notScored: 0 })).toBeNull();
    expect(recallOf({ found: 0, missed: 0, falseAlarm: 2, notScored: 5 })).toBeNull();
  });

  it('precision = found / (found + false alarms)', () => {
    expect(precisionOf({ found: 3, missed: 9, falseAlarm: 1, notScored: 0 })).toBe(0.75);
  });

  it('recall = found / (found + missed); labels that are not scored do not count', () => {
    expect(recallOf({ found: 1, missed: 3, falseAlarm: 7, notScored: 100 })).toBe(0.25);
  });

  it('0 is a real value when something was there and nothing was found', () => {
    expect(recallOf({ found: 0, missed: 4, falseAlarm: 0, notScored: 0 })).toBe(0);
  });
});

describe('summarize', () => {
  it('returns empty totals for no frames', () => {
    expect(summarize([])).toEqual({
      found: 0,
      missed: 0,
      falseAlarm: 0,
      notScored: 0,
      precision: null,
      recall: null,
      byDistance: [],
      byClass: [],
    });
  });

  it('adds up frames', () => {
    const frame1 = makeFrame([{ id: 'a', bbox: at(0) }, { id: 'b', bbox: at(1) }], 'f1');
    const frame2 = makeFrame([{ id: 'a', bbox: at(0) }], 'f2');
    const summary = summarize([
      evaluateFrame(frame1, [makePrediction(0, 'person', 0.9, at(0), 'f1')], RULES),
      evaluateFrame(
        frame2,
        [makePrediction(0, 'person', 0.9, at(0), 'f2'), makePrediction(1, 'car', 0.9, at(3), 'f2')],
        RULES,
      ),
    ]);
    expect(summary).toMatchObject({ found: 2, missed: 1, falseAlarm: 1, notScored: 0 });
    expect(summary.precision).toBeCloseTo(2 / 3, 10);
    expect(summary.recall).toBeCloseTo(2 / 3, 10);
  });

  it('splits recall into 10 m bands; a label at exactly 20 m is in 20–30', () => {
    const frame = makeFrame([
      { id: 'a', bbox: at(0), distance: 9.99 },
      { id: 'b', bbox: at(1), distance: 10 },
      { id: 'c', bbox: at(2), distance: 19.99 },
      { id: 'd', bbox: at(3), distance: 20 },
      { id: 'e', bbox: at(4), distance: 47 },
    ]);
    const predictions = [
      makePrediction(0, 'person', 0.9, at(1)),
      makePrediction(1, 'person', 0.9, at(3)),
    ];
    expect(summarize([evaluateFrame(frame, predictions, RULES)]).byDistance).toEqual([
      { from: 0, to: 10, found: 0, total: 1 },
      { from: 10, to: 20, found: 1, total: 2 },
      { from: 20, to: 30, found: 1, total: 1 },
      // no 30–40 band: bands without labels are left out
      { from: 40, to: 50, found: 0, total: 1 },
    ]);
  });

  it('lists classes by number of labels, then by name', () => {
    const frame = makeFrame([
      { id: 'c1', class: 'car', bbox: at(0) },
      { id: 'p1', bbox: at(1) },
      { id: 'p2', bbox: at(2) },
      { id: 'm1', class: 'motorcycle', bbox: at(3) },
    ]);
    const predictions = [makePrediction(0, 'person', 0.9, at(1)), makePrediction(1, 'car', 0.9, at(0))];
    expect(summarize([evaluateFrame(frame, predictions, RULES)]).byClass).toEqual([
      { class: 'person', found: 1, total: 2 },
      { class: 'car', found: 1, total: 1 },
      { class: 'motorcycle', found: 0, total: 1 },
    ]);
  });

  it('keeps labels that are not scored, and false alarms, out of the breakdowns', () => {
    const frame = makeFrame([
      { id: 'hidden', bbox: at(0), visibility: 'v0-40', distance: 35 },
      { id: 'a', bbox: at(1), distance: 12 },
    ]);
    const summary = summarize([
      evaluateFrame(frame, [makePrediction(0, 'truck', 0.9, at(4))], RULES),
    ]);
    expect(summary).toMatchObject({ found: 0, missed: 1, falseAlarm: 1, notScored: 1 });
    expect(summary.byDistance).toEqual([{ from: 10, to: 20, found: 0, total: 1 }]);
    expect(summary.byClass).toEqual([{ class: 'person', found: 0, total: 1 }]);
    expect(summary.precision).toBe(0);
    expect(summary.recall).toBe(0);
  });

  it('the bands and the classes each add up to the totals', () => {
    const frame = makeFrame([
      { id: 'a', bbox: at(0), distance: 5 },
      { id: 'b', class: 'car', bbox: at(1), distance: 25 },
      { id: 'c', bbox: at(2), distance: 31 },
    ]);
    const summary = summarize([evaluateFrame(frame, [makePrediction(0, 'car', 0.9, at(1))], RULES)]);
    const sum = (rows: { found: number; total: number }[]) =>
      rows.reduce((acc, r) => ({ found: acc.found + r.found, total: acc.total + r.total }), {
        found: 0,
        total: 0,
      });
    expect(sum(summary.byDistance)).toEqual({ found: summary.found, total: summary.found + summary.missed });
    expect(sum(summary.byClass)).toEqual({ found: summary.found, total: summary.found + summary.missed });
  });
});
