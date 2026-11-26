import { describe, expect, it } from 'vitest';
import { parseNuScenes } from '@/lib/nuscenes';
import { readReferenceFramesRaw, readReferencePredictionsRaw } from '@/lib/nuscenes/test-helpers';
import { frameAsCamera } from '@/lib/cameras';
import { boxOutcomeColors } from './box-colors';
import { evaluateFrames } from './evaluate';
import { DEFAULT_MIN_SCORE, IOU_THRESHOLD, evaluateFrame } from './match';
import { summarize } from './metrics';
import { NOT_EVALUATED_COLOR, OUTCOME_COLOR } from './outcomes';
import { isPredictionId, parsePredictions } from './parse';
import type { EvalSummary, EvaluationRules, PredictionSet } from './types';

/**
 * The evaluation of the REFERENCE sample: the first ten frames of scene-0916
 * against the model's predictions for them. Until F7 these ten frames were the
 * whole shipped dataset (`nuscenes.json` + `predictions.json`); they are now
 * read out of the scene's files, and every expected number below is unchanged.
 * It locks the numbers the UI shows (and the design docs quote) to the data
 * files — if a file is regenerated with a different model version, or a rule
 * changes, this fails and the change is visible.
 *
 * The expected values were measured independently before the code existed: a
 * Python re-implementation of the projection and the matching, on CAM_FRONT
 * (2026-11-25, F5) and on all six cameras (2026-11-26, F6 design doc §2.4).
 */
const frames = parseNuScenes(readReferenceFramesRaw());
const predictions = parsePredictions(readReferencePredictionsRaw()) as PredictionSet;
const CAMERAS = [
  'CAM_FRONT',
  'CAM_FRONT_LEFT',
  'CAM_FRONT_RIGHT',
  'CAM_BACK',
  'CAM_BACK_LEFT',
  'CAM_BACK_RIGHT',
];

const rules = (minScore: number, iouThreshold = IOU_THRESHOLD): EvaluationRules => ({
  minScore,
  iouThreshold,
});
/** One camera's ten photos, each evaluated on its own (the F5 evaluation, for any camera). */
const evaluateCamera = (camera: string, minScore: number, iouThreshold = IOU_THRESHOLD) =>
  frames.map((frame) =>
    evaluateFrame(
      frameAsCamera(frame, camera),
      predictions.byFrame.get(frame.id)?.get(camera) ?? [],
      rules(minScore, iouThreshold),
    ),
  );
const counts = (s: Pick<EvalSummary, 'found' | 'missed' | 'falseAlarm' | 'notScored'>) => [
  s.found,
  s.missed,
  s.falseAlarm,
  s.notScored,
];

describe('shipped sample: files', () => {
  it('has predictions for every photo: 10 frames × 6 cameras, and for nothing else', () => {
    expect(frames).toHaveLength(10);
    expect(predictions.cameras).toEqual(CAMERAS);
    expect([...predictions.byFrame.keys()].sort()).toEqual(frames.map((f) => f.id).sort());
    for (const frame of frames) {
      expect([...(predictions.byFrame.get(frame.id)?.keys() ?? [])]).toEqual(CAMERAS);
    }
  });

  it('records how the predictions were made', () => {
    expect(predictions.model).toMatchObject({ name: 'yolov8n', imageSize: 1280, minScore: 0.05 });
  });

  it('holds 1,597 predictions — 428 of them on CAM_FRONT, as before F6 — none below the recorded minimum', () => {
    const perCamera = CAMERAS.map((camera) =>
      frames.reduce((n, f) => n + (predictions.byFrame.get(f.id)?.get(camera)?.length ?? 0), 0),
    );
    expect(perCamera).toEqual([428, 144, 460, 71, 100, 394]);
    const all = [...predictions.byFrame.values()].flatMap((byCamera) => [...byCamera.values()].flat());
    expect(all).toHaveLength(1597);
    expect(Math.min(...all.map((p) => p.score))).toBeGreaterThanOrEqual(0.05);
  });

  it('prediction ids are unique across all photos and never collide with a label id (Rule #1)', () => {
    const predictionIds = [...predictions.byFrame.values()]
      .flatMap((byCamera) => [...byCamera.values()].flat())
      .map((p) => p.id);
    expect(new Set(predictionIds).size).toBe(predictionIds.length);
    expect(predictionIds.every((id) => isPredictionId(id))).toBe(true);
    const labelIds = frames.flatMap((f) => f.detections3D.map((d) => d.id));
    expect(labelIds.some((id) => isPredictionId(id))).toBe(false);
  });
});

