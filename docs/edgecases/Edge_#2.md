# Edge Case Log #2 — 2D Viewer (Step 2)

## Context

Discovered while manually verifying **Step 2 — 2D Image Viewer** in the browser
and through a follow-up audit of label positioning against all 10 sample frames.
The initial implementation rendered frame_001 correctly and all 6 bboxes were
clickable, so Step 2 "Done when" criteria passed on first try. Subsequent
inspection surfaced six edge cases — one reported by the user, three found via
data audit, two found via code review. Two are fixed in code; four are
documented without a code change because the right resolution depends on later
steps or has no clean fix at the current layer.

- Affected module: `apps/ai_detection_viewer_client/src/components/viewer-2d/Viewer2D.tsx`
- Step 2 "Done when" remains satisfied after fixes.
- Tests: 25/25 passing. No new tests added — per `CLAUDE.md` Testing Policy,
  components are not tested in the MVP, and the affected logic is presentation
  layout, not a pure function extracted out of the component.

---

## Case 1 — Click selection in overlapping bboxes (FIXED in Step 7 follow-up)

**Discovery reason.** User clicked inside the area where the person bbox
(id=1-5) and the small car bbox (id=1-6) overlap in frame_001. The car was
selected, not the person. The same pattern repeated for overlapping car
bboxes: clicking what looked visually like the "front" car sometimes selected
a different car. Clicking on isolated (non-overlapped) areas always selected
the expected bbox.

**Root cause.**

1. The `<rect>` uses `fill="transparent"`. Under SVG's default
   `pointer-events: visiblePainted`, `transparent` is still "painted"
   (`rgba(0,0,0,0)`), so the entire bbox interior captures clicks. (If we
   had used `fill="none"`, only the stroke line would be clickable — a worse UX.)
2. SVG ignores CSS `z-index`. Hit-testing follows document order: the element
   rendered LAST is on top and receives the click first.
3. `frame.detections2D.map(...)` preserves array order, which is the order
   from the COCO `annotations` array. That order carries no semantic
   priority — it is arbitrary input data.

For frame_001 the paint order is:

| paint order | id | class | bbox area |
|---|---|---|---|
| 1 (bottom) | 1-1 | car | 98,287 |
| 2 | 1-2 | car | 37,872 |
| 3 | 1-3 | car | 10,176 |
| 4 | 1-4 | car | 4,207 |
| 5 | 1-5 | person | 68,396 |
| **6 (top)** | **1-6** | **car** | **18,302** |

Wherever 1-6 overlaps 1-5 visually, 1-6 wins the click.

**Downstream risk.** None for the data contract — every bbox still owns a
unique, addressable `Detection2D.id`, and the `onSelect(id)` callback
remains deterministic for any given click point. The risk is purely UX:
users cannot select an occluded bbox by clicking the occluder.

**Why no fix in Step 2.**

- Step 2 "Done when: Each bbox is clickable (placeholder handler is fine)"
  is satisfied. The criterion does not promise unambiguous selection at every
  pixel, only that each bbox has a working click handler.
- Several disambiguation strategies exist (sort by area descending, click-cycle
  through overlapping candidates, hover preview, hide-on-modifier-key), each
  with non-trivial tradeoffs. Choosing one before Step 6 (Object List) and
  Step 7 (Filters) exist is premature — those steps provide natural
  workarounds and reshape what "good enough" looks like.
- `CLAUDE.md` rule: "Don't add features, refactor, or introduce abstractions
  beyond what the task requires."

**Locking test.** None. The "correct" outcome depends on a strategy not yet
chosen; a test pinning today's behavior would just lock in arbitrary
annotation-order semantics and break the moment we revisit it.

**Future revisit.**

| Step | Relevance | Note |
|---|---|---|
| Step 5 (2D↔3D sync) | Orthogonal | The id flows through to 3D unchanged; sync correctness is not affected. |
| Step 6 (Object List) | Mitigation | Users get a non-spatial selection path — preserved as a fallback for heuristic mismatches. |
| Step 7 (Filters) | Partial mitigation | Class-visibility toggles can remove the overlapping bbox from the scene. |
| **Step 7 follow-up** | **Resolution** | Paint-order sort applied. See "Resolution" below. |

---

### Resolution (Step 7 follow-up)

**Discovery path.** Re-surfaced by the user during Step 7 manual verification:
clicking what visually looks like the bicycle's front wheel selected the
person bbox instead. This was the first edge case found through direct
hands-on use rather than through code review / data audit, so the heuristic
question moved from "theoretical" to "concrete UX bug."

**Fix.** Sort `frame.detections2D` by bbox area ascending before mapping to
`<rect>` in `Viewer2D.tsx`. Larger bboxes are painted last and therefore land
on top of the SVG paint stack, capturing clicks in overlap regions.

```diff
- const detections = visibleIds
-   ? frame.detections2D.filter((d) => visibleIds.has(d.id))
-   : frame.detections2D;
+ const detections = (
+   visibleIds
+     ? frame.detections2D.filter((d) => visibleIds.has(d.id))
+     : frame.detections2D
+ )
+   .slice()
+   .sort(
+     (a, b) =>
+       a.bbox.width * a.bbox.height - b.bbox.width * b.bbox.height,
+   );
```

