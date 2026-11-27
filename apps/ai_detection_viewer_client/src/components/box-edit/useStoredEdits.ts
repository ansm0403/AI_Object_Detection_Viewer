'use client';

import { useEffect, useMemo } from 'react';
import { applyEdits, type EditMap, type EditScope } from '@/lib/editing';
import type { Frame } from '@/lib/types';
import { EDIT_STORAGE_KEY, useEditStore } from '@/store';

/**
 * (F8) The stored box edits of one scope.
 *
 * Loads them AFTER mount, like the review records: the store starts empty on
 * the server render and on the browser's first render, so the two match, and
 * this then fills it from localStorage.
 *
 * Every tab keeps its own copy and saves ALL edits on a change, so a tab that
 * was opened earlier would overwrite what another tab saved since. The browser
 * fires `storage` in the OTHER tabs whenever one writes; re-reading then keeps
 * every tab on the latest edits (the same rule as the reviews, Edge_F#4 Case 4).
 */
export function useStoredEdits(scope: EditScope): { edits: EditMap; storageFailed: boolean } {
  const edits = useEditStore((s) => s.edits[scope]);
  const storageFailed = useEditStore((s) => s.storageFailed);
  useEffect(() => {
    void useEditStore.persist.rehydrate();
    const onStorage = (event: StorageEvent) => {
      // key === null means the whole storage was cleared.
      if (event.key === EDIT_STORAGE_KEY || event.key === null) {
        void useEditStore.persist.rehydrate();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  return { edits, storageFailed };
}

/**
 * (F8) The frames with the stored edits laid over them — or the frames
 * themselves when `on` is false or no edit is about them.
 *
 * Returning the SAME array (and the same frame objects) whenever nothing
 * applies matters: everything downstream is memoised on these identities.
 *
 * `on` is where "edited boxes are shown in review only" is decided: evaluation,
 * search and the sample check pass `false` and so always work on the dataset's
 * own boxes — every number they report is independent of any edit.
 */
export function useEditedFrames(frames: Frame[] | null, edits: EditMap, on: boolean): Frame[] | null {
  return useMemo(() => {
    if (!on || !frames || Object.keys(edits).length === 0) return frames;
    let changed = false;
    const next = frames.map((frame) => {
      const edited = applyEdits(frame, edits);
      if (edited !== frame) changed = true;
      return edited;
    });
    return changed ? next : frames;
  }, [frames, edits, on]);
}
