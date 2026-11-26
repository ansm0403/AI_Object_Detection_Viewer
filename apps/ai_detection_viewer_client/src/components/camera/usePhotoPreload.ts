'use client';

import { useEffect, useRef } from 'react';
import { BoundedCache } from '@/lib/data/bounded-cache';

/** Photos fetched at the same time. Low, so the photos on screen are not starved. */
const CONCURRENCY = 3;
/**
 * Wait this long after a change before fetching ahead: the visible frame goes
 * first. Only when the frame on screen still needs its own photos — see below.
 */
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
 *
 * (F7) Only the last `keep` photos are held. With ten frames everything was
 * kept (8 MB); with hundreds of frames that grows without end (measured: 171
 * photos, 25 MB, after a little use of one 41-frame scene). A photo that is
 * dropped is still in the browser's HTTP cache.
 *
 * (F7) The start delay is skipped when the list's first photo — the current
 * frame's — has already been REQUESTED here (arrived or on its way). During
 * playback the frame changes every 0.5 s; waiting 0.3 s on each change left
 * 0.2 s to fetch the six photos of the frame that had just entered the window,
 * and they fell behind (measured: 18–20 of 24 frames shown before all their
 * photos had arrived). The delay exists to let the viewer fetch a frame nobody
 * preloaded (a jump to a far frame); when the current frame is already in this
 * queue there is nothing to give way to, and waiting only makes a slow
 * connection fall further behind.
 */
export function usePhotoPreload(urls: readonly string[], keep = Infinity): void {
  const loaded = useRef<BoundedCache<string, HTMLImageElement> | null>(null);
  if (loaded.current === null) {
    loaded.current = new BoundedCache(Number.isFinite(keep) ? keep : Number.MAX_SAFE_INTEGER);
  }

  useEffect(() => {
    const store = loaded.current;
    if (!store) return;
    // What is wanted now was "just used": it must outlive older photos.
    for (const url of urls) store.get(url);
    const queue = urls.filter((url) => !store.has(url));
    if (queue.length === 0) return;

    let cancelled = false;
    let next = 0;
    let active = 0;
    const pump = () => {
      while (!cancelled && active < CONCURRENCY && next < queue.length) {
        const url = queue[next];
        next += 1;
        if (store.has(url)) continue;
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
        store.set(url, image);
        image.src = url;
      }
    };
    const currentRequested = urls.length > 0 && store.has(urls[0]);
    const timer = setTimeout(pump, currentRequested ? 0 : START_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [urls]);
}
