import { describe, expect, it } from 'vitest';
import { describeResult, visibilityText } from './describe';
import type { EvalResult, EvaluationRules, FalseAlarmRelation, MissReason } from './types';

const RULES: EvaluationRules = { minScore: 0.25, iouThreshold: 0.3 };

const label = { objectId: 'a', class: 'motorcycle', distance: 24 };
const missedWith = (reason: MissReason): EvalResult => ({
  kind: 'missed',
  ...label,
  nearest: { predictionId: 'pred:f:1', class: 'person', score: 0.15, iou: 0.456, reason },
});
const falseAlarmWith = (relation: FalseAlarmRelation): EvalResult => ({
  kind: 'false-alarm',
  predictionId: 'pred:f:2',
  class: 'person',
  score: 0.35,
  nearest: { objectId: 'a', class: 'motorcycle', iou: 0.53, relation },
});

describe('describeResult', () => {
  it('found: the matched box, its score and overlap', () => {
    expect(
      describeResult(
        { kind: 'found', ...label, predictionId: 'pred:f:0', score: 0.81, iou: 0.624 },
        RULES,
      ),
    ).toBe('matched model box: score 0.81 · IoU 0.62');
  });

  it('missed, nothing near: says so without blaming a score', () => {
    expect(describeResult({ kind: 'missed', ...label, nearest: null }, RULES)).toBe(
      'no model box overlaps this label, at any score',
    );
  });

  it('missed: names the closest model box and the one fact that kept it from counting', () => {
    expect(describeResult(missedWith('below-min-score'), RULES)).toBe(
      'closest model box: person 0.15 · IoU 0.46 — below the min score 0.25',
    );
    expect(describeResult(missedWith('wrong-class'), RULES)).toMatch(/— a different class$/);
    expect(describeResult(missedWith('low-overlap'), RULES)).toMatch(/— under the IoU 0\.3 needed$/);
    expect(describeResult(missedWith('matched-elsewhere'), RULES)).toMatch(
      /— already matched to another label$/,
    );
  });

  it('missed: quotes the CURRENT minimum score', () => {
    expect(describeResult(missedWith('below-min-score'), { ...RULES, minScore: 0.4 })).toMatch(
      /below the min score 0\.40$/,
    );
  });

  it('false alarm, nothing under it', () => {
    expect(
      describeResult(
        { kind: 'false-alarm', predictionId: 'p', class: 'person', score: 0.3, nearest: null },
        RULES,
      ),
    ).toBe('no label overlaps this model box');
  });

  it('false alarm: names the closest label and how it relates', () => {
    expect(describeResult(falseAlarmWith('other-class'), RULES)).toBe(
      'closest label: motorcycle · IoU 0.53 — a different class',
    );
    expect(describeResult(falseAlarmWith('matched-elsewhere'), RULES)).toMatch(
      /— already found by a higher-scoring box$/,
    );
    expect(describeResult(falseAlarmWith('low-overlap'), RULES)).toMatch(
      /— under the IoU 0\.3 needed$/,
    );
  });

  it('not scored: the reason, plus any model boxes that were set aside with it', () => {
    const base = { kind: 'not-scored' as const, ...label, reason: 'low-visibility' as const };
    expect(describeResult({ ...base, predictionIds: [] }, RULES)).toBe(
      'less than 40% visible — left out of the score',
    );
    expect(describeResult({ ...base, predictionIds: ['p1'] }, RULES)).toMatch(
      /· 1 model box on it, not counted$/,
    );
    expect(describeResult({ ...base, predictionIds: ['p1', 'p2'] }, RULES)).toMatch(
      /· 2 model boxes on it, not counted$/,
    );
  });
});

describe('visibilityText', () => {
  it('maps the nuScenes bins to percentages', () => {
    expect(visibilityText('v0-40')).toBe('0–40%');
    expect(visibilityText('v60-80')).toBe('60–80%');
  });

  it('is null when the data does not carry it', () => {
    expect(visibilityText(undefined)).toBeNull();
  });
});
