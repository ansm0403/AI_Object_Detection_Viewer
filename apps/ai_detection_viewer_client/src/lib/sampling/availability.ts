/**
 * (F7.5) Whether the sample can be drawn yet.
 *
 * The sample is "the first N of the WHOLE population, shuffled". Drawn from
 * only the scenes that happen to be loaded, it would be a different list — and
 * verdicts given to it would silently stop matching once the rest arrives. So
 * the sample exists only when every scene of the catalog is in memory with its
 * predictions; until then the UI says what it is waiting for, and if a scene
 * cannot be had at all it says that instead of sampling what is left.
 */
export type SceneSampleState =
  /** Boxes and predictions are in memory. */
  | 'loaded'
  /** Loaded, but the scene has no usable predictions file. */
  | 'no-predictions'
  /** The scene's data could not be loaded. */
  | 'failed'
  /** Not requested yet, or still on its way. */
  | 'pending';

export type SampleAvailability =
  | { status: 'ready' }
  | { status: 'loading'; loaded: number; total: number }
  | { status: 'unavailable'; reason: string };

export function sampleAvailability(
  scenes: readonly { name: string; state: SceneSampleState }[],
): SampleAvailability {
  if (scenes.length === 0) return { status: 'unavailable', reason: 'There are no scenes to sample from.' };
  const names = (state: SceneSampleState) =>
    scenes.filter((scene) => scene.state === state).map((scene) => scene.name);

  // What can never complete comes first: waiting would not help.
  const failed = names('failed');
  if (failed.length > 0) {
    return {
      status: 'unavailable',
      reason: `${failed.join(', ')} could not be loaded. The sample is drawn from all ${scenes.length} scenes, so it is not drawn from the rest.`,
    };
  }
  const withoutPredictions = names('no-predictions');
  if (withoutPredictions.length > 0) {
    return {
      status: 'unavailable',
      reason: `${withoutPredictions.join(', ')} ${withoutPredictions.length === 1 ? 'has' : 'have'} no model predictions, so the false alarms of all ${scenes.length} scenes cannot be listed.`,
    };
  }
  const loaded = names('loaded').length;
  if (loaded < scenes.length) return { status: 'loading', loaded, total: scenes.length };
  return { status: 'ready' };
}
