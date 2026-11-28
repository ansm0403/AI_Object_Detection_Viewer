import {
  boxChange,
  getEdit,
  labelValuesOf,
  valuesOfEdit,
  yawToQuat,
  type BoxValues,
  type EditMap,
} from '@/lib/editing';
import type { Frame } from '@/lib/types';
import { summarizeProgress } from './progress';
import { getReview } from './records';
import type { RejectReason, ReviewMap, ReviewScope, Verdict } from './types';

/** Identifies the file format and its version, so a reader can tell what it got. */
export const REVIEW_EXPORT_FORMAT = 'ai-detection-viewer/review@1';
/**
 * The document for data that is split into scenes: every row also names its
 * scene, `frameIndex` counts within that scene, and `scenes` lists what the
 * file covers.
 *
 * Versions: `review@2` (F7) added the scenes. `review@3` (F8) adds the box
 * EDITS: a row is now a box that has a verdict OR an edit, every row carries
 * `edit` (null, or what the box was changed from and to), `verdict` can be
 * null (edited but not judged), and the CSV gains columns. The app writes
 * `review@3` only; it never reads an export back.
 */
export const REVIEW_EXPORT_FORMAT_SCENES = 'ai-detection-viewer/review@3';

/**
 * (F8) A box in the dataset's own terms (nuScenes): centre in the global
 * frame, size as width / length / height, and the rotation both as the yaw
 * angle and as the quaternion nuScenes stores. Rounded to six decimals.
 */
export type ExportedBox = {
  /** Centre in the GLOBAL frame [x, y, z], metres. */
  translation: [number, number, number];
  /** [width, length, height], metres. */
  size: [number, number, number];
  /** Rotation about the global vertical axis, radians. */
  yaw: number;
  /** The same rotation as a quaternion [w, x, y, z]. */
  rotation: [number, number, number, number];
};

/**
 * (F8) What a reviewer changed a box to. `original` is the label the edit
 * was made on (the nuScenes annotation; in a practice file, the practice
 * set's box). `edited` is ONE reviewer's judgement — it is not a corrected
 * label and the file never calls it one.
 */
export type ExportedEdit = {
  original: ExportedBox;
  edited: ExportedBox;
  /** The difference, as the screen words it ("moved 0.54 m", "turned +6.0°"). */
  change: {
    /** How far the centre moved on the ground, metres. */
    movedMetres: number;
    /** How far the BOTTOM of the box went up (+) or down (−), metres. */
    liftMetres: number;
    /** Size change [width, length, height], metres. */
    sizeDelta: [number, number, number];
    /** Turn about the vertical axis, degrees; + = counter-clockwise seen from above. */
    turnedDegrees: number;
  };
  editedAt: string;
};

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
  /** (review@3) `null` = the box was edited but has no verdict. */
  verdict: Verdict | null;
  reasons: RejectReason[];
  note: string;
  /** (review@3) `null` together with `verdict`. */
  reviewedAt: string | null;
  /** (review@3) The edit of this box, or `null` when it was not edited. Absent in review@1. */
  edit?: ExportedEdit | null;
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
    /** (review@3) Boxes of the covered scenes that carry an edit. */
    edited?: number;
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

const round6 = (value: number) => Math.round(value * 1e6) / 1e6 || 0; // `|| 0`: no "-0" in a file

function exportedBox(values: BoxValues): ExportedBox {
  const [w, x, y, z] = yawToQuat(values.yaw);
  return {
    translation: [round6(values.translation[0]), round6(values.translation[1]), round6(values.translation[2])],
    size: [round6(values.size[0]), round6(values.size[1]), round6(values.size[2])],
    yaw: round6(values.yaw),
    rotation: [round6(w), round6(x), round6(y), round6(z)],
  };
}

/**
 * The edit of one box for the file, or `null` when the box has none. `frame`
 * must be the frame AS THE DATA HAS IT (not with the edits laid over): the
 * original is read from it.
 */
function exportedEdit(frame: Frame, objectId: string, edits: EditMap): ExportedEdit | null {
  const edit = getEdit(edits, frame.id, objectId);
  if (!edit) return null;
  const label = labelValuesOf(frame, objectId);
  if (!label) return null; // a frame without what a box is rebuilt from cannot have been edited
  const edited = valuesOfEdit(edit);
  const change = boxChange(label, edited);
  return {
    original: exportedBox(label),
    edited: exportedBox(edited),
    change: {
      movedMetres: round6(change.moved),
      liftMetres: round6(change.lift),
      sizeDelta: [round6(change.sizeDelta[0]), round6(change.sizeDelta[1]), round6(change.sizeDelta[2])],
      turnedDegrees: round6(change.turned),
    },
    editedAt: edit.editedAt,
  };
}

