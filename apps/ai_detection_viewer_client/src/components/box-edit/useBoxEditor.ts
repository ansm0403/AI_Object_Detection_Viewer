'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { pickCamera } from '@/lib/cameras';
import {
  amendHistory,
  boxChange,
  canEditFrame,
  canRedo,
  canUndo,
  countInside,
  describeChange,
  dragBox,
  getEdit,
  labelValuesOf,
  makeBevProjector,
  nudgeBox,
  pushHistory,
  redoHistory,
  replaceBoxes,
  sameBoxValues,
  setBoxField,
  startHistory,
  undoHistory,
  valuesOfEdit,
  type BevPoint,
  type BevProjector,
  type BoxChange,
  type BoxField,
  type BoxValues,
  type DragHandle,
  type EditMap,
  type EditScope,
  type History,
} from '@/lib/editing';
import type { Vec3 } from '@/lib/geometry';
import type { ReviewBlock } from '@/lib/review';
import type { Detection3D, Frame, Point3D } from '@/lib/types';
import { useEditStore } from '@/store';
import { EDIT_BLOCK_MESSAGES } from './labels';
import type { BoxDraft } from './useBoxDraft';

/** How the editor shares the room with the 3D view (decision 1 of the F8 design). */
export type EditView =
  /** The top view covers the list AND the 3D view: all the room for the work. */
  | 'focus'
  /** Half and half: the 3D view stays next to the top view. */
  | 'split';

/**
 * A change made from the KEYBOARD (an arrow key, a typed number) is accepted
 * only after its box has been the one being edited for this long. Stepping to
 * another box and pressing a key in the same breath must not change a box
 * nobody has looked at yet (the F7.5 rule for verdicts, Edge_F#7.5 Case 1).
 * A drag is not held back: the handle has to be found and grabbed first.
 */
export const MIN_LOOK_MS = 400;

/**
 * Arrow presses that follow each other within this time are ONE movement: one
 * undo step, not one per press. Holding an arrow for a second is thirty presses;
 * thirty Undos to take it back would make Undo useless.
 */
export const NUDGE_RUN_MS = 800;

/** The box the editor is working on, with everything the screen says about it. */
export type EditTarget = {
  frameId: string;
  objectId: string;
  className: string;
  /** The dataset's own box (in practice mode: the practice set's box). */
  label: BoxValues;
  /** The box as it is now: being dragged, or the stored edit, or the label. */
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
  /** Which edits are being made: of the real annotations, or of the practice set. */
  scope: EditScope;
  /** The stored edits of that scope. */
  edits: EditMap;
  /** The current frame as the data has it — WITHOUT edits. */
  labelFrame: Frame | null;
  /** The current frame as it is drawn (stored edits and the drag laid over). */
  shownFrame: Frame | null;
  /** `selectedObjectId`: the box being edited is the selected one (Rule #2). */
  selectedId: string | null;
  /** Why the selected box cannot be worked on right now; `null` = it can. */
  block: ReviewBlock | null;
  /** The frame's points, when they have arrived. */
  points: readonly Point3D[] | null;
  /** True while the frame's points are still on their way. */
  pointsLoading: boolean;
  /** The box while it is being dragged, and its setter (`useBoxDraft`). */
  draft: BoxDraft | null;
  setDraft: (draft: BoxDraft | null) => void;
  /** The camera whose photo is on screen, and how to show another one. */
  activeCamera: string | null;
  setCamera: (name: string) => void;
  stopPlayback: () => void;
};

type Session = { key: string; history: History<BoxValues> };

/**
 * (F8) The top-view editor: whether it is open, how it shares the room with
 * the 3D view, which box it is about, and every way that box is changed.
 *
 * WHICH box is not stored anywhere — it is the selected object of the current
 * frame (`selectedObjectId`, the single selection of the app; Immutable Rule
 * #2). Selecting another box in the 3D view or the photo while the editor is
 * open makes that one the box being edited.
 *
 * What a change DOES to a box is `lib/editing` (Rule #3). This hook decides
 * when a change is taken:
 *  - while a handle is dragged, the box is a DRAFT (drawn, not stored);
 *  - when the pointer is released — or a number is entered — it is stored
 *    (`edit-store`) and becomes one undo step;
 *  - a box that ends up equal to the dataset's box has its edit removed: there
 *    is never an "edited" box that is not different from the label.
 *
 * The undo history belongs to one box for as long as the editor stays on it.
 * The page calls this hook and wires the results into the workspace slots — no
 * editing state or handler lives in `page.tsx`.
 */
