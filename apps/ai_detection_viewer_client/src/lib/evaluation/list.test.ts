import { describe, expect, it } from 'vitest';
import { isResultVisible, orderResults, resultQueue, type ResultFilter } from './list';
import type { EvalKind, EvalResult } from './types';

const found = (objectId: string, distance: number, cls = 'person'): EvalResult => ({
  kind: 'found',
  objectId,
  class: cls,
  distance,
  predictionId: `pred:f:${objectId}`,
  score: 0.8,
  iou: 0.6,
});
const missed = (objectId: string, distance: number, cls = 'person'): EvalResult => ({
  kind: 'missed',
  objectId,
  class: cls,
  distance,
  nearest: null,
});
const notScored = (objectId: string, distance: number): EvalResult => ({
  kind: 'not-scored',
  objectId,
  class: 'person',
  distance,
  reason: 'low-visibility',
  predictionIds: [],
});
const falseAlarm = (predictionId: string, score: number, cls = 'person'): EvalResult => ({
  kind: 'false-alarm',
  predictionId,
  class: cls,
  score,
  nearest: null,
});

const ALL: ResultFilter = { kinds: new Set(), classes: new Set() };
const idOf = (r: EvalResult) => (r.kind === 'false-alarm' ? r.predictionId : r.objectId);

describe('orderResults', () => {
  it('lists missed, then false alarms, then found, then not scored', () => {
    const ordered = orderResults([
      found('f', 10),
      notScored('n', 10),
      falseAlarm('pred:f:1', 0.5),
      missed('m', 10),
    ]);
    expect(ordered.map((r) => r.kind)).toEqual(['missed', 'false-alarm', 'found', 'not-scored']);
  });

  it('orders labels of one outcome nearest first', () => {
    const ordered = orderResults([missed('far', 35), missed('near', 12), missed('mid', 20)]);
    expect(ordered.map(idOf)).toEqual(['near', 'mid', 'far']);
  });

  it('orders false alarms by score, highest first', () => {
    const ordered = orderResults([falseAlarm('a', 0.3), falseAlarm('b', 0.9), falseAlarm('c', 0.5)]);
    expect(ordered.map(idOf)).toEqual(['b', 'c', 'a']);
  });

  it('keeps the given order on ties and does not mutate the input', () => {
    const input = [missed('first', 20), missed('second', 20)];
    const copy = [...input];
    expect(orderResults(input).map(idOf)).toEqual(['first', 'second']);
    expect(input).toEqual(copy);
  });

  it('returns an empty list for no results', () => {
    expect(orderResults([])).toEqual([]);
  });
});

describe('isResultVisible', () => {
  it('empty sets show everything', () => {
    expect(isResultVisible(missed('m', 10), ALL)).toBe(true);
    expect(isResultVisible(falseAlarm('p', 0.5), ALL)).toBe(true);
  });

  it('an outcome filter hides the other outcomes', () => {
    const onlyMissed: ResultFilter = { kinds: new Set<EvalKind>(['missed']), classes: new Set() };
    expect(isResultVisible(missed('m', 10), onlyMissed)).toBe(true);
    expect(isResultVisible(found('f', 10), onlyMissed)).toBe(false);
  });

  it('a class filter applies to the label class, and to the class a false alarm named', () => {
    const onlyCars: ResultFilter = { kinds: new Set(), classes: new Set(['car']) };
    expect(isResultVisible(missed('m', 10, 'car'), onlyCars)).toBe(true);
    expect(isResultVisible(missed('m', 10, 'person'), onlyCars)).toBe(false);
    expect(isResultVisible(falseAlarm('p', 0.5, 'car'), onlyCars)).toBe(true);
    expect(isResultVisible(falseAlarm('p', 0.5, 'person'), onlyCars)).toBe(false);
  });

  it('both filters must pass', () => {
    const filter: ResultFilter = { kinds: new Set<EvalKind>(['found']), classes: new Set(['car']) };
    expect(isResultVisible(found('f', 10, 'car'), filter)).toBe(true);
    expect(isResultVisible(found('f', 10, 'person'), filter)).toBe(false);
    expect(isResultVisible(missed('m', 10, 'car'), filter)).toBe(false);
  });
});

describe('resultQueue', () => {
  const ordered = orderResults([
    found('f1', 10),
    missed('m1', 10, 'car'),
    falseAlarm('pred:f:7', 0.4),
    notScored('n1', 10),
  ]);

  it('is the selection id of every visible result, in list order', () => {
    // A label is selected by its object id, a false alarm by its prediction id.
    expect(resultQueue(ordered, ALL)).toEqual(['m1', 'pred:f:7', 'f1', 'n1']);
  });

  it('skips results the filters hide', () => {
    expect(resultQueue(ordered, { kinds: new Set<EvalKind>(['missed', 'found']), classes: new Set() })).toEqual(['m1', 'f1']);
    expect(resultQueue(ordered, { kinds: new Set(), classes: new Set(['car']) })).toEqual(['m1']);
  });
});
