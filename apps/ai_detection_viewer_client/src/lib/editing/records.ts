import type { Vec3 } from '@/lib/geometry/transforms';
import { sameBoxValues, type BoxValues } from './box';

/**
 * Edit records (F8): what the reviewer changed a box to.
 *
 * An edit is NOT a changed copy of the data. It is a separate note — "the box
 * of this object in this frame now has these seven numbers" — that the screen
 * lays over the dataset's own box (`overlay.ts`). Removing the note brings the
 * dataset's box back exactly. The dataset's values are not stored in the
 * record; they are read from the data whenever they are needed (the export).
 *
 * Like a review (F4), an edit belongs to one box in one frame: the key is the
 * pair (frame id, object id).
 */
export type BoxEdit = {
  /** Frame the box belongs to (`Frame.id`). */
  frameId: string;
  /** The object's id — the same value as `selectedObjectId` (Rule #2). */
  objectId: string;
  /** Centre in the GLOBAL frame [x, y, z], metres. */
  translation: Vec3;
  /** [width, length, height], metres — nuScenes order. */
  size: Vec3;
  /** Rotation about the global vertical axis, radians. */
  yaw: number;
  /** When the box was last changed, as an ISO-8601 string. */
  editedAt: string;
};

/** Edits of one scope, keyed by `editKey(frameId, objectId)`. */
export type EditMap = Record<string, BoxEdit>;

/**
 * Which data the edits belong to. Edits made on the practice set are edits of
 * deliberately modified boxes and must never be laid over the real
 * annotations, so each has its own map (the same split as the review scopes).
 */
export type EditScope = 'nuscenes' | 'nuscenes-practice';

export const EDIT_SCOPES: readonly EditScope[] = ['nuscenes', 'nuscenes-practice'];

export type EditsByScope = Record<EditScope, EditMap>;

export const createEmptyEdits = (): EditsByScope => ({ nuscenes: {}, 'nuscenes-practice': {} });

/** Key of one edit. The same form as a review's key, so the two line up box by box. */
export function editKey(frameId: string, objectId: string): string {
  return `${frameId}/${objectId}`;
}

export function getEdit(edits: EditMap, frameId: string, objectId: string): BoxEdit | undefined {
  return edits[editKey(frameId, objectId)];
}

/** The seven numbers of an edit record. */
export function valuesOfEdit(edit: BoxEdit): BoxValues {
  return { translation: edit.translation, size: edit.size, yaw: edit.yaw };
}

/*
 * The two functions below are the only way an EditMap changes. Each returns a
 * NEW map when something changed and the SAME map when nothing did, so the
 * store can tell "no-op" from "update" by identity and skip a needless save.
 */

/** Record that the box now has `values`. Storing the values it already has changes nothing. */
export function withEdit(
  edits: EditMap,
  frameId: string,
  objectId: string,
  values: BoxValues,
  editedAt: string,
): EditMap {
  const key = editKey(frameId, objectId);
  const prev = edits[key];
  if (prev && sameBoxValues(valuesOfEdit(prev), values, 0)) return edits;
  return {
    ...edits,
    [key]: {
      frameId,
      objectId,
      translation: [...values.translation] as Vec3,
      size: [...values.size] as Vec3,
      yaw: values.yaw,
      editedAt,
    },
  };
}

/** Forget the edit: the box is the dataset's again. */
export function withoutEdit(edits: EditMap, frameId: string, objectId: string): EditMap {
  const key = editKey(frameId, objectId);
  if (!(key in edits)) return edits;
  const next = { ...edits };
  delete next[key];
  return next;
}
