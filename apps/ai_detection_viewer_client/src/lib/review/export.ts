import type { Frame } from '@/lib/types';
import { summarizeProgress } from './progress';
import { getReview } from './records';
import type { RejectReason, ReviewMap, ReviewScope, Verdict } from './types';

/** Identifies the file format and its version, so a reader can tell what it got. */
export const REVIEW_EXPORT_FORMAT = 'ai-detection-viewer/review@1';

export type ReviewExportRow = {
  /** 1-based position of the frame in the sequence (what the timeline shows). */
  frameIndex: number;
  frameId: string;
  objectId: string;
  /** The dataset's own id of this box in this frame, when the data has one. */
  annotationToken: string | null;
  class: string;
  verdict: Verdict;
  reasons: RejectReason[];
  note: string;
  reviewedAt: string;
};

export type ReviewExport = {
  format: typeof REVIEW_EXPORT_FORMAT;
  exportedAt: string;
  dataset: 'nuscenes';
  /**
   * True when the verdicts were made on the practice set, whose boxes were
   * deliberately modified. Such a file says nothing about the real annotations
   * and must not be read as if it did (same spirit as Immutable Rule #6).
   */
  practice: boolean;
  summary: {
    totalBoxes: number;
    reviewed: number;
    approved: number;
    rejected: number;
    unsure: number;
  };
  reviews: ReviewExportRow[];
};

/**
 * Build the export document: one row per REVIEWED box, in frame order and then
 * in the frame's own box order (so two exports of the same state are identical
 * apart from `exportedAt`). Unreviewed boxes are not listed — `summary` says how
 * many there are. Records whose box is not in `frames` are left out, for the
 * same reason `countFrameReviews` ignores them.
 */
export function buildReviewExport(
  frames: Frame[],
  reviews: ReviewMap,
  options: { scope: ReviewScope; exportedAt: string },
): ReviewExport {
  const rows: ReviewExportRow[] = [];
  frames.forEach((frame, index) => {
    for (const box of frame.detections3D) {
      const record = getReview(reviews, frame.id, box.id);
      if (!record) continue;
      rows.push({
        frameIndex: index + 1,
        frameId: frame.id,
        objectId: box.id,
        annotationToken: box.annotation?.token ?? null,
        class: box.class,
        verdict: record.verdict,
        reasons: [...record.reasons],
        note: record.note,
        reviewedAt: record.reviewedAt,
      });
    }
  });

  const { overall } = summarizeProgress(frames, reviews);
  return {
    format: REVIEW_EXPORT_FORMAT,
    exportedAt: options.exportedAt,
    dataset: 'nuscenes',
    practice: options.scope === 'nuscenes-practice',
    summary: {
      totalBoxes: overall.total,
      reviewed: overall.reviewed,
      approved: overall.approved,
      rejected: overall.rejected,
      unsure: overall.unsure,
    },
    reviews: rows,
  };
}

const CSV_COLUMNS = [
  'frameIndex',
  'frameId',
  'objectId',
  'annotationToken',
  'class',
  'verdict',
  'reasons',
  'note',
  'reviewedAt',
] as const;

/**
 * One CSV cell. Quoted when it contains a comma, quote or line break (RFC 4180),
 * with inner quotes doubled.
 *
 * `guardFormula`: the note is free text typed by a person, and a spreadsheet
 * treats a cell starting with = + - @ as a formula. Such a note gets a leading
 * apostrophe so it opens as plain text instead of being executed.
 */
function csvCell(value: string, guardFormula = false): string {
  const text = guardFormula && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * The same rows as a CSV table (header + one line per reviewed box). Multiple
 * reasons share one cell, joined with ";". Lines end with CRLF, as RFC 4180
 * specifies and Excel expects.
 */
export function reviewExportToCsv(data: ReviewExport): string {
  const lines = [CSV_COLUMNS.join(',')];
  for (const row of data.reviews) {
    lines.push(
      [
        String(row.frameIndex),
        csvCell(row.frameId),
        csvCell(row.objectId),
        csvCell(row.annotationToken ?? ''),
        csvCell(row.class),
        row.verdict,
        csvCell(row.reasons.join(';')),
        csvCell(row.note, true),
        csvCell(row.reviewedAt),
      ].join(','),
    );
  }
  return `${lines.join('\r\n')}\r\n`;
}