/**
 * The rows of one run of frames, frame order then box order.
 *
 * Without `edits` (review@1): reviewed boxes only. With `edits` (review@3): a
 * box that has a verdict OR an edit, and every row says which (`edit` is null
 * for a box that was only judged, `verdict` is null for one that was only
 * edited).
 */
function rowsOf(
  frames: readonly Frame[],
  reviews: ReviewMap,
  scene?: string,
  edits?: EditMap,
): ReviewExportRow[] {
  const rows: ReviewExportRow[] = [];
  frames.forEach((frame, index) => {
    for (const box of frame.detections3D) {
      const record = getReview(reviews, frame.id, box.id);
      const edit = edits ? exportedEdit(frame, box.id, edits) : null;
      if (!record && !edit) continue;
      rows.push({
        ...(scene !== undefined ? { scene } : {}),
        frameIndex: index + 1,
        frameId: frame.id,
        objectId: box.id,
        annotationToken: box.annotation?.token ?? null,
        class: box.class,
        verdict: record?.verdict ?? null,
        reasons: record ? [...record.reasons] : [],
        note: record?.note ?? '',
        reviewedAt: record?.reviewedAt ?? null,
        ...(edits ? { edit } : {}),
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
 *
 * (F8) `options.edits` are the box edits of the same scope. The frames passed
 * in must be the DATA's frames, not frames with the edits laid over: an edit's
 * `original` is read from them.
 */
export function buildSceneReviewExport(
  scenes: readonly { name: string; frames: readonly Frame[] }[],
  reviews: ReviewMap,
  options: { scope: ReviewScope; exportedAt: string; edits?: EditMap },
): ReviewExport {
  const edits = options.edits ?? {};
  const rows = scenes.flatMap((scene) => rowsOf(scene.frames, reviews, scene.name, edits));
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
      edited: rows.filter((row) => row.edit).length,
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

/** (review@3) What a row says about its edit. Empty cells when the box was not edited. */
const CSV_EDIT_COLUMNS = [
  'edited',
  'editedAt',
  'moved_m',
  'lift_m',
  'd_width_m',
  'd_length_m',
  'd_height_m',
  'turned_deg',
  'edited_x_m',
  'edited_y_m',
  'edited_z_m',
  'edited_width_m',
  'edited_length_m',
  'edited_height_m',
  'edited_yaw_rad',
] as const;

function csvEditCells(edit: ExportedEdit | null | undefined): string[] {
  if (!edit) return ['false', ...CSV_EDIT_COLUMNS.slice(1).map(() => '')];
  return [
    'true',
    csvCell(edit.editedAt),
    String(edit.change.movedMetres),
    String(edit.change.liftMetres),
    ...edit.change.sizeDelta.map(String),
    String(edit.change.turnedDegrees),
    ...edit.edited.translation.map(String),
    ...edit.edited.size.map(String),
    String(edit.edited.yaw),
  ];
}

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
 * (F7) A document with scenes gets a leading `scene` column; a review@1
 * document is written exactly as before.
 *
 * (F8) A document with scenes (review@3) also gets the edit columns at the
 * end: whether the box was edited, by how much, and the edited box's seven
 * numbers. A row without a verdict has empty `verdict` and `reviewedAt` cells.
 * The original box is in the JSON file only (the table would double in width).
 */
export function reviewExportToCsv(data: ReviewExport): string {
  const withScene = data.format === REVIEW_EXPORT_FORMAT_SCENES;
  const lines = [
    (withScene ? ['scene', ...CSV_COLUMNS, ...CSV_EDIT_COLUMNS] : CSV_COLUMNS).join(','),
  ];
  for (const row of data.reviews) {
    lines.push(
      [
        ...(withScene ? [csvCell(row.scene ?? '')] : []),
        String(row.frameIndex),
        csvCell(row.frameId),
        csvCell(row.objectId),
        csvCell(row.annotationToken ?? ''),
        csvCell(row.class),
        row.verdict ?? '',
        csvCell(row.reasons.join(';')),
        csvCell(row.note, true),
        csvCell(row.reviewedAt ?? ''),
        ...(withScene ? csvEditCells(row.edit) : []),
      ].join(','),
    );
  }
  return `${lines.join('\r\n')}\r\n`;
}
