import type { PredictionSet } from '@/lib/evaluation';

/**
 * What is known about the model's predictions for the data on screen.
 *  - `none`    — this dataset has no predictions (COCO).
 *  - `loading` — they are on their way (the scene is still loading).
 *  - `ready`   — parsed; `set` holds the predictions.
 *  - `failed`  — the request failed, or the file is not a predictions file, or
 *                the scene has none; `error` says which. Review does not depend
 *                on predictions, so this only affects evaluate mode.
 *
 * (F7) Predictions arrive together with their scene (`lib/scenes` loadScene,
 * `useScenes`), so there is no separate hook for them any more; the page turns
 * the scene on screen into this state.
 */
export type PredictionsState =
  | { status: 'none' | 'loading'; set: null; error: null }
  | { status: 'ready'; set: PredictionSet; error: null }
  | { status: 'failed'; set: null; error: string };
