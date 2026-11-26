import type { Frame } from '@/lib/types';
import { summarizeProgress } from './progress';
import { getReview } from './records';
import type { RejectReason, ReviewMap, ReviewScope, Verdict } from './types';

/** Identifies the file format and its version, so a reader can tell what it got. */
export const REVIEW_EXPORT_FORMAT = 'ai-detection-viewer/review@1';
/**
 * (F7) The same document for data that is split into scenes: every row also
 * names its scene, `frameIndex` counts within that scene, and `scenes` lists
 * what the file covers. A new version because the CSV gains a column.
 */
export const REVIEW_EXPORT_FORMAT_SCENES = 'ai-detection-viewer/review@2';

export type ReviewExportRow = {
  /** (review@2) The scene the frame belongs to, e.g. "scene-0916". */
  scene?: string;
  /** 1-based position of the frame in the sequence — within its scene, when
   *  the data has scenes (what the timeline shows). */
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
  format: typeof REVIEW_EXPORT_FORMAT | typeof REVIEW_EXPORT_FORMAT_SCENES;
  exportedAt: string;
  dataset: 'nuscenes';
  /**
   * (review@2) The scenes this file covers, in order. `summary.totalBoxes`
   * counts the boxes of exactly these scenes — a scene that was not loaded when
   * the file was written is not in the list, and its records are not in the file.
   */
  scenes?: string[];
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
  const rows = rowsOf(frames, reviews);
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

/** The rows of one run of frames: reviewed boxes only, frame order then box order. */
function rowsOf(frames: readonly Frame[], reviews: ReviewMap, scene?: string): ReviewExportRow[] {
  const rows: ReviewExportRow[] = [];
  frames.forEach((frame, index) => {
    for (const box of frame.detections3D) {
      const record = getReview(reviews, frame.id, box.id);
      if (!record) continue;
      rows.push({
        ...(scene !== undefined ? { scene } : {}),
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
  return rows;
}

/**
 * (F7) The export document for data split into scenes: the records of every
 * given scene, scene by scene in the given order. Each row names its scene and
 * its frame's position WITHIN that scene; the summary counts all given scenes.
 *
 * Only the scenes passed in are covered — the caller passes the ones it has in
 * memory, and `scenes` in the file says which those were.
 */
export function buildSceneReviewExport(
  scenes: readonly { name: string; frames: readonly Frame[] }[],
  reviews: ReviewMap,
  options: { scope: ReviewScope; exportedAt: string },
): ReviewExport {
  const rows = scenes.flatMap((scene) => rowsOf(scene.frames, reviews, scene.name));
  const { overall } = summarizeProgress(
    scenes.flatMap((scene) => scene.frames),
    reviews,
  );
  return {
    format: REVIEW_EXPORT_FORMAT_SCENES,
    exportedAt: options.exportedAt,
    dataset: 'nuscenes',
    scenes: scenes.map((scene) => scene.name),
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

export type ReviewExportFileType = 'json' | 'csv';

/**
 * File name for a download, e.g. `review_nuscenes_20261125-2045.json`
 * (`review_nuscenes-practice_…` for the practice set, so the two can never be
 * mistaken for each other in a folder). The time is the LOCAL wall-clock time —
 * a file name is read by a person; the exact instant is inside the file as
 * `exportedAt`.
 */
export function reviewExportFilename(
  scope: ReviewScope,
  at: Date,
  type: ReviewExportFileType,
): string {
  const two = (n: number) => String(n).padStart(2, '0');
  const stamp =
    `${at.getFullYear()}${two(at.getMonth() + 1)}${two(at.getDate())}` +
    `-${two(at.getHours())}${two(at.getMinutes())}`;
  return `review_${scope}_${stamp}.${type}`;
}

/** The export document as the text of a `.json` file (indented, newline-ended). */
export function reviewExportToJson(data: ReviewExport): string {
  return `${JSON.stringify(data, null, 2)}\n`;
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
 *
 * (F7) A document with scenes (review@2) gets a leading `scene` column; a
 * review@1 document is written exactly as before.
 */
export function reviewExportToCsv(data: ReviewExport): string {
  const withScene = data.format === REVIEW_EXPORT_FORMAT_SCENES;
  const lines = [(withScene ? ['scene', ...CSV_COLUMNS] : CSV_COLUMNS).join(',')];
  for (const row of data.reviews) {
    lines.push(
      [
        ...(withScene ? [csvCell(row.scene ?? '')] : []),
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
