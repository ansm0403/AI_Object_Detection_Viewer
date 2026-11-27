import type { Vec3 } from '@/lib/geometry/transforms';
import { isValidBoxValues } from './box';
import {
  EDIT_SCOPES,
  createEmptyEdits,
  editKey,
  type BoxEdit,
  type EditMap,
  type EditsByScope,
} from './records';

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isVec3 = (value: unknown): value is Vec3 =>
  Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === 'number');

/**
 * One stored record → a valid `BoxEdit`, or `null` when it cannot be trusted.
 *
 * Unlike a review record there is nothing "soft" to repair here: every number
 * of an edit decides where a box is drawn, so a record with a missing, wrong
 * typed, non-finite or non-positive value is dropped whole — a half-valid box
 * drawn in the wrong place would be worse than no edit. Only the date is
 * blanked instead.
 */
function sanitizeEdit(value: unknown): BoxEdit | null {
  if (!isObject(value)) return null;
  const { frameId, objectId, translation, size, yaw } = value;
  if (typeof frameId !== 'string' || frameId === '') return null;
  if (typeof objectId !== 'string' || objectId === '') return null;
  if (!isVec3(translation) || !isVec3(size) || typeof yaw !== 'number') return null;
  if (!isValidBoxValues({ translation, size, yaw })) return null;
  return {
    frameId,
    objectId,
    translation: [translation[0], translation[1], translation[2]],
    size: [size[0], size[1], size[2]],
    yaw,
    editedAt: typeof value.editedAt === 'string' ? value.editedAt : '',
  };
}

/**
 * Turn whatever was read back from browser storage into a valid
 * `EditsByScope`.
 *
 * Stored data is OUTSIDE input (an older build, a hand edit, a truncated
 * write), so it is validated like a parsed file: invalid records are skipped
 * with one `console.warn`, never thrown on (Error Defaults). The map key is
 * rebuilt from the record's own ids instead of trusting the stored key.
 */
export function sanitizeEdits(value: unknown): EditsByScope {
  const result = createEmptyEdits();
  if (value === undefined || value === null) return result; // nothing stored yet
  if (!isObject(value)) {
    console.warn('[edit] Ignoring stored edits: not an object.');
    return result;
  }

  let dropped = 0;
  for (const scope of EDIT_SCOPES) {
    const stored = value[scope];
    if (stored === undefined) continue;
    if (!isObject(stored)) {
      dropped += 1;
      continue;
    }
    const map: EditMap = {};
    for (const raw of Object.values(stored)) {
      const record = sanitizeEdit(raw);
      if (record) map[editKey(record.frameId, record.objectId)] = record;
      else dropped += 1;
    }
    result[scope] = map;
  }

  if (dropped > 0) {
    console.warn(`[edit] Skipped ${dropped} invalid stored edit record(s).`);
  }
  return result;
}