describe('shipped sample: the front camera alone is exactly what it was before F6', () => {
  const evaluations = evaluateCamera('CAM_FRONT', DEFAULT_MIN_SCORE);
  const summary = summarize(evaluations);

  it('found 91, missed 83, false alarms 13, not scored 26', () => {
    expect(counts(summary)).toEqual([91, 83, 13, 26]);
  });

  it('precision 88%, recall 52%', () => {
    expect(summary.precision).toBeCloseTo(91 / 104, 10);
    expect(summary.recall).toBeCloseTo(91 / 174, 10);
  });

  it('recall by distance: 36/64, 45/87, 10/23', () => {
    expect(summary.byDistance).toEqual([
      { from: 10, to: 20, found: 36, total: 64 },
      { from: 20, to: 30, found: 45, total: 87 },
      { from: 30, to: 40, found: 10, total: 23 },
    ]);
  });

  it('recall by class: person 73/112, motorcycle 0/40, car 18/22', () => {
    expect(summary.byClass).toEqual([
      { class: 'person', found: 73, total: 112 },
      { class: 'motorcycle', found: 0, total: 40 },
      { class: 'car', found: 18, total: 22 },
    ]);
  });

  it('missed per frame', () => {
    expect(evaluations.map((e) => e.counts.missed)).toEqual([10, 8, 8, 8, 10, 10, 9, 6, 6, 8]);
  });

  it('no bicycle rack is in the front photo, so the rack rule changes nothing there', () => {
    expect(evaluations.every((e) => e.ignored.length === 0)).toBe(true);
  });

  it('every label in the photo has exactly one result; the rest are "not evaluated"', () => {
    frames.forEach((frame, i) => {
      const labelResults = evaluations[i].results.filter((r) => r.kind !== 'false-alarm');
      expect(labelResults).toHaveLength(frame.detections2D.length);
      expect(evaluations[i].notEvaluated).toBe(
        frame.detections3D.length - frame.detections2D.length,
      );
    });
  });

  // The F5 design doc's table says 220 and 98 false alarms for 0.05 and 0.10. That
  // probe dropped ANY prediction lying on an unscored label; the rule as designed
  // (and as implemented) drops only predictions of the label's own class, like
  // the matching itself. Re-measured with that rule: 243 and 104.
  it.each([
    [0.05, { found: 127, falseAlarm: 243, missed: 47 }],
    [0.1, { found: 116, falseAlarm: 104, missed: 58 }],
    [0.4, { found: 72, falseAlarm: 0, missed: 102 }],
    [0.6, { found: 48, falseAlarm: 0, missed: 126 }],
  ])('the score slider trades false alarms for misses: min score %s', (minScore, expected) => {
    expect(summarize(evaluateCamera('CAM_FRONT', minScore))).toMatchObject(expected);
  });

  it('found + missed is the same at every score: the labels do not change', () => {
    for (const minScore of [0, 0.05, 0.25, 0.5, 1]) {
      const s = summarize(evaluateCamera('CAM_FRONT', minScore));
      expect(s.found + s.missed).toBe(174);
      expect(s.notScored).toBe(26);
    }
  });

  it('at IoU 0.5 the loose projected labels turn correct detections into misses (why 0.3)', () => {
    const strict = summarize(evaluateCamera('CAM_FRONT', DEFAULT_MIN_SCORE, 0.5));
    const used = summarize(evaluateCamera('CAM_FRONT', DEFAULT_MIN_SCORE, IOU_THRESHOLD));
    expect(strict.found).toBeLessThan(used.found - 20);
    expect(strict.falseAlarm).toBeGreaterThan(used.falseAlarm + 20);
  });
});

