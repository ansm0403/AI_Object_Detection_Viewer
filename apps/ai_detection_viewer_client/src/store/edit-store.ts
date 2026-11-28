import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  createEmptyEdits,
  sanitizeEdits,
  withEdit,
  withoutEdit,
  type BoxValues,
  type EditMap,
  type EditScope,
  type EditsByScope,
} from '@/lib/editing';
import { createSafeStorage, type StorageBackend } from './review-store';

/**
 * Box edits (F8), kept apart from the review records.
 *
 * Why a third store, with its OWN storage key, instead of another field of the
 * review store:
 *  - An edit is a different thing from a verdict (seven numbers, no verdict),
 *    and the review store's loader drops any record without a verdict.
 *  - The review store rewrites its whole stored value on every change. A tab
 *    still running an older build knows nothing about edits and would write
 *    the value back WITHOUT them. With a separate key, older code never
 *    touches the edits, and this store never touches the reviews: the records
 *    already in a user's browser cannot be damaged by it.
 *
 * Like the review store it has NO notion of "the box being edited": every
 * action is told which box (the page derives it from `selectedFrameId` +
 * `selectedObjectId`, the single source of selection — Immutable Rule #2), and
 * the transitions themselves are pure functions in `lib/editing` (Rule #3).
 *
 * What is NOT here: the box while it is being dragged, and the undo history.
 * Those belong to one editing session on screen and are not saved (a drag is
 * stored once, when it ends — not on every mouse move).
 */

/** localStorage key. Bump `STORAGE_VERSION`, not the key, when the shape changes. */
export const EDIT_STORAGE_KEY = 'ai-detection-viewer.box-edits';
const STORAGE_VERSION = 1;

type EditState = {
  edits: EditsByScope;
  /**
   * True while reading from or writing to browser storage is failing. Edits
   * still work for this visit; the UI says they will not survive a reload.
   * Goes back to false after the next save that succeeds.
   */
  storageFailed: boolean;
};

type EditActions = {
  /** The box now has these values. `now` is injectable so tests get a fixed timestamp. */
  setEdit: (
    scope: EditScope,
    frameId: string,
    objectId: string,
    values: BoxValues,
    now?: Date,
  ) => void;
  /** Forget the edit: the box is the dataset's again. */
  removeEdit: (scope: EditScope, frameId: string, objectId: string) => void;
  /** Delete every edit of one scope (the other scope is untouched). */
  resetScope: (scope: EditScope) => void;
};

export type EditStore = EditState & EditActions;

export const createInitialEditState = (): EditState => ({
  edits: createEmptyEdits(),
  storageFailed: false,
});

/** The browser's localStorage, or `undefined` when there is no window (server render). */
const browserBackend: StorageBackend = () =>
  typeof window === 'undefined' ? undefined : window.localStorage;

/**
 * Build an edit store on top of `backend`. The app uses the one instance
 * below; tests build their own with an in-memory backend.
 */
export function createEditStore(backend: StorageBackend = browserBackend) {
  // Apply a pure map transition to one scope. Returning the same state object
  // when nothing changed lets zustand skip notifying subscribers (and saving).
  const inScope = (
    state: EditStore,
    scope: EditScope,
    change: (map: EditMap) => EditMap,
  ): EditStore | Pick<EditStore, 'edits'> => {
    const prev = state.edits[scope];
    const next = change(prev);
    return next === prev ? state : { edits: { ...state.edits, [scope]: next } };
  };

  const store = create<EditStore>()(
    persist(
      (set) => ({
        ...createInitialEditState(),
        setEdit: (scope, frameId, objectId, values, now = new Date()) =>
          set((state) =>
            inScope(state, scope, (map) =>
              withEdit(map, frameId, objectId, values, now.toISOString()),
            ),
          ),
        removeEdit: (scope, frameId, objectId) =>
          set((state) => inScope(state, scope, (map) => withoutEdit(map, frameId, objectId))),
        resetScope: (scope) =>
          set((state) =>
            inScope(state, scope, (map) => (Object.keys(map).length === 0 ? map : {})),
          ),
      }),
      {
        name: EDIT_STORAGE_KEY,
        version: STORAGE_VERSION,
        storage: createJSONStorage(() =>
          createSafeStorage(
            backend,
            () => {
              // Guarded: setState itself triggers another save attempt, which
              // would fail again and loop without this check.
              if (!store.getState().storageFailed) store.setState({ storageFailed: true });
            },
            () => {
              // Every save writes ALL edits, so nothing from failed attempts is missing.
              if (store.getState().storageFailed) store.setState({ storageFailed: false });
            },
          ),
        ),
        // Only the records are saved — not the failure flag.
        partialize: (state) => ({ edits: state.edits }),
        migrate: (persisted) => persisted as Pick<EditStore, 'edits'>,
        // Stored data is outside input — validate it instead of spreading it in.
        merge: (persisted, current) => ({
          ...current,
          edits: sanitizeEdits(
            persisted !== null && typeof persisted === 'object'
              ? (persisted as Record<string, unknown>).edits
              : undefined,
          ),
        }),
        // Loaded by the page after mount (`rehydrate()`), like the reviews, so
        // the server-rendered HTML and the first browser render both start empty.
        skipHydration: true,
      },
    ),
  );
  return store;
}

export const useEditStore = createEditStore();
