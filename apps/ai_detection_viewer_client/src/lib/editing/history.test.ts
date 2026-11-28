import { describe, expect, it } from 'vitest';
import {
  HISTORY_LIMIT,
  amendHistory,
  canRedo,
  canUndo,
  pushHistory,
  redoHistory,
  startHistory,
  undoHistory,
} from './history';

describe('undo history', () => {
  it('starts with nothing to undo or redo', () => {
    const h = startHistory('a');
    expect(h.present).toBe('a');
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
    expect(undoHistory(h)).toBe(h);
    expect(redoHistory(h)).toBe(h);
  });

  it('three changes, three undos: back at the start; three redos: at the third change', () => {
    let h = startHistory('label');
    for (const state of ['one', 'two', 'three']) h = pushHistory(h, state);
    h = undoHistory(undoHistory(undoHistory(h)));
    expect(h.present).toBe('label');
    expect(canUndo(h)).toBe(false);
    h = redoHistory(redoHistory(redoHistory(h)));
    expect(h.present).toBe('three');
    expect(canRedo(h)).toBe(false);
  });

  it('undo then redo is where it was', () => {
    const h = pushHistory(pushHistory(startHistory(1), 2), 3);
    expect(redoHistory(undoHistory(h))).toEqual(h);
  });

  it('a new change after an undo drops what was ahead', () => {
    let h = pushHistory(pushHistory(startHistory('a'), 'b'), 'c');
    h = pushHistory(undoHistory(h), 'd');
    expect(h.present).toBe('d');
    expect(canRedo(h)).toBe(false);
    expect(undoHistory(h).present).toBe('b');
  });

  it('pushing the state it already has is not a step', () => {
    const h = pushHistory(startHistory({ n: 1 }), { n: 2 }, (a, b) => a.n === b.n);
    expect(pushHistory(h, { n: 2 }, (a, b) => a.n === b.n)).toBe(h);
    expect(h.past).toHaveLength(1);
  });

  it('keeps at most HISTORY_LIMIT earlier states (the oldest go first)', () => {
    let h = startHistory(0);
    for (let i = 1; i <= HISTORY_LIMIT + 25; i += 1) h = pushHistory(h, i);
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    expect(h.past[0]).toBe(25);
    expect(h.present).toBe(HISTORY_LIMIT + 25);
  });

  it('amendHistory changes the present without adding a step', () => {
    // one arrow press is pushed, the rest of the run amends it: one Undo takes the run back
    let h = pushHistory(startHistory('label'), 'moved 5 cm');
    h = amendHistory(h, 'moved 10 cm');
    h = amendHistory(h, 'moved 15 cm');
    expect(h.present).toBe('moved 15 cm');
    expect(h.past).toEqual(['label']);
    expect(undoHistory(h).present).toBe('label');
  });

  it('amendHistory drops what was ahead, and is a no-op for the same state', () => {
    const h = undoHistory(pushHistory(pushHistory(startHistory('a'), 'b'), 'c'));
    expect(canRedo(h)).toBe(true);
    const amended = amendHistory(h, 'b2');
    expect(amended.present).toBe('b2');
    expect(canRedo(amended)).toBe(false);
    expect(amendHistory(amended, 'b2')).toBe(amended);
  });

  it('never mutates the history it was given', () => {
    const h = pushHistory(startHistory('a'), 'b');
    const frozen = JSON.stringify(h);
    undoHistory(h);
    pushHistory(h, 'c');
    expect(JSON.stringify(h)).toBe(frozen);
  });
});
