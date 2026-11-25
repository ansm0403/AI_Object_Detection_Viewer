import { describe, expect, it } from 'vitest';
import { evaluateFrames } from './evaluate';
import { box, makeFrame, makePrediction } from './test-helpers';
import type { EvaluationRules, Prediction2D, PredictionSet } from './types';

const RULES: EvaluationRules = { minScore: 0.25, iouThreshold: 0.3 };
const HERE = box(0, 0, 100, 100);

const setOf = (entries: [string, Prediction2D[]][]): PredictionSet => ({
  model: { name: 'test-model' },
  byFrame: new Map(entries),
});

describe('evaluateFrames', () => {
  it('evaluates each frame against its own predictions and sums them', () => {
    const frames = [
      makeFrame([{ id: 'a', bbox: HERE }], 'f1'),
      makeFrame([{ id: 'b', bbox: HERE }], 'f2'),
    ];
    const result = evaluateFrames(
      frames,
      setOf([
        ['f1', [makePrediction(0, 'person', 0.9, HERE, 'f1')]],
        ['f2', [makePrediction(0, 'person', 0.9, box(500, 500, 50, 50), 'f2')]],
      ]),
      RULES,
    );
    expect(result.byFrame.get('f1')?.counts).toMatchObject({ found: 1, missed: 0 });
    expect(result.byFrame.get('f2')?.counts).toMatchObject({ found: 0, missed: 1, falseAlarm: 1 });
    expect(result.summary).toMatchObject({ found: 1, missed: 1, falseAlarm: 1 });
    expect(result.evaluatedFrames).toBe(2);
    expect(result.framesWithoutPredictions).toBe(0);
  });

  it('leaves out a frame the model was not run on — its labels are NOT counted as missed', () => {
    const frames = [
      makeFrame([{ id: 'a', bbox: HERE }], 'f1'),
      makeFrame([{ id: 'b', bbox: HERE }, { id: 'c', bbox: box(300, 0, 50, 50) }], 'f2'),
    ];
    const result = evaluateFrames(
      frames,
      setOf([['f1', [makePrediction(0, 'person', 0.9, HERE, 'f1')]]]),
      RULES,
    );
    expect(result.byFrame.has('f2')).toBe(false);
    expect(result.summary).toMatchObject({ found: 1, missed: 0 });
    expect(result.summary.recall).toBe(1);
    expect(result.evaluatedFrames).toBe(1);
    expect(result.framesWithoutPredictions).toBe(1);
  });

  it('a frame with an EMPTY prediction list was run: every scored label is missed', () => {
    const frames = [makeFrame([{ id: 'a', bbox: HERE }], 'f1')];
    const result = evaluateFrames(frames, setOf([['f1', []]]), RULES);
    expect(result.byFrame.get('f1')?.counts).toMatchObject({ found: 0, missed: 1 });
    expect(result.summary.recall).toBe(0);
    expect(result.summary.precision).toBeNull();
    expect(result.framesWithoutPredictions).toBe(0);
  });

  it('ignores predictions for frames that are not in the dataset', () => {
    const frames = [makeFrame([{ id: 'a', bbox: HERE }], 'f1')];
    const result = evaluateFrames(
      frames,
      setOf([
        ['f1', []],
        ['gone', [makePrediction(0, 'person', 0.9, HERE, 'gone')]],
      ]),
      RULES,
    );
    expect([...result.byFrame.keys()]).toEqual(['f1']);
    expect(result.summary.falseAlarm).toBe(0);
  });

  it('applies the rules it is given (the score slider)', () => {
    const frames = [makeFrame([{ id: 'a', bbox: HERE }], 'f1')];
    const predictions = setOf([['f1', [makePrediction(0, 'person', 0.3, HERE, 'f1')]]]);
    expect(evaluateFrames(frames, predictions, RULES).summary.found).toBe(1);
    expect(
      evaluateFrames(frames, predictions, { ...RULES, minScore: 0.5 }).summary,
    ).toMatchObject({ found: 0, missed: 1 });
  });

  it('no frames, or no evaluated frame: empty totals, null ratios', () => {
    expect(evaluateFrames([], setOf([]), RULES)).toMatchObject({
      evaluatedFrames: 0,
      framesWithoutPredictions: 0,
      summary: { found: 0, missed: 0, precision: null, recall: null },
    });
    const frames = [makeFrame([{ id: 'a', bbox: HERE }], 'f1')];
    expect(evaluateFrames(frames, setOf([]), RULES)).toMatchObject({
      evaluatedFrames: 0,
      framesWithoutPredictions: 1,
      summary: { missed: 0, recall: null },
    });
  });
});