describe('shipped sample: all six cameras at the default rules (F6)', () => {
  const evaluation = evaluateFrames(frames, predictions, rules(DEFAULT_MIN_SCORE));

  it('scores all 60 photos', () => {
    expect(evaluation.evaluatedFrames).toBe(10);
    expect(evaluation.evaluatedPhotos).toBe(60);
    expect(evaluation.framesWithoutPredictions).toBe(0);
    expect(evaluation.photosWithoutPredictions).toBe(0);
  });

  it('per photo: found 349, missed 182, false alarms 107, not scored 180', () => {
    expect(counts(evaluation.summary)).toEqual([349, 182, 107, 180]);
    expect(evaluation.summary.precision).toBeCloseTo(349 / 456, 10); // 77%
    expect(evaluation.summary.recall).toBeCloseTo(349 / 531, 10); // 66%
  });

  it('per camera (found / missed / false alarms / not scored) — and they add up to the total', () => {
    expect(evaluation.byCamera.map((c) => [c.camera, c.photos, ...counts(c.summary)])).toEqual([
      ['CAM_FRONT', 10, 91, 83, 13, 26],
      ['CAM_FRONT_LEFT', 10, 58, 17, 2, 3],
      ['CAM_FRONT_RIGHT', 10, 102, 34, 40, 48],
      ['CAM_BACK', 10, 19, 21, 1, 8],
      ['CAM_BACK_LEFT', 10, 16, 12, 2, 4],
      ['CAM_BACK_RIGHT', 10, 63, 15, 49, 91],
    ]);
  });

  it('the front camera inside the six-camera evaluation equals the front camera alone', () => {
    const alone = summarize(evaluateCamera('CAM_FRONT', DEFAULT_MIN_SCORE));
    expect(evaluation.byCamera[0].summary).toEqual(alone);
  });

  it('the bicycle-rack rule leaves 14 model boxes out; without it they are 14 more false alarms', () => {
    expect(evaluation.ignored).toBe(14);
    const perCamera = CAMERAS.map((camera) =>
      [...evaluation.byFrame.values()].reduce(
        (n, f) => n + (f.byCamera.get(camera)?.ignored.length ?? 0),
        0,
      ),
    );
    // CAM_FRONT_LEFT 1, CAM_BACK 2, CAM_BACK_LEFT 11 — the three cameras that see the rack.
    expect(perCamera).toEqual([0, 1, 0, 2, 11, 0]);

    const off = evaluateFrames(frames, predictions, {
      ...rules(DEFAULT_MIN_SCORE),
      ignoreRackRegions: false,
    });
    expect(counts(off.summary)).toEqual([349, 182, 121, 180]);
    expect(off.ignored).toBe(0);
    expect(off.summary.precision).toBeCloseTo(349 / 470, 10); // 74%
  });

  it('every left-out box is a bicycle (no motorcycle is reported inside the rack in this sample)', () => {
    const ignored = [...evaluation.byFrame.values()].flatMap((f) =>
      [...f.byCamera.values()].flatMap((photo) => photo.ignored),
    );
    expect(new Set(ignored.map((i) => i.class))).toEqual(new Set(['bicycle']));
    expect(new Set(ignored.map((i) => i.reason))).toEqual(new Set(['bicycle-rack']));
  });

  it('recall by class: person 163/246, car 160/194, motorcycle 0/45, truck 10/17, bus 15/16, bicycle 1/13', () => {
    expect(evaluation.summary.byClass).toEqual([
      { class: 'person', found: 163, total: 246 },
      { class: 'car', found: 160, total: 194 },
      { class: 'motorcycle', found: 0, total: 45 },
      { class: 'truck', found: 10, total: 17 },
      { class: 'bus', found: 15, total: 16 },
      { class: 'bicycle', found: 1, total: 13 },
    ]);
  });

  it('recall by distance now covers 0–70 m (the front camera alone: 10–40 m)', () => {
    expect(evaluation.summary.byDistance).toEqual([
      { from: 0, to: 10, found: 12, total: 19 },
      { from: 10, to: 20, found: 145, total: 205 },
      { from: 20, to: 30, found: 129, total: 209 },
      { from: 30, to: 40, found: 51, total: 81 },
      { from: 40, to: 50, found: 7, total: 11 },
      { from: 60, to: 70, found: 5, total: 6 },
    ]);
  });

  it('missed per frame, added over its six photos', () => {
    expect(frames.map((f) => evaluation.byFrame.get(f.id)?.counts.missed)).toEqual([
      23, 19, 17, 12, 19, 19, 23, 19, 14, 17,
    ]);
  });

  it('per object: 295 found by at least one camera, 123 by none, 155 not scored', () => {
    expect(evaluation.objects).toEqual({ found: 295, missed: 123, notScored: 155 });
    // 573 boxes of an evaluated class; the other 10 of the 583 are bicycle racks.
    expect(295 + 123 + 155).toBe(573);
  });

  it('an object two cameras see is one object but two labels: 531 scored labels, 418 scored objects', () => {
    expect(evaluation.summary.found + evaluation.summary.missed).toBe(531);
    expect(evaluation.objects.found + evaluation.objects.missed).toBe(418);
    const twice = [...evaluation.byFrame.values()].flatMap((f) =>
      [...f.objects.values()].filter(
        (o) => o.views.filter((v) => v.kind !== 'not-scored').length === 2,
      ),
    );
    expect(twice).toHaveLength(113);
    const pairs = { both: 0, one: 0, none: 0 };
    for (const object of twice) {
      const found = object.views.filter((v) => v.kind === 'found').length;
      if (found === 2) pairs.both += 1;
      else if (found === 1) pairs.one += 1;
      else pairs.none += 1;
    }
    expect(pairs).toEqual({ both: 54, one: 39, none: 20 });
  });
});

