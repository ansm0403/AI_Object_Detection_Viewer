import { describe, expect, it } from 'vitest';
import { iou } from './iou';
import { countResults, evaluateFrame, findResult, selectionIdOf } from './match';
import { box, makeFrame, makePrediction } from './test-helpers';
import type { EvalResult, EvaluationRules } from './types';

const RULES: EvaluationRules = { minScore: 0.25, iouThreshold: 0.3 };
// Three well separated places on the image.
const A = box(0, 0, 100, 100);
const B = box(300, 0, 100, 100);
const C = box(600, 0, 100, 100);
const kinds = (results: EvalResult[]) => results.map((r) => r.kind);

describe('evaluateFrame — the basic outcomes', () => {
  it('found: a prediction of the right class on the label', () => {
    const frame = makeFrame([{ id: 'a', bbox: A, distance: 12 }]);
    const { results, counts } = evaluateFrame(frame, [makePrediction(0, 'person', 0.9, A)], RULES);
    expect(results).toEqual([
      {
        kind: 'found',
        objectId: 'a',
        class: 'person',
        distance: 12,
        predictionId: 'pred:frame-1:CAM_TEST:0',
        score: 0.9,
        iou: 1,
      },
    ]);
    expect(counts).toEqual({ found: 1, missed: 0, falseAlarm: 0, notScored: 0 });
  });

  it('missed: a label nothing was predicted on', () => {
    const frame = makeFrame([{ id: 'a', bbox: A }]);
    const { results, counts } = evaluateFrame(frame, [], RULES);
    expect(results).toEqual([
      { kind: 'missed', objectId: 'a', class: 'person', distance: 15, nearest: null },
    ]);
    expect(counts.missed).toBe(1);
  });

  it('false alarm: a prediction where there is no label', () => {
    const frame = makeFrame([]);
    const { results, counts } = evaluateFrame(frame, [makePrediction(0, 'car', 0.6, B)], RULES);
    expect(results).toEqual([
      { kind: 'false-alarm', predictionId: 'pred:frame-1:CAM_TEST:0', class: 'car', score: 0.6, nearest: null },
    ]);
    expect(counts.falseAlarm).toBe(1);
  });

  it('an empty frame with no predictions has no results', () => {
    const evaluation = evaluateFrame(makeFrame([]), [], RULES);
    expect(evaluation.results).toEqual([]);
    expect(evaluation.counts).toEqual({ found: 0, missed: 0, falseAlarm: 0, notScored: 0 });
    expect(evaluation.notEvaluated).toBe(0);
    expect(evaluation.frameId).toBe('frame-1');
  });
});

