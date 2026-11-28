/**
 * Review data model (F4 — 3D box review).
 *
 * A REVIEW is one person's decision about one annotated 3D box: is the box
 * right? Boxes are drawn per frame, so the same object (same id) has a separate
 * box — and a separate review — in every frame it appears in. A review is
 * therefore identified by the pair (frame id, object id); see `reviewKey`.
 *
 * Nothing here knows about React or Zustand (Immutable Rule #3). The store keeps
 * the records; every derived number (progress, queue, export) is computed by the
 * pure functions in this folder.
 */

/**
 * The decision on a box.
 *  - `approved`: the box is right.
 *  - `rejected`: the box is wrong (see `RejectReason`).
 *  - `unsure`:   looked at it, but what is on screen cannot settle it — e.g.
 *                the photo shows too little of it and the box holds almost no
 *                LiDAR points. Counted as reviewed, and kept apart so it can
 *                be revisited: before F6 only the front camera existed, and
 *                the "Unsure first" order brings those boxes back now that
 *                every camera's photo can be checked.
 * A box with no record is simply "not reviewed" — that is not a verdict.
 */
export type Verdict = 'approved' | 'rejected' | 'unsure';

export const VERDICTS: readonly Verdict[] = ['approved', 'rejected', 'unsure'];

/** Why a box was rejected. More than one may apply to the same box. */
export type RejectReason =
  | 'wrong_class'
  | 'wrong_size'
  | 'wrong_position'
  | 'wrong_heading'
  | 'not_an_object'
  | 'other';

/**
 * All reasons, in display order. The order is part of the contract: the number
 * keys 1–6 toggle the reason at that position.
 */
export const REJECT_REASONS: readonly RejectReason[] = [
  'wrong_class',
  'wrong_size',
  'wrong_position',
  'wrong_heading',
  'not_an_object',
  'other',
];

/** Free-text notes are capped so a stored record stays small. */
export const NOTE_MAX_LENGTH = 200;

export type ReviewRecord = {
  /** Frame the box belongs to (`Frame.id`). */
  frameId: string;
  /** The object's id — the same value as `selectedObjectId` (Rule #2). */
  objectId: string;
  verdict: Verdict;
  /** Only meaningful while `verdict === 'rejected'`; empty otherwise. */
  reasons: RejectReason[];
  /** Optional note. Kept for `rejected` and `unsure`; empty for `approved`. */
  note: string;
  /** When the verdict was set, as an ISO-8601 string. */
  reviewedAt: string;
};

/** Records of one scope, keyed by `reviewKey(frameId, objectId)`. */
export type ReviewMap = Record<string, ReviewRecord>;

/**
 * Which data the records belong to. Practice-mode verdicts (boxes that were
 * deliberately modified) must never mix with verdicts on the real annotations,
 * so each scope has its own map.
 *
 * (F7.5) `nuscenes-false-alarms` holds verdicts on MODEL boxes, not on labels:
 * the sample check of the false alarms that have no label nearby
 * (`lib/sampling`). There the record's `objectId` is a prediction id and the
 * three verdicts read as a review of the model's box:
 *  - `approved`: the box is right — a real object is there, the dataset has no
 *                label for it;
 *  - `rejected`: the box is wrong — the model reported something that is not there;
 *  - `unsure`:   the photo cannot settle it.
 * Reasons and notes are not used in that scope. Nothing that reads the two
 * label scopes (progress, queue, `review@3` export) ever reads this one.
 */
export type ReviewScope = 'nuscenes' | 'nuscenes-practice' | 'nuscenes-false-alarms';

export const REVIEW_SCOPES: readonly ReviewScope[] = [
  'nuscenes',
  'nuscenes-practice',
  'nuscenes-false-alarms',
];

export type ReviewsByScope = Record<ReviewScope, ReviewMap>;

export const createEmptyReviews = (): ReviewsByScope => ({
  nuscenes: {},
  'nuscenes-practice': {},
  'nuscenes-false-alarms': {},
});
