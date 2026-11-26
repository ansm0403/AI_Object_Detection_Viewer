'use client';

import { useEffect, useState } from 'react';

/**
 * (F7) A value that follows `value` only once it has stopped changing for
 * `delayMs` — "the slider has come to rest".
 *
 * Used for work that is too heavy to redo on every step of a drag: scoring all
 * ten scenes takes ~70–100 ms. React's `useDeferredValue` was tried first and
 * measured (production build, 2026-11-27): it still started that work after
 * every step, and because one computation cannot be interrupted half-way each
 * start blocked the next paint — 145 ms of JS per slider step against 49 ms
 * before, worst frame while dragging 156 ms against 95 ms. Waiting for the
 * value to settle does the heavy work once per gesture instead.
 *
 * The first value is returned at once (no delay on mount). While a newer value
 * is waiting, the old one is returned; the caller compares the two to show that
 * a number is catching up.
 */
export function useSettledValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (Object.is(settled, value)) return;
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, settled, delayMs]);
  return settled;
}
