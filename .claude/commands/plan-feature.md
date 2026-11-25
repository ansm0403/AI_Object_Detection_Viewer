---
description: Start a post-MVP feature session (F3+) — read the handoff, then write or resume that feature's design doc and wait for approval
argument-hint: "[feature id, e.g. F4] [optional notes]"
---

# Plan Feature (post-MVP, F3 onward)

Arguments: `$ARGUMENTS`

This command starts (or resumes) the session for ONE post-MVP feature. It ends with a design doc
the user has approved. **It does not implement anything.**

Language policy: reply to the user in Korean, in plain words (the user is new to 3D / AI data).
Design docs in `docs/plan-feature/` are written in Korean. Docs in `.claude/docs/` stay English with
a Korean translation in an HTML comment block below.

## 1. Identify the feature

- The first argument is the feature id (`F3`, `F4`, …). Anything after it is extra context from the
  user — treat it as input to the design, not as a replacement for the steps below.
- If no argument was given, read section 1 ("현재 상태") of `docs/plan-feature/HANDOFF.md`, take the
  next feature from "다음 세션에서 할 일", and confirm it with the user before going on.

## 2. Read before doing anything else

In this order. Do not edit code before finishing this list.

1. `docs/plan-feature/HANDOFF.md` — sections 0–3 in full, then the part of section 4 for this
   feature, then sections 5–7.
2. `.claude/docs/post-mvp-checklist.md` — "Roadmap — F3+ direction" and the completion record of
   the previous feature (what changed from its plan, and why).
3. `docs/plan-feature/README.md` — status table.
4. The previous feature's design doc, if this feature depends on it.
5. `.claude/docs/architecture.md` — when the feature changes structure, data model, or more than
   one file (almost always).
6. Any `docs/edgecases/Edge_F#N.md` the checklist links for the code you will touch.

## 3. Check that the feature can start

- **One feature per session.** If the previous feature is not finished (see HANDOFF section 1 and
  the checklist), stop and tell the user what is still open instead of starting this one.
- Decisions recorded in HANDOFF section 3 are settled. Do not reopen them unless the user does, or
  unless you found a fact in the code that contradicts one — in that case show the fact first.

## 4. Design doc — resume or write

Path: `docs/plan-feature/F#_<short_snake_case_name>.md`.

**If it already exists:** do not rewrite it. Report its status (초안 / 임시 승인 / 승인됨 / 구현 완료),
summarize it in a few lines, list any decision still open, and ask the user whether to begin
implementation or revise the doc.

**If it does not exist:** write it, following HANDOFF section 5 and the format in
`docs/plan-feature/README.md` (use `F3_workspace_layout.md` as the model). In particular:

- Read the relevant code first. HANDOFF section 4 is the thinking at the time it was written, not
  verified fact — re-check it against the current code, especially anything marked "확인 필요".
- For anything about how the screen looks or behaves, run the app and capture it (HANDOFF section 8)
  before writing. Do not describe the UI from memory or from the code alone.
- "지금의 문제" contains only facts you checked, each with its cause in the code.
- Every decision item has a recommendation, the alternative(s), the reason, and what the
  recommendation costs.
- "완료 기준" items are checkable statements, not adjectives.
- State the interaction with each of the 7 Immutable Rules, one by one.
- State what is out of scope, and what is left for later features.
- Mark what you could not verify as "확인 필요".
- Write for the user: plain Korean, new terms explained where they first appear. Add new domain
  terms to `.claude/docs/domain-glossary.md` when the feature is implemented, not now.

## 5. Record that the doc exists

- `docs/plan-feature/README.md` — add or update the feature's row and status.
- `docs/plan-feature/HANDOFF.md` section 1 — update the status table.

## 6. Present and stop

Give the user: a short summary of the design, the steps, and the decision items with your
recommendation for each. Then wait.

- Do not write implementation code until the user approves. For decisions about how the screen
  looks, the user has said "build the recommended option, show it, and adjust" is acceptable —
  that still requires the user to say go.
- Do not commit unless the user asks.

## After approval (not part of this command)

Implement step by step, verify each visual step by capturing the running app, and finish the session
with the checklist in HANDOFF section 6 ("세션을 끝낼 때") — including updating HANDOFF sections 1
and 9 so the next session can continue.
