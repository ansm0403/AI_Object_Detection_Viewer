import { describe, expect, it } from 'vitest';
import { boxOutcomeColors } from './box-colors';
import { mergeObjectOutcomes, type ObjectOutcome } from './evaluate';
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
/** The per-object outcomes of one photo (a one-camera frame). */
const outcomes = mergeObjectOutcomes(new Map([['CAM', evaluateFrame(frame, predictions, RULES)]]));
const colors = boxOutcomeColors(frame, outcomes);

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

  it('ignores outcomes of objects that are not in the frame', () => {
    const other = makeFrame([{ id: 'elsewhere', bbox: box(0, 0, 100, 200) }], 'frame-2');
    const foreign = mergeObjectOutcomes(new Map([['CAM', evaluateFrame(other, [], RULES)]]));
    const mixed = boxOutcomeColors(frame, foreign);
    expect(mixed.has('elsewhere')).toBe(false);
    expect(new Set(mixed.values())).toEqual(new Set([NOT_EVALUATED_COLOR]));
  });

  it('a frame without boxes gives an empty map', () => {
    expect(boxOutcomeColors(makeFrame([]), new Map()).size).toBe(0);
  });
});

describe('boxOutcomeColors — several cameras (F6)', () => {
  const outcome = (kind: ObjectOutcome['kind'], ...views: ObjectOutcome['views']): ObjectOutcome => ({
    kind,
    views,
  });
  const boxes = makeFrame(
    ['any', 'none', 'unscored', 'unseen'].map((id) => ({ id, inCamera: false })),
  );
  const merged = boxOutcomeColors(
    boxes,
    new Map([
      ['any', outcome('found', { camera: 'F', kind: 'missed' }, { camera: 'FR', kind: 'found' })],
      ['none', outcome('missed', { camera: 'F', kind: 'missed' }, { camera: 'FR', kind: 'missed' })],
      ['unscored', outcome('not-scored', { camera: 'BR', kind: 'not-scored' })],
    ]),
  );

  it('green when at least one camera found it — even if another missed it', () => {
    expect(merged.get('any')).toBe(OUTCOME_COLOR.found);
  });

  it('red only when every photo that scored it missed it', () => {
    expect(merged.get('none')).toBe(OUTCOME_COLOR.missed);
  });

  it('grey when not scored, and when no camera has a result for it', () => {
    expect(merged.get('unscored')).toBe(NOT_EVALUATED_COLOR);
    expect(merged.get('unseen')).toBe(NOT_EVALUATED_COLOR);
  });

  it('one box, one colour: the colour is the object’s, not a photo’s', () => {
    expect(merged.size).toBe(4);
  });
});
