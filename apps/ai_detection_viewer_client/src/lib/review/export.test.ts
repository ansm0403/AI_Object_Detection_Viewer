import { describe, expect, it } from 'vitest';
import { labelValuesOf, quatToYaw, withEdit, type BoxValues, type EditMap } from '@/lib/editing';
import { must, referenceFrames } from '@/lib/editing/test-helpers';
import { readReferenceFramesRaw } from '@/lib/nuscenes/test-helpers';
import {
  REVIEW_EXPORT_FORMAT,
  REVIEW_EXPORT_FORMAT_SCENES,
  buildReviewExport,
  buildSceneReviewExport,
  reviewExportFilename,
  reviewExportToCsv,
  reviewExportToJson,
} from './export';
import { withNote, withReasonToggled, withVerdict } from './records';
import { makeBox, makeFrame } from './test-helpers';
import type { ReviewMap } from './types';

const T1 = '2026-11-25T10:00:00.000Z';
const T2 = '2026-11-25T10:01:00.000Z';
const NOW = '2026-11-25T11:00:00.000Z';

const f1 = makeFrame('f1', [
  makeBox('a', { class: 'car', annotation: { token: 'ann-f1-a' } }),
  makeBox('b', { class: 'person', annotation: { token: 'ann-f1-b' } }),
  makeBox('c', { class: 'truck' }), // no annotation token (older sample file)
]);
const f2 = makeFrame('f2', [makeBox('a', { class: 'car', annotation: { token: 'ann-f2-a' } })]);
const frames = [f1, f2];

function sampleReviews(): ReviewMap {
  // Inserted out of order on purpose: the export must not depend on it.
  let map = withVerdict({}, 'f2', 'a', 'unsure', T2);
  map = withVerdict(map, 'f1', 'b', 'rejected', T1);
  map = withReasonToggled(map, 'f1', 'b', 'wrong_size');
  map = withReasonToggled(map, 'f1', 'b', 'wrong_position');
  map = withNote(map, 'f1', 'b', 'box is taller than the person');
  map = withVerdict(map, 'f1', 'a', 'approved', T1);
  return map;
}

describe('buildReviewExport', () => {
  it('writes the header fields', () => {
    const data = buildReviewExport(frames, {}, { scope: 'nuscenes', exportedAt: NOW });
    expect(data.format).toBe(REVIEW_EXPORT_FORMAT);
    expect(data.exportedAt).toBe(NOW);
    expect(data.dataset).toBe('nuscenes');
    expect(data.practice).toBe(false);
  });

  it('marks a practice-set export as such', () => {
    const data = buildReviewExport(frames, {}, { scope: 'nuscenes-practice', exportedAt: NOW });
    expect(data.practice).toBe(true);
  });

  it('lists reviewed boxes only, in frame order then box order', () => {
    const data = buildReviewExport(frames, sampleReviews(), { scope: 'nuscenes', exportedAt: NOW });
    expect(data.reviews.map((r) => `${r.frameIndex}:${r.objectId}`)).toEqual([
      '1:a',
      '1:b',
      '2:a',
    ]);
  });

  it('carries the box facts and the verdict details on each row', () => {
    const data = buildReviewExport(frames, sampleReviews(), { scope: 'nuscenes', exportedAt: NOW });
    expect(data.reviews[1]).toEqual({
      frameIndex: 1,
      frameId: 'f1',
      objectId: 'b',
      annotationToken: 'ann-f1-b',
      class: 'person',
      verdict: 'rejected',
      reasons: ['wrong_size', 'wrong_position'],
      note: 'box is taller than the person',
      reviewedAt: T1,
    });
  });

  it('uses the per-frame annotation token for the same object in another frame', () => {
    const data = buildReviewExport(frames, sampleReviews(), { scope: 'nuscenes', exportedAt: NOW });
    expect(data.reviews[0].annotationToken).toBe('ann-f1-a');
    expect(data.reviews[2].annotationToken).toBe('ann-f2-a');
  });

  it('writes null when the data has no annotation token', () => {
    const reviews = withVerdict({}, 'f1', 'c', 'approved', T1);
    const data = buildReviewExport(frames, reviews, { scope: 'nuscenes', exportedAt: NOW });
    expect(data.reviews[0].annotationToken).toBeNull();
  });

  it('summary matches the rows and counts every box in the data', () => {
    const data = buildReviewExport(frames, sampleReviews(), { scope: 'nuscenes', exportedAt: NOW });
    expect(data.summary).toEqual({
      totalBoxes: 4,
      reviewed: 3,
      approved: 1,
      rejected: 1,
      unsure: 1,
    });
    expect(data.reviews).toHaveLength(data.summary.reviewed);
  });

  it('leaves out records whose box is not in the data', () => {
    const reviews = withVerdict(sampleReviews(), 'f9', 'ghost', 'rejected', T1);
    const data = buildReviewExport(frames, reviews, { scope: 'nuscenes', exportedAt: NOW });
    expect(data.reviews).toHaveLength(3);
    expect(data.summary.reviewed).toBe(3);
  });

  it('copies the reasons, so editing the export cannot touch the store', () => {
    const reviews = sampleReviews();
    const data = buildReviewExport(frames, reviews, { scope: 'nuscenes', exportedAt: NOW });
    data.reviews[1].reasons.push('other');
    expect(reviews['f1/b'].reasons).toEqual(['wrong_size', 'wrong_position']);
  });
});

