import { describe, expect, it } from 'vitest';
import { labelValuesOf, withEdit, type BoxValues, type EditMap } from '@/lib/editing';
import { must, referenceFrames } from '@/lib/editing/test-helpers';
import { parseNuScenes } from '@/lib/nuscenes';
import { readReferenceFramesRaw } from '@/lib/nuscenes/test-helpers';
import type { Frame } from '@/lib/types';
import { editCloseness } from './closeness';
import { makePracticeSet, type PlantedError, type PracticeErrorKind } from './practice';

// The real sample (scene-0916, first ten frames) and its practice set, both
// through the app's own parser — what the page holds in practice mode.
const real = referenceFrames();
const set = makePracticeSet(readReferenceFramesRaw());
const practice: Frame[] = parseNuScenes(set.prepped);
const planted: PlantedError[] = set.planted;
const AT = '2026-11-27T12:00:00.000Z';

const frameOf = (frames: Frame[], id: string) => must(frames.find((f) => f.id === id), `frame ${id}`);
const firstOfKind = (kind: PracticeErrorKind) => must(planted.find((p) => p.kind === kind), `a planted ${kind} error`);
const valuesIn = (frames: Frame[], error: { frameId: string; objectId: string }): BoxValues =>
  must(labelValuesOf(frameOf(frames, error.frameId), error.objectId), 'box values');
const closeness = (frameId: string, edits: EditMap) =>
  editCloseness(frameOf(real, frameId), frameOf(practice, frameId), edits, planted);

