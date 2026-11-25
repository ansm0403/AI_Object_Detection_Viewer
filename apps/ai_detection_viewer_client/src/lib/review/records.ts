import {
  NOTE_MAX_LENGTH,
  type RejectReason,
  type ReviewMap,
  type ReviewRecord,
  type Verdict,
} from './types';

/**
 * Key of one review: the box of `objectId` in frame `frameId`.
 *
 * The object id alone is not enough — on nuScenes it is the `instance` token,
 * shared by the same physical object in every frame, while each frame has its
 * own separately drawn box. Both parts are also stored inside the record, so
 * nothing ever needs to split a key back apart.
 */
export function reviewKey(frameId: string, objectId: string): string {
  return `${frameId}/${objectId}`;
}

export function getReview(
  reviews: ReviewMap,
  frameId: string,
  objectId: string,
): ReviewRecord | undefined {
  return reviews[reviewKey(frameId, objectId)];
}

/*
 * The functions below are the only way a ReviewMap changes. Each returns a NEW
 * map when something changed and the SAME map when nothing did, so callers (the
 * store) can tell "no-op" from "update" by identity and skip needless writes.
 */

/**
 * Set the verdict of a box.
 *
 * Pressing the same verdict again changes nothing (so a held key or a second
 * click is harmless). Switching verdicts keeps only what still makes sense:
 * reasons belong to a rejection, and a note belongs to a rejection or an
 * "unsure" — an approved box carries neither.
 */
export function withVerdict(
  reviews: ReviewMap,
  frameId: string,
  objectId: string,
  verdict: Verdict,
  reviewedAt: string,
): ReviewMap {
  const key = reviewKey(frameId, objectId);
  const prev = reviews[key];
  if (prev?.verdict === verdict) return reviews;
  const next: ReviewRecord = {
    frameId,
    objectId,
    verdict,
    reasons: verdict === 'rejected' ? (prev?.reasons ?? []) : [],
    note: verdict === 'approved' ? '' : (prev?.note ?? ''),
    reviewedAt,
  };
  return { ...reviews, [key]: next };
}

/** Add or remove one reject reason. Only a rejected box has reasons. */
export function withReasonToggled(
  reviews: ReviewMap,
  frameId: string,
  objectId: string,
  reason: RejectReason,
): ReviewMap {
  const key = reviewKey(frameId, objectId);
  const prev = reviews[key];
  if (!prev || prev.verdict !== 'rejected') return reviews;
  const reasons = prev.reasons.includes(reason)
    ? prev.reasons.filter((r) => r !== reason)
    : [...prev.reasons, reason];
  return { ...reviews, [key]: { ...prev, reasons } };
}

/** Set the note of a rejected / unsure box (trimmed to `NOTE_MAX_LENGTH`). */
export function withNote(
  reviews: ReviewMap,
  frameId: string,
  objectId: string,
  note: string,
): ReviewMap {
  const key = reviewKey(frameId, objectId);
  const prev = reviews[key];
  if (!prev || prev.verdict === 'approved') return reviews;
  const clipped = note.slice(0, NOTE_MAX_LENGTH);
  if (clipped === prev.note) return reviews;
  return { ...reviews, [key]: { ...prev, note: clipped } };
}

/** Remove a review: the box goes back to "not reviewed". */
export function withoutReview(
  reviews: ReviewMap,
  frameId: string,
  objectId: string,
): ReviewMap {
  const key = reviewKey(frameId, objectId);
  if (!(key in reviews)) return reviews;
  const rest = { ...reviews };
  delete rest[key];
  return rest;
}
