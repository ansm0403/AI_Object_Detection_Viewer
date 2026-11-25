/**
 * Short, readable form of an object id for dense UI (the object list).
 * (F3, decision 7)
 *
 * nuScenes ids are 32-character instance tokens (hex). They are stable for the
 * same physical object across frames (tracking), so their first few characters
 * are enough to recognise "the same object as before". COCO ids
 * (`imageId-annotationId`, e.g. `1-3`) are already short and are returned as is.
 *
 * Display only: the real id (Immutable Rule #1) is never changed, and callers
 * should expose the full id somewhere (e.g. a tooltip, the details panel).
 *
 * Collision check (2026-11-25): the 6-character prefixes of all 73 instance
 * tokens in the bundled nuScenes sample are unique, so two rows in one frame
 * never show the same short id with this data. A larger dataset could collide;
 * the full id stays available in the tooltip and the details panel.
 */
export const DISPLAY_ID_LENGTH = 6;

// Ids at most this long are shown in full (shortening them would gain nothing).
const SHOW_FULL_MAX = DISPLAY_ID_LENGTH + 2;

export function displayId(id: string): string {
  return id.length <= SHOW_FULL_MAX ? id : id.slice(0, DISPLAY_ID_LENGTH);
}
