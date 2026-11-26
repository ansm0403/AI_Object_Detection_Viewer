/**
 * (F7) The scene catalog: the first file the app fetches for nuScenes.
 *
 * `scenes.json` (written by `scripts/prep_nuscenes.py`) lists every scene with
 * what is needed to show a scene picker and to fetch the scene's own files. It
 * holds no boxes and no coordinates — only names, counts and paths — so nothing
 * here is coordinate math.
 */

/** The drive a scene was cut from. Scenes of the same log were recorded on the
 *  same day by the same car, one after the other — they are not independent
 *  samples (nuScenes-mini's three night scenes come from one log). */
export type SceneLog = {
  /** nuScenes `log.logfile`, e.g. "n015-2018-11-21-19-38-26+0800". */
  name: string;
  /** nuScenes `log.location`, e.g. "singapore-hollandvillage". */
  location: string;
  /** nuScenes `log.date_captured`, "YYYY-MM-DD". */
  date: string;
};

/** One scene (about 20 s of driving, ~40 keyframes). */
export type SceneInfo = {
  /** nuScenes scene name, e.g. "scene-0916". Unique in the catalog. */
  name: string;
  /** The dataset's own free-text description (English). */
  description: string;
  /**
   * Whether the dataset describes the scene as a night scene. nuScenes has no
   * day/night field: this is read off `description` (see `isNightDescription`)
   * and the UI says so.
   */
  night: boolean;
  /** `null` when the catalog does not say (the scene still works). */
  log: SceneLog | null;
  frameCount: number;
  boxCount: number;
  /** Where the scene's frames file (boxes + cameras) is fetched from. */
  framesUrl: string;
  /** Where the scene's model predictions are fetched from; `null` = none. */
  predictionsUrl: string | null;
};

export type SceneCatalog = {
  scenes: SceneInfo[];
  /**
   * The photos the app shows are reduced copies; boxes and predictions are in
   * the ORIGINAL photo's pixels. `null` when the catalog does not say.
   */
  photo: { width: number; height: number; sourceWidth: number; sourceHeight: number } | null;
  /** Dataset name, version and licence, for the attribution line. */
  source: { dataset: string; version: string; license: string } | null;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string' && value !== '';
const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

/**
 * Whether a scene description marks a night scene.
 *
 * nuScenes writes the time of day only into the description, and only for
 * night scenes, as the first tag: "Night, big street, bus stop, …". A scene
 * whose description does not start with that tag is treated as not-night; that
 * is a reading of the text, not a measured property.
 */
export function isNightDescription(description: string): boolean {
  return /^\s*night\b/i.test(description);
}

/**
 * Parse `scenes.json`.
 *
 * Returns `null` when the root is not a catalog. A malformed or repeated scene
 * entry is skipped with a warning and the others are kept (Error Defaults:
 * never throw, never lose everything over one bad entry). A scene needs a name
 * and a frames path; everything else has a fallback.
 */
export function parseSceneCatalog(raw: unknown): SceneCatalog | null {
  if (!isObject(raw) || !Array.isArray(raw.scenes)) {
    console.warn('[parseSceneCatalog] Invalid root. Expected { scenes: [] }.');
    return null;
  }

  const scenes: SceneInfo[] = [];
  const seen = new Set<string>();
  for (const entry of raw.scenes) {
    if (!isObject(entry) || !isText(entry.name) || !isText(entry.framesPath)) {
      console.warn('[parseSceneCatalog] Skipping a scene without a name or a frames path.');
      continue;
    }
    if (seen.has(entry.name)) {
      console.warn(`[parseSceneCatalog] Skipping repeated scene "${entry.name}".`);
      continue;
    }
    seen.add(entry.name);
    const description = typeof entry.description === 'string' ? entry.description : '';
    scenes.push({
      name: entry.name,
      description,
      night: isNightDescription(description),
      log: readLog(entry.log),
      frameCount: isCount(entry.frameCount) ? entry.frameCount : 0,
      boxCount: isCount(entry.boxCount) ? entry.boxCount : 0,
      framesUrl: entry.framesPath,
      predictionsUrl: isText(entry.predictionsPath) ? entry.predictionsPath : null,
    });
  }

  return { scenes, photo: readPhoto(raw.photo), source: readSource(raw.source) };
}

function readLog(value: unknown): SceneLog | null {
  if (!isObject(value) || !isText(value.name)) return null;
  return {
    name: value.name,
    location: typeof value.location === 'string' ? value.location : '',
    date: typeof value.dateCaptured === 'string' ? value.dateCaptured : '',
  };
}

function readPhoto(value: unknown): SceneCatalog['photo'] {
  if (!isObject(value)) return null;
  const { width, height, sourceWidth, sourceHeight } = value;
  const positive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;
  if (!positive(width) || !positive(height) || !positive(sourceWidth) || !positive(sourceHeight)) {
    return null;
  }
  return { width, height, sourceWidth, sourceHeight };
}

function readSource(value: unknown): SceneCatalog['source'] {
  if (!isObject(value) || !isText(value.dataset)) return null;
  return {
    dataset: value.dataset,
    version: typeof value.version === 'string' ? value.version : '',
    license: typeof value.license === 'string' ? value.license : '',
  };
}
