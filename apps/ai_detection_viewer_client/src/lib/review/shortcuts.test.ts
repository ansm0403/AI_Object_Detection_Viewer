import { describe, expect, it } from 'vitest';
import { isTypingTarget, resolveShortcut } from './shortcuts';
import { REJECT_REASONS } from './types';

const press = (key: string, extra: object = {}) => resolveShortcut({ key, ...extra });

describe('resolveShortcut — key map', () => {
  it('maps A / R / U to the three verdicts', () => {
    expect(press('a')).toEqual({ type: 'verdict', verdict: 'approved' });
    expect(press('r')).toEqual({ type: 'verdict', verdict: 'rejected' });
    expect(press('u')).toEqual({ type: 'verdict', verdict: 'unsure' });
  });

  it('maps C to clear, N to next frame', () => {
    expect(press('c')).toEqual({ type: 'clear' });
    expect(press('n')).toEqual({ type: 'next-frame' });
  });

  it('maps J / K to next / previous in the queue', () => {
    expect(press('j')).toEqual({ type: 'step', direction: 1 });
    expect(press('k')).toEqual({ type: 'step', direction: -1 });
  });

  it('maps 1–6 to the reject reasons in their display order', () => {
    REJECT_REASONS.forEach((reason, i) => {
      expect(press(String(i + 1))).toEqual({ type: 'reason', reason });
    });
  });

  it('ignores digits without a reason (7–9, 0)', () => {
    for (const key of ['7', '8', '9', '0']) expect(press(key)).toBeNull();
  });

  it('is case-insensitive (Caps Lock / Shift)', () => {
    expect(press('A')).toEqual({ type: 'verdict', verdict: 'approved' });
    expect(press('J')).toEqual({ type: 'step', direction: 1 });
  });

  it('returns null for keys that are not shortcuts', () => {
    for (const key of ['x', 'Enter', ' ', 'Escape', 'ArrowDown', 'Tab', 'Shift']) {
      expect(press(key)).toBeNull();
    }
  });
});

describe('resolveShortcut — when shortcuts must not fire', () => {
  it('ignores combinations with Ctrl / Meta / Alt (e.g. Ctrl+R reloads)', () => {
    expect(press('r', { ctrlKey: true })).toBeNull();
    expect(press('a', { metaKey: true })).toBeNull();
    expect(press('j', { altKey: true })).toBeNull();
  });

  it('ignores every key while typing in a text field', () => {
    const note = { tagName: 'INPUT', type: 'text' };
    for (const key of ['a', 'r', 'u', 'c', 'j', 'k', 'n', '1']) {
      expect(press(key, { target: note })).toBeNull();
    }
  });

  it('acts once per press for verdicts, clear, reasons and frame jumps', () => {
    for (const key of ['a', 'r', 'u', 'c', 'n', '2']) {
      expect(press(key, { repeat: true })).toBeNull();
    }
  });

  it('lets a held J / K keep moving through the queue', () => {
    expect(press('j', { repeat: true })).toEqual({ type: 'step', direction: 1 });
    expect(press('k', { repeat: true })).toEqual({ type: 'step', direction: -1 });
  });
});

describe('isTypingTarget', () => {
  it('is true for text-like inputs, textareas, selects and editable content', () => {
    expect(isTypingTarget({ tagName: 'INPUT', type: 'text' })).toBe(true);
    expect(isTypingTarget({ tagName: 'INPUT', type: 'search' })).toBe(true);
    expect(isTypingTarget({ tagName: 'INPUT', type: 'number' })).toBe(true);
    expect(isTypingTarget({ tagName: 'INPUT' })).toBe(true); // no type = text
    expect(isTypingTarget({ tagName: 'input', type: 'TEXT' })).toBe(true);
    expect(isTypingTarget({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isTypingTarget({ tagName: 'SELECT' })).toBe(true);
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
  });

  it('is false for sliders, checkboxes, buttons and plain elements', () => {
    expect(isTypingTarget({ tagName: 'INPUT', type: 'range' })).toBe(false);
    expect(isTypingTarget({ tagName: 'INPUT', type: 'checkbox' })).toBe(false);
    expect(isTypingTarget({ tagName: 'BUTTON' })).toBe(false);
    expect(isTypingTarget({ tagName: 'LI' })).toBe(false);
    expect(isTypingTarget({ tagName: 'CANVAS' })).toBe(false);
  });

  it('is false for a missing or non-element target', () => {
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget(undefined)).toBe(false);
    expect(isTypingTarget('body')).toBe(false);
  });
});
