# Edge Case Log #8 — Frame Timeline (Step 8)

## Context

Discovered during `/edgecase-review` after the **Step 8 — Frame Timeline**
implementation. Step 8 also resolved four previously-deferred cases from
earlier logs (Edge_#3 Case 3, Edge_#4 Case 6, Edge_#5 Case 6, Edge_#7
Case 1); those are cross-referenced in the Summary below rather than
re-described here.

- Affected modules:
  - `apps/ai_detection_viewer_client/src/app/page.tsx`
  - `apps/ai_detection_viewer_client/src/components/timeline/Timeline.tsx`
- Test suite: **85/85 passing** throughout (82 prior + 3 new frame-switch
  integration tests).

---

## Case 1 — Stale `selectedFrameId` leaves the page stuck on "Selecting frame…" (FIXED)

**Discovery.** `/edgecase-review` open-ended pass.

**Root cause.** The first version of the auto-select effect only fired on
the initial null case:

```ts
useEffect(() => {
  if (enrichedFrames && enrichedFrames.length > 0 && selectedFrameId === null) {
    setSelectedFrame(enrichedFrames[0].id);
  }
}, [enrichedFrames, selectedFrameId, setSelectedFrame]);
```

If `selectedFrameId` was set to a string that did not appear in
`enrichedFrames` — possible whenever the store persists across a data
swap (dev hot-reload, future dataset switcher, or a deep-link that
addresses a frame not in the current set) — then `currentFrame` resolved
to `null`, the page rendered the "Selecting frame…" placeholder, and the
auto-select effect never re-fired because the guard was strictly
`=== null`.

**Downstream risk.** In production today (single fixed `sample.json`, no
persist middleware on the store, so the store starts fresh each browser
session) the scenario does not arise. The fix protects against future
dataset swapping and hot-reload during dev. The failure mode is silent
(placeholder text, no console error) and would be slow to diagnose, so
paying the cost upfront is justified by the one-line cost.

**Fix.** Replace the `=== null` guard with an "exists in current data"
check:

```diff
- if (enrichedFrames && enrichedFrames.length > 0 && selectedFrameId === null) {
-   setSelectedFrame(enrichedFrames[0].id);
- }
+ if (!enrichedFrames || enrichedFrames.length === 0) return;
+ const exists =
+   selectedFrameId !== null &&
+   enrichedFrames.some((f) => f.id === selectedFrameId);
+ if (!exists) {
+   setSelectedFrame(enrichedFrames[0].id);
+ }
```

**Why self-heal via effect, not via `currentFrame` fallback.** Computing
`currentFrame = enrichedFrames.find(...) ?? enrichedFrames[0]` would
*display* a valid frame but leave `selectedFrameId` in the store out of
sync with what the user sees. Future store consumers (timeline highlight
ring, eventual URL sync) would then disagree with the rendered frame.
Keeping the store authoritative — and self-healing it via effect —
preserves the single-source-of-truth invariant.

**Locking test.** None added. The behavior is render-tier orchestration
in `page.tsx`, not a pure function; the unit-test scope here would
require `@testing-library/react`, which is out of MVP per CLAUDE.md.

---

## Case 2 — `fetch` in `useEffect` has no `AbortController` (DOCUMENTED, defer to Step 9)

**Discovery.** Outside-checklist review during Step 8.

**Root cause.** `page.tsx` line ~30:

```ts
useEffect(() => {
  fetch('/sample-data/sample.json')
    .then((r) => r.json())
    .then((raw) => setFrames(parseCoco(raw)))
    .catch((err) => setError(String(err)));
}, []);
```

No abort signal is wired. If the page unmounts before the fetch resolves
(client-side navigation away during initial load), `setFrames` or
`setError` will be called on an unmounted component, triggering
React 19's "update on unmounted component" warning.

**Downstream risk.** No functional break — React tolerates the call and
swallows the result. Only a console warning. The fetch hits a local
static asset (`/sample-data/sample.json` served from `public/`), so the
window in which this can trigger is sub-100ms in practice.

