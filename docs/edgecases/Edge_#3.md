# Edge Case Log #3 — Zustand Store (Step 3)

## Context

Discovered while auditing the **Step 3 — Zustand Store** implementation against
its downstream consumers (Step 5 selection sync, Step 7 filter selector, Step 8
timeline). The first pass of `viewer-store.ts` satisfied every "Done when"
criterion and 16 hand-written tests passed on the first run. A subsequent
review against the Immutable Rules and the parser's existing edge case
contracts (see Edge_#1.md) surfaced three issues — two were fixed in code,
one is documented and deferred because the resolution belongs to a later step.

- Affected module: `apps/ai_detection_viewer_client/src/store/viewer-store.ts`
- Test suite: `apps/ai_detection_viewer_client/src/store/viewer-store.test.ts`
- Final status: **43/43 tests passing** (parser 25 + store 18).

---

## Case 1 — `setConfidenceThreshold(NaN)` poisons the threshold (FIXED)

**Discovery reason.** The first implementation clamped the threshold with
`Math.min(1, Math.max(0, v))` and trusted the caller to pass a real number.
`Math.max(0, NaN)` returns `NaN`, and `Math.min(1, NaN)` also returns `NaN`,
so a `NaN` argument was written straight into the store.

**Downstream risk.** This is the same hazard the parser already locked down
in Edge_#1.md Case 3, surfacing one layer up. The Step 7 visibility selector
will compare `detection.confidence >= confidenceThreshold`. Any `>` / `>=`
comparison against `NaN` is `false`, so:

- Every detection would silently vanish from both the 2D and the 3D viewers.
- The "threshold = 0 returns all detections" contract pinned by the Step 7
  test plan would be violated.
- The slider UI in Step 7 has no good way to surface this — it would look
  like a stuck "0 detections" state.

`±Infinity` does not cause the same comparison bug (`confidence >= Infinity`
is just always `false`, `confidence >= -Infinity` is always `true`), but the
field is documented as `0 ~ 1`. Storing a non-finite value violates the
contract regardless of whether comparisons happen to behave sanely.

**Fix.** Reject non-finite inputs at the setter boundary. Keep the previous
value, warn once.

```diff
- setConfidenceThreshold: (v) =>
-   set({ confidenceThreshold: Math.min(1, Math.max(0, v)) }),
+ setConfidenceThreshold: (v) => {
+   if (!Number.isFinite(v)) {
+     console.warn(
+       `[viewer-store] setConfidenceThreshold ignored non-finite value: ${v}`
+     );
+     return;
+   }
+   set({ confidenceThreshold: clamp01(v) });
+ },
```

**Why "ignore and keep previous" rather than "fallback to 0".** The parser
falls back to `1.0` for a missing/`NaN` score because it has only one chance
to produce a `Detection2D` — without a fallback the detection vanishes
entirely. A store setter is different: the previous value is always valid by
induction (the store starts at `0` and every successful write goes through
the same clamp). Keeping the previous value is the least-surprising "undo"
of an invalid call, and it preserves whatever the user had already chosen
on the slider.

**Why `Number.isFinite` is sufficient.** It is the canonical "real, usable
number" predicate — rejects `NaN`, `+Infinity`, `-Infinity`, and non-number
values in one call. Same guard the parser uses for bbox entries
(Edge_#1.md Case 1/2), so the codebase has one consistent rule for "is this
a real number."

**Locking tests.**
- `viewer-store.test.ts > setConfidenceThreshold non-finite inputs > ignores NaN and keeps the previous value`
- `... > ignores +Infinity and keeps the previous value`
- `... > ignores -Infinity and keeps the previous value`

Each test also asserts that `console.warn` was called exactly once, so a
silent-failure refactor (dropping the warn while keeping the early return)
also fails.

---

## Case 2 — `initialState` Set was shared by reference across consumers (FIXED)

**Discovery reason.** The original module exported a frozen-in-place
`initialState` object literal:

```ts
export const initialState: ViewerState = {
  // ...
  visibleClasses: new Set(),
};

export const useViewerStore = create<ViewerStore>((set) => ({
  ...initialState,
  // ...
}));
```

Two consumers ended up referring to the **same** `Set` instance:

1. The store's own initial `visibleClasses` field — `...initialState` is a
   shallow spread, so the property reference (the `Set`) is copied, not the
   Set's contents.
2. Any external caller that imported `initialState` for a reset
   (`useViewerStore.setState(initialState)`) — including the test suite's
   `beforeEach`.

Inside the store this was *latent* because `toggleClass` already creates a
new Set on every write and never mutates the original. But the moment
anything outside the store mutated a `visibleClasses` Set in place — a
future debug helper, a future "select all classes" action, a careless test —
the mutation would leak into `initialState` itself, and every subsequent
reset would start from a corrupted baseline.

**Downstream risk.** Hard-to-reproduce test pollution: a test that mutates
the Set would corrupt the initial state seen by every later test in the
same file, but only in run order. Order-dependent failures are the worst
kind of test regression to diagnose. The same risk applies to Step 5
integration tests that will reset the store between scenarios.

**Fix.** Replaced the singleton with a factory:

```diff
- export const initialState: ViewerState = {
-   selectedFrameId: null,
-   selectedObjectId: null,
-   confidenceThreshold: 0,
-   visibleClasses: new Set(),
- };
+ export const createInitialState = (): ViewerState => ({
+   selectedFrameId: null,
+   selectedObjectId: null,
+   confidenceThreshold: 0,
+   visibleClasses: new Set<string>(),
+ });
```

The store and the tests both now call `createInitialState()` whenever they
need a baseline. Every call constructs a brand-new `Set`, so there is no
reachable path by which two consumers share a mutable Set.

**Why a factory rather than `Object.freeze` + a frozen Set.** `Object.freeze`
on the outer object would prevent reassignment but does not deep-freeze the
`Set`; the Set's `add` / `delete` would still mutate the singleton. A
read-only `Set` proxy is heavier than the problem warrants. The factory
keeps one rule — "always construct, never share" — and removes the failure
mode entirely.

**Why the existing tests didn't fail in either implementation.** The
original `beforeEach` already wrote a freshly-constructed Set:
`setState({ ..., visibleClasses: new Set() })`. That happened to dodge the
sharing problem. The fix removes the implicit dependency: a tester writing
`setState(createInitialState())` (the obvious idiom) is now equally safe.

**Locking tests.**
- `viewer-store.test.ts > createInitialState > returns a fresh visibleClasses Set on each call`
  — fails immediately if the factory regresses to a shared singleton.
- `... > returns the documented default state` — pins the per-field defaults
  so any silent baseline drift breaks the suite.

---

## Case 3 — `setSelectedFrame` cannot clear the selection (DOCUMENTED, defer to Step 8)

**Discovery reason.** Type review against `selectedFrameId: string | null`.
The state field accepts `null`, but the action signature is
`setSelectedFrame: (id: string) => void`. There is no way to return the
store to "no frame selected" through the public action surface. This is
asymmetric with `setSelectedObject(id: string | null)`, which explicitly
encodes the deselect path.

**Downstream risk.** None for the current step. Step 3's "Done when" does
not require a deselect path for frames. Step 8 (Frame Timeline) is the
only consumer of `selectedFrameId`, and its requirements are still abstract
("Clicking a frame sets `selectedFrameId`" / "Current frame is visually
highlighted"). Whether a frame can ever be *un*selected depends on a UX
decision Step 8 has not made yet.

**Why no fix in Step 3.**

- The `architecture.md` Zustand Store Schema explicitly lists the signature
  as `setSelectedFrame: (id: string) => void`. Loosening it preemptively
  would either contradict that doc or require updating the doc to a shape
  Step 8 has not committed to yet.
- A symmetric, defensible API is one decision among at least three:
  (a) frames are always selected (initial frame loaded eagerly, no
  deselect path); (b) `null` means "no frame is currently visible"
  (acceptable, drives a "no frame" empty state); (c) some sentinel
  ("preview", "intro") rather than `null`. Picking before Step 8 starts is
  guessing.
- `CLAUDE.md` rule: "Don't add features, refactor, or introduce abstractions
  beyond what the task requires."

**Locking test.** None. Pinning today's behavior with a "string-only"
assertion would freeze a choice we haven't actually made. Pinning the
opposite ("must accept null") presupposes Step 8's verdict.

**Future revisit.**

| Step | Relevance | Note |
|---|---|---|
| **Step 8 (Frame Timeline)** | **Primary decision point** | Decide whether timeline navigation can land in a no-frame state. If yes, broaden the signature to `(id: string \| null) => void` and add a deselect test mirroring `setSelectedObject`. |
| Step 9 (UI Cleanup) | Fallback | If Step 8 ships with "frame is always selected," delete this row and the asymmetry becomes intentional API. |

---

## Summary

| # | Symptom | Decision | Fix site | Locking test(s) |
|---|---------|----------|----------|-----------------|
| 1 | `NaN` / `±Infinity` threshold poisons Step 7 filtering | **Fixed** | `viewer-store.ts` setter guard | `setConfidenceThreshold non-finite inputs > NaN / +Infinity / -Infinity` |
| 2 | `initialState.visibleClasses` shared Set reference across consumers | **Fixed** | Replaced singleton with `createInitialState()` factory | `createInitialState > returns a fresh visibleClasses Set on each call` |
| 3 | `setSelectedFrame` has no `null` deselect path | Document | n/a | n/a — decision belongs to Step 8 |

Cases 1 and 2 mirror the Step 1 pattern from Edge_#1.md (defensive input
guards + factory over singleton). Case 3 mirrors the Step 2 pattern from
Edge_#2.md Cases 1/4/6 — a cluster of related decisions deliberately
deferred until the consuming step has enough context to choose.
