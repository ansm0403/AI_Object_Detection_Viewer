/**
 * (F7) In what order the scenes' files are fetched, and how to step between
 * scenes. Pure — the hook that sends the requests asks these.
 *
 * The app holds every scene's boxes in memory (all ten are ~1.3 MB compressed),
 * so that search and whole-dataset numbers can use them. But the scene on
 * screen must not wait for nine others: it is requested first, and the rest
 * follow a few at a time in the background.
 */

/** What is known about one scene's files. A scene without a state has not been requested. */
export type SceneLoadState = 'loading' | 'ready' | 'failed';

/**
 * How many scenes are fetched at the same time. More than one, so that a single
 * slow or hanging file does not hold up every scene queued behind it (found
 * while testing: with one at a time, one stuck scene left six others unloaded).
 * Few, so the photos and points of the frame on screen are not starved.
 */
export const SCENE_LOAD_CONCURRENCY = 2;

/**
 * The scenes to request NOW, most urgent first.
 *
 *  - The active scene, if it has not been requested — always, even when the
 *    limit is already reached (the user is waiting for it).
 *  - Then, while fewer than `concurrency` scenes are loading, the next scenes
 *    that have not been requested: the ones after the active scene first
 *    (wrapping around), since "next scene" is the likeliest move.
 *
 * A failed scene is not requested again here; retrying is the user's decision
 * (selecting the scene again).
 */
export function scenesToRequest(
  names: readonly string[],
  states: ReadonlyMap<string, SceneLoadState>,
  active: string | null,
  concurrency: number = SCENE_LOAD_CONCURRENCY,
): string[] {
  const requests: string[] = [];
  const activeKnown = active !== null && names.includes(active);
  if (activeKnown && !states.has(active)) requests.push(active);

  const limit = Number.isFinite(concurrency) ? Math.max(1, Math.floor(concurrency)) : 1;
  let loading = names.filter((name) => states.get(name) === 'loading').length + requests.length;
  const start = activeKnown ? names.indexOf(active) + 1 : 0;
  for (let step = 0; step < names.length && loading < limit; step += 1) {
    const name = names[(start + step) % names.length];
    if (states.has(name) || requests.includes(name)) continue;
    requests.push(name);
    loading += 1;
  }
  return requests;
}

/**
 * The scene `delta` places from `current` in list order, wrapping around both
 * ends (so "next" on the last scene is the first). `null` when there are no
 * scenes; an unknown `current` steps from the start (or the end, going back).
 */
export function stepScene(
  names: readonly string[],
  current: string | null,
  delta: number,
): string | null {
  const count = names.length;
  if (count === 0) return null;
  const move = Number.isFinite(delta) ? Math.trunc(delta) : 0;
  const index = current === null ? -1 : names.indexOf(current);
  if (index === -1) return move < 0 ? names[count - 1] : names[0];
  return names[(((index + move) % count) + count) % count];
}

/** How many scenes are in each state, for "7 / 10 scenes" progress text. */
export function countSceneStates(
  names: readonly string[],
  states: ReadonlyMap<string, SceneLoadState>,
): { total: number; ready: number; failed: number; pending: number } {
  let ready = 0;
  let failed = 0;
  for (const name of names) {
    const state = states.get(name);
    if (state === 'ready') ready += 1;
    else if (state === 'failed') failed += 1;
  }
  return { total: names.length, ready, failed, pending: names.length - ready - failed };
}
