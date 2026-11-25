import { reviewKey } from './records';
import {
  NOTE_MAX_LENGTH,
  REJECT_REASONS,
  REVIEW_SCOPES,
  VERDICTS,
  createEmptyReviews,
  type RejectReason,
  type ReviewMap,
  type ReviewRecord,
  type ReviewsByScope,
  type Verdict,
} from './types';

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * One stored record → a valid `ReviewRecord`, or `null` when it cannot be
 * trusted. A record is dropped when the fields that identify it or decide its
 * meaning are wrong (ids, verdict); softer fields are repaired instead
 * (unknown reasons removed, an over-long note clipped, a missing date blanked).
 */
function sanitizeRecord(value: unknown): ReviewRecord | null {
  if (!isObject(value)) return null;
  const { frameId, objectId, verdict } = value;
  if (typeof frameId !== 'string' || frameId === '') return null;
  if (typeof objectId !== 'string' || objectId === '') return null;
  if (typeof verdict !== 'string' || !VERDICTS.includes(verdict as Verdict)) return null;

  const rawReasons = Array.isArray(value.reasons) ? value.reasons : [];
  // Keep known reasons once each, in the canonical order.
  const reasons =
    verdict === 'rejected'
      ? REJECT_REASONS.filter((reason) => rawReasons.includes(reason))
      : ([] as RejectReason[]);
  const note =
    verdict !== 'approved' && typeof value.note === 'string'
      ? value.note.slice(0, NOTE_MAX_LENGTH)
      : '';
  const reviewedAt = typeof value.reviewedAt === 'string' ? value.reviewedAt : '';

  return { frameId, objectId, verdict: verdict as Verdict, reasons, note, reviewedAt };
}

/**
 * Turn whatever was read back from browser storage into a valid
 * `ReviewsByScope`.
 *
 * Stored data is OUTSIDE input: an older build may have written a different
 * shape, the user (or an extension) may have edited it, or it may be truncated.
 * So it is validated like any parsed file — invalid records are skipped with
 * one `console.warn`, never thrown on (Error Defaults). The map key is rebuilt
 * from the record's own ids instead of trusting the stored key.
 */
export function sanitizeReviews(value: unknown): ReviewsByScope {
  const result = createEmptyReviews();
  if (value === undefined || value === null) return result; // nothing stored yet
  if (!isObject(value)) {
    console.warn('[review] Ignoring stored reviews: not an object.');
    return result;
  }

  let dropped = 0;
  for (const scope of REVIEW_SCOPES) {
    const stored = value[scope];
    if (stored === undefined) continue;
    if (!isObject(stored)) {
      dropped += 1;
      continue;
    }
    const map: ReviewMap = {};
    for (const raw of Object.values(stored)) {
      const record = sanitizeRecord(raw);
      if (record) map[reviewKey(record.frameId, record.objectId)] = record;
      else dropped += 1;
    }
    result[scope] = map;
  }

  if (dropped > 0) {
    console.warn(`[review] Skipped ${dropped} invalid stored review record(s).`);
  }
  return result;
}