describe('evaluateFrame — matching rules', () => {
  it('a label is matched once: the higher score wins, the other box is a false alarm', () => {
    const frame = makeFrame([{ id: 'a', bbox: A }]);
    const { results } = evaluateFrame(
      frame,
      [makePrediction(0, 'person', 0.5, A), makePrediction(1, 'person', 0.8, A)],
      RULES,
    );
    expect(results[0]).toMatchObject({ kind: 'found', predictionId: 'pred:frame-1:CAM_TEST:1', score: 0.8 });
    expect(results[1]).toMatchObject({
      kind: 'false-alarm',
      predictionId: 'pred:frame-1:CAM_TEST:0',
      nearest: { objectId: 'a', class: 'person', iou: 1, relation: 'matched-elsewhere' },
    });
  });

  it('a prediction takes the label it overlaps MOST', () => {
    // The prediction covers `near` exactly and `far` only partly.
    const frame = makeFrame([
      { id: 'far', bbox: box(40, 0, 100, 100) },
      { id: 'near', bbox: A },
    ]);
    const { results } = evaluateFrame(frame, [makePrediction(0, 'person', 0.9, A)], RULES);
    expect(results.find((r) => r.kind === 'found')).toMatchObject({ objectId: 'near' });
    expect(results.find((r) => r.kind === 'missed')).toMatchObject({
      objectId: 'far',
      nearest: { predictionId: 'pred:frame-1:CAM_TEST:0', reason: 'matched-elsewhere' },
    });
  });

  it('the higher-scoring prediction chooses first, even when listed last', () => {
    // Both predictions prefer label `a`; the confident one gets it, the other
    // falls back to `b`, which it also overlaps enough.
    const frame = makeFrame([
      { id: 'a', bbox: A },
      { id: 'b', bbox: box(50, 0, 100, 100) },
    ]);
    const low = makePrediction(0, 'person', 0.4, box(10, 0, 100, 100));
    const high = makePrediction(1, 'person', 0.9, A);
    for (const order of [[low, high], [high, low]]) {
      const { results, counts } = evaluateFrame(frame, order, RULES);
      expect(results[0]).toMatchObject({ kind: 'found', objectId: 'a', predictionId: high.id });
      expect(results[1]).toMatchObject({ kind: 'found', objectId: 'b', predictionId: low.id });
      expect(counts).toEqual({ found: 2, missed: 0, falseAlarm: 0, notScored: 0 });
    }
  });

  it('only matches the same class: a wrong class is one false alarm AND one miss', () => {
    const frame = makeFrame([{ id: 'm', class: 'motorcycle', bbox: A }]);
    const { results, counts } = evaluateFrame(frame, [makePrediction(0, 'person', 0.9, A)], RULES);
    expect(counts).toEqual({ found: 0, missed: 1, falseAlarm: 1, notScored: 0 });
    expect(results[0]).toMatchObject({
      kind: 'missed',
      objectId: 'm',
      nearest: { class: 'person', score: 0.9, iou: 1, reason: 'wrong-class' },
    });
    expect(results[1]).toMatchObject({
      kind: 'false-alarm',
      class: 'person',
      nearest: { objectId: 'm', class: 'motorcycle', relation: 'other-class' },
    });
  });

  it('an overlap of exactly the threshold counts; just under does not', () => {
    const shifted = box(50, 0, 100, 100);
    const exact = iou(A, shifted); // 1/3
    const frame = makeFrame([{ id: 'a', bbox: A }]);
    const prediction = [makePrediction(0, 'person', 0.9, shifted)];

    const at = evaluateFrame(frame, prediction, { minScore: 0.25, iouThreshold: exact });
    expect(kinds(at.results)).toEqual(['found']);

    const above = evaluateFrame(frame, prediction, { minScore: 0.25, iouThreshold: exact + 1e-9 });
    expect(kinds(above.results)).toEqual(['missed', 'false-alarm']);
    expect(above.results[0]).toMatchObject({ nearest: { reason: 'low-overlap' } });
    expect(above.results[1]).toMatchObject({ nearest: { relation: 'low-overlap' } });
  });
});

describe('evaluateFrame — minimum score', () => {
  const frame = makeFrame([{ id: 'a', bbox: A }]);

  it('a prediction under the minimum is as if it had not been made', () => {
    const { results, counts } = evaluateFrame(frame, [makePrediction(0, 'person', 0.2, A)], RULES);
    expect(counts).toEqual({ found: 0, missed: 1, falseAlarm: 0, notScored: 0 });
    // …but the miss still says the model had seen something there.
    expect(results[0]).toMatchObject({
      kind: 'missed',
      nearest: { score: 0.2, reason: 'below-min-score' },
    });
  });

  it('a score of exactly the minimum counts', () => {
    const { counts } = evaluateFrame(frame, [makePrediction(0, 'person', 0.25, A)], RULES);
    expect(counts.found).toBe(1);
  });

  it('lowering the minimum turns the miss into a find', () => {
    const prediction = [makePrediction(0, 'person', 0.2, A)];
    expect(evaluateFrame(frame, prediction, { ...RULES, minScore: 0.25 }).counts.found).toBe(0);
    expect(evaluateFrame(frame, prediction, { ...RULES, minScore: 0.1 }).counts.found).toBe(1);
  });
});

