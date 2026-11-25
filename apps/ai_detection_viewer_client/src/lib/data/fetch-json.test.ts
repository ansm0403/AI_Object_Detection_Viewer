import { describe, expect, it } from 'vitest';
import { fetchJson } from './fetch-json';

// A stand-in for `fetch` that answers with a fixed response.
const respondWith = (body: string, init: ResponseInit): typeof fetch =>
  (async () => new Response(body, init)) as typeof fetch;

describe('fetchJson', () => {
  it('returns the parsed body on a 2xx answer', async () => {
    const fetchImpl = respondWith('{"frames":[]}', { status: 200 });
    await expect(fetchJson('/data.json', { fetchImpl })).resolves.toEqual({ frames: [] });
  });

  it('reports the HTTP status instead of a JSON parse error on a 500', async () => {
    const fetchImpl = respondWith('<!DOCTYPE html><h1>Internal Server Error</h1>', {
      status: 500,
      statusText: 'Internal Server Error',
    });
    await expect(fetchJson('/data.json', { fetchImpl })).rejects.toThrow(
      'HTTP 500 Internal Server Error while loading /data.json',
    );
  });

  it('still names the status when the server sends no status text (HTTP/2)', async () => {
    const fetchImpl = respondWith('Not found', { status: 404 });
    await expect(fetchJson('/missing.json', { fetchImpl })).rejects.toThrow(
      'HTTP 404 while loading /missing.json',
    );
  });

  it('passes the abort signal through and lets network failures propagate', async () => {
    const controller = new AbortController();
    let seen: AbortSignal | null | undefined;
    const fetchImpl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      seen = init?.signal;
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    await expect(
      fetchJson('/data.json', { signal: controller.signal, fetchImpl }),
    ).rejects.toThrow('Failed to fetch');
    expect(seen).toBe(controller.signal);
  });

  it('keeps a real parse error for a 2xx answer that is not JSON', async () => {
    const fetchImpl = respondWith('not json', { status: 200 });
    await expect(fetchJson('/data.json', { fetchImpl })).rejects.toThrow(SyntaxError);
  });
});
