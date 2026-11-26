'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchJson } from '@/lib/data/fetch-json';
import type { PredictionSet } from '@/lib/evaluation';
import { parseSceneCatalog, type SceneCatalog, type SceneInfo } from '@/lib/nuscenes';
import type { PlantedError } from '@/lib/review';
import {
  loadPracticeScene,
  loadScene,
  scenesToRequest,
  type LoadedScene,
  type PracticeScene,
  type SceneLoadState,
} from '@/lib/scenes';
import type { Frame } from '@/lib/types';

// ---------------------------------------------------------------- catalog

type CatalogState =
  | { status: 'none' | 'loading'; catalog: null; error: null }
  | { status: 'ready'; catalog: SceneCatalog; error: null }
  | { status: 'failed'; catalog: null; error: string };

/**
 * Load the scene catalog (`scenes.json`). `url === null` → no request (`none`).
 * The result is stored together with the url it belongs to, and the state is
 * derived by comparing that url with the current one — so a url change reports
 * `loading` at once instead of showing the old catalog for a render.
 */
function useSceneCatalog(url: string | null): CatalogState {
  const [loaded, setLoaded] = useState<{ url: string; catalog: SceneCatalog | null; error: string | null } | null>(null);

  useEffect(() => {
    if (!url) return;
    const ac = new AbortController();
    fetchJson(url, { signal: ac.signal })
      .then((raw) => {
        const catalog = parseSceneCatalog(raw);
        setLoaded({ url, catalog, error: catalog ? null : `Not a scene catalog: ${url}` });
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setLoaded({ url, catalog: null, error: String(err) });
      });
    return () => ac.abort();
  }, [url]);

  if (!url) return { status: 'none', catalog: null, error: null };
  if (!loaded || loaded.url !== url) return { status: 'loading', catalog: null, error: null };
  if (loaded.catalog) return { status: 'ready', catalog: loaded.catalog, error: null };
  return { status: 'failed', catalog: null, error: loaded.error ?? 'Unknown error' };
}

// ---------------------------------------------------------------- library

/** Every scene's data the app holds, and how far loading has come. */
export type SceneLibrary = {
  /** Per scene name. A scene without an entry has not been requested yet. */
  states: ReadonlyMap<string, SceneLoadState>;
  /** The scenes that are loaded. */
  scenes: ReadonlyMap<string, LoadedScene>;
  /** Why a scene failed, per scene name. */
  errors: ReadonlyMap<string, string>;
};

type LibraryStore = SceneLibrary & { catalog: SceneCatalog | null };

const EMPTY_LIBRARY: LibraryStore = {
  catalog: null,
  states: new Map(),
  scenes: new Map(),
  errors: new Map(),
};

/**
 * Load the scenes of a catalog: the active one first, then the others a couple at a
 * time in the background (order decided by the pure `scenesToRequest`).
 *
 * Why everything is loaded in the end: search and whole-dataset numbers run
 * directly on the boxes, with the same functions the screen uses, so they need
 * every scene's boxes in memory (all ten are ~1.3 MB compressed). Why not at
 * once: the scene on screen should not wait for nine others.
 *
 * Requests are not aborted when the active scene changes — a scene that was
 * asked for is still wanted. A result is dropped only if its catalog is no
 * longer the current one (dataset switched) or the component is gone.
 */