export function useBoxEditor({
  available,
  scope,
  edits,
  labelFrame,
  shownFrame,
  selectedId,
  block,
  points,
  pointsLoading,
  draft,
  setDraft,
  activeCamera,
  setCamera,
  stopPlayback,
}: Options) {
  const setEdit = useEditStore((s) => s.setEdit);
  const removeEdit = useEditStore((s) => s.removeEdit);

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

  // The dataset's box and the stored state of the selected box.
  const base = useMemo(() => {
    if (!labelFrame || !selectedId || !editable) return null;
    const label = labelValuesOf(labelFrame, selectedId);
    if (!label) return null;
    const edit = getEdit(edits, labelFrame.id, selectedId);
    return {
      key: `${labelFrame.id}/${selectedId}`,
      frameId: labelFrame.id,
      objectId: selectedId,
      label,
      stored: edit ? valuesOfEdit(edit) : label,
      edited: edit !== undefined,
    };
  }, [labelFrame, selectedId, editable, edits]);

  const target: EditTarget | null = useMemo(() => {
    const shown = base && shownFrame?.detections3D.find((d) => d.id === base.objectId);
    if (!base || !shown) return null;
    const dragged = draft && draft.frameId === base.frameId && draft.objectId === base.objectId;
    const values = dragged ? draft.values : base.stored;
    const change = boxChange(base.label, values);
    return {
      frameId: base.frameId,
      objectId: base.objectId,
      className: shown.class,
      label: base.label,
      values,
      edited: base.edited,
      change,
      changeText: describeChange(change),
      labelLidarPoints: shown.annotation?.lidarPoints,
      pointsInView: points ? countInside(points, shown.bbox3D) : null,
      shown,
    };
  }, [base, shownFrame, draft, points]);

  // ---- the undo history of the box the editor is on -------------------------
  // Started when the editor arrives at a box (with the box as it is stored
  // then), dropped when it leaves. Kept in state and replaced while rendering.
  const [session, setSession] = useState<Session | null>(null);
  const sessionKey = editing && base ? base.key : null;
  if ((session?.key ?? null) !== sessionKey) {
    setSession(
      sessionKey && base
        ? { key: sessionKey, history: startHistory(base.stored) }
        : null,
    );
  } else if (session && base && !sameBoxValues(session.history.present, base.stored)) {
    // The stored box is not what this editor last wrote: it was changed from
    // OUTSIDE — another tab edited or reverted the same box. The steps recorded
    // here lead back to states the reviewer is no longer looking at (an Undo
    // would bring back an edit the other tab had removed), so the history
    // starts again from what is stored now. Changes made here never get to
    // this branch: the store and the history are written in the same update.
    setSession({ key: session.key, history: startHistory(base.stored) });
  }
  // When the box became the one being edited (for `MIN_LOOK_MS`). Stamped in
  // an effect: reading the clock is not something a render may do.
  const since = useRef(0);
  useEffect(() => {
    since.current = performance.now();
  }, [sessionKey]);

  // Why the box cannot be changed right now, in words; null = it can. The
  // points are what a box is checked against, so nothing is changed while they
  // are still on their way (a moment); if they could not be fetched at all,
  // editing stays possible — the photos are still there — and the view says so.
  const locked: string | null = !editing
    ? null
    : block !== null
      ? EDIT_BLOCK_MESSAGES[block]
      : !target
        ? EDIT_BLOCK_MESSAGES['not-in-frame']
        : pointsLoading
          ? 'Loading the LiDAR points…'
          : null;

  /** Store `next` as the state of the box (or remove the edit when it is the label again). */
  const store = useCallback(
    (frameId: string, objectId: string, label: BoxValues, next: BoxValues) => {
      if (sameBoxValues(next, label)) removeEdit(scope, frameId, objectId);
      else setEdit(scope, frameId, objectId, next);
    },
    [scope, setEdit, removeEdit],
  );

  /** After a change: if the photo on screen no longer shows the box, show the one that does. */
  const followWithCamera = useCallback(
    (objectId: string, next: BoxValues) => {
      if (!labelFrame || activeCamera === null) return;
      const moved = replaceBoxes(labelFrame, new Map([[objectId, next]]));
      const camera = pickCamera(moved, objectId, activeCamera);
      if (camera !== null && camera !== activeCamera) setCamera(camera);
    },
    [labelFrame, activeCamera, setCamera],
  );

  /** Take a finished change: store it and make it one undo step. */
  const commit = useCallback(
    (next: BoxValues) => {
      if (!base || !session || session.key !== base.key) return;
      const history = pushHistory(session.history, next, sameBoxValues);
      if (history === session.history) return; // nothing changed
      store(base.frameId, base.objectId, base.label, next);
      setSession({ ...session, history });
      followWithCamera(base.objectId, next);
    },
    [base, session, store, followWithCamera],
  );

  // ---- dragging ---------------------------------------------------------------
  const gesture = useRef<{
    handle: DragHandle;
    start: BoxValues;
    from: Vec3;
    latest: BoxValues;
    frameId: string;
    objectId: string;
  } | null>(null);

  /** Grab a handle at a top-view point. Returns false when the box cannot be changed now. */
  const beginDrag = useCallback(
    (handle: DragHandle, at: BevPoint): boolean => {
      if (locked !== null || !base || !projector) return false;
      lastNudge.current = null;
      const start = base.stored;
      gesture.current = {
        handle,
        start,
        from: projector.toGlobal(at, start.translation[2]),
        latest: start,
        frameId: base.frameId,
        objectId: base.objectId,
      };
      return true;
    },
    [locked, base, projector],
  );

  const dragTo = useCallback(
    (at: BevPoint) => {
      const g = gesture.current;
      if (!g || !projector) return;
      // Always from the box as it was when the drag began (no accumulated rounding).
      g.latest = dragBox(g.start, g.handle, g.from, projector.toGlobal(at, g.start.translation[2]));
      setDraft({ frameId: g.frameId, objectId: g.objectId, values: g.latest });
    },
    [projector, setDraft],
  );

  const endDrag = useCallback(() => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    // The editor moved on to another box while the pointer was down (a key
    // went to the next rejected box): the numbers of THAT drag must not be
    // written to the box that is on screen now.
    if (!base || base.frameId !== g.frameId || base.objectId !== g.objectId) {
      setDraft(null);
      return;
    }
    // The store write and the end of the draft happen in the same update, so
    // no frame is painted with the box back at its old place.
    commit(g.latest);
    setDraft(null);
  }, [base, commit, setDraft]);

  const cancelDrag = useCallback(() => {
    gesture.current = null;
    setDraft(null);
  }, [setDraft]);

  // ---- numbers and keys ---------------------------------------------------------
  /** Set one of the panel's numbers. */
  const setField = useCallback(
    (field: BoxField, value: number) => {
      if (locked !== null || !base || !projector) return;
      if (performance.now() - since.current < MIN_LOOK_MS) return;
      lastNudge.current = null;
      commit(setBoxField(base.stored, field, value, { projector, label: base.label }));
    },
    [locked, base, projector, commit],
  );

  /**
   * Move the box by a step as the top view shows it (metres; x right, y down).
   * A run of steps (see `NUDGE_RUN_MS`) is one undo step.
   */
  const lastNudge = useRef<{ key: string; at: number } | null>(null);
  const nudge = useCallback(
    (delta: BevPoint) => {
      if (locked !== null || !base || !projector || gesture.current) return;
      if (!session || session.key !== base.key) return;
      const now = performance.now();
      if (now - since.current < MIN_LOOK_MS) return;
      const next = nudgeBox(base.stored, delta, projector);
      const inRun =
        lastNudge.current !== null &&
        lastNudge.current.key === base.key &&
        now - lastNudge.current.at < NUDGE_RUN_MS;
      lastNudge.current = { key: base.key, at: now };
      if (!inRun) {
        commit(next);
        return;
      }
      store(base.frameId, base.objectId, base.label, next);
      setSession({ ...session, history: amendHistory(session.history, next) });
      followWithCamera(base.objectId, next);
    },
    [locked, base, projector, session, commit, store, followWithCamera],
  );

  const step = useCallback(
    (move: (history: History<BoxValues>) => History<BoxValues>) => {
      if (!base || !session || session.key !== base.key || gesture.current) return;
      lastNudge.current = null; // an undo / redo ends a run of arrow presses
      const history = move(session.history);
      if (history === session.history) return;
      store(base.frameId, base.objectId, base.label, history.present);
      setSession({ ...session, history });
      followWithCamera(base.objectId, history.present);
    },
    [base, session, store, followWithCamera],
  );
  const undo = useCallback(() => step(undoHistory), [step]);
  const redo = useCallback(() => step(redoHistory), [step]);
  /** Back to the dataset's box. An undo step like any other change. */
  const revert = useCallback(() => {
    if (base) commit(base.label);
  }, [base, commit]);

  // ---- opening and closing ------------------------------------------------------
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

  const exit = useCallback(() => {
    gesture.current = null;
    setDraft(null);
    setWanted(false);
  }, [setDraft]);
  const toggleView = useCallback(() => setView((v) => (v === 'focus' ? 'split' : 'focus')), []);

  const history = session && base && session.key === base.key ? session.history : null;

  return {
    editing,
    /** Whether the selected box could be opened in the editor right now. */
    canEnter: available && editable && block === null && selectedId !== null,
    view,
    growFrom,
    projector,
    target,
    /** Why the box cannot be changed right now; null = it can. */
    locked,
    dragging: draft !== null,
    enter,
    exit,
    toggleView,
    beginDrag,
    dragTo,
    endDrag,
    cancelDrag,
    setField,
    nudge,
    /** Undefined when there is nothing to undo / redo / revert — the buttons are then disabled. */
    undo: history && canUndo(history) && locked === null ? undo : undefined,
    redo: history && canRedo(history) && locked === null ? redo : undefined,
    revert: base?.edited && locked === null ? revert : undefined,
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