**Why area ascending and not annotation-order, descending, or 3D z.**

- The 3D estimator already encodes "larger bbox area → smaller z → closer"
  (see `lib/geometry/bbox-estimator.ts` and `Edge_#4.md` Case 2). Sorting 2D
  paint order by the *same* proxy makes the two viewers share one depth
  model: a click on the 2D overlap region now selects the same object the
  3D viewer shows as front-most.
- Using `detections3D[].bbox3D.center[2]` directly would be more semantically
  honest but couples `Viewer2D` to the enrichment pipeline. `bbox.area` is
  monotonic with that z by construction, so the cheaper proxy gives an
  identical result.

**Heuristic limits (accepted).**

- A frame where a *larger* background object visually sits *behind* a
  *smaller* foreground object will be ranked wrong — area is a proxy, not
  ground truth. The 3D viewer also gets this case wrong in the same
  direction, so the two views remain *consistent* even when both are
  wrong. ObjectList is the documented escape hatch.
- Sub-object depth (e.g. bicycle front wheel vs. back wheel as separate
  click targets) is impossible at this data model — every detection carries
  a single z. Resolving this would require COCO segmentation polygons or
  instance masks, which is out of MVP scope. See `docs/etc/` blog write-up
  for the long-form analysis.

**Tests.** None added — UI rendering is not in the unit-test scope (CLAUDE.md
Testing Policy). Suite remains 82/82.

---

## Case 2 — Label clips past the bottom of the image (FIXED)

**Discovery reason.** Audit of label positioning against all 49 annotations
in `sample.json`. The original logic placed the label above the bbox when
`bbox.y > 16`, otherwise below. One annotation hits the "below" branch and
the below-position itself runs past the image:

- frame_009, id=9-40 (bicycle): `bbox.y = 5.84`, `bbox.height = 380.49`,
  `image.height = 388`. Above-position would land at `y = 2.84` (no room).
  Below-position lands at `y = 5.84 + 380.49 + 14 = 400.33`, which is **12 px
  past the image bottom**.

**Symptom.** SVG content past the viewBox is clipped by the SVG element's
own bounding box (browsers apply `overflow: hidden` to `<svg>` by default).
The label was invisible — the user would have no way to know what class that
bbox represents.

**Latent vs observed.** Latent in Step 2 (only frame_001 is rendered).
Will manifest as soon as Step 8 introduces multi-frame navigation.

**Fix.** Added a third candidate position — inside the bbox at the top —
used only when both above and below would clip.

```diff
- const labelY =
-   d.bbox.y > 16 ? d.bbox.y - 3 : d.bbox.y + d.bbox.height + 14;
+ const labelY =
+   d.bbox.y > 16
+     ? d.bbox.y - 3
+     : d.bbox.y + d.bbox.height + 14 <= frame.imageHeight - 2
+       ? d.bbox.y + d.bbox.height + 14
+       : d.bbox.y + 14;
```

**Why fallback to inside-top instead of accepting the clip.** Visibility beats
aesthetics. A clipped label is invisible — the user has no signal at all.
A label inside the bbox is visually busier but always readable, and the
bbox stroke still shows through behind the text. The inside-top fallback
only triggers when both outside positions fail, so the common case is
unaffected.

**Locking test.** None — see Context section. The positioning logic is
inline presentation code, not a pure function. If this becomes flaky in
practice, extracting it to `lib/...` and adding unit tests is the right
step then.

---

## Case 3 — Label clips past the right edge of the image (FIXED)

**Discovery reason.** Same audit as Case 2. Two annotations place a
~56-pixel-wide "car 1.00" label starting near the right edge of the image:

- frame_002, id=2-11 (car): `bbox.x = 625.78`, `image.width = 640`. Label
  starts at `x = 627.78` and extends past 680 — well beyond the right edge.
- frame_010, id=10-49 (car): `bbox.x = 607.31`, same overflow pattern.

**Symptom.** Label text past the SVG's right edge is clipped, leaving the
visible label fragment unreadable or missing entirely.

**Latent vs observed.** Latent in Step 2. Will manifest in Step 8.

**Fix.** When the estimated label width would push past the image's right
edge, switch `text-anchor` to `'end'` and anchor at the bbox's right edge.
The label then grows leftward into the image area.

```diff
+ const labelText = `${d.class} ${d.confidence.toFixed(2)}`;
+ const estLabelWidth = labelText.length * 7;
+ const overflowRight = d.bbox.x + estLabelWidth > frame.imageWidth;
+ const labelX = overflowRight
+   ? d.bbox.x + d.bbox.width - 2
+   : d.bbox.x + 2;
+ const labelAnchor = overflowRight ? 'end' : 'start';
```

And in the `<text>`:
```diff
- x={d.bbox.x + 2}
+ x={labelX}
+ textAnchor={labelAnchor}
```

