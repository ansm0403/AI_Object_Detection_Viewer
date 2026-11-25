import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getReview } from '@/lib/review';
import {
  REVIEW_STORAGE_KEY,
  createReviewStore,
  createSafeStorage,
  type StorageBackend,
} from './review-store';

const NOW = new Date('2026-11-25T10:00:00.000Z');

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

const saved = (data: Map<string, string>) => JSON.parse(data.get(REVIEW_STORAGE_KEY) ?? 'null');

describe('review store actions', () => {
  // No backend at all (as in server rendering): actions must still work.
  const makeStore = () => createReviewStore(() => undefined);

  it('starts empty in both scopes', () => {
    const store = makeStore();
    expect(store.getState().reviews).toEqual({ nuscenes: {}, 'nuscenes-practice': {} });
    expect(store.getState().storageFailed).toBe(false);
  });

  it('setVerdict records the verdict with the given time', () => {
    const store = makeStore();
    store.getState().setVerdict('nuscenes', 'f1', 'a', 'approved', NOW);
    expect(getReview(store.getState().reviews.nuscenes, 'f1', 'a')).toMatchObject({
      verdict: 'approved',
      reviewedAt: NOW.toISOString(),
    });
  });

  it('keeps verdicts per frame for the same object id', () => {
    const store = makeStore();
    store.getState().setVerdict('nuscenes', 'f1', 'a', 'approved', NOW);
    store.getState().setVerdict('nuscenes', 'f2', 'a', 'rejected', NOW);
    const { nuscenes } = store.getState().reviews;
    expect(getReview(nuscenes, 'f1', 'a')?.verdict).toBe('approved');
    expect(getReview(nuscenes, 'f2', 'a')?.verdict).toBe('rejected');
  });

  it('keeps the practice scope separate from the real one', () => {
    const store = makeStore();
    store.getState().setVerdict('nuscenes-practice', 'f1', 'a', 'rejected', NOW);
    expect(store.getState().reviews.nuscenes).toEqual({});
    expect(Object.keys(store.getState().reviews['nuscenes-practice'])).toHaveLength(1);
  });

  it('toggleReason and setNote edit a rejected box', () => {
    const store = makeStore();
    store.getState().setVerdict('nuscenes', 'f1', 'a', 'rejected', NOW);
    store.getState().toggleReason('nuscenes', 'f1', 'a', 'wrong_heading');
    store.getState().setNote('nuscenes', 'f1', 'a', 'faces the other way');
    expect(getReview(store.getState().reviews.nuscenes, 'f1', 'a')).toMatchObject({
      reasons: ['wrong_heading'],
      note: 'faces the other way',
    });
  });

  it('clearReview returns the box to "not reviewed"', () => {
    const store = makeStore();
    store.getState().setVerdict('nuscenes', 'f1', 'a', 'unsure', NOW);
    store.getState().clearReview('nuscenes', 'f1', 'a');
    expect(store.getState().reviews.nuscenes).toEqual({});
  });

  it('resetScope clears one scope and leaves the other', () => {
    const store = makeStore();
    store.getState().setVerdict('nuscenes', 'f1', 'a', 'approved', NOW);
    store.getState().setVerdict('nuscenes-practice', 'f1', 'a', 'rejected', NOW);
    store.getState().resetScope('nuscenes-practice');
    expect(Object.keys(store.getState().reviews.nuscenes)).toHaveLength(1);
    expect(store.getState().reviews['nuscenes-practice']).toEqual({});
  });

  it('does not notify subscribers when an action changes nothing', () => {
    const store = makeStore();
    store.getState().setVerdict('nuscenes', 'f1', 'a', 'approved', NOW);
    const listener = vi.fn();
    store.subscribe(listener);
    store.getState().setVerdict('nuscenes', 'f1', 'a', 'approved', new Date());
    store.getState().toggleReason('nuscenes', 'f1', 'a', 'other'); // not rejected
    store.getState().clearReview('nuscenes', 'f9', 'zzz');
    store.getState().resetScope('nuscenes-practice'); // already empty
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('review store persistence', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    warn.mockRestore();
  });

  it('saves only the records, under the storage key', () => {
    const { backend, data } = memoryBackend();
    const store = createReviewStore(backend);
    store.getState().setVerdict('nuscenes', 'f1', 'a', 'approved', NOW);
    const stored = saved(data);
    expect(stored.version).toBe(1);
    expect(Object.keys(stored.state)).toEqual(['reviews']);
    expect(stored.state.reviews.nuscenes['f1/a'].verdict).toBe('approved');
  });

  it('does not load anything until rehydrate() is called (no hydration mismatch)', async () => {
    const { backend, data } = memoryBackend();
    createReviewStore(backend).getState().setVerdict('nuscenes', 'f1', 'a', 'rejected', NOW);

    const reopened = createReviewStore(() => ({
      getItem: (name) => data.get(name) ?? null,
      setItem: (name, value) => void data.set(name, value),
      removeItem: (name) => void data.delete(name),
    }));
    expect(reopened.getState().reviews.nuscenes).toEqual({});

    await reopened.persist.rehydrate();
    expect(getReview(reopened.getState().reviews.nuscenes, 'f1', 'a')?.verdict).toBe('rejected');
    // Actions survive the rehydrate (state is replaced, not just merged).
    reopened.getState().clearReview('nuscenes', 'f1', 'a');
    expect(reopened.getState().reviews.nuscenes).toEqual({});
  });

  it('drops invalid stored records while loading, keeping the valid ones', async () => {
    const { backend } = memoryBackend({
      [REVIEW_STORAGE_KEY]: JSON.stringify({
        version: 1,
        state: {
          reviews: {
            nuscenes: {
              good: { frameId: 'f1', objectId: 'a', verdict: 'approved', reasons: [], note: '', reviewedAt: '' },
              bad: { frameId: 'f1', objectId: 'b', verdict: 'whatever' },
            },
          },
        },
      }),
    });
    const store = createReviewStore(backend);
    await store.persist.rehydrate();
    expect(Object.keys(store.getState().reviews.nuscenes)).toEqual(['f1/a']);
    expect(warn).toHaveBeenCalled();
  });

  it('loads data written by a different storage version through the same validation', async () => {
    const { backend } = memoryBackend({
      [REVIEW_STORAGE_KEY]: JSON.stringify({
        version: 0,
        state: {
          reviews: {
            nuscenes: {
              k: { frameId: 'f1', objectId: 'a', verdict: 'unsure', reasons: [], note: '', reviewedAt: '' },
            },
          },
        },
      }),
    });
    const store = createReviewStore(backend);
    await store.persist.rehydrate();
    expect(getReview(store.getState().reviews.nuscenes, 'f1', 'a')?.verdict).toBe('unsure');
  });

  it('starts empty, without throwing, when the stored text is not JSON', async () => {
    const { backend } = memoryBackend({ [REVIEW_STORAGE_KEY]: '{not json' });
    const store = createReviewStore(backend);
    await store.persist.rehydrate();
    expect(store.getState().reviews.nuscenes).toEqual({});
    // The store is still usable afterwards.
    store.getState().setVerdict('nuscenes', 'f1', 'a', 'approved', NOW);
    expect(Object.keys(store.getState().reviews.nuscenes)).toHaveLength(1);
  });

  it('keeps working and raises storageFailed when saving throws (storage full)', () => {
    const backend: StorageBackend = () => ({
      getItem: () => null,
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError');
      },
      removeItem: () => undefined,
    });
    const store = createReviewStore(backend);
    expect(() => store.getState().setVerdict('nuscenes', 'f1', 'a', 'approved', NOW)).not.toThrow();
    expect(getReview(store.getState().reviews.nuscenes, 'f1', 'a')?.verdict).toBe('approved');
    expect(store.getState().storageFailed).toBe(true);
  });

  it('clears storageFailed once a later save succeeds, and that save holds everything', () => {
    const data = new Map<string, string>();
    let full = true;
    const store = createReviewStore(() => ({
      getItem: (name) => data.get(name) ?? null,
      setItem: (name, value) => {
        if (full) throw new DOMException('quota', 'QuotaExceededError');
        data.set(name, value);
      },
      removeItem: (name) => void data.delete(name),
    }));
    store.getState().setVerdict('nuscenes', 'f1', 'a', 'approved', NOW);
    expect(store.getState().storageFailed).toBe(true);
    full = false; // space was freed
    store.getState().setVerdict('nuscenes', 'f1', 'b', 'rejected', NOW);
    expect(store.getState().storageFailed).toBe(false);
    // The record made while saving failed is in the saved data too.
    expect(Object.keys(saved(data).state.reviews.nuscenes)).toEqual(['f1/a', 'f1/b']);
  });

  it('keeps working and raises storageFailed when storage access itself throws (blocked)', async () => {
    const store = createReviewStore(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    await store.persist.rehydrate();
    expect(store.getState().storageFailed).toBe(true);
    expect(() => store.getState().setVerdict('nuscenes', 'f1', 'a', 'rejected', NOW)).not.toThrow();
    expect(Object.keys(store.getState().reviews.nuscenes)).toHaveLength(1);
  });

  it('does not flag a failure when there is simply no storage (server render)', async () => {
    const store = createReviewStore(() => undefined);
    await store.persist.rehydrate();
    store.getState().setVerdict('nuscenes', 'f1', 'a', 'approved', NOW);
    expect(store.getState().storageFailed).toBe(false);
  });
});

describe('createSafeStorage', () => {
  it('passes values through to the backend', () => {
    const { backend, data } = memoryBackend();
    const storage = createSafeStorage(backend, () => undefined);
    storage.setItem('k', 'v');
    expect(storage.getItem('k')).toBe('v');
    storage.removeItem('k');
    expect(data.has('k')).toBe(false);
  });

  it('reports errors through onError and returns the fallback instead of throwing', () => {
    const onError = vi.fn();
    const storage = createSafeStorage(() => {
      throw new Error('blocked');
    }, onError);
    expect(storage.getItem('k')).toBeNull();
    expect(() => storage.setItem('k', 'v')).not.toThrow();
    expect(() => storage.removeItem('k')).not.toThrow();
    expect(onError).toHaveBeenCalledTimes(3);
  });
});
