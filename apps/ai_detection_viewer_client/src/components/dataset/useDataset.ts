'use client';

import { useEffect, useState } from 'react';
import { buildFrames, type DatasetKind } from '@/lib/data/build-frames';
import { fetchJson } from '@/lib/data/fetch-json';
import type { PlantedError } from '@/lib/review';
import type { Frame } from '@/lib/types';

/** What the page knows about the dataset on screen. */
export type DatasetState = {
  /** `null` while loading; `[]` when the file holds no usable frame. */
  frames: Frame[] | null;
  /**
   * Set together with `frames`, so it says what the data on screen actually IS:
   * `null` = the real annotations, an array = the practice set and its answer key.
   */
  plantedErrors: PlantedError[] | null;
  /** The request failed (HTTP status or network error), as text; otherwise `null`. */
  error: string | null;
};

const EMPTY: DatasetState = { frames: null, plantedErrors: null, error: null };

/**
 * Load one dataset FILE and turn it into frames: the loader that used to sit
 * inside `app/page.tsx`. Since F7 this serves the single-file datasets (COCO);
 * nuScenes is loaded scene by scene by `useScenes`.
 *
 * Re-runs when the dataset, its url or the practice toggle changes. It clears
 * the previous frames first, so the loading placeholder shows and the page
 * re-homes to the new first frame (the old selected frame id is not in the new
 * set). What to build from the file is decided by the pure `buildFrames`.
 *
 * `fetchJson` rejects with the HTTP status on a non-2xx answer, so a failed
 * request is reported as what it is and not as a JSON parse error.
 */
export function useDataset(kind: DatasetKind, url: string | null, practice: boolean): DatasetState {
  const [state, setState] = useState<DatasetState>(EMPTY);

  useEffect(() => {
    setState(EMPTY);
    // (F7) No url → this loader is not in use (nuScenes loads by scene, see
    // `useScenes`); it reports "nothing yet" and sends no request.
    if (!url) return;
    const ac = new AbortController();
    fetchJson(url, { signal: ac.signal })
      .then((raw) => {
        const built = buildFrames(kind, raw, { practice });
        setState({ frames: built.frames, plantedErrors: built.planted, error: null });
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setState({ frames: null, plantedErrors: null, error: String(err) });
      });
    return () => ac.abort();
  }, [kind, url, practice]);

  return state;
}