**Why an estimate, not a measurement.** SVG `<text>` only exposes accurate
width via `getComputedTextLength()` after the element is in the DOM. Measuring
at render time requires refs, an effect, and a second render — too much
machinery for the precision we need. The 7-px-per-character heuristic at
fontSize=12 sans-serif is a slight overestimate, intentionally biasing toward
right-anchoring when in doubt. Misclassification is visually invisible (the
label fits either way).

**Why anchor at `bbox.x + bbox.width - 2` and not at `imageWidth - 2`.**
Anchoring at the bbox's own right edge keeps the label visually associated
with its bbox even at the extreme right. Anchoring at the image edge could
detach the label from a small right-edge bbox by tens of pixels.

**Locking test.** None — same reasoning as Case 2.

---

## Case 4 — Click on label text does not select the bbox (DOCUMENTED, no fix)

**Discovery reason.** Code review while writing this document. The `<text>`
element carries `style={{ pointerEvents: 'none' }}`, so clicks on the label
glyphs pass through to whatever sits underneath. Labels are typically placed
above or below the bbox (outside it), so the underlying element is the SVG
`<image>` — not the rect — and the click resolves to "no bbox selected."

**Why no fix.** Three obvious options, each with a downside:

1. **Add `onClick` to `<text>` and drop `pointer-events: none`.** The label,
   when above a bbox, can land inside an *adjacent* bbox. Clicking the label
   would then ambiguously select either the labelled bbox or the underlying
   one, depending on which gets the event first — a *worse* version of Case 1.
2. **Wrap rect + text in a `<g onClick>`.** Same overlap problem in a
   different shape; the `<g>`'s effective hit area becomes the union of rect
   and text bounding boxes.
3. **Always place the label inside the bbox.** Visually crowds the bbox
   interior and interferes with the underlying image. The Case 2 fix already
   uses inside-top as a last resort because it is *not* a good default.

Step 6 (Object List) again provides a non-spatial selection path, so this
remains minor.

**Locking test.** None.

**Future revisit.** Step 9 (UI Cleanup) if it becomes a real complaint.

---

## Case 5 — Image load failure has no fallback (DOCUMENTED, deferred)

**Discovery reason.** Code review. If `frame.imageUrl` returns 404 or fails
to load (e.g. typo in `file_name`, missing file in `public/sample-data/`,
network error after page load), the SVG `<image>` element renders nothing
silently. The bboxes still render at their geometrically correct positions,
floating over an empty area.

**Downstream risk.** Confusing for a developer who sees boxes without an
image and isn't sure whether the data is wrong or the file is missing. For
end users, no functional risk — selection and labels still work.

**Why no fix in Step 2.** Adding a fallback requires either (a) wrapping the
`<image>` with an `onError` handler and a "broken image" placeholder, or
(b) pre-fetching the image in `page.tsx` and showing a load-error state.
Both are UI polish, not Step 2 scope. Step 9 (UI Cleanup) is the right
home — by then we also have Step 8's frame navigation and can choose a
consistent error/loading aesthetic for the whole viewer.

**Locking test.** None.

---

## Case 6 — Very small bboxes are hard to click (DOCUMENTED, no fix)

**Discovery reason.** Audit of bbox areas in sample data. The smallest is
frame_009, id=9-45 (car): `9.33 × 14.9 ≈ 139 px²`. At typical display sizes
(e.g. an SVG width of 600 px in a 640-px-wide viewBox, scale ≈ 0.94×) the
on-screen target is ~9 × 14 px — small but clickable. At smaller display
sizes the target can shrink below practical pointer accuracy.

**Why no fix at this layer.** Genuine fixes (invisible hit-area padding
around small bboxes, magnify on hover, snap-to-nearest selection) are all
*selection-strategy* changes that belong in the same conversation as Case 1.
Adding hit-area padding here would also enlarge the click footprint *into*
neighboring bboxes, worsening Case 1 ambiguity. Step 6 (Object List)
provides the natural escape hatch for small targets too.

**Locking test.** None.

---

## Summary

| # | Symptom | Decision | Note |
|---|---------|----------|------|
| 1 | Click selection ambiguous in overlapping bboxes | **Fixed in Step 7 follow-up** | Paint order sorted by bbox area ascending — mirrors 3D estimator's z proxy. |
| 2 | Label clips past the bottom of the image | **Fixed** | Inside-top fallback added (id=9-40). |
| 3 | Label clips past the right edge of the image | **Fixed** | Switch to `text-anchor="end"` (id=2-11, 10-49). |
| 4 | Click on label text falls through | Document | All three fixes worsen Case 1. |
| 5 | Image load failure has no fallback | Defer to Step 9 | Out of Step 2 scope. |
| 6 | Very small bboxes are hard to click | Document | Linked to Case 1 strategy. |

Cases 2 and 3 are latent in Step 2 (only `frames[0]` = frame_001 is rendered;
neither overflow case lives in frame_001) and would have first appeared in
Step 8 (timeline navigation). Fixing them now avoids surprise regressions
when those frames become reachable.

Cases 1, 4, and 6 form a related cluster about spatial selection in 2D.
They are best revisited together after Step 6 (Object List) has shown how
much the non-spatial selection path absorbs in practice.