describe('evaluateFrame — labels that are not scored', () => {
  it('a barely visible label is neither missed nor found', () => {
    const frame = makeFrame([{ id: 'hidden', bbox: A, visibility: 'v0-40', distance: 22 }]);
    const { results, counts } = evaluateFrame(frame, [], RULES);
    expect(results).toEqual([
      {
        kind: 'not-scored',
        objectId: 'hidden',
        class: 'person',
        distance: 22,
        reason: 'low-visibility',
        predictionIds: [],
      },
    ]);
    expect(counts).toEqual({ found: 0, missed: 0, falseAlarm: 0, notScored: 1 });
  });

  it('a prediction on it is neither a find nor a false alarm', () => {
    const frame = makeFrame([{ id: 'hidden', bbox: A, visibility: 'v0-40' }]);
    const { results, counts } = evaluateFrame(frame, [makePrediction(0, 'person', 0.9, A)], RULES);
    expect(counts).toEqual({ found: 0, missed: 0, falseAlarm: 0, notScored: 1 });
    expect(results[0]).toMatchObject({ kind: 'not-scored', predictionIds: ['pred:frame-1:CAM_TEST:0'] });
  });

  it('a prediction of ANOTHER class on it is still a false alarm', () => {
    const frame = makeFrame([{ id: 'hidden', class: 'motorcycle', bbox: A, visibility: 'v0-40' }]);
    const { counts, results } = evaluateFrame(frame, [makePrediction(0, 'person', 0.9, A)], RULES);
    expect(counts).toEqual({ found: 0, missed: 0, falseAlarm: 1, notScored: 1 });
    expect(results[1]).toMatchObject({ nearest: { objectId: 'hidden', relation: 'other-class' } });
  });

  it('a scored label is preferred over an unscored one', () => {
    const frame = makeFrame([
      { id: 'hidden', bbox: A, visibility: 'v0-40' },
      { id: 'seen', bbox: box(20, 0, 100, 100), visibility: 'v80-100' },
    ]);
    const { counts } = evaluateFrame(frame, [makePrediction(0, 'person', 0.9, A)], RULES);
    expect(counts).toEqual({ found: 1, missed: 0, falseAlarm: 0, notScored: 1 });
  });

  it('other visibility levels, and labels without the value, are scored', () => {
    const frame = makeFrame([
      { id: 'a', bbox: A, visibility: 'v40-60' },
      { id: 'b', bbox: B, visibility: 'v60-80' },
      { id: 'c', bbox: C }, // data prepped before F4: no visibility
    ]);
    expect(evaluateFrame(frame, [], RULES).counts.missed).toBe(3);
  });
});

describe('evaluateFrame — what takes part', () => {
  it('ignores labels of a class the model cannot name, and counts them as not evaluated', () => {
    const frame = makeFrame([
      { id: 'rack', class: 'static_object.bicycle_rack', bbox: A },
      { id: 'a', bbox: B },
    ]);
    const evaluation = evaluateFrame(frame, [], RULES);
    expect(evaluation.results.map((r) => (r.kind === 'false-alarm' ? null : r.objectId))).toEqual(['a']);
    expect(evaluation.notEvaluated).toBe(1);
  });

  it('counts 3D boxes outside the camera image as not evaluated', () => {
    const frame = makeFrame([
      { id: 'behind', inCamera: false },
      { id: 'beside', inCamera: false },
      { id: 'a', bbox: A },
    ]);
    const evaluation = evaluateFrame(frame, [makePrediction(0, 'person', 0.9, A)], RULES);
    expect(evaluation.counts.found).toBe(1);
    expect(evaluation.notEvaluated).toBe(2);
  });

  it('ignores predictions of a class that is not evaluated', () => {
    const frame = makeFrame([{ id: 'a', bbox: A }]);
    const { results, counts } = evaluateFrame(
      frame,
      [makePrediction(0, 'traffic light', 0.9, C), makePrediction(1, 'handbag', 0.9, A)],
      RULES,
    );
    expect(counts).toEqual({ found: 0, missed: 1, falseAlarm: 0, notScored: 0 });
    // The closest box is still reported as a fact about the miss.
    expect(results[0]).toMatchObject({ nearest: { class: 'handbag', reason: 'wrong-class' } });
  });

  it('does not mention a "nearest" box that barely overlaps', () => {
    const frame = makeFrame([{ id: 'a', bbox: A }]);
    // 5% of each box overlaps → IoU ≈ 0.026.
    const { results } = evaluateFrame(frame, [makePrediction(0, 'person', 0.9, box(95, 0, 100, 100))], RULES);
    expect(results[0]).toMatchObject({ kind: 'missed', nearest: null });
    expect(results[1]).toMatchObject({ kind: 'false-alarm', nearest: null });
  });
});

