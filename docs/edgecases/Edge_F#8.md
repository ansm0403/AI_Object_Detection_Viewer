# Edge Case Log F#8 — Editing a 3D box in the top view

> Cases found while building F8 (2026-11-27 … 28): during the per-step checks, while writing code,
> by looking at captures, and in the edge-case review that followed (conditions the step checks never
> exercised). See `post-mvp-checklist.md` → F8, `docs/plan-feature/F8_bev_box_edit.md`, and the
> captures and raw pass / fail output in `docs/plan-feature/assets/F8/` (`steps.html`,
> `2026-11-27_steps/`, `2026-11-28_steps/`).

## Context

- Affected modules: `lib/editing/` (new), `lib/nuscenes/box-views.ts` (new), `store/edit-store.ts`
  (new), `components/box-edit/` (new), `lib/review/` (`export.ts`, `closeness.ts`, `rejected.ts`),
  `components/review/` (`ReviewProgress`, `ExportMenu`, `PracticeScoreCard`, `EvidenceStrip`,
  `useRejectedWalk`, `usePracticeCloseness`), `components/workspace/WorkspaceShell.tsx`,
  `components/header/Header.tsx`, `components/object-list/ObjectList.tsx`, `app/page.tsx`.
- Everything was run on the **production build** (`npx next build --webpack`, `npx next start -p
  3100`), headless Chromium (Playwright). Pass / fail scripts use software GL (deterministic, slow);
  frame times were also taken on the integrated GPU. The user's own browser and the RTX 4060 were
  **not** measured.
- Method for the edge review (step G): one script, `checks/g.js`, each scenario a condition the step
  scripts had not exercised — two tabs, eight kinds of broken stored value, twelve bad records, a
  browser from before the feature, storage that refuses writes / refuses everything, the Korean
  keyboard layout, numbers far outside any box, a frame / scene / mode / dataset / practice change
  under the open editor, keys with no pause, a reload with the editor open, fifteen open-close
  cycles, five window sizes outside the promised ones, the longest class name, a scene that cannot be
  loaded. **Run before any fix: 63 / 68.** Three real problems (Cases 7–9); the other failures were
  wrong expectations in the script (listed under "Script mistakes"). A fourth problem (the second
  half of Case 8) was not caught by the script at all — it passed — and was seen in the capture.
- After the fixes every script was re-run on the final build: step 0·B 142, C 77, D 85, E 68, F 52,
  F (button) 14, edge 73 — 511 checks — plus the F7.5 scripts, 362.

---

## Case 1 — "Not saved" wrapped the top bar at 1280–1320 px (fixed; present before F8)

**Symptom.** With the storage refusing writes, the review top bar broke into two lines at window
widths 1280–1300 px (1320 px too once the reviewed count had four digits) and painted over the filter
bar.

**Root cause.** At 1280 px the app name and the "N rejected / N unsure" counts appear together (both
`xl:`), leaving 56 px. The "Not saved" pill needs about 78 px. Step 0 of F8 had fixed the bar *below*
1280 px and measured 1024, 1040 and 1279 px only.

**Found by.** The step-D width sweep (18 widths × the widest texts), written because F8 adds a second
reason for "Not saved" (the edit store).

**Fix.** `ReviewProgress`: while "Not saved" is shown the two counts appear from 1400 px instead of
1280 px (they stay in the tooltip). Without "Not saved" nothing changed.

## Case 2 — Practice mode wrapped the top bar at 1280–1320 px with nothing edited (fixed; present before F8)

**Symptom.** In practice mode, with one rejected box and no edit, the top bar wrapped at 1280, 1300
and 1320 px.

**Root cause.** The practice badge ("Practice · labels modified") is about 92 px wider than
"Measured". The step-D sweep had been run without practice mode.

**Found by.** The step-E sweep (F8 makes editing on the practice set a main path, so the sweep was
repeated there).

