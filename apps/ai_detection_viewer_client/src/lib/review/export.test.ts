import { describe, expect, it } from 'vitest';
import { REVIEW_EXPORT_FORMAT, buildReviewExport, reviewExportToCsv } from './export';
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