describe('evaluateFrame — shape of the result', () => {
  const frame = makeFrame([
    { id: 'a', bbox: A },
    { id: 'b', bbox: B, visibility: 'v0-40' },
    { id: 'c', bbox: C },
  ]);
  const predictions = [
    makePrediction(0, 'person', 0.9, C),
    makePrediction(1, 'car', 0.3, box(0, 400, 50, 50)),
    makePrediction(2, 'car', 0.7, box(300, 400, 50, 50)),
  ];
  const evaluation = evaluateFrame(frame, predictions, RULES);

  it('lists label results in the frame order, then false alarms by score', () => {
    expect(evaluation.results.map((r) => [r.kind, selectionIdOf(r)])).toEqual([
      ['missed', 'a'],
      ['not-scored', 'b'],
      ['found', 'c'],
      ['false-alarm', 'pred:frame-1:CAM_TEST:2'],
      ['false-alarm', 'pred:frame-1:CAM_TEST:1'],
    ]);
  });

  it('counts agree with the results', () => {
    expect(evaluation.counts).toEqual(countResults(evaluation.results));
    expect(evaluation.counts).toEqual({ found: 1, missed: 1, falseAlarm: 2, notScored: 1 });
  });

  it('does not modify its inputs', () => {
    const frameCopy = structuredClone(frame);
    const predictionsCopy = structuredClone(predictions);
    evaluateFrame(frame, predictions, RULES);
    expect(frame).toEqual(frameCopy);
    expect(predictions).toEqual(predictionsCopy);
  });

  it('gives the same answer every time', () => {
    expect(evaluateFrame(frame, predictions, RULES)).toEqual(evaluation);
  });
});

describe('findResult / selectionIdOf', () => {
  const frame = makeFrame([
    { id: 'a', bbox: A },
    { id: 'b', bbox: B, visibility: 'v0-40' },
    { id: 'outside', inCamera: false },
  ]);
  const evaluation = evaluateFrame(
    frame,
    [
      makePrediction(0, 'person', 0.9, A),
      makePrediction(1, 'person', 0.8, B),
      makePrediction(2, 'car', 0.7, C),
    ],
    RULES,
  );

  it('finds a label result by its object id', () => {
    expect(findResult(evaluation, 'a')).toMatchObject({ kind: 'found', objectId: 'a' });
    expect(findResult(evaluation, 'b')).toMatchObject({ kind: 'not-scored' });
  });

  it('resolves the prediction of a matched pair to the label\'s result', () => {
    expect(findResult(evaluation, 'pred:frame-1:CAM_TEST:0')).toMatchObject({ kind: 'found', objectId: 'a' });
    expect(findResult(evaluation, 'pred:frame-1:CAM_TEST:1')).toMatchObject({ kind: 'not-scored', objectId: 'b' });
  });

  it('finds a false alarm by its prediction id', () => {
    const result = findResult(evaluation, 'pred:frame-1:CAM_TEST:2');
    expect(result).toMatchObject({ kind: 'false-alarm' });
    expect(result && selectionIdOf(result)).toBe('pred:frame-1:CAM_TEST:2');
  });

  it('returns undefined for a box that is not evaluated, an unknown id, or no id', () => {
    expect(findResult(evaluation, 'outside')).toBeUndefined();
    expect(findResult(evaluation, 'pred:other-frame:0')).toBeUndefined();
    expect(findResult(evaluation, null)).toBeUndefined();
    expect(findResult(evaluation, '')).toBeUndefined();
  });

  it('selects a label by its object id, so 2D, 3D and the list agree (Rule #1)', () => {
    const found = findResult(evaluation, 'pred:frame-1:CAM_TEST:0');
    expect(found && selectionIdOf(found)).toBe('a');
  });
});

