# Step Completion & Handoff Command

<!--
  CLAUDE CODE DIRECTIVE
  =====================
  This command is executed at the end of each implementation step,
  AFTER edge case review has already been completed via /edgecase_review.

  Responsibilities:
    1. Update all design documents to reflect CURRENT_STEP completion
    2. Generate a ready-to-paste handoff prompt for NEXT_STEP

  BEFORE DOING ANYTHING:
  1. Read CLAUDE.md in the project root
  2. Extract:
     - Project name and description
     - All design/architecture document paths
     - Any project-specific conventions or constraints
  If CLAUDE.md does not exist or document paths are missing, output:
  "⚠️ Document paths not found in CLAUDE.md. Please add them or specify manually."
  Then stop and wait for user input.

  ARGUMENT PARSING:
  $ARGUMENTS contains two space-separated values:
    - First  = CURRENT_STEP (just completed, e.g. "Step3")
    - Second = NEXT_STEP    (to hand off to,  e.g. "Step4")
  If only one argument is given, auto-set NEXT_STEP = CURRENT_STEP + 1.
-->

## Arguments

```
$ARGUMENTS
```

---

## Pre-flight: Read CLAUDE.md

<!--
  CLAUDE: Read CLAUDE.md first.
  Extract project name, document paths, and any project-specific constraints.
  If document paths are undefined, stop and ask the user.
-->

Read `CLAUDE.md` now and extract project context and document paths.

---

## Phase 1 — Document Update

<!--
  CLAUDE: Use document paths from CLAUDE.md.
  Update only content affected by CURRENT_STEP implementation or edge case fixes.
  Do NOT change anything unrelated to CURRENT_STEP.
  Strict consistency between all documents is mandatory.
-->

### 1-1. Update Rules

**Architecture / Design docs**
- Reflect any structural changes made during CURRENT_STEP
- Update component relationships, data flow, or tech decisions if they changed
- Mark deprecated any design that was abandoned during implementation

**Checklist / Progress doc** (if present)
- Mark CURRENT_STEP as ✅ completed
- Mark all test items for CURRENT_STEP as ✅ completed
- Do not change the status of any other step

**All documents**
- No contradictions allowed between documents
- Do not touch content unrelated to CURRENT_STEP

### 1-2. Consistency Check

- [ ] All documents agree on what CURRENT_STEP implemented
- [ ] No document contradicts another
- [ ] Checklist completion status matches design doc progress

### 1-3. Summary Format (output in context)

```
## Document Update Summary — CURRENT_STEP

### [document name]
- Changed : [what]
- Reason  : [why]

### [document name]
- Changed : [what]
- Reason  : [why]

(repeat for each document)

Consistency check : PASS / FAIL (list conflicts if FAIL)

Manual confirmation needed:
- [anything that could not be verified automatically]
```

---

## Phase 2 — Next Step Handoff Prompt

<!--
  CLAUDE: Generate a ready-to-paste prompt for the next context session.
  Use project name and document paths from CLAUDE.md.
-->

Output a copyable handoff prompt in this format:

~~~
```
## [Project Name] — NEXT_STEP 시작 프롬프트

### 완료된 Step
[list of steps completed so far, including CURRENT_STEP]

### 참고 문서
[list of document paths from CLAUDE.md]

### 인수인계 사항
[any notes from CURRENT_STEP the next context should be aware of]

### 지시
위 문서들을 분석하고 NEXT_STEP 을 구현하라.
구현 전 반드시 설계 문서의 NEXT_STEP 명세를 먼저 확인하고 시작하라.
```
~~~

---

## Execution Order

1. Read `CLAUDE.md` → extract project context and document paths
2. Parse `$ARGUMENTS` → identify CURRENT_STEP and NEXT_STEP
3. **Phase 1** — Update all documents
4. **Phase 2** — Generate handoff prompt
5. Output all results in context