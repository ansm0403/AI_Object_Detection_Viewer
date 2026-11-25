'use client';

import { useEffect, useRef } from 'react';

/** Photos fetched at the same time. Low, so the photos on screen are not starved. */
const CONCURRENCY = 2;
/** Wait this long after a change before fetching ahead: the visible frame goes first. */
const START_DELAY_MS = 300;

/**
 * (F6) Fetch photos in the background, in the given order.
 *
 * WHICH photos and in WHAT order is decided by the pure `preloadOrder`
 * (`lib/cameras`); this only turns the list into requests. One frame is six
 * photos (~0.8 MB) and playback moves every half second, so without this the
 * photos lag behind playback on an ordinary connection (design doc F6 §2.7).
 *
 * A new list (the frame changed) restarts from its front and skips what is
 * already fetched. The `Image` objects are kept, so the browser keeps the
 * photos in memory and shows them without asking the server again.
 */
export function usePhotoPreload(urls: readonly string[]): void {
  const loaded = useRef(new Map<string, HTMLImageElement>());

  useEffect(() => {
    const queue = urls.filter((url) => !loaded.current.has(url));
    if (queue.length === 0) return;

    let cancelled = false;
    let next = 0;
    let active = 0;
    const pump = () => {
      while (!cancelled && active < CONCURRENCY && next < queue.length) {
        const url = queue[next];
        next += 1;
        if (loaded.current.has(url)) continue;
        active += 1;
        const image = new Image();
        image.decoding = 'async';
        const settle = () => {
          active -= 1;
          pump();
        };
        image.onload = settle;
        // A photo that fails is not retried here; the viewer that needs it
        // requests it again and shows its own "unavailable" state.
        image.onerror = settle;
        loaded.current.set(url, image);
        image.src = url;
      }
    };
    const timer = setTimeout(pump, START_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [urls]);
}