describe('reviewExportFilename', () => {
  // Local-time constructor, so the expectation holds in any time zone.
  const at = new Date(2026, 10, 25, 9, 5); // 2026-11-25 09:05 local

  it('names the file by scope, local date-time and type', () => {
    expect(reviewExportFilename('nuscenes', at, 'json')).toBe('review_nuscenes_20261125-0905.json');
    expect(reviewExportFilename('nuscenes', at, 'csv')).toBe('review_nuscenes_20261125-0905.csv');
  });

  it('makes a practice-set export recognisable from its name', () => {
    expect(reviewExportFilename('nuscenes-practice', at, 'json')).toBe(
      'review_nuscenes-practice_20261125-0905.json',
    );
  });
});

describe('reviewExportToJson', () => {
  it('round-trips through JSON.parse and ends with a newline', () => {
    const data = buildReviewExport(frames, sampleReviews(), { scope: 'nuscenes', exportedAt: NOW });
    const text = reviewExportToJson(data);
    expect(text.endsWith('\n')).toBe(true);
    expect(JSON.parse(text)).toEqual(data);
  });
});

describe('reviewExportToCsv', () => {
  const lines = (csv: string) => csv.split('\r\n');

  it('writes a header and one CRLF-terminated line per reviewed box', () => {
    const data = buildReviewExport(frames, sampleReviews(), { scope: 'nuscenes', exportedAt: NOW });
    const csv = reviewExportToCsv(data);
    expect(csv.endsWith('\r\n')).toBe(true);
    const rows = lines(csv);
    expect(rows[0]).toBe(
      'frameIndex,frameId,objectId,annotationToken,class,verdict,reasons,note,reviewedAt',
    );
    expect(rows).toHaveLength(1 + 3 + 1); // header + rows + the empty tail after the last CRLF
  });

  it('joins several reasons with ";" inside one cell', () => {
    const data = buildReviewExport(frames, sampleReviews(), { scope: 'nuscenes', exportedAt: NOW });
    expect(lines(reviewExportToCsv(data))[2]).toBe(
      `1,f1,b,ann-f1-b,person,rejected,wrong_size;wrong_position,box is taller than the person,${T1}`,
    );
  });

  it('writes only the header when nothing is reviewed', () => {
    const data = buildReviewExport(frames, {}, { scope: 'nuscenes', exportedAt: NOW });
    expect(lines(reviewExportToCsv(data))).toHaveLength(2);
  });

  it('quotes a note containing commas, quotes or line breaks', () => {
    let reviews = withVerdict({}, 'f1', 'a', 'rejected', T1);
    reviews = withNote(reviews, 'f1', 'a', 'too "wide", see\nframe 2');
    const csv = reviewExportToCsv(
      buildReviewExport(frames, reviews, { scope: 'nuscenes', exportedAt: NOW }),
    );
    expect(csv).toContain('"too ""wide"", see\nframe 2"');
  });

  it('neutralises a note that a spreadsheet would run as a formula', () => {
    for (const note of ['=SUM(A1:A9)', '+1', '-1', '@cmd']) {
      let reviews = withVerdict({}, 'f1', 'a', 'rejected', T1);
      reviews = withNote(reviews, 'f1', 'a', note);
      const csv = reviewExportToCsv(
        buildReviewExport(frames, reviews, { scope: 'nuscenes', exportedAt: NOW }),
      );
      expect(csv).toContain(`,'${note},`);
    }
  });
});

