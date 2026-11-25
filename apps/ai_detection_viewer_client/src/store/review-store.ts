import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import {
  createEmptyReviews,
  sanitizeReviews,
  withNote,
  withReasonToggled,
  withVerdict,
  withoutReview,
  type RejectReason,
  type ReviewMap,
  type ReviewScope,
  type ReviewsByScope,
  type Verdict,
} from '@/lib/review';

/**
 * Review records (F4), kept apart from `viewer-store`.
 *
 * Why a second store: these records are SAVED to the browser (so a review can be
 * resumed), while the viewer store holds things that must not be saved (the
 * current selection) or cannot be saved as JSON (a `Set`). Keeping them apart
 * means the persistence settings apply to the review records and nothing else.
 *
 * This store has NO notion of "the box being reviewed". The target of every
 * action is passed in, and the page always derives it from `selectedFrameId` +
 * `selectedObjectId` — the single source of selection (Immutable Rule #2).
 *
 * The record transitions themselves are pure functions in `lib/review`
 * (Immutable Rule #3); the actions here only pick the scope and store the result.
 */

/** localStorage key. Bump `STORAGE_VERSION`, not the key, when the shape changes. */
export const REVIEW_STORAGE_KEY = 'ai-detection-viewer.review';
const STORAGE_VERSION = 1;

type ReviewState = {
  reviews: ReviewsByScope;
  /**
   * True once reading from or writing to browser storage has failed (storage
   * blocked, or full). Reviews still work for this visit — they just will not
   * survive a reload — and the UI says so instead of failing silently.
   */
  storageFailed: boolean;
};

type ReviewActions = {
  /** `now` is injectable so tests get a fixed timestamp. */
  setVerdict: (
    scope: ReviewScope,
    frameId: string,
    objectId: string,
    verdict: Verdict,
    now?: Date,
  ) => void;
  toggleReason: (
    scope: ReviewScope,
    frameId: string,
    objectId: string,
    reason: RejectReason,
  ) => void;
  setNote: (scope: ReviewScope, frameId: string, objectId: string, note: string) => void;
  /** Back to "not reviewed". */
  clearReview: (scope: ReviewScope, frameId: string, objectId: string) => void;
  /** Delete every record of one scope (the other scope is untouched). */
  resetScope: (scope: ReviewScope) => void;
};

export type ReviewStore = ReviewState & ReviewActions;

export const createInitialReviewState = (): ReviewState => ({
  reviews: createEmptyReviews(),
  storageFailed: false,
});

/** Where records are saved. `undefined` = no storage here (server render, tests). */
export type StorageBackend = () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined;

/**
 * The browser's localStorage, or `undefined` when there is no window (the
 * module is also evaluated during server rendering). Reading
 * `window.localStorage` can itself THROW when the browser blocks storage; the
 * caller catches that.
 */
const browserBackend: StorageBackend = () =>
  typeof window === 'undefined' ? undefined : window.localStorage;

/**
 * Wrap a storage backend so it can never throw into a store action.
 *
 * Without this, zustand's `persist` lets a failed `setItem` (quota exceeded,
 * storage blocked) escape from `set()` — a click on "Approve" would crash — and
 * a blocked `localStorage` at startup would leave the store without its
 * `persist` API. Failures are reported through `onError` instead.
 */
export function createSafeStorage(
  backend: StorageBackend,
  onError: (error: unknown) => void,
): StateStorage {
  const attempt = <T>(action: (storage: NonNullable<ReturnType<StorageBackend>>) => T, fallback: T): T => {
    try {
      const storage = backend();
      return storage ? action(storage) : fallback;
    } catch (error) {
      onError(error);
      return fallback;
    }
  };
  return {
    getItem: (name) => attempt((s) => s.getItem(name), null),
    setItem: (name, value) => attempt((s) => s.setItem(name, value), undefined),
    removeItem: (name) => attempt((s) => s.removeItem(name), undefined),
  };
}

/**
 * Build a review store on top of `backend`. The app uses the one instance below;
 * tests build their own with an in-memory backend.
 */
export function createReviewStore(backend: StorageBackend = browserBackend) {
  // Apply a pure map transition to one scope. Returning the same state object
  // when nothing changed lets zustand skip notifying subscribers.
  const inScope = (
    state: ReviewStore,
    scope: ReviewScope,
    change: (map: ReviewMap) => ReviewMap,
  ): ReviewStore | Pick<ReviewStore, 'reviews'> => {
    const prev = state.reviews[scope];
    const next = change(prev);
    return next === prev ? state : { reviews: { ...state.reviews, [scope]: next } };
  };

  const store = create<ReviewStore>()(
    persist(
      (set) => ({
        ...createInitialReviewState(),
        setVerdict: (scope, frameId, objectId, verdict, now = new Date()) =>
          set((state) =>
            inScope(state, scope, (map) =>
              withVerdict(map, frameId, objectId, verdict, now.toISOString()),
            ),
          ),
        toggleReason: (scope, frameId, objectId, reason) =>
          set((state) =>
            inScope(state, scope, (map) => withReasonToggled(map, frameId, objectId, reason)),
          ),
        setNote: (scope, frameId, objectId, note) =>
          set((state) => inScope(state, scope, (map) => withNote(map, frameId, objectId, note))),
        clearReview: (scope, frameId, objectId) =>
          set((state) => inScope(state, scope, (map) => withoutReview(map, frameId, objectId))),
        resetScope: (scope) =>
          set((state) =>
            inScope(state, scope, (map) => (Object.keys(map).length === 0 ? map : {})),
          ),
      }),
      {
        name: REVIEW_STORAGE_KEY,
        version: STORAGE_VERSION,
        storage: createJSONStorage(() =>
          createSafeStorage(backend, () => {
            // Guarded: setState itself triggers another save attempt, which
            // would fail again and loop without this check.
            if (!store.getState().storageFailed) store.setState({ storageFailed: true });
          }),
        ),
        // Only the records are saved — not the failure flag.
        partialize: (state) => ({ reviews: state.reviews }),
        // Data from a different version is passed through unchanged; `merge`
        // validates every record anyway, so nothing unknown gets in.
        migrate: (persisted) => persisted as Pick<ReviewStore, 'reviews'>,
        // Stored data is outside input — validate it instead of spreading it in.
        merge: (persisted, current) => ({
          ...current,
          reviews: sanitizeReviews(
            persisted !== null && typeof persisted === 'object'
              ? (persisted as Record<string, unknown>).reviews
              : undefined,
          ),
        }),
        // Loading is started by the page after mount (`rehydrate()`), so the
        // server-rendered HTML and the browser's first render both start from
        // the empty state — no hydration mismatch.
        skipHydration: true,
      },
    ),
  );
  return store;
}

export const useReviewStore = createReviewStore();