function useSceneLibrary(
  catalog: SceneCatalog | null,
  active: string | null,
): SceneLibrary & { retry: (name: string) => void } {
  const [store, setStore] = useState<LibraryStore>(EMPTY_LIBRARY);
  // The store belongs to one catalog; for any other it reads as empty.
  const view = store.catalog === catalog ? store : EMPTY_LIBRARY;

  // Which catalog results may still be written for. Set in an effect (and
  // cleared on unmount) so a late answer for an old catalog is ignored.
  const live = useRef<SceneCatalog | null>(null);
  useEffect(() => {
    live.current = catalog;
    return () => {
      live.current = null;
    };
  }, [catalog]);

  // Names already asked for, per catalog. The state above only shows `loading`
  // after a re-render; this guards the gap (and React's double effect run in
  // development) so a scene is never requested twice.
  const requested = useRef<{ catalog: SceneCatalog | null; names: Set<string> }>({
    catalog: null,
    names: new Set(),
  });

  useEffect(() => {
    if (!catalog) return;
    if (requested.current.catalog !== catalog) requested.current = { catalog, names: new Set() };
    const names = catalog.scenes.map((scene) => scene.name);
    const states = new Map<string, SceneLoadState>(view.states);
    for (const name of requested.current.names) {
      if (!states.has(name)) states.set(name, 'loading');
    }
    const wanted = scenesToRequest(names, states, active);
    if (wanted.length === 0) return;

    for (const name of wanted) requested.current.names.add(name);
    const base = (prev: LibraryStore): LibraryStore =>
      prev.catalog === catalog ? prev : { ...EMPTY_LIBRARY, catalog };
    setStore((prev) => {
      const next = base(prev);
      const nextStates = new Map(next.states);
      for (const name of wanted) nextStates.set(name, 'loading');
      return { ...next, states: nextStates };
    });
    for (const name of wanted) {
      const scene = catalog.scenes.find((s) => s.name === name);
      if (!scene) continue;
      void loadScene(scene).then((result) => {
        if (live.current !== catalog) return;
        setStore((prev) => {
          const next = base(prev);
          const nextStates = new Map(next.states);
          const scenes = new Map(next.scenes);
          const errors = new Map(next.errors);
          if (result.ok) {
            nextStates.set(name, 'ready');
            scenes.set(name, result.scene);
            errors.delete(name);
          } else {
            nextStates.set(name, 'failed');
            errors.set(name, result.error);
          }
          return { catalog, states: nextStates, scenes, errors };
        });
      });
    }
  }, [catalog, active, view.states]);

  // Forget a failed scene so it is requested again (when it is, or becomes, the
  // active one — or when its turn comes in the background).
  const retry = useCallback((name: string) => {
    requested.current.names.delete(name);
    setStore((prev) => {
      if (prev.states.get(name) !== 'failed') return prev;
      const states = new Map(prev.states);
      const errors = new Map(prev.errors);
      states.delete(name);
      errors.delete(name);
      return { ...prev, states, errors };
    });
  }, []);

  return { states: view.states, scenes: view.scenes, errors: view.errors, retry };
}

// ---------------------------------------------------------------- practice

type PracticeState = { name: string; scene: PracticeScene | null; error: string | null } | null;