describe('buildSceneReviewExport (F7: data split into scenes)', () => {
  // Two scenes. The second scene's first frame is frame 1 OF THAT SCENE.
  const g1 = makeFrame('g1', [makeBox('x', { class: 'bus', annotation: { token: 'ann-g1-x' } })]);
  const scenes = [
    { name: 'scene-0061', frames },
    { name: 'scene-0103', frames: [g1] },
  ];
  const reviews = () => withVerdict(sampleReviews(), 'g1', 'x', 'approved', T2);

  it('names the format, the scenes it covers, and whether it is a practice set', () => {
    const data = buildSceneReviewExport(scenes, {}, { scope: 'nuscenes', exportedAt: NOW });
    expect(data.format).toBe(REVIEW_EXPORT_FORMAT_SCENES);
    expect(data.scenes).toEqual(['scene-0061', 'scene-0103']);
    expect(data.practice).toBe(false);
    expect(buildSceneReviewExport(scenes, {}, { scope: 'nuscenes-practice', exportedAt: NOW }).practice).toBe(true);
  });

  it('lists the records scene by scene, with the frame index counted within the scene', () => {
    const data = buildSceneReviewExport(scenes, reviews(), { scope: 'nuscenes', exportedAt: NOW });
    expect(data.reviews.map((r) => [r.scene, r.frameIndex, r.frameId, r.objectId])).toEqual([
      ['scene-0061', 1, 'f1', 'a'],
      ['scene-0061', 1, 'f1', 'b'],
      ['scene-0061', 2, 'f2', 'a'],
      ['scene-0103', 1, 'g1', 'x'],
    ]);
  });

  it('the summary counts every box of the scenes given', () => {
    const data = buildSceneReviewExport(scenes, reviews(), { scope: 'nuscenes', exportedAt: NOW });
    expect(data.summary).toEqual({
      totalBoxes: 5,
      reviewed: 4,
      approved: 2,
      rejected: 1,
      unsure: 1,
      edited: 0,
    });
  });

  it('covers only the scenes it is given: a record of another scene is left out', () => {
    const data = buildSceneReviewExport([scenes[0]], reviews(), { scope: 'nuscenes', exportedAt: NOW });
    expect(data.scenes).toEqual(['scene-0061']);
    expect(data.reviews.some((r) => r.frameId === 'g1')).toBe(false);
    expect(data.summary.totalBoxes).toBe(4);
  });

  it('for one scene the rows are those of the plain export, plus the scene name', () => {
    const plain = buildReviewExport(frames, sampleReviews(), { scope: 'nuscenes', exportedAt: NOW });
    const split = buildSceneReviewExport([scenes[0]], sampleReviews(), { scope: 'nuscenes', exportedAt: NOW });
    // (review@3) … and `edit: null`: none of these boxes was edited.
    expect(split.reviews).toEqual(
      plain.reviews.map((row) => ({ scene: 'scene-0061', ...row, edit: null })),
    );
    expect(split.summary).toEqual({ ...plain.summary, edited: 0 });
  });

  it('no scenes → an empty, valid document', () => {
    const data = buildSceneReviewExport([], reviews(), { scope: 'nuscenes', exportedAt: NOW });
    expect(data.scenes).toEqual([]);
    expect(data.reviews).toEqual([]);
    expect(data.summary.totalBoxes).toBe(0);
  });

  it('the CSV gets a leading scene column; the plain export keeps its header', () => {
    const csv = reviewExportToCsv(
      buildSceneReviewExport(scenes, reviews(), { scope: 'nuscenes', exportedAt: NOW }),
    ).split('\r\n');
    expect(csv[0]).toBe(
      'scene,frameIndex,frameId,objectId,annotationToken,class,verdict,reasons,note,reviewedAt,' +
        'edited,editedAt,moved_m,lift_m,d_width_m,d_length_m,d_height_m,turned_deg,' +
        'edited_x_m,edited_y_m,edited_z_m,edited_width_m,edited_length_m,edited_height_m,edited_yaw_rad',
    );
    expect(csv[1].startsWith('scene-0061,1,f1,a,ann-f1-a,car,approved,')).toBe(true);
    expect(csv[4].startsWith('scene-0103,1,g1,x,ann-g1-x,bus,approved,')).toBe(true);
    const plain = reviewExportToCsv(
      buildReviewExport(frames, sampleReviews(), { scope: 'nuscenes', exportedAt: NOW }),
    ).split('\r\n');
    expect(plain[0]).toBe('frameIndex,frameId,objectId,annotationToken,class,verdict,reasons,note,reviewedAt');
  });
});

