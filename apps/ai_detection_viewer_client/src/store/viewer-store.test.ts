import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useViewerStore, createInitialState } from './viewer-store';

beforeEach(() => {
  // Partial reset: resets state fields without replacing action references.
  // createInitialState() returns a fresh Set on every call, so tests cannot
  // accidentally share a mutable Set across runs (Edge_#3.md Case 2).
  useViewerStore.setState(createInitialState());
});

describe('setSelectedObject', () => {
  it('sets selectedObjectId', () => {
    useViewerStore.getState().setSelectedObject('obj-1');
    expect(useViewerStore.getState().selectedObjectId).toBe('obj-1');
  });

  it('clears selectedObjectId when null is passed', () => {
    useViewerStore.getState().setSelectedObject('obj-1');
    useViewerStore.getState().setSelectedObject(null);
    expect(useViewerStore.getState().selectedObjectId).toBeNull();
  });
});

describe('setSelectedFrame', () => {
  it('sets selectedFrameId', () => {
    useViewerStore.getState().setSelectedFrame('frame-1');
    expect(useViewerStore.getState().selectedFrameId).toBe('frame-1');
  });
});

describe('setConfidenceThreshold', () => {
  it('sets a value within [0, 1]', () => {
    useViewerStore.getState().setConfidenceThreshold(0.5);
    expect(useViewerStore.getState().confidenceThreshold).toBe(0.5);
  });

  it('clamps values below 0 to 0', () => {
    useViewerStore.getState().setConfidenceThreshold(-0.5);
    expect(useViewerStore.getState().confidenceThreshold).toBe(0);
  });

  it('clamps values above 1 to 1', () => {
    useViewerStore.getState().setConfidenceThreshold(1.5);
    expect(useViewerStore.getState().confidenceThreshold).toBe(1);
  });
});

// Edge_#3.md Case 1 — non-finite inputs must NOT corrupt the threshold field.
// A NaN threshold would silently break the Step 7 filter selector since
// `confidence >= NaN` is always false (every detection would vanish).
describe('setConfidenceThreshold non-finite inputs', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('ignores NaN and keeps the previous value', () => {
    useViewerStore.getState().setConfidenceThreshold(0.5);
    useViewerStore.getState().setConfidenceThreshold(Number.NaN);
    expect(useViewerStore.getState().confidenceThreshold).toBe(0.5);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('ignores +Infinity and keeps the previous value', () => {
    useViewerStore.getState().setConfidenceThreshold(0.3);
    useViewerStore.getState().setConfidenceThreshold(Number.POSITIVE_INFINITY);
    expect(useViewerStore.getState().confidenceThreshold).toBe(0.3);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('ignores -Infinity and keeps the previous value', () => {
    useViewerStore.getState().setConfidenceThreshold(0.7);
    useViewerStore.getState().setConfidenceThreshold(Number.NEGATIVE_INFINITY);
    expect(useViewerStore.getState().confidenceThreshold).toBe(0.7);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});

describe('toggleClass', () => {
  it('adds a class when not present', () => {
    useViewerStore.getState().toggleClass('person');
    expect(useViewerStore.getState().visibleClasses.has('person')).toBe(true);
  });

  it('removes a class when already present', () => {
    useViewerStore.getState().toggleClass('person');
    useViewerStore.getState().toggleClass('person');
    expect(useViewerStore.getState().visibleClasses.has('person')).toBe(false);
  });

  it('does not affect other classes', () => {
    useViewerStore.getState().toggleClass('person');
    useViewerStore.getState().toggleClass('car');
    useViewerStore.getState().toggleClass('person'); // remove
    const classes = useViewerStore.getState().visibleClasses;
    expect(classes.has('car')).toBe(true);
    expect(classes.has('person')).toBe(false);
  });

  it('produces a new Set instance on each call', () => {
    const before = useViewerStore.getState().visibleClasses;
    useViewerStore.getState().toggleClass('person');
    const after = useViewerStore.getState().visibleClasses;
    expect(before).not.toBe(after);
  });
});

describe('slice independence', () => {
  it('setSelectedObject does not mutate confidenceThreshold or visibleClasses', () => {
    useViewerStore.getState().setConfidenceThreshold(0.7);
    useViewerStore.getState().toggleClass('person');
    const snapClasses = useViewerStore.getState().visibleClasses;

    useViewerStore.getState().setSelectedObject('obj-1');

    const state = useViewerStore.getState();
    expect(state.confidenceThreshold).toBe(0.7);
    expect(state.visibleClasses).toBe(snapClasses);
  });

  it('toggleClass does not mutate selectedObjectId or selectedFrameId', () => {
    useViewerStore.getState().setSelectedObject('obj-1');
    useViewerStore.getState().setSelectedFrame('frame-1');

    useViewerStore.getState().toggleClass('person');

    const state = useViewerStore.getState();
    expect(state.selectedObjectId).toBe('obj-1');
    expect(state.selectedFrameId).toBe('frame-1');
  });

  it('setConfidenceThreshold does not mutate selectedObjectId or visibleClasses', () => {
    useViewerStore.getState().setSelectedObject('obj-2');
    useViewerStore.getState().toggleClass('car');
    const snapClasses = useViewerStore.getState().visibleClasses;

    useViewerStore.getState().setConfidenceThreshold(0.9);

    const state = useViewerStore.getState();
    expect(state.selectedObjectId).toBe('obj-2');
    expect(state.visibleClasses).toBe(snapClasses);
  });
});

// Edge_#3.md Case 2 — the factory must hand out independent Set instances so
// callers cannot share a mutable visibleClasses Set by accident.
describe('createInitialState', () => {
  it('returns a fresh visibleClasses Set on each call', () => {
    const a = createInitialState();
    const b = createInitialState();
    expect(a.visibleClasses).not.toBe(b.visibleClasses);
  });

  it('returns the documented default state', () => {
    const s = createInitialState();
    expect(s.selectedFrameId).toBeNull();
    expect(s.selectedObjectId).toBeNull();
    expect(s.confidenceThreshold).toBe(0);
    expect(s.visibleClasses.size).toBe(0);
  });
});