/** The practice set of one scene (F4-F), built when practice is on. */
function usePracticeScene(scene: SceneInfo | null, enabled: boolean): PracticeState {
  const [loaded, setLoaded] = useState<PracticeState>(null);
  useEffect(() => {
    if (!scene || !enabled) return;
    let cancelled = false;
    void loadPracticeScene(scene).then((result) => {
      if (cancelled) return;
      setLoaded(
        result.ok
          ? { name: scene.name, scene: result.scene, error: null }
          : { name: scene.name, scene: null, error: result.error },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [scene, enabled]);
  if (!scene || !enabled || !loaded || loaded.name !== scene.name) return null;
  return loaded;
}

// ---------------------------------------------------------------- on screen

/** The scene the workspace is showing right now, with everything that belongs to it. */
export type SceneOnScreen = {
  info: SceneInfo;
  frames: Frame[];
  /** `null` = the dataset's own boxes; an array = the practice set and its answer key. */
  plantedErrors: PlantedError[] | null;
  predictions: PredictionSet | null;
  predictionsError: string | null;
};

export type ScenesState = {
  /** `none` = this dataset has no scenes (COCO). */
  status: 'none' | 'loading' | 'ready' | 'failed';
  /** The catalog failed, or the first scene failed with nothing to show instead. */
  error: string | null;
  catalog: SceneCatalog | null;
  /**
   * The scene on screen. It LAGS the requested scene on purpose: while the
   * requested one is still loading, the previous scene stays (so the 3D canvas
   * is never torn down for a loading placeholder), and `pending` says what is
   * on its way.
   */
  onScreen: SceneOnScreen | null;
  /** The requested scene, while it is not on screen yet; `error` when it failed. */
  pending: { name: string; practice: boolean; error: string | null } | null;
  library: SceneLibrary;
  retry: (name: string) => void;
};

/**
 * (F7) Everything about nuScenes scenes for the page: the catalog, every
 * scene's data as it arrives, and which scene is on screen.
 *
 * @param catalogUrl  `null` when the dataset has no scenes → no requests at all.
 * @param requested   The scene the user asked for; `null` = the default.
 * @param defaultScene  Opened when nothing was asked for (falls back to the
 *                      catalog's first scene if the name is not in it).
 * @param practice    Show the practice set of the scene instead of its real boxes.
 */
export function useScenes(
  catalogUrl: string | null,
  requested: string | null,
  defaultScene: string,
  practice: boolean,
): ScenesState {
  const catalogState = useSceneCatalog(catalogUrl);
  const catalog = catalogState.catalog;

  // The scene that should be on screen.
  const wantedInfo = useMemo(() => {
    if (!catalog) return null;
    const byName = (name: string | null) => catalog.scenes.find((s) => s.name === name);
    return byName(requested) ?? byName(defaultScene) ?? catalog.scenes[0] ?? null;
  }, [catalog, requested, defaultScene]);

  const library = useSceneLibrary(catalog, wantedInfo?.name ?? null);
  const practiceState = usePracticeScene(wantedInfo, practice);

  // What is wanted, once ALL of it has arrived. One object per (scene, practice)
  // state, so "is this what is on screen?" is an identity check.
  const loaded = wantedInfo ? library.scenes.get(wantedInfo.name) : undefined;
  // A scene whose file holds no usable frame cannot be shown: the workspace
  // needs a frame. It is treated like a scene that failed — the scene on screen
  // stays and the picker says what happened (Edge_F#7 Case 1: showing it left
  // the page on "No frames." with no scene picker to leave again).
  const emptyScene = loaded !== undefined && loaded.frames.length === 0;
  const wanted = useMemo<SceneOnScreen | null>(() => {
    if (!wantedInfo || !loaded || emptyScene) return null;
    if (!practice) {
      return {
        info: wantedInfo,
        frames: loaded.frames,
        plantedErrors: null,
        predictions: loaded.predictions,
        predictionsError: loaded.predictionsError,
      };
    }
    if (!practiceState?.scene) return null;
    return {
      info: wantedInfo,
      frames: practiceState.scene.frames,
      plantedErrors: practiceState.scene.planted,
      predictions: loaded.predictions,
      predictionsError: loaded.predictionsError,
    };
  }, [wantedInfo, loaded, emptyScene, practice, practiceState]);

  // Remember the last complete scene and keep showing it until the next one is
  // complete. (State adjusted while rendering — React's pattern for "derive
  // from props, but remember the previous value".)
  const [shown, setShown] = useState<{ catalog: SceneCatalog | null; scene: SceneOnScreen | null }>({
    catalog: null,
    scene: null,
  });
  if (shown.catalog !== catalog) {
    setShown({ catalog, scene: wanted });
  } else if (wanted && shown.scene !== wanted) {
    setShown({ catalog, scene: wanted });
  }
  const onScreen = wanted ?? (shown.catalog === catalog ? shown.scene : null);

  const failure = wantedInfo
    ? library.errors.get(wantedInfo.name) ??
      (emptyScene ? `${wantedInfo.name} has no frames.` : null) ??
      (practice ? practiceState?.error : null) ??
      null
    : null;
  const pending =
    wantedInfo && !wanted
      ? { name: wantedInfo.name, practice, error: failure }
      : null;

  let status: ScenesState['status'];
  let error: string | null = null;
  if (catalogState.status === 'none') status = 'none';
  else if (catalogState.status === 'failed') {
    status = 'failed';
    error = catalogState.error;
  } else if (catalogState.status === 'loading') status = 'loading';
  else if (onScreen) status = 'ready';
  else if (failure) {
    // Nothing on screen and the scene that should be failed.
    status = 'failed';
    error = failure;
  } else if (catalog && catalog.scenes.length === 0) status = 'ready';
  else status = 'loading';

  return {
    status,
    error,
    catalog,
    onScreen,
    pending,
    library: { states: library.states, scenes: library.scenes, errors: library.errors },
    retry: library.retry,
  };
}
