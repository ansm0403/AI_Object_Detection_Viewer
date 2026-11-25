'use client';

import { useEffect, useState } from 'react';
import { fetchJson } from '@/lib/data/fetch-json';
import { parsePredictions, type PredictionSet } from '@/lib/evaluation';

/**
 * What is known about the predictions file right now.
 *  - `none`    — this dataset has no predictions (COCO).
 *  - `loading` — the request is on its way.
 *  - `ready`   — parsed; `set` holds the predictions.
 *  - `failed`  — the request failed or the file is not a predictions file;
 *                `error` says which. Review does not depend on this file, so a
 *                failure only affects evaluate mode.
 */
export type PredictionsState =
  | { status: 'none' | 'loading'; set: null; error: null }
  | { status: 'ready'; set: PredictionSet; error: null }
  | { status: 'failed'; set: null; error: string };

type Loaded = { url: string; set: PredictionSet | null; error: string | null };

/**
 * Load and parse a predictions file (F5). `url === null` → no request.
 *
 * The result is stored together with the url it belongs to, and the state is
 * derived from comparing that url with the current one. So the moment the url
 * changes the hook reports `loading` — there is never a render in which one
 * dataset's frames are evaluated against another dataset's predictions.
 */
export function usePredictions(url: string | null): PredictionsState {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!url) return;
    const ac = new AbortController();
    fetchJson(url, { signal: ac.signal })
      .then((raw) => {
        const set = parsePredictions(raw);
        setLoaded({ url, set, error: set ? null : `Not a predictions file: ${url}` });
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setLoaded({ url, set: null, error: String(err) });
      });
    return () => ac.abort();
  }, [url]);

  if (!url) return { status: 'none', set: null, error: null };
  if (!loaded || loaded.url !== url) return { status: 'loading', set: null, error: null };
  if (loaded.set) return { status: 'ready', set: loaded.set, error: null };
  return { status: 'failed', set: null, error: loaded.error ?? 'Unknown error' };
}
