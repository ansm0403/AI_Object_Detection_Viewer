import { describe, expect, it } from 'vitest';
import { NUDGE_STEP, NUDGE_STEP_LARGE, resolveEditKey, type EditKeyEvent } from './keys';

const press = (key: string, extra: Partial<EditKeyEvent> = {}) => resolveEditKey({ key, ...extra });

describe('resolveEditKey', () => {
  it('Escape closes the editor, V switches the view', () => {
    expect(press('Escape')).toEqual({ type: 'done' });
    expect(press('v')).toEqual({ type: 'toggle-view' });
    expect(press('V')).toEqual({ type: 'toggle-view' });
  });

  it('arrows move the box by 5 cm as the top view shows it (up = the way the car faces)', () => {
    expect(press('ArrowUp')).toEqual({ type: 'nudge', delta: [0, -NUDGE_STEP] });
    expect(press('ArrowDown')).toEqual({ type: 'nudge', delta: [0, NUDGE_STEP] });
    expect(press('ArrowLeft')).toEqual({ type: 'nudge', delta: [-NUDGE_STEP, 0] });
    expect(press('ArrowRight')).toEqual({ type: 'nudge', delta: [NUDGE_STEP, 0] });
    expect(NUDGE_STEP).toBe(0.05);
  });

  it('with Shift the step is 50 cm', () => {
    expect(press('ArrowRight', { shiftKey: true })).toEqual({ type: 'nudge', delta: [NUDGE_STEP_LARGE, 0] });
    expect(NUDGE_STEP_LARGE).toBe(0.5);
  });

  it('a held arrow keeps moving; Escape and V act once per press', () => {
    expect(press('ArrowUp', { repeat: true })).toEqual({ type: 'nudge', delta: [0, -NUDGE_STEP] });
    expect(press('Escape', { repeat: true })).toBeNull();
    expect(press('v', { repeat: true })).toBeNull();
  });

  it('Ctrl+Z undoes; Ctrl+Shift+Z and Ctrl+Y redo (and the same with the Mac command key)', () => {
    expect(press('z', { ctrlKey: true })).toEqual({ type: 'undo' });
    expect(press('Z', { ctrlKey: true, shiftKey: true })).toEqual({ type: 'redo' });
    expect(press('y', { ctrlKey: true })).toEqual({ type: 'redo' });
    expect(press('z', { metaKey: true })).toEqual({ type: 'undo' });
    expect(press('z', { metaKey: true, shiftKey: true })).toEqual({ type: 'redo' });
  });

  it('a held Ctrl+Z keeps undoing', () => {
    expect(press('z', { ctrlKey: true, repeat: true })).toEqual({ type: 'undo' });
  });

  it('reads the physical key under a Korean layout', () => {
    expect(press('ㅋ', { code: 'KeyZ', ctrlKey: true })).toEqual({ type: 'undo' });
    expect(press('ㅛ', { code: 'KeyY', ctrlKey: true })).toEqual({ type: 'redo' });
    expect(press('ㅍ', { code: 'KeyV' })).toEqual({ type: 'toggle-view' });
    expect(press('Process', { code: 'KeyV' })).toEqual({ type: 'toggle-view' });
  });

  it('does nothing while typing in a field: the field owns its keys', () => {
    for (const key of ['Escape', 'v', 'ArrowLeft', 'ArrowUp']) {
      expect(press(key, { typing: true })).toBeNull();
    }
    expect(press('z', { ctrlKey: true, typing: true })).toBeNull();
  });

  it('leaves other combinations to the browser', () => {
    expect(press('v', { ctrlKey: true })).toBeNull(); // paste
    expect(press('ArrowLeft', { altKey: true })).toBeNull(); // browser back
    expect(press('z')).toBeNull(); // plain Z is the photo zoom of the review keys
    expect(press('a', { ctrlKey: true })).toBeNull();
    expect(press('y', { ctrlKey: true, shiftKey: true })).toBeNull();
  });

  it('is not a review key map: verdict keys mean nothing here', () => {
    for (const key of ['a', 'r', 'u', 'c', 'j', 'k', 'n', '1', 'e']) expect(press(key)).toBeNull();
  });
});