describe('editCloseness (F8: practice mode)', () => {
  it('the practice set of the reference frames has every kind of geometric error', () => {
    // (what the tests below stand on)
    expect(planted.length).toBeGreaterThan(0);
    for (const kind of ['position', 'size', 'heading'] as const) firstOfKind(kind);
  });

  it('no edits → no rows', () => {
    expect(closeness(real[0].id, {})).toEqual([]);
  });

  it('a planted POSITION error: the box was 1.0 – 1.6 m off, and only off in position', () => {
    const error = firstOfKind('position');
    const shown = valuesIn(practice, error);
    // an edit that changes nothing that matters: 1 cm sideways
    const edits = withEdit({}, error.frameId, error.objectId, { ...shown, translation: [shown.translation[0] + 0.01, shown.translation[1], shown.translation[2]] }, AT);
    const [row] = closeness(error.frameId, edits);
    expect(row.objectId).toBe(error.objectId);
    expect(row.planted).toBe('position');
    expect(row.before.centre).toBeGreaterThanOrEqual(1.0 - 1e-6);
    expect(row.before.centre).toBeLessThanOrEqual(1.6 + 1e-6);
    expect(row.before.size).toBeLessThan(1e-9);
    expect(row.before.heading).toBeLessThan(1e-4);
    // "moved 1.3 m" in the answer key is this number
    expect(error.detail).toBe(`moved ${row.before.centre.toFixed(1)} m`);
  });

  it('editing the box back onto the real label brings every distance to zero', () => {
    for (const kind of ['position', 'size', 'heading'] as const) {
      const error = firstOfKind(kind);
      const edits = withEdit({}, error.frameId, error.objectId, valuesIn(real, error), AT);
      const [row] = closeness(error.frameId, edits);
      expect(row.planted).toBe(kind);
      expect(row.after.centre).toBeLessThan(1e-9);
      expect(row.after.size).toBeLessThan(1e-9);
      expect(row.after.heading).toBeLessThan(1e-9);
    }
  });

  it('half of the way back is half of the distance', () => {
    const error = firstOfKind('position');
    const shown = valuesIn(practice, error);
    const target = valuesIn(real, error);
    const halfway: BoxValues = {
      ...shown,
      translation: [
        (shown.translation[0] + target.translation[0]) / 2,
        (shown.translation[1] + target.translation[1]) / 2,
        (shown.translation[2] + target.translation[2]) / 2,
      ],
    };
    const [row] = closeness(error.frameId, withEdit({}, error.frameId, error.objectId, halfway, AT));
    expect(row.after.centre).toBeCloseTo(row.before.centre / 2, 9);
  });

  it('a planted SIZE error shows in size (and in the centre: the bottom was kept, so the centre moved)', () => {
    const error = firstOfKind('size');
    const shown = valuesIn(practice, error);
    const [row] = closeness(error.frameId, withEdit({}, error.frameId, error.objectId, { ...shown, yaw: shown.yaw + 0.001 }, AT));
    expect(row.before.size).toBeGreaterThan(0.05);
    expect(row.before.heading).toBeLessThan(1e-4);
    const target = valuesIn(real, error);
    expect(row.before.centre).toBeCloseTo(Math.abs(shown.size[2] - target.size[2]) / 2, 6);
  });

  it('a planted HEADING error: 30° – 60° off, nothing else', () => {
    const error = firstOfKind('heading');
    const shown = valuesIn(practice, error);
    const [row] = closeness(error.frameId, withEdit({}, error.frameId, error.objectId, { ...shown, size: [shown.size[0] + 0.01, shown.size[1], shown.size[2]] }, AT));
    expect(row.before.heading).toBeGreaterThanOrEqual(30 - 1e-3);
    expect(row.before.heading).toBeLessThanOrEqual(60 + 1e-3);
    expect(row.before.centre).toBeLessThan(1e-9);
    expect(row.before.size).toBeLessThan(1e-9);
  });

  it('a box nothing was planted on: before = 0, and the edit is measured as what it took away from the real label', () => {
    const frame = practice[0];
    const plantedIds = new Set(planted.filter((p) => p.frameId === frame.id).map((p) => p.objectId));
    const box = must(frame.detections3D.find((d) => !plantedIds.has(d.id)), 'an untouched box');
    const shown = must(labelValuesOf(frame, box.id));
    const edits = withEdit({}, frame.id, box.id, { ...shown, translation: [shown.translation[0] + 0.3, shown.translation[1] + 0.4, shown.translation[2]] }, AT);
    const [row] = closeness(frame.id, edits);
    expect(row.planted).toBeNull();
    expect(row.before).toEqual({ centre: 0, size: 0, heading: 0 });
    expect(row.after.centre).toBeCloseTo(0.5, 9);
  });

  it('a planted CLASS error leaves the box where it was: before = 0', () => {
    const error = planted.find((p) => p.kind === 'class');
    if (!error) return; // the seed planted none in these ten frames
    const shown = valuesIn(practice, error);
    const [row] = closeness(error.frameId, withEdit({}, error.frameId, error.objectId, { ...shown, yaw: shown.yaw + 0.01 }, AT));
    expect(row.planted).toBe('class');
    expect(row.before.centre).toBeLessThan(1e-9);
    expect(row.before.size).toBeLessThan(1e-9);
  });

  it('rows are in the frame’s box order and only for this frame’s edits', () => {
    const frame = practice[2];
    const [a, b, c] = frame.detections3D;
    const nudge = (id: string, map: EditMap, frameId = frame.id) => {
      const shown = must(labelValuesOf(frameOf(practice, frameId), id));
      return withEdit(map, frameId, id, { ...shown, yaw: shown.yaw + 0.02 }, AT);
    };
    let edits = nudge(c.id, {});
    edits = nudge(a.id, edits);
    edits = nudge(practice[3].detections3D[0].id, edits, practice[3].id); // another frame
    expect(closeness(frame.id, edits).map((r) => r.objectId)).toEqual([a.id, c.id]);
    void b;
  });

  it('two different frames, or frames a box cannot be measured in, give no rows', () => {
    const edits = withEdit({}, practice[0].id, practice[0].detections3D[0].id, valuesIn(practice, { frameId: practice[0].id, objectId: practice[0].detections3D[0].id }), AT);
    expect(editCloseness(real[1], practice[0], edits, planted)).toEqual([]);
    const noPose: Frame = { ...practice[0], egoPose: undefined };
    expect(editCloseness(real[0], noPose, edits, planted)).toEqual([]);
  });
});
