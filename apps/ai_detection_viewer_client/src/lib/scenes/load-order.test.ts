import { describe, expect, it } from 'vitest';
import { countSceneStates, scenesToRequest, stepScene, type SceneLoadState } from './load-order';

const NAMES = ['s1', 's2', 's3', 's4'];
const states = (entries: Record<string, SceneLoadState>) => new Map(Object.entries(entries));

describe('scenesToRequest', () => {
  // Most cases use one request at a time, so the ORDER is easy to read.
  const one = (st: Map<string, SceneLoadState>, active: string | null) =>
    scenesToRequest(NAMES, st, active, 1);

  it('asks for the active scene first', () => {
    expect(one(states({}), 's3')).toEqual(['s3']);
  });

  it('asks for the active scene even when the limit is already reached', () => {
    expect(one(states({ s1: 'loading' }), 's3')).toEqual(['s3']);
    expect(scenesToRequest(NAMES, states({ s1: 'loading', s2: 'loading' }), 's3', 2)).toEqual(['s3']);
  });

  it('then the scenes after the active one, wrapping around', () => {
    expect(one(states({ s3: 'ready' }), 's3')).toEqual(['s4']);
    expect(one(states({ s3: 'ready', s4: 'ready' }), 's3')).toEqual(['s1']);
    expect(one(states({ s3: 'ready', s4: 'ready', s1: 'ready' }), 's3')).toEqual(['s2']);
  });

  it('asks for nothing more while the limit of running requests is reached', () => {
    expect(one(states({ s3: 'loading' }), 's3')).toEqual([]);
    expect(one(states({ s3: 'ready', s4: 'loading' }), 's3')).toEqual([]);
  });

  it('by default two scenes load at a time', () => {
    // Nothing requested yet: the active scene and the one after it.
    expect(scenesToRequest(NAMES, states({}), 's3')).toEqual(['s3', 's4']);
    // One running: one more is added.
    expect(scenesToRequest(NAMES, states({ s3: 'ready', s4: 'loading' }), 's3')).toEqual(['s1']);
    // Two running: nothing.
    expect(
      scenesToRequest(NAMES, states({ s3: 'ready', s4: 'loading', s1: 'loading' }), 's3'),
    ).toEqual([]);
  });

  it('a scene that hangs does not hold up the ones behind it', () => {
    // s4 never finishes. The others still get their turn, one after another.
    const stuck: Record<string, SceneLoadState> = { s3: 'ready', s4: 'loading' };
    expect(scenesToRequest(NAMES, states(stuck), 's3')).toEqual(['s1']);
    expect(scenesToRequest(NAMES, states({ ...stuck, s1: 'ready' }), 's3')).toEqual(['s2']);
    expect(scenesToRequest(NAMES, states({ ...stuck, s1: 'ready', s2: 'ready' }), 's3')).toEqual([]);
  });

  it('asks for nothing once every scene has been requested', () => {
    expect(
      scenesToRequest(NAMES, states({ s1: 'ready', s2: 'ready', s3: 'ready', s4: 'ready' }), 's3'),
    ).toEqual([]);
  });

  it('does not ask again for a scene that failed, and moves on past it', () => {
    expect(one(states({ s3: 'failed' }), 's3')).toEqual(['s4']);
    expect(one(states({ s3: 'ready', s4: 'failed' }), 's3')).toEqual(['s1']);
  });

  it('without an active scene (or with an unknown one) starts from the first', () => {
    expect(one(states({}), null)).toEqual(['s1']);
    expect(one(states({}), 'nope')).toEqual(['s1']);
    expect(one(states({ s1: 'ready' }), 'nope')).toEqual(['s2']);
  });

  it('no scenes → nothing to ask for', () => {
    expect(scenesToRequest([], states({}), 's1')).toEqual([]);
  });

  it('ignores states of scenes that are not in the list', () => {
    expect(one(states({ gone: 'loading' }), 's1')).toEqual(['s1']);
    expect(one(states({ gone: 'loading', s1: 'ready' }), 's1')).toEqual(['s2']);
  });

  it('a limit that is not a positive number means one at a time', () => {
    for (const limit of [0, -2, Number.NaN]) {
      expect(scenesToRequest(NAMES, states({ s3: 'ready' }), 's3', limit)).toEqual(['s4']);
    }
  });

  it('never asks for the same scene twice in one answer', () => {
    expect(scenesToRequest(['only'], states({}), 'only', 5)).toEqual(['only']);
    expect(scenesToRequest(NAMES, states({}), 's1', 9)).toEqual(['s1', 's2', 's3', 's4']);
  });
});

describe('stepScene', () => {
  it('moves to the neighbouring scene', () => {
    expect(stepScene(NAMES, 's2', 1)).toBe('s3');
    expect(stepScene(NAMES, 's2', -1)).toBe('s1');
  });

  it('wraps around both ends', () => {
    expect(stepScene(NAMES, 's4', 1)).toBe('s1');
    expect(stepScene(NAMES, 's1', -1)).toBe('s4');
    expect(stepScene(NAMES, 's1', -5)).toBe('s4');
    expect(stepScene(NAMES, 's1', 9)).toBe('s2');
  });

  it('a step of 0 (or a non-number) stays where it is', () => {
    expect(stepScene(NAMES, 's2', 0)).toBe('s2');
    expect(stepScene(NAMES, 's2', Number.NaN)).toBe('s2');
  });

  it('from an unknown scene: forward starts at the first, back at the last', () => {
    expect(stepScene(NAMES, null, 1)).toBe('s1');
    expect(stepScene(NAMES, 'nope', 1)).toBe('s1');
    expect(stepScene(NAMES, 'nope', -1)).toBe('s4');
  });

  it('with one scene stays on it; with none there is nowhere to go', () => {
    expect(stepScene(['only'], 'only', 1)).toBe('only');
    expect(stepScene([], 's1', 1)).toBeNull();
  });
});

describe('countSceneStates', () => {
  it('counts ready, failed and still-pending scenes', () => {
    expect(countSceneStates(NAMES, states({ s1: 'ready', s2: 'loading', s3: 'failed' }))).toEqual({
      total: 4,
      ready: 1,
      failed: 1,
      pending: 2,
    });
  });

  it('an empty list is all zeros', () => {
    expect(countSceneStates([], states({}))).toEqual({ total: 0, ready: 0, failed: 0, pending: 0 });
  });
});
