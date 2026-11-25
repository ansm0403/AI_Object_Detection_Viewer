import { describe, expect, it } from 'vitest';
import type { ResultFilter } from './list';
import { evaluateFrame } from './match';
import { CONTEXT_COLOR, NOT_EVALUATED_COLOR, OUTCOME_COLOR } from './outcomes';
import { buildOverlay, unionBox } from './overlay';
import { box, makeFrame, makePrediction } from './test-helpers';
import type { EvalKind, EvaluationRules, Prediction2D } from './types';

const RULES: EvaluationRules = { minScore: 0.25, iouThreshold: 0.3 };
const ALL: ResultFilter = { kinds: new Set(), classes: new Set() };
const only = (...kinds: EvalKind[]): ResultFilter => ({ kinds: new Set(kinds), classes: new Set() });

/**
 * One frame with every outcome:
 *  - `found`    person at x=0, found by prediction 0;
 *  - `missed`   person at x=300, with a low-score prediction (1) on it;
 *  - `hidden`   person at x=600, visibility 0–40% → not scored, prediction 2 on it;
 *  - prediction 3 at x=900 on nothing → false alarm;
 *  - `rack`     a class the model cannot name, in the camera image.
 */
const frame = makeFrame([
  { id: 'found', bbox: box(0, 0, 100, 200) },
  { id: 'missed', bbox: box(300, 0, 100, 200) },
  { id: 'hidden', bbox: box(600, 0, 100, 200), visibility: 'v0-40' },
  { id: 'rack', class: 'static_object.bicycle_rack', bbox: box(1200, 0, 100, 100) },
]);
const predictions: Prediction2D[] = [
  makePrediction(0, 'person', 0.9, box(5, 5, 100, 200)),
  makePrediction(1, 'person', 0.1, box(305, 5, 100, 200)),
  makePrediction(2, 'person', 0.8, box(600, 0, 100, 200)),
  makePrediction(3, 'person', 0.5, box(900, 0, 50, 50)),
];
const evaluation = evaluateFrame(frame, predictions, RULES);
const overlay = (selectedId: string | null, filter: ResultFilter = ALL) =>
  buildOverlay(frame, predictions, evaluation, { selectedId, filter });
const rect = (o: ReturnType<typeof overlay>, key: string) => o.rects.find((r) => r.key === key);

describe('unionBox', () => {
  it('is the smallest rectangle around all boxes', () => {
    expect(unionBox([box(10, 20, 30, 40), box(0, 50, 20, 100)])).toEqual(box(0, 20, 40, 130));
  });
  it('is null for no boxes', () => {
    expect(unionBox([])).toBeNull();
  });
});

describe('buildOverlay — nothing selected', () => {
  const o = overlay(null);

  it('the fixture has one of each outcome', () => {
    expect(evaluation.counts).toEqual({ found: 1, missed: 1, falseAlarm: 1, notScored: 1 });
  });

  it('draws labels dashed and model boxes solid, coloured by outcome', () => {
    expect(rect(o, 'label:found')).toMatchObject({ dashed: true, color: OUTCOME_COLOR.found });
    expect(rect(o, 'model:pred:frame-1:0')).toMatchObject({ dashed: false, color: OUTCOME_COLOR.found });
    expect(rect(o, 'label:missed')).toMatchObject({ dashed: true, color: OUTCOME_COLOR.missed });
    expect(rect(o, 'model:pred:frame-1:3')).toMatchObject({
      dashed: false,
      color: OUTCOME_COLOR['false-alarm'],
    });
    expect(rect(o, 'label:hidden')).toMatchObject({ dashed: true, color: OUTCOME_COLOR['not-scored'] });
    expect(rect(o, 'model:pred:frame-1:2')).toMatchObject({
      dashed: false,
      color: OUTCOME_COLOR['not-scored'],
    });
  });

  it('does not draw a model box below the minimum score, nor a label that is not evaluated', () => {
    expect(rect(o, 'model:pred:frame-1:1')).toBeUndefined();
    expect(rect(o, 'label:rack')).toBeUndefined();
  });

  it('everything is at normal strength, without captions, and there is no focus', () => {
    expect(o.rects.every((r) => r.emphasis === 'normal' && r.caption === undefined)).toBe(true);
    expect(o.focus).toBeNull();
  });

  it('a click selects the label for label-side boxes and the prediction for a false alarm', () => {
    expect(rect(o, 'label:found')?.selectId).toBe('found');
    // Both boxes of a matched pair select the same thing: the label.
    expect(rect(o, 'model:pred:frame-1:0')?.selectId).toBe('found');
    expect(rect(o, 'model:pred:frame-1:2')?.selectId).toBe('hidden');
    expect(rect(o, 'model:pred:frame-1:3')?.selectId).toBe('pred:frame-1:3');
  });

  it('paints large boxes first so small ones end up on top', () => {
    const areas = o.rects.map((r) => r.bbox.width * r.bbox.height);
    expect(areas).toEqual([...areas].sort((a, b) => b - a));
  });
});

