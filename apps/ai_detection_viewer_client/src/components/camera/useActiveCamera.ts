'use client';

import { useCallback, useState } from 'react';
import { defaultCameraName, hasCamera, pickCamera } from '@/lib/cameras';
import type { Frame } from '@/lib/types';

type State = {
  /** The camera chosen last (by the user or automatically); null = the default one. */
  camera: string | null;
  /** The (frame, selection) the automatic choice was last made for. */
  key: string;
};

/**
 * (F6) Which camera the large camera image shows.
 *
 * A VIEW setting, like the 3D camera mode or the zoom toggle: it lives in the
 * page, is not saved, and is not a selection. `selectedObjectId` stays the only
 * selection (Immutable Rule #2) — the camera FOLLOWS from it, never the other
 * way round.
 *
 * - Automatic: whenever the selected object or the frame changes, the camera
 *   that sees the object is shown (`pickCamera`: stay if the current photo
 *   already shows it, otherwise its best view). This also makes the photo
 *   follow a tracked object from one camera to the next during playback.
 * - Manual: `setCamera` (a thumbnail click) shows any camera. That choice holds
 *   until the selection or the frame changes.
 *
 * The automatic choice is made WHILE RENDERING (React's "adjust state when a
 * prop changes" pattern), not in an effect: an effect would paint one frame
 * with the old photo — and its "selected box is outside this camera" notice —
 * before switching.
 *
 * `enabled = false` pins the default camera (a mode that only has data for it).
 */
export function useActiveCamera(
  frame: Frame | null,
  selectedObjectId: string | null,
  enabled = true,
): {
  /** The camera to show: always a camera of `frame`; null without a frame. */
  activeCamera: string | null;
  setCamera: (name: string) => void;
  /** Back to the default camera (dataset switch). */
  resetCamera: () => void;
} {
  const [state, setState] = useState<State>({ camera: null, key: '' });

  let camera = state.camera;
  if (frame && enabled) {
    const key = `${frame.id}|${selectedObjectId ?? ''}`;
    if (state.key !== key) {
      const current = hasCamera(frame, camera) ? camera : defaultCameraName(frame);
      camera = pickCamera(frame, selectedObjectId, current);
      setState({ camera, key });
    }
  }

  const activeCamera = !frame
    ? null
    : enabled && hasCamera(frame, camera)
      ? camera
      : defaultCameraName(frame);

  const setCamera = useCallback((name: string) => {
    setState((previous) => (previous.camera === name ? previous : { ...previous, camera: name }));
  }, []);
  const resetCamera = useCallback(() => setState({ camera: null, key: '' }), []);

  return { activeCamera, setCamera, resetCamera };
}
