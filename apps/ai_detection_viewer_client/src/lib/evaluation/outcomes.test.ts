import { describe, expect, it } from 'vitest';
import { EVAL_KINDS, OUTCOME_COLOR, OUTCOME_LABEL, countOf, formatPercent } from './outcomes';
import type { EvalCounts } from './types';

describe('outcomes table', () => {
  it('lists every outcome once, misses first', () => {
    expect(EVAL_KINDS).toEqual(['missed', 'false-alarm', 'found', 'not-scored']);
    expect(new Set(EVAL_KINDS).size).toBe(4);
  });

  it('has a label and a distinct colour for every outcome', () => {
    for (const kind of EVAL_KINDS) {
      expect(OUTCOME_LABEL[kind]).toBeTruthy();
      expect(OUTCOME_COLOR[kind]).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(new Set(EVAL_KINDS.map((k) => OUTCOME_COLOR[k])).size).toBe(4);
  });

  it('countOf reads the matching counter', () => {
    const counts: EvalCounts = { found: 1, missed: 2, falseAlarm: 3, notScored: 4 };
    expect(EVAL_KINDS.map((k) => countOf(counts, k))).toEqual([2, 3, 1, 4]);
  });
});

describe('formatPercent', () => {
  it('rounds to a whole percentage', () => {
    expect(formatPercent(91 / 104)).toBe('88%');
    expect(formatPercent(91 / 174)).toBe('52%');
    expect(formatPercent(1)).toBe('100%');
  });

  it('0 is a real value: nothing found where something was', () => {
    expect(formatPercent(0)).toBe('0%');
  });

  it('shows a dash — never 0% — when there is no ratio', () => {
    expect(formatPercent(null)).toBe('—');
    expect(formatPercent(Number.NaN)).toBe('—');
  });
});