**Fix.** `Header`: on the practice set the app name comes back at 1400 px instead of 1280 px.
`ReviewProgress` (`tight`): there the counts with "Not saved" and the "N edited" count appear from
1536 px. 19 widths × 6 states: one line; least room 47 px (1024 px, widest texts + "Not saved").

## Case 3 — The new "N edited" count wrapped the bar at 1400 px (fixed)

**Symptom.** "N edited" was first shown from 1400 px; with "Not saved" and the widest texts the bar
wrapped at exactly 1400 px.

**Fix.** Shown from 1440 px (50 px to spare in the widest case); below that it is in the tooltip
("… · 2 boxes edited in this scene"). The design said 1280 px, where there are 56 px in total.

## Case 4 — The editor called a practice box "the nuScenes label" (fixed)

**Symptom.** In practice mode the edit bar, the legend and the panel said "nuScenes label" for the
box an edit starts from — which there may be one of the deliberately wrong boxes.

**Root cause.** The wording was written for the real annotations in steps B and C; practice mode was
first exercised in step E.

**Fix.** `labelNameOf(practice)`: "practice label" on the practice set; the LiDAR count there reads
"in the original" (it is nuScenes' count for the box it annotated).

## Case 5 — A drag could be written to another box (fixed before it shipped)

**Symptom (would have been).** Press the mouse on a box, press `N` (next rejected box) while holding
it, release: the numbers of the drag were stored on the box the editor had moved to.

**Root cause.** `endDrag` committed the gesture's last values to "the box the editor is on", and
until step F nothing could change that box while a pointer was down.

**Found by.** Reading the code while adding the walk, before any script was written.

**Fix.** Two layers: the walk does not step while a drag is in progress, and `endDrag` drops a drag
whose box is no longer the editor's.

## Case 6 — The edit bar ran out of itself at 1400–1440 px with "Not saved" (fixed)

**Symptom.** With the "Rejected 2 / 4 ‹ ›" group and the "Not saved" pill, the sentence "Saved as an
edit on top of …" pushed the buttons out of the bar.

**Fix.** While "Not saved" is shown the sentence appears from 1536 px (the warning matters more).

## Case 7 — Two tabs: Undo brought back an edit the other tab had removed (fixed)

**Symptom.** Tabs A and B edit the same box. A reverts it to the label. In B the box correctly shows
the label — and `Ctrl+Z` in B restored an older edited state.

**Root cause.** B's undo history only knew B's own steps; the stored box had changed underneath it.

**Fix.** `useBoxEditor`: when the stored box differs from what this editor last wrote, the history
starts again from the stored box (Undo is disabled until the next change here).

**Limit.** Two tabs still overwrite each other — the last write wins. There is no merge.

## Case 8 — 390 px: the edit bar ran 125 px out of the window, and an empty cell 60 % of the window tall sat in the middle (fixed)

**Symptom.** (a) At 390 px the bar's button group did not wrap and the whole page scrolled sideways.
(b) On the stacked layout the list cell, which holds nothing while the editor is open, stayed as a
480 px empty panel between the timeline and the panel with the numbers.

**Found by.** (a) the edge script; (b) **only the capture** — the script's check ("all five number
fields are there, nothing runs out sideways") passed.

**Fix.** (a) the group wraps below the fixed layout. (b) `WorkspaceShell` (`listEmpty`): the empty
cell is left out below `lg`; it comes back with the list when the editor closes. A check for (b) was
added to the script.

## Case 9 — The export menu counted edit records that are in no file (fixed)

**Symptom.** With stale records in storage (a box that is not in the data), the menu said "6 boxes
edited"; the file held 1.

**Fix.** `countEdited` counts from the records and only those whose box is in the scenes the file
covers (`useEditCountIn`).

## Case 10 — The top-bar count is per scene, the walk is over all scenes (handled)

The "N rejected" count in the top bar counts the scene on screen (like the rest of that bar). Made a
button, a click goes to the next rejected box of *any* scene. The tooltip says both numbers ("1
rejected in this scene, 4 in all scenes"), and the button works at "0 rejected" when another scene
has some.

---

## Found while building steps B and C (all fixed there)

- **A hidden list cost the drag its frame rate.** The object list (up to 156 rows), covered by the
  editor, was re-rendered on every pointer move: 41–42 fps on the integrated GPU for the 156-box
  frame. Not drawn while editing → 60 fps (the 72-box frame: 59–60 fps).
- **Handles on top of each other.** Zoomed far out, the hit areas of the handles overlapped and a
  drag on the box's middle resized it. Hit areas scale with the box; below 24 px (shorter side) no
  handles are offered and the view says "Zoom in to resize or turn the box".
- **The 3D name tag showed through the editor** (drei `<Html>` is a DOM node above the canvas):
  `isolate` on the 3D cell.
- **A covered 3D cell was still painted** (41–43 fps in software GL with the editor open): the cell
  is `lg:invisible` while fully covered — the canvas stays mounted. Also applies to the F7.5 report.
- **"171.5" was cut** in a three-column number grid at the 360 px panel → two columns.

## Checked, no change needed (edge review)

- **Stored value broken** — not JSON, empty, `null`, a number, no `state`, `edits` a string, a scope
  an array, a future version: the app opens, nothing is marked, a new edit works, the reviews are
  untouched.
- **Bad records** — NaN, negative / zero / huge size, text for a number, a missing field, a key that
  does not match its ids, a frame or box that is gone, a string, `null`: dropped or laid over
  nothing; only the one good record of thirteen is drawn.
- **A browser from before F8** (reviews in all three scopes, no edit key): the review value is byte
  for byte the same before and after the first edit.
- **Storage refusing writes, or everything:** editing works for the visit; the editor and the top
  bar say "Not saved".
- **Korean layout:** `ㄷ` (E), `ㅍ` (V), V during composition (`Process`), `Ctrl+ㅋ` (Z); Korean text
  in a number field changes nothing.
- **Numbers far outside a box** (9999, 0, −3, 725°, ±999, `1e3`, `Infinity`, `NaN`, empty): sizes
  stay within 0.1–50 m, up / down within ±20 m; the 3D view, the photo and the top view survive a
  50 m box 20 m below the ground; "Revert to label" restores the label's numbers exactly.
- **Another frame under the open editor:** the object id is the same in every frame, so the editor
  follows to the *same object's box in that frame* — a different box with its own edit and undo
  steps. In a frame where the object has no box the editor says so and offers no fields.
- **Another scene picked / Practice switched / Evaluate or COCO chosen while editing:** no error;
  the editor shows "no box selected" (scene, practice) or closes (mode, dataset); the 3D canvas is
  never re-created; edits of one scope are never drawn in the other.
- **Keys with no pause:** `E Esc E V V Esc E Esc E`; `Ctrl+Z` × 12 with nothing to undo; `N` and `→`
  alternating nine times — not one box moved (each arrow came within 0.4 s of an arrival).
- **Reload with the editor open** (closed afterwards, the edit kept); **15 open / switch view / close
  cycles** (72 geometries before and after; with the editor closed the keys do nothing).
- **1024×600, 1280×560, 2560×1300:** the editor adds no page scroll; the numbers can be typed.
- **The longest class name + the walk group + "Not saved" at 1024 px:** the edit bar is one line.
- **A scene whose file cannot be loaded:** the walk and the export leave it out (the menu says "9 of
  10 scenes").

## Found, not caused by F8 (not changed)

- **Below about 640 px of window height the page scrolls** (40 px at 1024×600, 80 px at 1280×560),
  with or without the editor. The fixed layout has a minimum height; the supported sizes start at
  1024×768.

## Script mistakes (so the next session does not repeat them)

- The object id (`instanceToken`) is the same in every frame: "another frame" is another box of the
  same object, not "no box".
- A class chip means "show only these classes", not "hide this class".
- Clicking the selected row again clears the selection.
- A "run" of arrow presses is defined by time (0.8 s); in the CPU-rendered check environment 110
  presses made 20 undo steps, not the 12 the script's pauses intended.
- 0.5 m as the top view shows it is 0.500024 m on level ground when the car is tilted.
- A capture taken after test texts were injected into the page shows the test texts.

## Could not be verified

- The user's own browser, and frame times on the RTX 4060.
- A real input method (the Korean layout was simulated with synthetic key events).
- Whether a box on screen "has been seen": the 0.4 s guard is a time, not a painted frame.

## Known limits

- An edit is one reviewer's judgement, stored in one browser. Two tabs overwrite each other.
- The undo steps belong to one visit of a box: stepping to another box and back keeps the edit and
  drops the steps.
- A stored record with a size above 50 m passes the sanitizer (it only rejects what is not a finite
  positive number); the editor itself never writes one.
- Moving a box in the top view keeps its height above the map, not above the road: on a slope a box
  moved far must be put back on the ground with the up / down number.

<!-- KO (move to a localized file)
# 엣지 케이스 기록 F#8 — 위에서 본 화면에서 3D 박스 수정

F8(2026-11-27 ~ 28)을 만들며 찾은 것들이다: 단계 확인 중에, 코드를 쓰다가, 캡처를 보다가, 그리고 마지막 엣지 검증
(단계 확인에서 한 번도 돌려 보지 않은 조건)에서. 엣지 검증 스크립트(`checks/g.js`)는 **고치기 전에** 먼저 돌렸고
68개 중 63개가 통과했다. 실제 문제 셋(Case 7 ~ 9)이 나왔고, 나머지 실패는 스크립트의 기대가 틀린 것이었다. 넷째
문제(Case 8의 뒷부분)는 스크립트는 통과했는데 캡처에서 보였다. 고친 뒤 마지막 빌드에서 전부 다시 돌렸다: 새 확인
511개와 F7.5의 362개.

- Case 1: "Not saved"가 뜬 채 창이 1280 ~ 1320px이면 맨 위 줄이 접혔다(F8 전부터). 그때는 두 숫자를 1400px부터.
- Case 2: 연습 모드에서는 수정이 없어도 1280 ~ 1320px에서 접혔다(F8 전부터. 배지가 약 92px 넓다). 연습 모드에서는
  앱 이름을 1400px부터.
- Case 3: 새로 넣은 "N edited"가 1400px에서 줄을 접었다. 1440px부터 보인다.
- Case 4: 연습 모드의 편집 화면이 연습용 박스를 "nuScenes label"이라고 불렀다. "practice label"로.
- Case 5: 끄는 도중에 다른 박스로 넘어가면 끌던 값이 새 박스에 저장될 수 있었다(코드를 읽다가 찾음). 두 겹으로 막음.
- Case 6: 1400 ~ 1440px + "Not saved"에서 편집 줄이 넘쳤다. 그때는 설명 문장을 1536px부터.
- Case 7: 탭 두 개에서, 다른 탭이 되돌린 수정을 Ctrl+Z가 되살렸다. 저장된 박스가 밖에서 바뀌면 이력을 새로 시작.
- Case 8: 390px에서 편집 줄이 창 밖으로 125px 나갔고, 빈 목록 칸(창 높이의 60%)이 가운데 남았다(뒷부분은 캡처로만 찾음).
- Case 9: 내보내기 메뉴가 파일에 없는 낡은 수정 기록까지 셌다("6개" 대 파일의 1개).
- Case 10: 맨 위 줄의 반려 개수는 지금 장면의 것이고 넘기기는 전체 장면이다. 설명에 둘 다 적고, 0개여도 누를 수 있게.

F8이 만든 것이 아니라서 고치지 않은 것: 창 높이가 약 640px보다 낮으면 페이지가 스크롤된다(편집 화면과 무관).
확인하지 못한 것: 사용자의 실제 브라우저와 RTX 4060, 실제 한글 입력기(키 이벤트를 흉내 냈다).
-->