describe('shipped sample: frame 6 in the 3D view (F6)', () => {
  const frame = frames[5];
  const evaluation = evaluateFrames(frames, predictions, rules(DEFAULT_MIN_SCORE)).byFrame.get(
    frame.id,
  );
  const colours = [...boxOutcomeColors(frame, evaluation?.objects ?? new Map()).values()];
  const count = (colour: string) => colours.filter((c) => c === colour).length;

  it('61 boxes: 28 green, 16 red, 17 grey (front camera alone: 12 / 10 / 39)', () => {
    expect(colours).toHaveLength(61);
    expect(count(OUTCOME_COLOR.found)).toBe(28);
    expect(count(OUTCOME_COLOR.missed)).toBe(16);
    expect(count(NOT_EVALUATED_COLOR)).toBe(17);

    const frontOnly = evaluateFrame(
      frame,
      predictions.byFrame.get(frame.id)?.get('CAM_FRONT') ?? [],
      rules(DEFAULT_MIN_SCORE),
    );
    expect([frontOnly.counts.found, frontOnly.counts.missed]).toEqual([12, 10]);
  });

  it('per photo: 19 missed, 5 false alarms, 35 found, 17 not scored', () => {
    expect(evaluation?.counts).toEqual({ found: 35, missed: 19, falseAlarm: 5, notScored: 17 });
    expect(evaluation?.ignored).toBe(2);
  });

  it('the car at the edge of the front photo: missed there, found by the front-right camera → green', () => {
    const car = frame.detections3D.find((d) => d.id.startsWith('e3f3d9'));
    expect(car).toBeDefined();
    expect(evaluation?.objects.get(car?.id ?? '')).toEqual({
      kind: 'found',
      views: [
        { camera: 'CAM_FRONT', kind: 'missed' },
        { camera: 'CAM_FRONT_RIGHT', kind: 'found' },
      ],
    });
    const right = evaluation?.byCamera
      .get('CAM_FRONT_RIGHT')
      ?.results.find((r) => r.kind === 'found' && r.objectId === car?.id);
    expect(right?.kind === 'found' && right.score).toBeCloseTo(0.4461, 4);
  });
});
