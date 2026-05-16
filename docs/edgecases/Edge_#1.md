# Edge Case Log #1 — COCO Parser (Step 1)

## Context

Discovered while writing `lib/coco/parser.test.ts` for **Step 1 — COCO Parsing**.
Six "Done when" cases from the checklist passed on the first run. Four additional
edge cases — deliberately exercised by the tests — failed and revealed silent
hazards that would propagate downstream (Step 4 3D conversion, Step 7 filtering,
Step 8 timeline). All four were fixed before Step 1 was marked complete.

- Affected module: `apps/ai_detection_viewer_client/src/lib/coco/parser.ts`
- Test suite: `apps/ai_detection_viewer_client/src/lib/coco/parser.test.ts`
- Final status: 25/25 tests passing.

---

## Case 1 — NaN inside `bbox`

**Discovery reason.** The original guard rejected non-numeric bbox entries with
`typeof n !== 'number'`. JavaScript classifies `typeof NaN === 'number'`, so a
`NaN` slipped through and produced a `Detection2D` with `bbox.x = NaN`.

**Downstream risk.** In Step 4 the 2D→3D estimator multiplies bbox center and
area; any NaN propagates to `Detection3D.bbox3D.center`, the point cloud, and
ultimately Three.js attribute buffers. Three.js does not throw on NaN — it
silently produces missing geometry. The defect is invisible without a test.

**Fix.** Switched the guard to `Number.isFinite`, which rejects `NaN`, `Infinity`,
`-Infinity`, and non-number values in a single predicate.

```ts
// before
ann.bbox.some((n) => typeof n !== 'number')

// after
!ann.bbox.every((n) => Number.isFinite(n))
```

**Why this approach.** `Number.isFinite` is the canonical "is this a usable
finite real number" check. Layering a separate `Number.isNaN` after a `typeof`
check would have worked, but it duplicates intent. One predicate, one log
message, one skipped detection.

**Locking test.**
`parser.test.ts > invalid bbox > skips annotations with NaN bbox entries`

---

## Case 2 — Infinity inside `bbox`

**Discovery reason.** Same root cause as Case 1: `typeof Infinity === 'number'`.

**Downstream risk.** Infinity in bbox coordinates maps to an off-screen 3D
position with infinite extent. Camera fit-to-scene math (planned for Step 4
OrbitControls) would break — frustum clipping and bounding sphere calculations
divide by inf or produce NaN.

**Fix.** Resolved by the same `Number.isFinite` switch as Case 1. One change
handled both NaN and Infinity.

**Locking test.**
`parser.test.ts > invalid bbox > skips annotations with Infinity bbox entries`

---

## Case 3 — `NaN` as `score`

**Discovery reason.** The original confidence assignment used the nullish
coalescing operator: `ann.score ?? 1.0`. `NaN` is not nullish, so a `NaN` score
passed through to `Detection2D.confidence`.

**Downstream risk.** Step 7 filters detections by
`confidence >= confidenceThreshold`. For a `NaN` confidence, every comparison
returns `false` — including the `threshold = 0` ("show all") case. The
detection would silently vanish from both 2D and 3D viewers regardless of
slider position, violating the locked-down Step 7 behavior.

**Fix.** Replaced the nullish fallback with a finiteness check.

```ts
// before
confidence: ann.score ?? 1.0,

// after
const confidence = Number.isFinite(ann.score) ? (ann.score as number) : 1.0;
```

**Why fallback to `1.0`.** COCO annotations are treated as ground truth in this
project (see `domain-glossary.md` → "Annotation"). When confidence is missing or
malformed, "fully confident" is the conservative default — the detection
remains visible and a downstream component can still flag low-quality data if
needed.

**Locking test.**
`parser.test.ts > invalid score > falls back to 1.0 when score is NaN`

---

## Case 4 — Duplicate `image.id`

**Discovery reason.** The original implementation iterated images with
`raw.images.map()` and emitted one `Frame` per entry. Two image entries sharing
the same `id` produced two `Frame`s with identical `Frame.id`.

**Downstream risk.**
- Step 8 uses `Frame.id` as the `selectedFrameId` key. Duplicates create
  ambiguous selection — clicking one timeline cell could resolve to either
  Frame.
- React lists render with `key={frame.id}`. Duplicate keys trigger console
  warnings and break reconciliation, causing wrong-DOM bugs.

**Fix.** Added a `Set<number>` guard mirroring the existing duplicate-detection
guard inside a single frame. Same policy: keep the first occurrence, warn, skip
the rest.

```ts
const frames: Frame[] = [];
const seenImageIds = new Set<number>();
for (const image of raw.images) {
  if (seenImageIds.has(image.id)) {
    console.warn(`[parseCoco] Duplicate image id ${image.id}. Skipping.`);
    continue;
  }
  seenImageIds.add(image.id);
  frames.push(buildFrame(image, annotationsByImage, categoryMap));
}
return frames;
```

**Why this policy.** Consistency with the existing per-frame detection-id guard.
A different rule (e.g. throwing, renaming) would force callers to handle two
malformed-input strategies instead of one.

**Locking test.**
`parser.test.ts > duplicate image ids > skips duplicate image ids and warns`

---

## Summary

| # | Symptom | Fix site | Locking test |
|---|---------|----------|--------------|
| 1 | NaN bbox slipped through `typeof` check | `parser.ts` bbox guard | `invalid bbox > NaN` |
| 2 | Infinity bbox slipped through `typeof` check | same as #1 | `invalid bbox > Infinity` |
| 3 | NaN score bypassed `??` fallback | `parser.ts` confidence assign | `invalid score > NaN` |
| 4 | Duplicate `image.id` produced colliding Frames | `parser.ts` main loop | `duplicate image ids` |

All four are pinned by tests. Any future regression — accidental revert, refactor
that drops the guard, schema-loosening change — will fail at the test layer
before reaching the runtime.