describe('evaluateFrame — bicycle racks (F6)', () => {
  // nuScenes labels a rack as ONE box and gives the bikes parked in it no boxes
  // of their own. The rack here spans x 1000–1400; a labelled bicycle stands
  // next to it.
  const RACK = box(1000, 400, 400, 100);
  const frame = makeFrame([
    { id: 'rack', class: 'static_object.bicycle_rack', bbox: RACK },
    { id: 'bike', class: 'bicycle', bbox: box(1500, 400, 80, 80) },
  ]);
  const inRack = (index: number, x: number, cls = 'bicycle', score = 0.6) =>
    makePrediction(index, cls, score, box(x, 410, 60, 80));

  it('a bicycle box whose centre is inside a rack is neither a find nor a false alarm', () => {
    const evaluation = evaluateFrame(frame, [inRack(0, 1050), inRack(1, 1200)], RULES);
    expect(evaluation.counts.falseAlarm).toBe(0);
    expect(evaluation.ignored).toEqual([
      { predictionId: 'pred:frame-1:CAM_TEST:0', class: 'bicycle', score: 0.6, regionObjectId: 'rack', reason: 'bicycle-rack' },
      { predictionId: 'pred:frame-1:CAM_TEST:1', class: 'bicycle', score: 0.6, regionObjectId: 'rack', reason: 'bicycle-rack' },
    ]);
    // It is not a result at all: nothing to select, nothing counted.
    expect(findResult(evaluation, 'pred:frame-1:CAM_TEST:0')).toBeUndefined();
    expect(evaluation.results.some((r) => r.kind === 'false-alarm')).toBe(false);
  });

  it('a motorcycle box in a rack is left out too; a person there is still a false alarm', () => {
    const evaluation = evaluateFrame(
      frame,
      [inRack(0, 1100, 'motorcycle'), inRack(1, 1250, 'person')],
      RULES,
    );
    expect(evaluation.ignored.map((i) => i.class)).toEqual(['motorcycle']);
    expect(evaluation.counts.falseAlarm).toBe(1);
  });

  it('it is the CENTRE that decides: a box mostly outside the rack is a false alarm', () => {
    // 60 px wide starting at x = 960: centre x = 990, 10 px left of the rack.
    const outside = evaluateFrame(frame, [inRack(0, 960)], RULES);
    expect(outside.ignored).toEqual([]);
    expect(outside.counts.falseAlarm).toBe(1);
    // Starting at x = 975: centre x = 1005, inside.
    expect(evaluateFrame(frame, [inRack(0, 975)], RULES).ignored).toHaveLength(1);
    // A centre exactly on the rack's edge counts as inside.
    expect(evaluateFrame(frame, [inRack(0, 970)], RULES).ignored).toHaveLength(1);
  });

  it('a labelled bicycle next to the rack is matched as usual — the rule is checked last', () => {
    const evaluation = evaluateFrame(
      frame,
      [makePrediction(0, 'bicycle', 0.9, box(1500, 400, 80, 80)), inRack(1, 1100)],
      RULES,
    );
    expect(evaluation.counts).toMatchObject({ found: 1, missed: 0, falseAlarm: 0 });
    expect(evaluation.ignored.map((i) => i.predictionId)).toEqual(['pred:frame-1:CAM_TEST:1']);
  });

  it('a labelled bicycle INSIDE the rack is still found by its own box', () => {
    const withBike = makeFrame([
      { id: 'rack', class: 'static_object.bicycle_rack', bbox: RACK },
      { id: 'own', class: 'bicycle', bbox: box(1100, 410, 60, 80) },
    ]);
    const evaluation = evaluateFrame(withBike, [inRack(0, 1100), inRack(1, 1300)], RULES);
    expect(evaluation.counts).toMatchObject({ found: 1, falseAlarm: 0 });
    expect(evaluation.ignored).toHaveLength(1);
  });

  it('a box below the minimum score was never reported, so it is not "left out" either', () => {
    const evaluation = evaluateFrame(frame, [inRack(0, 1100, 'bicycle', 0.1)], RULES);
    expect(evaluation.ignored).toEqual([]);
    expect(evaluation.counts.falseAlarm).toBe(0);
  });

  it('the rack itself is not a label to find: not found, not missed, not evaluated', () => {
    const evaluation = evaluateFrame(frame, [], RULES);
    expect(evaluation.results.map((r) => (r.kind === 'false-alarm' ? '' : r.objectId))).toEqual(['bike']);
    expect(evaluation.notEvaluated).toBe(1);
  });

  it('without a rack in the photo nothing is left out', () => {
    const noRack = makeFrame([{ id: 'bike', class: 'bicycle', bbox: box(1500, 400, 80, 80) }]);
    const evaluation = evaluateFrame(noRack, [inRack(0, 1100)], RULES);
    expect(evaluation.ignored).toEqual([]);
    expect(evaluation.counts.falseAlarm).toBe(1);
  });

  it('can be switched off: the same boxes are then false alarms', () => {
    const evaluation = evaluateFrame(frame, [inRack(0, 1050), inRack(1, 1200)], {
      ...RULES,
      ignoreRackRegions: false,
    });
    expect(evaluation.ignored).toEqual([]);
    expect(evaluation.counts.falseAlarm).toBe(2);
  });

  it('every evaluation carries the list, empty when nothing was left out', () => {
    expect(evaluateFrame(makeFrame([]), [], RULES).ignored).toEqual([]);
  });
});
