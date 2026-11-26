import type { Frame } from '@/lib/types';
import { cameraViews } from './views';

/**
 * (F6) Which photos to fetch ahead of time, and in what order.
 *
 * One nuScenes frame is six photos (about 0.8 MB); playback moves on every
 * half second. Photos fetched only when their frame appears arrive late on an
 * ordinary connection (measured 2026-11-26: six photos take 0.6 s at 20 Mbps),
 * so the page fetches the coming frames' photos in the background.
 *
 * Order: the current frame's photos first (the thumbnails need all of them),
 * then the following frames in playback order, wrapping around the end because
 * playback loops. `framesAhead` limits how far ahead to go: with ten frames
 * everything is fetched; a larger dataset passes a small number here instead of
 * downloading all of it.
 *
 * Pure: returns URLs, most urgent first, without duplicates. The page turns
 * them into requests.
 */
export function preloadOrder(
  frames: readonly Frame[],
  currentIndex: number,
  framesAhead: number,
): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const frame of upcomingFrames(frames, currentIndex, framesAhead)) {
    for (const view of cameraViews(frame)) {
      if (view.imageUrl === '' || seen.has(view.imageUrl)) continue;
      seen.add(view.imageUrl);
      urls.push(view.imageUrl);
    }
  }
  return urls;
}

/**
 * (F7) The current frame followed by the next `framesAhead` frames in playback
 * order, wrapping around the end (playback loops within a scene). Each frame
 * appears once. The same window decides which photos (`preloadOrder`) and which
 * point-cloud files are fetched ahead.
 *
 * An index outside the list → `[]`. NaN / negative `framesAhead` → only the
 * current frame; Infinity (or more than there are) → every frame once.
 */
export function upcomingFrames<T>(
  frames: readonly T[],
  currentIndex: number,
  framesAhead: number,
): T[] {
  const count = frames.length;
  if (count === 0 || !Number.isInteger(currentIndex) || currentIndex < 0 || currentIndex >= count) {
    return [];
  }
  const span = Math.min(count - 1, Math.max(0, Math.floor(framesAhead) || 0));
  const out: T[] = [];
  for (let step = 0; step <= span; step += 1) out.push(frames[(currentIndex + step) % count]);
  return out;
}
