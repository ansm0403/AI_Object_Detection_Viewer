import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseNuScenes } from '@/lib/nuscenes';
import { DEFAULT_MIN_SCORE, IOU_THRESHOLD, evaluateFrame } from './match';
import { summarize } from './metrics';
import { isPredictionId, parsePredictions } from './parse';
import type { PredictionSet } from './types';

/**
 * The evaluation of the SHIPPED sample: the real `nuscenes.json` against the
 * real `predictions.json`. It locks the numbers the UI shows (and the design
 * doc quotes) to the data files — if a file is regenerated with a different
 * model version, or a rule changes, this fails and the change is visible.
 *
 * The expected values were measured independently (a Python re-implementation
 * of the projection and the matching, 2026-11-25) before this module existed.
 */
const SAMPLE_DIR = new URL('../../../public/sample-data/nuscenes/', import.meta.url);
const readJson = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(name, SAMPLE_DIR), 'utf-8'));

const frames = parseNuScenes(readJson('nuscenes.json'));
const predictions = parsePredictions(readJson('predictions.json')) as PredictionSet;

const evaluateAll = (minScore: number, iouThreshold = IOU_THRESHOLD) =>
  frames.map((frame) =>
    evaluateFrame(frame, predictions.byFrame.get(frame.id) ?? [], { minScore, iouThreshold }),
  );

describe('shipped sample: files', () => {
  it('has predictions for every frame, and for no other frame', () => {
    expect(frames).toHaveLength(10);
    expect([...predictions.byFrame.keys()].sort()).toEqual(frames.map((f) => f.id).sort());
  });

  it('records how the predictions were made', () => {
    expect(predictions.model).toMatchObject({ name: 'yolov8n', imageSize: 1280, minScore: 0.05 });
    expect(predictions.camera).toBe('CAM_FRONT');
  });

  it('holds 428 predictions, none below the recorded minimum score', () => {
    const all = [...predictions.byFrame.values()].flat();
    expect(all).toHaveLength(428);
    expect(Math.min(...all.map((p) => p.score))).toBeGreaterThanOrEqual(0.05);
  });

  it('prediction ids are unique and never collide with a label id (Rule #1)', () => {
    const predictionIds = [...predictions.byFrame.values()].flat().map((p) => p.id);
    expect(new Set(predictionIds).size).toBe(predictionIds.length);
    expect(predictionIds.every((id) => isPredictionId(id))).toBe(true);
    const labelIds = frames.flatMap((f) => f.detections3D.map((d) => d.id));
    expect(labelIds.some((id) => isPredictionId(id))).toBe(false);
  });
});

describe('shipped sample: evaluation at the default rules', () => {
  const evaluations = evaluateAll(DEFAULT_MIN_SCORE);
  const summary = summarize(evaluations);

  it('found 91, missed 83, false alarms 13, not scored 26', () => {
    expect(summary).toMatchObject({ found: 91, missed: 83, falseAlarm: 13, notScored: 26 });
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

  it('every label in the camera image has exactly one result; the rest are "not evaluated"', () => {
    frames.forEach((frame, i) => {
      const labelResults = evaluations[i].results.filter((r) => r.kind !== 'false-alarm');
      expect(labelResults).toHaveLength(frame.detections2D.length);
      expect(evaluations[i].notEvaluated).toBe(
        frame.detections3D.length - frame.detections2D.length,
      );
    });
  });
});

describe('shipped sample: the score slider trades false alarms for misses', () => {
  // The design doc's table says 220 and 98 false alarms for 0.05 and 0.10. That
  // probe dropped ANY prediction lying on an unscored label; the rule as designed
  // (and as implemented) drops only predictions of the label's own class, like
  // the matching itself. Re-measured with that rule: 243 and 104.
  it.each([
    [0.05, { found: 127, falseAlarm: 243, missed: 47 }],
    [0.1, { found: 116, falseAlarm: 104, missed: 58 }],
    [0.4, { found: 72, falseAlarm: 0, missed: 102 }],
    [0.6, { found: 48, falseAlarm: 0, missed: 126 }],
  ])('min score %s', (minScore, expected) => {
    expect(summarize(evaluateAll(minScore))).toMatchObject(expected);
  });

  it('found + missed is the same at every score: the labels do not change', () => {
    for (const minScore of [0, 0.05, 0.25, 0.5, 1]) {
      const s = summarize(evaluateAll(minScore));
      expect(s.found + s.missed).toBe(174);
      expect(s.notScored).toBe(26);
    }
  });
});

describe('shipped sample: why 0.3 and not the benchmark 0.5', () => {
  it('at IoU 0.5 the loose projected labels turn correct detections into misses', () => {
    const strict = summarize(evaluateAll(DEFAULT_MIN_SCORE, 0.5));
    const used = summarize(evaluateAll(DEFAULT_MIN_SCORE, IOU_THRESHOLD));
    expect(strict.found).toBeLessThan(used.found - 20);
    expect(strict.falseAlarm).toBeGreaterThan(used.falseAlarm + 20);
  });
});
