import { existsSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseSceneCatalog, type SceneInfo } from '@/lib/nuscenes';
import { loadPracticeScene, loadScene } from './load-scene';

// A stand-in for `fetch` that serves the app's own public/ folder, and lets a
// test replace or break single URLs.
const PUBLIC_DIR = new URL('../../../public/', import.meta.url);
function publicFetch(overrides: Record<string, () => Response> = {}): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (overrides[url]) return overrides[url]();
    const file = new URL(url.replace(/^\//, ''), PUBLIC_DIR);
    if (!existsSync(file)) return new Response('Not found', { status: 404 });
    return new Response(readFileSync(file, 'utf-8'), { status: 200 });
  }) as typeof fetch;
}

const catalog = parseSceneCatalog(
  JSON.parse(readFileSync(new URL('sample-data/nuscenes/scenes.json', PUBLIC_DIR), 'utf-8')),
);
// The scene with the fewest boxes (604) keeps these tests quick.
const scene = catalog?.scenes.find((s) => s.name === 'scene-0757') as SceneInfo;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('loadScene', () => {
  it('loads the frames and the predictions of a scene', async () => {
    const result = await loadScene(scene, { fetchImpl: publicFetch() });
    if (!result.ok) throw new Error(result.error);
    expect(result.scene.name).toBe('scene-0757');
    expect(result.scene.frames).toHaveLength(scene.frameCount);
    expect(result.scene.frames.reduce((n, f) => n + f.detections3D.length, 0)).toBe(scene.boxCount);
    expect(result.scene.predictions?.byFrame.size).toBe(scene.frameCount);
    expect(result.scene.predictionsError).toBeNull();
    // Points are not part of a scene: they are fetched per frame.
    expect(result.scene.frames.every((f) => f.pointCloud.length === 0 && f.pointCloudSource)).toBe(true);
  });

  it('a scene still loads when its predictions fail — only evaluation is unavailable', async () => {
    const fetchImpl = publicFetch({
      [scene.predictionsUrl as string]: () => new Response('boom', { status: 500, statusText: 'Server Error' }),
    });
    const result = await loadScene(scene, { fetchImpl });
    if (!result.ok) throw new Error(result.error);
    expect(result.scene.frames).toHaveLength(scene.frameCount);
    expect(result.scene.predictions).toBeNull();
    expect(result.scene.predictionsError).toContain('HTTP 500');
  });

  it('predictions that are not a predictions file are reported, not used', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchImpl = publicFetch({
      [scene.predictionsUrl as string]: () => new Response('{"hello":1}', { status: 200 }),
    });
    const result = await loadScene(scene, { fetchImpl });
    if (!result.ok) throw new Error(result.error);
    expect(result.scene.predictions).toBeNull();
    expect(result.scene.predictionsError).toContain('Not a predictions file');
  });

  it('a scene without a predictions file has none, and that is not an error', async () => {
    const result = await loadScene({ ...scene, predictionsUrl: null }, { fetchImpl: publicFetch() });
    if (!result.ok) throw new Error(result.error);
    expect(result.scene.predictions).toBeNull();
    expect(result.scene.predictionsError).toBeNull();
  });

  it('fails (without throwing) when the frames file cannot be fetched', async () => {
    const fetchImpl = publicFetch({
      [scene.framesUrl]: () => new Response('Not found', { status: 404 }),
    });
    const result = await loadScene(scene, { fetchImpl });
    expect(result).toEqual({ ok: false, error: expect.stringContaining('HTTP 404') });
  });

  it('fails (without throwing) on a network error', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    const result = await loadScene(scene, { fetchImpl });
    expect(result).toEqual({ ok: false, error: expect.stringContaining('Failed to fetch') });
  });

  it('a frames file with no usable frame loads as an empty scene', async () => {
    const fetchImpl = publicFetch({
      [scene.framesUrl]: () => new Response('{"version":"1.3","frames":[]}', { status: 200 }),
    });
    const result = await loadScene(scene, { fetchImpl });
    if (!result.ok) throw new Error(result.error);
    expect(result.scene.frames).toEqual([]);
  });
});

describe('loadPracticeScene', () => {
  it('gives the same frames with some boxes changed, and the answer key', async () => {
    const real = await loadScene(scene, { fetchImpl: publicFetch() });
    const practice = await loadPracticeScene(scene, { fetchImpl: publicFetch() });
    if (!real.ok || !practice.ok) throw new Error('load failed');
    expect(practice.scene.frames.map((f) => f.id)).toEqual(real.scene.frames.map((f) => f.id));
    expect(practice.scene.planted.length).toBeGreaterThan(0);
    expect(practice.scene.frames).not.toEqual(real.scene.frames);
    // The points still come from the same per-frame files.
    expect(practice.scene.frames.map((f) => f.pointCloudSource)).toEqual(
      real.scene.frames.map((f) => f.pointCloudSource),
    );
  });

  it('fails (without throwing) when the frames file cannot be fetched', async () => {
    const fetchImpl = publicFetch({ [scene.framesUrl]: () => new Response('x', { status: 503 }) });
    const result = await loadPracticeScene(scene, { fetchImpl });
    expect(result).toEqual({ ok: false, error: expect.stringContaining('HTTP 503') });
  });
});
