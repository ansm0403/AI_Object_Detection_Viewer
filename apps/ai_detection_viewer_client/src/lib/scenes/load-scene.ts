import { buildFrames } from '@/lib/data/build-frames';
import { fetchJson } from '@/lib/data/fetch-json';
import { parsePredictions, type PredictionSet } from '@/lib/evaluation';
import type { SceneInfo } from '@/lib/nuscenes';
import type { PlantedError } from '@/lib/review';
import type { Frame } from '@/lib/types';

/** One scene's data in memory: its frames (boxes, cameras — no points) and the model's predictions. */
export type LoadedScene = {
  name: string;
  frames: Frame[];
  /** `null` when the scene has no predictions file or it could not be used. */
  predictions: PredictionSet | null;
  /** Why `predictions` is `null`, when a file was expected; otherwise `null`. */
  predictionsError: string | null;
};

export type SceneLoadResult =
  | { ok: true; scene: LoadedScene }
  | { ok: false; error: string };

type LoadOptions = { signal?: AbortSignal; fetchImpl?: typeof fetch };

/**
 * Fetch and parse one scene: its frames file and, next to it, its predictions.
 *
 * The two requests run together. They are independent on purpose (F5): if the
 * predictions fail, the scene still loads and review works — only evaluation is
 * unavailable for it, and `predictionsError` says why. If the FRAMES fail, the
 * scene fails.
 *
 * Never rejects: the outcome is in the returned value, so a caller loading
 * several scenes cannot be torn down by one of them. (An aborted request is
 * reported as a failure like any other; the caller that aborted ignores it.)
 */
export async function loadScene(scene: SceneInfo, options: LoadOptions = {}): Promise<SceneLoadResult> {
  const predictions = scene.predictionsUrl
    ? loadPredictions(scene.predictionsUrl, options)
    : Promise.resolve({ set: null, error: null });
  try {
    const raw = await fetchJson(scene.framesUrl, options);
    const { frames } = buildFrames('nuscenes', raw);
    const { set, error } = await predictions;
    return { ok: true, scene: { name: scene.name, frames, predictions: set, predictionsError: error } };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

async function loadPredictions(
  url: string,
  options: LoadOptions,
): Promise<{ set: PredictionSet | null; error: string | null }> {
  try {
    const set = parsePredictions(await fetchJson(url, options));
    return set ? { set, error: null } : { set: null, error: `Not a predictions file: ${url}` };
  } catch (err) {
    return { set: null, error: String(err) };
  }
}

/** A scene's practice set (F4-F): the same scene with a few boxes made wrong, and the answer key. */
export type PracticeScene = { name: string; frames: Frame[]; planted: PlantedError[] };

/**
 * Fetch a scene's frames file again and build its practice set from the raw
 * data (`makePracticeSet` works on the file's values, before parsing). The file
 * was fetched moments ago for the scene itself, so this is answered from the
 * browser's cache; keeping every scene's raw file in memory just for this would
 * double what the app holds.
 */
export async function loadPracticeScene(
  scene: SceneInfo,
  options: LoadOptions = {},
): Promise<{ ok: true; scene: PracticeScene } | { ok: false; error: string }> {
  try {
    const raw = await fetchJson(scene.framesUrl, options);
    const built = buildFrames('nuscenes', raw, { practice: true });
    return { ok: true, scene: { name: scene.name, frames: built.frames, planted: built.planted ?? [] } };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
