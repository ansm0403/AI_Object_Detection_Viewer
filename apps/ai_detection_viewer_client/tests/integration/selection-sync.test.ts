import { describe, it, expect, beforeEach } from 'vitest';
import { useViewerStore, createInitialState } from '@/store';

beforeEach(() => {
  useViewerStore.setState(createInitialState());
});

// These helpers represent each viewer's interaction surface.
// Both call the same store action — this is the shared contract under test.
// Immutable Rule #2: selectedObjectId is the single source of truth for selection.
const selectFromViewer2D = (id: string | null) =>
  useViewerStore.getState().setSelectedObject(id);

const selectFromViewer3D = (id: string | null) =>
  useViewerStore.getState().setSelectedObject(id);

const querySelectedId = () => useViewerStore.getState().selectedObjectId;

describe('2D ↔ 3D selection sync', () => {
  it('selecting from 2D is immediately visible from 3D via selectedObjectId', () => {
    selectFromViewer2D('1-1');
    expect(querySelectedId()).toBe('1-1');
  });

  it('selecting from 3D is immediately visible from 2D via selectedObjectId', () => {
    selectFromViewer3D('1-2');
    expect(querySelectedId()).toBe('1-2');
  });

  it('selecting the same id twice does not throw or corrupt state', () => {
    expect(() => {
      selectFromViewer2D('1-1');
      selectFromViewer2D('1-1');
    }).not.toThrow();
    expect(querySelectedId()).toBe('1-1');
  });

  it('setSelectedObject(null) clears the selection from both views', () => {
    selectFromViewer2D('1-1');
    useViewerStore.getState().setSelectedObject(null);
    expect(querySelectedId()).toBeNull();
  });

  // Case 5 — Edge_#5.md: the store intentionally accepts any string id without
  // validating against the current frame's detections (store is UI state only;
  // it has no knowledge of frame data). Components handle unknown ids gracefully
  // by rendering no highlight (d.id === unknownId is always false).
  it('setting a nonexistent objectId does not throw and stores the id as-is', () => {
    expect(() => {
      useViewerStore.getState().setSelectedObject('does-not-exist-in-any-frame');
    }).not.toThrow();
    expect(querySelectedId()).toBe('does-not-exist-in-any-frame');
  });
});
