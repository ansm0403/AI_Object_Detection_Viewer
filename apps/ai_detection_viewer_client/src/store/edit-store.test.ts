import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getEdit, type BoxValues } from '@/lib/editing';
import { EDIT_STORAGE_KEY, createEditStore } from './edit-store';
import { REVIEW_STORAGE_KEY, createReviewStore, type StorageBackend } from './review-store';

const NOW = new Date('2026-11-27T08:00:00.000Z');
const VALUES: BoxValues = { translation: [10, 3, 0.8], size: [1.8, 4.5, 1.6], yaw: 0.4 };

/** In-memory stand-in for localStorage. */
function memoryBackend(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const storage = {
    getItem: (name: string) => data.get(name) ?? null,
    setItem: (name: string, value: string) => void data.set(name, value),
    removeItem: (name: string) => void data.delete(name),
  };
  const backend: StorageBackend = () => storage;
  return { backend, data };
}

const saved = (data: Map<string, string>) => JSON.parse(data.get(EDIT_STORAGE_KEY) ?? 'null');

describe('edit store actions', () => {
  // No backend at all (as in server rendering): actions must still work.
  const makeStore = () => createEditStore(() => undefined);

  it('starts empty in both scopes', () => {
    const store = makeStore();
    expect(store.getState().edits).toEqual({ nuscenes: {}, 'nuscenes-practice': {} });
    expect(store.getState().storageFailed).toBe(false);
  });

  it('setEdit records the values with the given time', () => {
    const store = makeStore();
    store.getState().setEdit('nuscenes', 'f1', 'a', VALUES, NOW);
    expect(getEdit(store.getState().edits.nuscenes, 'f1', 'a')).toEqual({
      frameId: 'f1',
      objectId: 'a',
      ...VALUES,
      editedAt: NOW.toISOString(),
    });
  });

  it('keeps the practice scope separate from the real one', () => {
    const store = makeStore();
    store.getState().setEdit('nuscenes-practice', 'f1', 'a', VALUES, NOW);
    expect(store.getState().edits.nuscenes).toEqual({});
    expect(Object.keys(store.getState().edits['nuscenes-practice'])).toHaveLength(1);
  });

  it('removeEdit returns the box to the dataset, resetScope clears one scope only', () => {
    const store = makeStore();
    store.getState().setEdit('nuscenes', 'f1', 'a', VALUES, NOW);
    store.getState().setEdit('nuscenes', 'f1', 'b', VALUES, NOW);
    store.getState().setEdit('nuscenes-practice', 'f1', 'a', VALUES, NOW);
    store.getState().removeEdit('nuscenes', 'f1', 'a');
    expect(Object.keys(store.getState().edits.nuscenes)).toHaveLength(1);
    store.getState().resetScope('nuscenes');
    expect(store.getState().edits.nuscenes).toEqual({});
    expect(Object.keys(store.getState().edits['nuscenes-practice'])).toHaveLength(1);
  });

  it('does not notify subscribers when an action changes nothing', () => {
    const store = makeStore();
    store.getState().setEdit('nuscenes', 'f1', 'a', VALUES, NOW);
    const listener = vi.fn();
    store.subscribe(listener);
    store.getState().setEdit('nuscenes', 'f1', 'a', { ...VALUES }, new Date());
    store.getState().removeEdit('nuscenes', 'f1', 'zzz');
    store.getState().resetScope('nuscenes-practice');
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('edit store persistence', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  it('saves only the records, under its own key', () => {
    const { backend, data } = memoryBackend();
    const store = createEditStore(backend);
    store.getState().setEdit('nuscenes', 'f1', 'a', VALUES, NOW);
    expect([...data.keys()]).toEqual([EDIT_STORAGE_KEY]);
    expect(Object.keys(saved(data).state)).toEqual(['edits']);
    expect(Object.keys(saved(data).state.edits.nuscenes)).toHaveLength(1);
  });

  it('does not load anything until rehydrate() is called, then restores the edits', async () => {
    const first = memoryBackend();
    createEditStore(first.backend).getState().setEdit('nuscenes', 'f1', 'a', VALUES, NOW);
    const store = createEditStore(memoryBackend(Object.fromEntries(first.data)).backend);
    expect(store.getState().edits.nuscenes).toEqual({});
    await store.persist.rehydrate();
    expect(getEdit(store.getState().edits.nuscenes, 'f1', 'a')).toMatchObject(VALUES);
  });

  it('drops invalid stored records while loading, keeping the valid ones', async () => {
    const stored = {
      state: {
        edits: {
          nuscenes: {
            ok: { frameId: 'f1', objectId: 'a', ...VALUES, editedAt: '' },
            bad: { frameId: 'f1', objectId: 'b', translation: [1, 2], size: [1, 1, 1], yaw: 0 },
          },
        },
      },
      version: 1,
    };
    const store = createEditStore(memoryBackend({ [EDIT_STORAGE_KEY]: JSON.stringify(stored) }).backend);
    await store.persist.rehydrate();
    expect(Object.keys(store.getState().edits.nuscenes)).toEqual(['f1/a']);
    expect(store.getState().edits['nuscenes-practice']).toEqual({});
  });

  it('starts empty, without throwing, when the stored text is not JSON', async () => {
    const store = createEditStore(memoryBackend({ [EDIT_STORAGE_KEY]: '{not json' }).backend);
    await store.persist.rehydrate();
    expect(store.getState().edits).toEqual({ nuscenes: {}, 'nuscenes-practice': {} });
  });

  it('keeps working and raises storageFailed when saving throws, and clears it when saving works again', () => {
    let failing = true;
    const data = new Map<string, string>();
    const backend: StorageBackend = () => ({
      getItem: (name) => data.get(name) ?? null,
      setItem: (name, value) => {
        if (failing) throw new Error('QuotaExceededError');
        data.set(name, value);
      },
      removeItem: (name) => void data.delete(name),
    });
    const store = createEditStore(backend);
    expect(() => store.getState().setEdit('nuscenes', 'f1', 'a', VALUES, NOW)).not.toThrow();
    expect(store.getState().storageFailed).toBe(true);
    expect(getEdit(store.getState().edits.nuscenes, 'f1', 'a')).toBeDefined();
    failing = false;
    store.getState().setEdit('nuscenes', 'f1', 'b', VALUES, NOW);
    expect(store.getState().storageFailed).toBe(false);
    // the save that worked holds the edit made while saving failed
    expect(Object.keys(saved(data).state.edits.nuscenes).sort()).toEqual(['f1/a', 'f1/b']);
  });
});

describe('edits and reviews do not touch each other in storage', () => {
  it('writing an edit leaves the stored reviews byte for byte as they were, and the reverse', () => {
    const { backend, data } = memoryBackend();
    const reviews = createReviewStore(backend);
    reviews.getState().setVerdict('nuscenes-false-alarms', 'f1', 'pred:f1:CAM_FRONT:3', 'approved', NOW);
    reviews.getState().setVerdict('nuscenes', 'f1', 'a', 'rejected', NOW);
    const reviewsBefore = data.get(REVIEW_STORAGE_KEY);
    expect(reviewsBefore).toBeDefined();

    const edits = createEditStore(backend);
    edits.getState().setEdit('nuscenes', 'f1', 'a', VALUES, NOW);
    edits.getState().removeEdit('nuscenes', 'f1', 'a');
    edits.getState().setEdit('nuscenes', 'f1', 'a', { ...VALUES, yaw: 1 }, NOW);
    expect(data.get(REVIEW_STORAGE_KEY)).toBe(reviewsBefore);

    const editsBefore = data.get(EDIT_STORAGE_KEY);
    reviews.getState().setVerdict('nuscenes', 'f1', 'b', 'approved', NOW);
    reviews.getState().resetScope('nuscenes');
    expect(data.get(EDIT_STORAGE_KEY)).toBe(editsBefore);
  });

  it('data stored before F8 (reviews only, no edits key) loads with empty edits and intact reviews', async () => {
    const before = memoryBackend();
    const old = createReviewStore(before.backend);
    old.getState().setVerdict('nuscenes-false-alarms', 'f1', 'pred:f1:CAM_FRONT:3', 'approved', NOW);
    const data = Object.fromEntries(before.data);
    expect(Object.keys(data)).toEqual([REVIEW_STORAGE_KEY]);

    const { backend } = memoryBackend(data);
    const edits = createEditStore(backend);
    const reviews = createReviewStore(backend);
    await edits.persist.rehydrate();
    await reviews.persist.rehydrate();
    expect(edits.getState().edits).toEqual({ nuscenes: {}, 'nuscenes-practice': {} });
    expect(Object.keys(reviews.getState().reviews['nuscenes-false-alarms'])).toHaveLength(1);
  });
});
