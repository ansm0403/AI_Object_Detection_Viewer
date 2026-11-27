'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  boxChange,
  canEditFrame,
  countInside,
  describeChange,
  getEdit,
  labelValuesOf,
  makeBevProjector,
  valuesOfEdit,
  type BevProjector,
  type BoxChange,
  type BoxValues,
  type EditMap,
} from '@/lib/editing';
import type { ReviewBlock } from '@/lib/review';
import type { Detection3D, Frame, Point3D } from '@/lib/types';

/** How the editor shares the room with the 3D view (decision 1 of the F8 design). */
export type EditView =
  /** The top view covers the list AND the 3D view: all the room for the work. */
  | 'focus'
  /** Half and half: the 3D view stays next to the top view. */
  | 'split';

/** The box the editor is working on, with everything the screen says about it. */
export type EditTarget = {
  frameId: string;
  objectId: string;
  className: string;
  /** The dataset's own box (in practice mode: the practice set's box). */
  label: BoxValues;
  /** The box as it is now: the stored edit, or the label when there is none. */
  values: BoxValues;
  /** Whether an edit is stored for it. */
  edited: boolean;
  change: BoxChange;
  /** `change` in words; empty when nothing changed. */
  changeText: string[];
  /** LiDAR points the DATASET counted in its own box (original sweep); undefined when the data has no count. */
  labelLidarPoints?: number;
  /** How many of the points this app carries are inside the box as it is now; null while there are none to count. */
  pointsInView: number | null;
  /** The box as the frame on screen draws it (render frame). */
  shown: Detection3D;
};

type Options = {
  /** Review mode is on screen, on data whose boxes can be edited. */
  available: boolean;
  /** The stored edits of the scope on screen. */
  edits: EditMap;
  /** The current frame as the data has it — WITHOUT edits. */
  labelFrame: Frame | null;
  /** The current frame as it is drawn (edits laid over). */
  shownFrame: Frame | null;
  /** `selectedObjectId`: the box being edited is the selected one (Rule #2). */
  selectedId: string | null;
  /** Why the selected box cannot be worked on right now; `null` = it can. */
  block: ReviewBlock | null;
  /** The frame's points, when they have arrived. */
  points: readonly Point3D[] | null;
  stopPlayback: () => void;
};

/**
 * (F8) The top-view editor's state: whether it is open, how it shares the room
 * with the 3D view, and which box it is about.
 *
 * WHICH box is not stored anywhere — it is the selected object of the current
 * frame (`selectedObjectId`, the single selection of the app; Immutable Rule
 * #2). Selecting another box in the 3D view or the photo while the editor is
 * open makes that one the box being edited, exactly as a click selects it
 * everywhere else.
 *
 * All box math is in `lib/editing` (Rule #3); this only holds view state and
 * joins the pieces. The page calls it and wires the results into the workspace
 * slots — no editing state or handler lives in `page.tsx`.
 */
export function useBoxEditor({
  available,
  edits,
  labelFrame,
  shownFrame,
  selectedId,
  block,
  points,
  stopPlayback,
}: Options) {
  const [wanted, setWanted] = useState(false);
  // The view is remembered for the visit: someone who prefers the 3D view next
  // to the top view does not have to ask for it at every box.
  const [view, setView] = useState<EditView>('focus');
  // Where the entrance animation starts: the list row of the box, relative to
  // the top-left corner of the editor (CSS `transform-origin`).
  const [growFrom, setGrowFrom] = useState<string | null>(null);

  // Leaving review mode (another mode, dataset, or data that cannot be edited)
  // closes the editor. Adjusted while rendering, so it is never open for a
  // render in a state where it must not be.
  if (wanted && !available) setWanted(false);
  const editing = wanted && available;

  const editable = labelFrame !== null && canEditFrame(labelFrame);
  const projector: BevProjector | null = useMemo(
    () => (labelFrame?.egoPose ? makeBevProjector(labelFrame.egoPose) : null),
    [labelFrame],
  );

  const target: EditTarget | null = useMemo(() => {
    if (!labelFrame || !shownFrame || !selectedId || !editable) return null;
    const label = labelValuesOf(labelFrame, selectedId);
    const shown = shownFrame.detections3D.find((d) => d.id === selectedId);
    if (!label || !shown) return null;
    const edit = getEdit(edits, labelFrame.id, selectedId);
    const values = edit ? valuesOfEdit(edit) : label;
    const change = boxChange(label, values);
    return {
      frameId: labelFrame.id,
      objectId: selectedId,
      className: shown.class,
      label,
      values,
      edited: edit !== undefined,
      change,
      changeText: describeChange(change),
      labelLidarPoints: shown.annotation?.lidarPoints,
      pointsInView: points ? countInside(points, shown.bbox3D) : null,
      shown,
    };
  }, [labelFrame, shownFrame, selectedId, editable, edits, points]);

  /**
   * Open the editor on the selected box. Does nothing when there is no box
   * that could be worked on — the same conditions that block a verdict
   * (playing, nothing selected, not in this frame, hidden by a filter).
   */
  const enter = useCallback(() => {
    if (!available || !editable || block !== null || !selectedId) return;
    stopPlayback();
    setGrowFrom(originOfSelectedRow());
    setWanted(true);
  }, [available, editable, block, selectedId, stopPlayback]);

  const exit = useCallback(() => setWanted(false), []);
  const toggleView = useCallback(() => setView((v) => (v === 'focus' ? 'split' : 'focus')), []);

  return {
    editing,
    /** Whether the selected box could be opened in the editor right now. */
    canEnter: available && editable && block === null && selectedId !== null,
    view,
    growFrom,
    projector,
    target,
    enter,
    exit,
    toggleView,
  };
}

/**
 * Where the selected row of the object list is, relative to the top-left corner
 * of the list's cell — which is also the top-left corner of the editor, in
 * both of its views. `null` when the row is not on screen (the editor then
 * grows from its own left edge).
 */
function originOfSelectedRow(): string | null {
  if (typeof document === 'undefined') return null;
  const cell = document.querySelector('section[aria-label="Objects"]');
  const row = cell?.querySelector('li[data-selected="true"]');
  if (!cell || !row) return null;
  const c = cell.getBoundingClientRect();
  const r = row.getBoundingClientRect();
  if (r.bottom < c.top || r.top > c.bottom) return null;
  return `${Math.round(r.left + r.width / 2 - c.left)}px ${Math.round(r.top + r.height / 2 - c.top)}px`;
}
