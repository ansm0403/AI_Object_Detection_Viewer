import { describe, expect, it } from 'vitest';
import { boxOutcomeColors } from './box-colors';
import { evaluateFrame } from './match';
import { NOT_EVALUATED_COLOR, OUTCOME_COLOR } from './outcomes';
import { box, makeFrame, makePrediction } from './test-helpers';
import type { EvaluationRules } from './types';

const RULES: EvaluationRules = { minScore: 0.25, iouThreshold: 0.3 };

const frame = makeFrame([
  { id: 'found', bbox: box(0, 0, 100, 200) },
  { id: 'missed', bbox: box(300, 0, 100, 200) },
  { id: 'hidden', bbox: box(600, 0, 100, 200), visibility: 'v0-40' },
  { id: 'behind', inCamera: false },
  { id: 'rack', class: 'static_object.bicycle_rack', bbox: box(1200, 0, 100, 100) },
]);
const predictions = [
  makePrediction(0, 'person', 0.9, box(0, 0, 100, 200)),
  makePrediction(1, 'person', 0.5, box(900, 0, 50, 50)), // false alarm
];
const colors = boxOutcomeColors(frame, evaluateFrame(frame, predictions, RULES));

describe('boxOutcomeColors', () => {
  it('gives every 3D box of the frame a colour', () => {
    expect([...colors.keys()].sort()).toEqual(frame.detections3D.map((d) => d.id).sort());
  });

  it('found is green, missed is red', () => {
    expect(colors.get('found')).toBe(OUTCOME_COLOR.found);
    expect(colors.get('missed')).toBe(OUTCOME_COLOR.missed);
  });

  it('grey for everything that says nothing about the model', () => {
    // not scored (low visibility), outside the camera, a class the model cannot name
    expect(colors.get('hidden')).toBe(NOT_EVALUATED_COLOR);
    expect(colors.get('behind')).toBe(NOT_EVALUATED_COLOR);
    expect(colors.get('rack')).toBe(NOT_EVALUATED_COLOR);
  });

  it('a false alarm gets no 3D colour: a model box has no 3D position', () => {
    expect([...colors.keys()].some((id) => id.startsWith('pred:'))).toBe(false);
    expect([...colors.values()]).not.toContain(OUTCOME_COLOR['false-alarm']);
  });

  it('ignores results of boxes that are not in the frame', () => {
    const other = makeFrame([{ id: 'elsewhere', bbox: box(0, 0, 100, 200) }], 'frame-2');
    const mixed = boxOutcomeColors(frame, evaluateFrame(other, [], RULES));
    expect(mixed.has('elsewhere')).toBe(false);
    expect(new Set(mixed.values())).toEqual(new Set([NOT_EVALUATED_COLOR]));
  });

  it('a frame without boxes gives an empty map', () => {
    const empty = makeFrame([]);
    expect(boxOutcomeColors(empty, evaluateFrame(empty, [], RULES)).size).toBe(0);
  });
});
