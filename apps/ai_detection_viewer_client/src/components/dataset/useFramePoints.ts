'use client';

import { useEffect, useRef, useState } from 'react';
import { upcomingFrames } from '@/lib/cameras';
import { BoundedCache } from '@/lib/data/bounded-cache';
import { fetchJson } from '@/lib/data/fetch-json';
import { parseNuScenesPoints } from '@/lib/nuscenes';
import type { Frame, Point3D } from '@/lib/types';

/** Points files fetched at the same time. Low, so the photos on screen are not starved. */
const CONCURRENCY = 2;

/**
 * What is known about the current frame's point cloud.
 *  - `inline`  — the frame carries its points itself (COCO, single-file data).
 *  - `loading` — the points file is on its way; `points` is `null`.
 *  - `ready`   — `points` holds the frame's points.
 *  - `failed`  — the file could not be fetched or is not a points file. The
 *                boxes still render; only the cloud is missing.
 */
export type FramePoints =
  | { status: 'inline' | 'ready'; points: Point3D[] }
  | { status: 'loading' | 'failed'; points: null };

/**
 * (F7) The point cloud of the current frame, fetched per frame.
 *
 * Points are ~85 % of the data, so a scene's frames arrive without them
 * (`Frame.pointCloudSource` says where they are). This fetches the current
 * frame's file and, behind it, the files of the next `framesAhead` frames in
 * playback order, so that playback (a new frame every 0.5 s) finds them ready.
 *
 * Parsed clouds are kept in a `BoundedCache` (the last `keep` frames used); an
 * older one is parsed again from the browser's HTTP cache if it is needed.
 * Points are stored by frame id and only ever returned for the frame they
 * belong to — a slow answer can not put one frame's cloud on another.
 *
 * Requests are not aborted when the frame changes: a file that was asked for
 * a moment ago is usually about to be needed. Only requests that have not
 * started yet are dropped when the wanted list changes.
 */
export function useFramePoints(
  frames: readonly Frame[] | null,
  current: Frame | null,
  framesAhead: number,
  keep: number,
): FramePoints {
  // `null` in the cache = this frame's file failed. The cache is a mutable
  // object created once and held in state (not a ref), because it is read
  // while rendering; `version` below tells React when its content changed.
  const [store] = useState(() => new BoundedCache<string, Point3D[] | null>(keep));
  const inFlight = useRef(new Set<string>());
  const queue = useRef<Frame[]>([]);
  const [, setVersion] = useState(0);

  useEffect(() => {
    if (!frames || !current) return;
    // A file that failed is asked for again when its frame is opened again.
    if (store.peek(current.id) === null) store.delete(current.id);
    // The frame on screen was just used: it must outlive the ones fetched ahead.
    store.get(current.id);
    queue.current = upcomingFrames(frames, frames.indexOf(current), framesAhead).filter(
      (frame) => frame.pointCloudSource && !store.has(frame.id) && !inFlight.current.has(frame.id),
    );

    const pump = () => {
      while (inFlight.current.size < CONCURRENCY && queue.current.length > 0) {
        const frame = queue.current.shift();
        const source = frame?.pointCloudSource;
        if (!frame || !source || store.has(frame.id) || inFlight.current.has(frame.id)) continue;
        inFlight.current.add(frame.id);
        fetchJson(source.url)
          .then((raw) => parseNuScenesPoints(raw, frame.id))
          .catch(() => null)
          .then((points) => {
            inFlight.current.delete(frame.id);
            store.set(frame.id, points);
            // Re-render: the frame on screen may be the one that just arrived.
            setVersion((v) => v + 1);
            pump();
          });
      }
    };
    pump();
  }, [store, frames, current, framesAhead]);

  if (!current) return { status: 'loading', points: null };
  if (!current.pointCloudSource) return { status: 'inline', points: current.pointCloud };
  const stored = store.peek(current.id);
  if (stored === undefined) return { status: 'loading', points: null };
  if (stored === null) return { status: 'failed', points: null };
  return { status: 'ready', points: stored };
}
