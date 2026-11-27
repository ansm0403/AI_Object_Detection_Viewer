/**
 * Undo history (F8), as plain data.
 *
 * A list of the states something went through, and where in that list "now"
 * is. Undo steps back, redo steps forward, and a new change made after an undo
 * drops what was ahead (the usual rule of every editor).
 *
 * One completed change is one step — a drag is pushed ONCE, when it ends, not
 * once per mouse move. The functions return the SAME history when nothing
 * changes, so a caller can compare by identity.
 */
export type History<T> = {
  /** Earlier states, oldest first. */
  past: readonly T[];
  present: T;
  /** States that were undone, nearest first. */
  future: readonly T[];
};

/** Steps kept. Older ones are dropped: undo then stops there instead of growing without bound. */
export const HISTORY_LIMIT = 100;

export function startHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

/**
 * Record a new state. `same` decides whether it differs from the current one;
 * pushing an identical state changes nothing (a click without a drag must not
 * become an undo step).
 */
export function pushHistory<T>(
  history: History<T>,
  next: T,
  same: (a: T, b: T) => boolean = Object.is,
): History<T> {
  if (same(history.present, next)) return history;
  const past = [...history.past, history.present];
  return {
    past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past,
    present: next,
    future: [],
  };
}

export const canUndo = <T>(history: History<T>): boolean => history.past.length > 0;
export const canRedo = <T>(history: History<T>): boolean => history.future.length > 0;

export function undoHistory<T>(history: History<T>): History<T> {
  if (!canUndo(history)) return history;
  const previous = history.past[history.past.length - 1];
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redoHistory<T>(history: History<T>): History<T> {
  if (!canRedo(history)) return history;
  const [next, ...rest] = history.future;
  return { past: [...history.past, history.present], present: next, future: rest };
}
