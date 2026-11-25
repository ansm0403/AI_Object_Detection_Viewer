/**
 * Fetch a JSON file and fail with the HTTP status when the server did not
 * answer 2xx.
 *
 * `fetch` only rejects on network failure. A 404 / 500 resolves normally, and
 * its body is usually an HTML error page — so calling `response.json()` on it
 * reported "SyntaxError: Unexpected token '<'…", which says nothing about what
 * actually went wrong (Edge_F#4, "found, not caused by F4"). Checking
 * `response.ok` first turns that into "HTTP 500 Internal Server Error".
 *
 * The parsed body is returned as `unknown`: every caller hands it to a parser
 * that validates it (`parseCoco`, `parseNuScenes`, `parsePredictions`).
 *
 * `fetchImpl` exists so the function can be unit-tested without a network.
 */
export async function fetchJson(
  url: string,
  options: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<unknown> {
  const { signal, fetchImpl = fetch } = options;
  const response = await fetchImpl(url, { signal });
  if (!response.ok) {
    const status = [response.status, response.statusText].filter(Boolean).join(' ');
    throw new Error(`HTTP ${status} while loading ${url}`);
  }
  return response.json();
}
