# Edge Case Review (Lite)

<!--
  CLAUDE CODE DIRECTIVE
  =====================
  This is a lightweight edge case review command.
  
  EXECUTION:
  1. Read the Step Context section below first
  2. Run only the checks relevant to the current task
  3. Skip irrelevant checks with N/A — no explanation needed
  4. Output a short report (see Report Format)
  5. Be concise. Flag real problems, not hypotheticals.
-->

## Step Context

```
STEP     : [e.g., Step 3 — 3D Viewer Component]
FILES    : [e.g., src/components/Viewer3D.tsx]
CONCERNS : [e.g., large dataset rendering, memory cleanup]
SKIP     : [e.g., security, accessibility]
```

---

## Checklist

### Core (Always Check)
- [ ] Null / undefined / empty input handled?
- [ ] Loading / error / empty states in UI?
- [ ] Async errors caught? (try/catch, .catch)
- [ ] Event listeners / timers cleaned up on unmount?

### Data & State
- [ ] Extreme values handled? (0, negative, Infinity, NaN)
- [ ] Race condition possible? (concurrent async calls)
- [ ] Stale state risk after data refresh?

### UI
- [ ] Layout breaks with very long or very short content?
- [ ] Works on mobile / small screen?

### Visualization (skip if not applicable)
- [ ] Empty dataset renders gracefully?
- [ ] Single data point renders correctly?
- [ ] All-same-value dataset renders correctly?
- [ ] WebGL / canvas disposed on unmount?

### Performance
- [ ] Re-renders unnecessary? (check memoization)
- [ ] Memory leak risk in long sessions?

---

## Open-ended Review

<!--
  CLAUDE: After finishing the checklist, read the files in scope and think freely.
  The checklist is a starting point, not a ceiling.
  Ask yourself:
  - Is there anything in this code that feels fragile or risky?
  - What assumption is this code making that could be wrong?
  - What would break this if the input or environment changed unexpectedly?
  Report any findings under ⚠️ WARN or ❌ FAIL in the report, with a note that
  it was found outside the checklist.
-->

> After the checklist, scan the code in scope with fresh eyes.
> Flag anything that feels fragile, even if it doesn't match a checklist item.

---

## Report Format

<!--
  CLAUDE: Output only this. Keep it short.
-->

```
### Edge Case Review — [Step Name]

✅ OK   : [list]
⚠️ WARN : [issue + one-line fix]
❌ FAIL : [issue + file:line + fix]
⏭️ N/A  : [list]

Priority fixes:
1. [most critical]
2. [next]

Additional findings (outside checklist):
- [anything fragile or risky spotted during open-ended review]
```