**Why no fix in Step 8.** Pre-existing from Step 1, not a Step 8
regression. Adding `AbortController` is a ~4-line patch that mixes
naturally with Step 9 polish (error states, loading skeleton, Case 3
image-load fallback). Bundling them keeps the diff focused on UX
cleanup.

**Future revisit.** Step 9 (UI Cleanup). Sketch:

```ts
const ac = new AbortController();
fetch('/sample-data/sample.json', { signal: ac.signal })...;
return () => ac.abort();
```

---

## Case 3 — Timeline thumbnail has no image-load fallback (DOCUMENTED, defer to Step 9)

**Discovery.** Outside-checklist review; same shape as `Edge_#2.md` Case 5
(2D viewer `<image>` load failure) applied to the new Timeline `<img>`.

**Root cause.** `Timeline.tsx` renders a native `<img src={frame.imageUrl}>`
per frame. If the image 404s (typo in `file_name`, missing file in
`public/sample-data/`, network failure), the browser shows its default
broken-image icon. The "#N" label overlay remains visible and the
thumbnail remains clickable, so navigation still works.

**Downstream risk.** Cosmetic. Same one as Viewer2D's `<image>` load
failure (`Edge_#2.md` Case 5). Cross-cutting concern: best solved with
a shared "image with fallback" pattern, not a per-component patch.

**Why no fix in Step 8.** Step 8 scope is timeline *behavior*, not
image error UX. Step 9 (UI Cleanup) is the natural home for a shared
fallback aesthetic — a broken-image placeholder with class hint, or a
skeleton — applied uniformly to Viewer2D and Timeline.

---

## Summary

| # | Symptom | Decision | Fix site |
|---|---------|----------|----------|
| 1 | Stale `selectedFrameId` (no matching frame in `enrichedFrames`) leaves page stuck on "Selecting frame…" | **Fixed** | `page.tsx` auto-select effect: `=== null` guard replaced with "exists in current data" check |
| 2 | `fetch` in `useEffect` has no `AbortController` | **Defer to Step 9** | Pre-existing from Step 1; bundle with Step 9 loading/error polish |
| 3 | Timeline thumbnail has no image-load fallback | **Defer to Step 9** | Mirrors `Edge_#2.md` Case 5; needs shared cross-component pattern |

### Cross-referenced resolutions (Step 8 closing earlier defers)

| Earlier defer | Resolution in Step 8 |
|---|---|
| `Edge_#3.md` Case 3 — `setSelectedFrame` no-null deselect path | **Resolved by decision**: signature `(id: string) => void` confirmed as final API; timeline policy is "always exactly one frame selected"; `page.tsx` auto-select effect self-heals stale ids (Case 1 above) |
| `Edge_#4.md` Case 6 — `OrbitControls` camera state persists across frames | **Fixed**: `<Viewer3D key={currentFrame.id}>` forces full Canvas remount on frame change; GPU disposal already wired by `Edge_#4.md` Case 4 |
| `Edge_#5.md` Case 6 — stale `selectedObjectId` after frame switch | **Fixed**: `handleSelectFrame(id)` in `page.tsx` calls `setSelectedFrame(id); setSelectedObject(null);`; idempotent on same-frame click; locked by `tests/integration/frame-switch.test.ts` |
| `Edge_#7.md` Case 1 — `Filters` chip set per-frame while `visibleClasses` persists | **Fixed (Option A)**: `page.tsx` computes union of all frames' classes; `Filters` now takes `classes: string[]` instead of `frame: Frame`; toggled-on classes stay reachable in any frame |

Cases 1–3 above are all small. Step 8's main load was *resolving* the
four earlier defers above — which is why the new-case count is low
despite a sizable behavioral change. This mirrors the pattern in
`Edge_#7.md` (small new-case count, deliberate consolidation of prior
defers) and confirms that the "defer to the step that has enough
context" policy works as designed.