describe('review@3: box edits in the export (F8)', () => {
  // Real frames (scene-0916, first ten): an edit's `original` is rebuilt from
  // the frame's box and its ego pose, so placeholders would not do.
  const real = referenceFrames();
  const scene = [{ name: 'scene-0916', frames: real }];
  const frame = real[5];
  const [boxA, boxB, boxC] = frame.detections3D;
  const labelA = must(labelValuesOf(frame, boxA.id), 'label of box A');
  const labelB = must(labelValuesOf(frame, boxB.id), 'label of box B');
  const E1 = '2026-11-27T12:00:00.000Z';

  /** Box A: 0.3 m east, 0.4 m north, 0.35 m longer, turned +6° — height and bottom untouched. */
  const editedA: BoxValues = {
    translation: [labelA.translation[0] + 0.3, labelA.translation[1] + 0.4, labelA.translation[2]],
    size: [labelA.size[0], labelA.size[1] + 0.35, labelA.size[2]],
    yaw: labelA.yaw + (6 * Math.PI) / 180,
  };
  /** Box B: 0.5 m taller with the BOTTOM kept (the centre rises by half of it). */
  const editedB: BoxValues = {
    translation: [labelB.translation[0], labelB.translation[1], labelB.translation[2] + 0.25],
    size: [labelB.size[0], labelB.size[1], labelB.size[2] + 0.5],
    yaw: labelB.yaw,
  };
  const edits = (): EditMap =>
    withEdit(withEdit({}, frame.id, boxA.id, editedA, E1), frame.id, boxB.id, editedB, E1);
  const build = (reviews: ReviewMap, editMap: EditMap) =>
    buildSceneReviewExport(scene, reviews, { scope: 'nuscenes', exportedAt: NOW, edits: editMap });
  const rowOf = (data: ReturnType<typeof build>, objectId: string) =>
    must(data.reviews.find((r) => r.frameId === frame.id && r.objectId === objectId), `row of ${objectId}`);

  it('names the new version', () => {
    expect(build({}, {}).format).toBe('ai-detection-viewer/review@3');
    expect(REVIEW_EXPORT_FORMAT_SCENES).toBe('ai-detection-viewer/review@3');
  });

  it('a row is a box with a verdict OR an edit; each row says which', () => {
    // A: edited and rejected. B: edited only. C: approved only.
    let reviews = withVerdict({}, frame.id, boxA.id, 'rejected', T1);
    reviews = withReasonToggled(reviews, frame.id, boxA.id, 'wrong_position');
    reviews = withVerdict(reviews, frame.id, boxC.id, 'approved', T2);
    const data = build(reviews, edits());
    expect(data.reviews.map((r) => r.objectId)).toEqual([boxA.id, boxB.id, boxC.id]);

    const a = rowOf(data, boxA.id);
    expect(a.verdict).toBe('rejected');
    expect(a.reasons).toEqual(['wrong_position']);
    expect(a.edit).not.toBeNull();

    const b = rowOf(data, boxB.id);
    expect(b.verdict).toBeNull(); // edited, never judged: an edit does not set a verdict
    expect(b.reasons).toEqual([]);
    expect(b.note).toBe('');
    expect(b.reviewedAt).toBeNull();
    expect(b.edit).not.toBeNull();

    const c = rowOf(data, boxC.id);
    expect(c.verdict).toBe('approved');
    expect(c.edit).toBeNull();
  });

  it('the summary counts the edited boxes next to the verdicts', () => {
    const reviews = withVerdict({}, frame.id, boxA.id, 'rejected', T1);
    const data = build(reviews, edits());
    expect(data.summary.edited).toBe(2);
    expect(data.summary.reviewed).toBe(1);
    expect(data.summary.rejected).toBe(1);
  });

  it('says what changed, in the numbers the screen shows', () => {
    const { change } = must(rowOf(build({}, edits()), boxA.id).edit, 'edit of A');
    expect(change.movedMetres).toBeCloseTo(0.5, 6); // 0.3 and 0.4 → "moved 0.50 m"
    expect(change.sizeDelta).toEqual([0, 0.35, 0]); // [width, length, height] → "length +0.35 m"
    expect(change.turnedDegrees).toBeCloseTo(6, 6); // "turned +6.0°"
    expect(change.liftMetres).toBe(0);
  });

  it('a taller box whose bottom was kept has lift 0, although its centre rose', () => {
    const edit = must(rowOf(build({}, edits()), boxB.id).edit, 'edit of B');
    expect(edit.change.sizeDelta).toEqual([0, 0, 0.5]);
    expect(edit.change.liftMetres).toBe(0);
    expect(edit.change.movedMetres).toBe(0);
    expect(edit.edited.translation[2] - edit.original.translation[2]).toBeCloseTo(0.25, 6);
  });

  it('carries the original box and the edited box in nuScenes terms', () => {
    const edit = must(rowOf(build({}, edits()), boxA.id).edit, 'edit of A');
    expect(edit.editedAt).toBe(E1);
    expect(edit.edited.translation[0]).toBeCloseTo(editedA.translation[0], 6);
    expect(edit.edited.size[1]).toBeCloseTo(editedA.size[1], 6);
    expect(edit.edited.yaw).toBeCloseTo(editedA.yaw, 6);
    // the quaternion is the yaw about the vertical axis, [w, x, y, z]
    expect(edit.edited.rotation[0]).toBeCloseTo(Math.cos(editedA.yaw / 2), 6);
    expect(edit.edited.rotation[1]).toBe(0);
    expect(edit.edited.rotation[2]).toBe(0);
    expect(edit.edited.rotation[3]).toBeCloseTo(Math.sin(editedA.yaw / 2), 6);
  });

  it('the original in the file is the number in the nuScenes sample file (six decimals)', () => {
    // Read the annotation straight from the shipped file — not through the app's parser.
    const raw = readReferenceFramesRaw() as unknown as {
      frames: { token: string; annotations: { instanceToken: string; translation: number[]; size: number[]; rotation: [number, number, number, number] }[] }[];
    };
    const rawFrame = must(raw.frames.find((f) => f.token === frame.id), 'raw frame');
    const data = build({}, edits());
    for (const id of [boxA.id, boxB.id]) {
      const ann = must(rawFrame.annotations.find((a) => a.instanceToken === id), 'raw annotation');
      const { original } = must(rowOf(data, id).edit, 'edit');
      for (let i = 0; i < 3; i += 1) {
        expect(Math.abs(original.translation[i] - ann.translation[i])).toBeLessThan(1e-6);
        expect(Math.abs(original.size[i] - ann.size[i])).toBeLessThan(1e-6);
      }
      expect(Math.abs(original.yaw - quatToYaw(ann.rotation))).toBeLessThan(1e-6);
    }
  });

  it('writes at most six decimals and never "-0"', () => {
    const text = reviewExportToJson(build({}, edits()));
    expect(/\d\.\d{7,}/.test(text)).toBe(false);
    expect(text.includes('-0,') || text.includes('-0\n')).toBe(false);
  });

  it('leaves out an edit whose box is not in the frames (another scene, or stale)', () => {
    const stray = withEdit(edits(), 'no-such-frame', boxA.id, editedA, E1);
    const withStaleBox = withEdit(stray, frame.id, 'no-such-object', editedA, E1);
    const data = build({}, withStaleBox);
    expect(data.summary.edited).toBe(2);
    expect(data.reviews).toHaveLength(2);
  });

  it('a frame a box cannot be rebuilt in (no ego pose) has no edits: a stored edit for it is ignored', () => {
    const data = buildSceneReviewExport(
      [{ name: 'scene-x', frames }],
      withVerdict({}, 'f1', 'a', 'approved', T1),
      { scope: 'nuscenes', exportedAt: NOW, edits: withEdit(withEdit({}, 'f1', 'a', editedA, E1), 'f1', 'b', editedA, E1) },
    );
    expect(data.reviews.map((r) => [r.objectId, r.verdict, r.edit])).toEqual([['a', 'approved', null]]);
    expect(data.summary.edited).toBe(0);
  });

  it('is the same document for the same state (rows in frame order, then box order)', () => {
    const one = build(withVerdict({}, frame.id, boxC.id, 'approved', T2), edits());
    const reversed = withEdit(withEdit({}, frame.id, boxB.id, editedB, E1), frame.id, boxA.id, editedA, E1);
    const two = build(withVerdict({}, frame.id, boxC.id, 'approved', T2), reversed);
    expect(two).toEqual(one);
  });

  it('a practice file is flagged; its "original" is the practice set box it was given', () => {
    const data = buildSceneReviewExport(scene, {}, { scope: 'nuscenes-practice', exportedAt: NOW, edits: edits() });
    expect(data.practice).toBe(true);
    expect(data.summary.edited).toBe(2);
  });

  it('CSV: edit columns at the end; empty verdict cells for a box that was only edited', () => {
    const reviews = withVerdict({}, frame.id, boxC.id, 'approved', T2);
    const lines = reviewExportToCsv(build(reviews, edits())).trimEnd().split('\r\n');
    const header = lines[0].split(',');
    expect(header.slice(0, 2)).toEqual(['scene', 'frameIndex']);
    expect(header.slice(-15)).toEqual([
      'edited', 'editedAt', 'moved_m', 'lift_m', 'd_width_m', 'd_length_m', 'd_height_m', 'turned_deg',
      'edited_x_m', 'edited_y_m', 'edited_z_m', 'edited_width_m', 'edited_length_m', 'edited_height_m', 'edited_yaw_rad',
    ]);
    // every line has the same number of cells (no cell here contains a comma)
    for (const line of lines) expect(line.split(',')).toHaveLength(header.length);

    const cells = (objectId: string) => {
      const line = must(lines.find((l) => l.includes(objectId)), `line of ${objectId}`).split(',');
      return Object.fromEntries(header.map((name, i) => [name, line[i]]));
    };
    const a = cells(boxA.id);
    expect(a.verdict).toBe('');
    expect(a.reviewedAt).toBe('');
    expect(a.edited).toBe('true');
    expect(a.editedAt).toBe(E1);
    expect(Number(a.moved_m)).toBeCloseTo(0.5, 6);
    expect(Number(a.d_length_m)).toBeCloseTo(0.35, 6);
    expect(Number(a.turned_deg)).toBeCloseTo(6, 6);
    expect(Number(a.edited_x_m)).toBeCloseTo(editedA.translation[0], 6);
    expect(Number(a.edited_yaw_rad)).toBeCloseTo(editedA.yaw, 6);

    const c = cells(boxC.id);
    expect(c.verdict).toBe('approved');
    expect(c.edited).toBe('false');
    expect(c.moved_m).toBe('');
    expect(c.edited_yaw_rad).toBe('');
  });

  it('the plain review@1 document is untouched: no edit field, no edit columns', () => {
    const plain = buildReviewExport(frames, sampleReviews(), { scope: 'nuscenes', exportedAt: NOW });
    expect(plain.reviews.every((row) => !('edit' in row))).toBe(true);
    expect('edited' in plain.summary).toBe(false);
    expect(reviewExportToCsv(plain).split('\r\n')[0]).toBe(
      'frameIndex,frameId,objectId,annotationToken,class,verdict,reasons,note,reviewedAt',
    );
  });
});