describe('buildOverlay — a result selected', () => {
  it('found: both boxes emphasised and captioned, the rest dimmed, focus around the pair', () => {
    const o = overlay('found');
    expect(rect(o, 'label:found')).toMatchObject({ emphasis: 'selected', caption: 'label · person' });
    expect(rect(o, 'model:pred:frame-1:0')).toMatchObject({
      emphasis: 'selected',
      caption: 'model · person 0.90',
    });
    expect(rect(o, 'label:missed')?.emphasis).toBe('dim');
    expect(rect(o, 'model:pred:frame-1:3')?.emphasis).toBe('dim');
    expect(o.focus).toEqual(box(0, 0, 105, 205));
  });

  it('selecting by the matched prediction id resolves to the same pair', () => {
    expect(overlay('pred:frame-1:0').focus).toEqual(box(0, 0, 105, 205));
  });

  it('missed: adds the closest model box as context even though it is below the minimum score', () => {
    const o = overlay('missed');
    expect(rect(o, 'label:missed')).toMatchObject({ emphasis: 'selected', caption: 'label · person' });
    const context = rect(o, 'model:pred:frame-1:1');
    expect(context).toMatchObject({
      emphasis: 'normal',
      dashed: false,
      color: CONTEXT_COLOR,
      caption: 'model · person 0.10',
    });
    // It is not a result, so clicking it selects nothing.
    expect(context?.selectId).toBeUndefined();
    expect(o.focus).toEqual(box(300, 0, 105, 205));
  });

  it('false alarm: emphasised alone when no label is under it', () => {
    const o = overlay('pred:frame-1:3');
    expect(rect(o, 'model:pred:frame-1:3')).toMatchObject({
      emphasis: 'selected',
      caption: 'model · person 0.50',
    });
    expect(o.focus).toEqual(box(900, 0, 50, 50));
  });

  it('not scored: the label and the model boxes set aside with it', () => {
    const o = overlay('hidden');
    expect(rect(o, 'label:hidden')?.emphasis).toBe('selected');
    expect(rect(o, 'model:pred:frame-1:2')?.emphasis).toBe('selected');
  });

  it('a selected box that is not evaluated is still shown, in grey, and focused', () => {
    const o = overlay('rack');
    expect(rect(o, 'label:rack')).toMatchObject({
      emphasis: 'selected',
      dashed: true,
      color: NOT_EVALUATED_COLOR,
      caption: 'label · static_object.bicycle_rack · not evaluated',
    });
    expect(rect(o, 'label:found')?.emphasis).toBe('dim');
    expect(o.focus).toEqual(box(1200, 0, 100, 100));
  });

  it('an id that is nothing in this frame (another frame, a box outside the camera): no emphasis, no focus', () => {
    const o = overlay('pred:other-frame:0');
    expect(o.rects.every((r) => r.emphasis === 'normal')).toBe(true);
    expect(o.focus).toBeNull();
  });
});

describe('buildOverlay — companion of a false alarm', () => {
  // A person label, found by prediction 0; prediction 1 is a second, weaker box
  // on the same person → false alarm whose closest label is that person.
  const f = makeFrame([{ id: 'p', bbox: box(0, 0, 100, 200) }]);
  const preds = [
    makePrediction(0, 'person', 0.9, box(0, 0, 100, 200)),
    makePrediction(1, 'person', 0.5, box(10, 0, 100, 200)),
  ];
  const ev = evaluateFrame(f, preds, RULES);

  it('keeps the label under it readable (not dimmed) and captions it; focus covers both', () => {
    const o = buildOverlay(f, preds, ev, { selectedId: 'pred:frame-1:1', filter: ALL });
    const labelRect = o.rects.find((r) => r.key === 'label:p');
    // The label is a visible "found" result: it keeps its outcome colour.
    expect(labelRect).toMatchObject({
      emphasis: 'normal',
      color: OUTCOME_COLOR.found,
      caption: 'label · person',
      selectId: 'p',
    });
    expect(o.rects.find((r) => r.key === 'model:pred:frame-1:0')?.emphasis).toBe('dim');
    expect(o.focus).toEqual(box(0, 0, 110, 200));
  });

  it('adds the label as grey context when its own result is filtered out', () => {
    const o = buildOverlay(f, preds, ev, { selectedId: 'pred:frame-1:1', filter: only('false-alarm') });
    expect(o.rects.map((r) => r.key).sort()).toEqual(['label:p', 'model:pred:frame-1:1']);
    expect(o.rects.find((r) => r.key === 'label:p')).toMatchObject({
      color: CONTEXT_COLOR,
      dashed: true,
      emphasis: 'normal',
    });
  });
});

describe('buildOverlay — filters', () => {
  it('an outcome filter removes the other outcomes', () => {
    const o = overlay(null, only('missed'));
    expect(o.rects.map((r) => r.key)).toEqual(['label:missed']);
  });

  it('a class filter removes results of other classes (a false alarm by the class it named)', () => {
    const o = overlay(null, { kinds: new Set(), classes: new Set(['car']) });
    expect(o.rects).toEqual([]);
  });

  it('a selected result that the filters hide is not drawn and gives no focus', () => {
    const o = overlay('found', only('missed'));
    expect(rect(o, 'label:found')).toBeUndefined();
    expect(rect(o, 'label:missed')?.emphasis).toBe('normal');
    expect(o.focus).toBeNull();
  });
});

describe('buildOverlay — bad geometry', () => {
  it('skips a box with no area or a non-finite coordinate instead of throwing', () => {
    const f = makeFrame([{ id: 'flat', bbox: box(0, 0, 0, 50) }]);
    const preds = [makePrediction(0, 'person', 0.9, box(Number.NaN, 0, 10, 10))];
    const ev = evaluateFrame(f, preds, RULES);
    const o = buildOverlay(f, preds, ev, { selectedId: 'flat', filter: ALL });
    expect(o.rects).toEqual([]);
    expect(o.focus).toBeNull();
  });
});
