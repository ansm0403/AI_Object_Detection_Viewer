# Edge Case Log #5 — 2D ↔ 3D Selection Sync (Step 5)

## Context

Discovered during edge case analysis after the **Step 5 — 2D ↔ 3D Selection Sync**
implementation. All 12 cases were systematically reviewed against the following files:

- `apps/ai_detection_viewer_client/src/app/page.tsx`
- `apps/ai_detection_viewer_client/src/components/viewer-2d/Viewer2D.tsx`
- `apps/ai_detection_viewer_client/src/components/viewer-3d/Viewer3D.tsx`
- `apps/ai_detection_viewer_client/src/components/viewer-3d/Scene.tsx`
- `apps/ai_detection_viewer_client/src/components/viewer-3d/BBox3D.tsx`
- `apps/ai_detection_viewer_client/tests/integration/selection-sync.test.ts`
- `apps/ai_detection_viewer_client/vitest.config.ts`

Test suite status throughout: **70/70 passing** after fixes (69 prior + 1 new case-5 test).

---

## Summary

| # | Symptom | Root cause | Decision | Fix site |
|---|---------|-----------|----------|----------|
| 1 | 2D bbox 클릭이 svg deselect를 동시에 트리거 | DOM 이벤트 버블링 | **Already handled** | `Viewer2D.tsx` `e.stopPropagation()` |
| 2 | 3D bbox 클릭이 `onPointerMissed`와 충돌 | R3F 이벤트 모델 오해 | **Not applicable** | — |
| 3 | 동일 id 반복 선택 시 상태 오염 | Zustand `set()` 중복 호출 | **Already handled** | 기존 테스트로 커버됨 |
| 4 | `null` 전달 시 양쪽 하이라이트 미해제 | `d.id === null` 비교 | **Already handled** | 기존 테스트로 커버됨 |
| 5 | 존재하지 않는 id 설정 시 UI 오류 | store가 id를 검증하지 않음 | **Documented + test added** | `selection-sync.test.ts` |
| 6 | 프레임 전환 시 stale selection 잔류 | store가 프레임 데이터를 모름 | **Defer to Step 8** | — |
| 7 | 뷰어 한 쪽만 렌더링 시 상태 오류 | store 의존성 구조 | **Already handled** | — |
| 8 | 빠른 연속 클릭 시 race condition | 브라우저 싱글 스레드 특성 | **Not applicable** | — |
| 9 | glow filter가 잘못된 요소에 적용 | JSX attribute 조건부 렌더링 | **Already handled** | — |
| 10 | scale pulse 해제 시 원상 복구 실패 | `useFrame` 클로저 업데이트 시점 | **Already handled** | — |
| 11 | 카메라가 bbox 내부에서 클릭 불가 | Three.js `FrontSide` 기본값 | **Fixed** | `BBox3D.tsx` `THREE.DoubleSide` |
| 12 | DOM/canvas 미검증 영역 미문서화 | 통합 테스트 범위 제한 | **Already documented** | `mvp-checklist.md`, `architecture.md` |

---

## Case 1 — 2D bbox 클릭 이벤트가 `<svg onClick>`로 전파되어 즉시 deselect

### 원인 분석
`<svg onClick={() => onSelect?.(null)}>` (empty-space deselect)와 `<rect onClick>` (bbox select)가
동일 DOM 트리에 있다. 이벤트가 `rect → g → svg` 순으로 버블링되므로, bbox를 클릭하면
`rect.onClick`과 `svg.onClick`이 모두 실행될 수 있다.

### 발생 가능한 문제
`onSelect?.(d.id)` 직후 `onSelect?.(null)`이 연속 호출 → 선택 직후 즉시 해제.

### 수정 방법
수정 불필요. `Viewer2D.tsx`의 `rect.onClick`에 이미 `e.stopPropagation()`이 구현되어 있다.

```tsx
onClick={(e) => {
  e.stopPropagation();  // svg.onClick으로 버블링 차단
  onSelect?.(d.id);
}}
```

### 수정 이유
SVG 이벤트 버블링은 DOM 표준 동작이며, `stopPropagation`이 정확한 해결책이다.

### 검증 방법
DOM 렌더링 테스트는 MVP 정책상 제외. 수동 검증: bbox 클릭 후 즉시 deselect되지 않음을 확인.

### 결과
**해결됨 (기존 구현에서 처리됨)**. `e.stopPropagation()`이 Step 2 설계 시 이미 포함됨.
잔여 리스크 없음.

---

## Case 2 — 3D bbox 클릭과 `<Canvas onPointerMissed>` 충돌

### 원인 분석
R3F의 `onPointerMissed`는 Canvas-level 콜백이며, pointer 이벤트가 Canvas에 도달했지만
**어떤 Three.js 오브젝트도 교차되지 않았을 때만** 발동한다. 이는 R3F의 raycasting 레이어에서
결정되는 것이지, DOM 이벤트 버블링과 무관하다.

### 발생 가능한 문제
이론: bbox를 클릭했는데 `onPointerMissed`도 동시에 발동 → 선택 직후 즉시 deselect.
**실제로는 발생하지 않음** — R3F 이벤트 모델에서 두 경로는 상호 배타적이다.

### 수정 방법
수정 불필요. R3F의 `onPointerMissed`는 `mesh.onClick`과 상호 배타적으로 동작한다.
BBox3D의 `e.stopPropagation()`은 씬 그래프에서 다른 겹치는 3D 오브젝트로의 전파를 막지만,
`onPointerMissed`를 막는 것과는 무관하다 — `onPointerMissed`는 교차 없음 판정 자체가 전제조건.

### 수정 이유
해당 케이스는 R3F 이벤트 모델에 대한 오해에서 비롯된 우려로, 실제 버그가 아니다.

### 검증 방법
수동 검증: 3D bbox 클릭 후 즉시 deselect되지 않음을 확인.

### 결과
**해당 없음 (Not applicable)**. R3F 이벤트 아키텍처에서 충돌 불가능. 잔여 리스크 없음.

---

## Case 3 — 동일 객체 반복 클릭 시 상태 오염 또는 예외

### 원인 분석
동일 bbox를 두 번 클릭하면 `setSelectedObject('same-id')`가 두 번 호출된다.
Zustand의 `set()`이 두 번 실행되어 내부 리스너가 두 번 통지받는다.

### 발생 가능한 문제
이론: 불필요한 re-render 또는 상태 오염.

**실제로는 발생하지 않음**:
- 예외 없음: `set({ selectedObjectId: 'same' })`은 언제나 안전하다.
- 상태 오염 없음: 두 번째 호출도 동일 값을 기록한다.
- 불필요한 re-render 없음: 구독자는 selector 결과를 `Object.is`로 비교하므로
  (`Object.is('same', 'same') === true`) React 컴포넌트를 re-render하지 않는다.

### 수정 방법
수정 불필요.

### 수정 이유
Zustand v5의 구독 모델이 selector 수준에서 중복 re-render를 자동으로 방지한다.
store setter에 idempotency 최적화를 추가하는 것은 현재 사용자 경험에 영향이 없으므로
MVP 범위를 넘는다.

### 검증 방법
기존 통합 테스트: `'selecting the same id twice does not throw or corrupt state'`.

### 결과
**해결됨 (기존 구현 및 테스트로 커버됨)**. 잔여 리스크 없음.

---

## Case 4 — `setSelectedObject(null)` 호출 시 양쪽 하이라이트 미해제

### 원인 분석
`selectedObjectId`가 `null`로 설정된 후 각 detection의 `d.id === null` 비교가 어떻게
동작하는지에 달려 있다. Detection id는 항상 `string` 타입이므로 `string === null`은
항상 `false`다.

### 발생 가능한 문제
이론: 일부 뷰어에서 하이라이트가 잔류.

**실제로는 발생하지 않음**:
- Viewer2D: `isSelected = d.id === null` → 모든 detection에서 `false` → 클래스 색상 복원, glow 제거.
- BBox3D: `isSelected={false}` → 흰색 제거, 다음 `useFrame` 틱에서 `scale.setScalar(1)`.

### 수정 방법
수정 불필요.

### 수정 이유
string/null 타입 불일치로 인한 비교 결과가 설계 의도와 일치한다.

### 검증 방법
기존 통합 테스트: `'setSelectedObject(null) clears the selection from both views'`.

### 결과
**해결됨 (기존 구현 및 테스트로 커버됨)**. 잔여 리스크 없음.

---

## Case 5 — 존재하지 않는 objectId가 설정될 경우 UI 오류

### 원인 분석
Zustand store의 `setSelectedObject`는 id를 검증하지 않는다 (store는 프레임 데이터를 모름 —
Separation of Concerns). 따라서 어떤 string이든 `selectedObjectId`에 저장될 수 있다.

이 상황이 발생하는 경로:
- 외부에서 임의 string을 store에 직접 주입하는 경우 (예: 개발 도구, 미래 URL 기반 state restore).
- Step 8 구현 후 프레임 전환 시 이전 프레임의 id가 새 프레임에 없는 경우 (Case 6과 연계).

### 발생 가능한 문제
이론: `d.id === 'ghost-id'`가 잘못 `true`가 되거나, 컴포넌트가 crash할 수 있음.

**실제로는 발생하지 않음**:
- Viewer2D: `d.id === 'ghost-id'` → 모든 detection에서 `false` → 하이라이트 없이 정상 렌더링.
- BBox3D: `isSelected={d.id === 'ghost-id'}` → `false` → 정상 렌더링.
- `useFrame`: `isSelected = false` → 애니메이션 없음.

### 수정 방법
코드 수정 불필요. **통합 테스트 추가**로 이 동작을 계약으로 잠근다:

```ts
// tests/integration/selection-sync.test.ts에 추가됨
it('setting a nonexistent objectId does not throw and stores the id as-is', () => {
  expect(() => {
    useViewerStore.getState().setSelectedObject('does-not-exist-in-any-frame');
  }).not.toThrow();
  expect(querySelectedId()).toBe('does-not-exist-in-any-frame');
});
```

### 수정 이유
store가 id를 검증하지 않는 것은 의도적 설계(Separation of Concerns)이며, 그 결과로 컴포넌트가
안전하게 렌더링되는 것도 의도된 동작이다. 이를 테스트로 명시적으로 잠그면 향후 store에
의도치 않은 검증 로직이 추가될 때 알림 역할을 한다.

### 검증 방법
신규 통합 테스트: `'setting a nonexistent objectId does not throw and stores the id as-is'`.

### 결과
**해결됨 (설계상 안전, 테스트로 계약 잠금)**. 잔여 리스크: 렌더링 레이어에서의 동작은
DOM 테스트 없이는 불검증 상태이나, `d.id === selectedId` 비교 로직이 단순해 수동 확인으로 충분.

---

## Case 6 — 선택된 객체가 데이터에서 사라졌을 때 stale selection 잔류 (DOCUMENTED, defer to Step 8)

### 원인 분석
`selectedObjectId`는 Zustand store에 지속되며, `setSelectedFrame`으로 프레임이 전환돼도
자동으로 초기화되지 않는다. 새 프레임에 이전 id가 없으면 하이라이트는 보이지 않지만
store에는 stale id가 남는다.

현재 Step 5는 `frames[0]`만 렌더링하므로 이 케이스는 실제로 발생하지 않는다.

### 발생 가능한 문제
Step 8에서 프레임 타임라인이 구현되면:
- 프레임 A에서 "obj-5" 선택 → 프레임 B로 전환 → `selectedObjectId = 'obj-5'` 잔류
- 프레임 B에 "obj-5"가 없으면 하이라이트 없음 (visual은 정상처럼 보임)
- 이후 프레임 C에 "obj-5"가 있으면 의도치 않게 하이라이트됨
- Object List 패널(Step 6)에서 stale item이 highlighted로 표시될 수 있음

### 수정 방법
수정 불필요 (Step 5 범위 아님). **Step 8에서 프레임 전환 시 selection 초기화** 필요:

```ts
// Step 8 구현 시 page.tsx에서:
setSelectedFrame(newFrameId);
setSelectedObject(null);  // stale selection 초기화
```

또는 store의 `setSelectedFrame` 내부에서 `selectedObjectId`를 함께 초기화하는 방식도 가능하나,
store가 프레임 전환 의미론에 결합되는 것이므로 page.tsx에서 처리하는 것이 더 적합하다.

### 수정 이유
Step 5 범위를 벗어난다. Step 8이 `setSelectedFrame` 로직을 구현할 때 함께 결정해야 할 UX
사항이기도 하다 (예: "프레임 전환 시 선택 유지" vs "항상 초기화" — 이 결정이 fix 위치에 영향을 미침).

### 검증 방법
Step 8 구현 시 통합 테스트 추가 예정:
- 프레임 A에서 id 선택 → 프레임 B로 전환 → `selectedObjectId`가 null임을 확인.

### 결과
**문서화됨 (DEFER to Step 8)**. Step 8 시작 전 이 케이스를 재독할 것.
잔여 리스크: 현재 Step 5 구현에서는 frames[0]만 렌더링하므로 실제로 발생하지 않음.

---

## Case 7 — 2D 또는 3D viewer 중 하나만 렌더링되는 상황

### 원인 분석
`onSelect`와 `selectedId`는 모두 optional prop이다. 하나의 viewer가 렌더링되지 않거나
prop 없이 렌더링될 수 있다.

### 발생 가능한 문제
이론: 한쪽 viewer가 없을 때 selection state가 reset되거나 crash.

**실제로는 발생하지 않음**:
- Zustand store는 React 컴포넌트 마운트/언마운트와 독립적이다.
- `onSelect` 미전달 → `onSelect?.()` 옵셔널 체이닝으로 no-op.
- `selectedId` 미전달 → `undefined` → `d.id === undefined` 항상 `false` → 하이라이트 없음.

### 수정 방법
수정 불필요. prop이 optional로 설계되어 있다.

### 수정 이유
controlled component 패턴에서 optional prop의 정확한 사용이다.

### 검증 방법
store 유닛 테스트에서 이미 검증됨: store는 컴포넌트 없이 단독으로 동작함.

### 결과
**해결됨 (기존 설계에서 처리됨)**. 잔여 리스크 없음.

---

## Case 8 — 빠른 연속 클릭, 선택/해제 반복 시 race condition

### 원인 분석
클릭 이벤트 핸들러 → `setSelectedObject` 호출 → Zustand state 업데이트가 동시에
진행될 수 있다는 우려다.

### 발생 가능한 문제
이론: 두 클릭이 동시에 store를 mutation해 잘못된 상태로 수렴.

**실제로 발생 불가**:
브라우저 JavaScript는 단일 스레드(Single-threaded Event Loop)다. 이벤트 핸들러는 순서대로
실행되며, 하나의 핸들러가 완전히 실행되기 전에 다른 핸들러가 시작될 수 없다.
Zustand의 `set()`도 동기적으로 실행된다.

빠른 연속 클릭의 실제 동작:
1. 클릭 A → `setSelectedObject('A')` → store: `selectedObjectId='A'`
2. 클릭 B → `setSelectedObject('B')` → store: `selectedObjectId='B'`
3. React batching: 단일 re-render → `selectedObjectId='B'` (최종 상태 반영)

### 수정 방법
수정 불필요. 이 케이스는 브라우저 아키텍처 특성상 발생하지 않는다.

### 수정 이유
Single-threaded JavaScript에서 race condition은 개념적으로 불가능하다.
Web Worker나 SharedArrayBuffer를 사용하는 경우라면 달라지지만, 이 프로젝트는 해당 없음.

### 검증 방법
해당 없음.

### 결과
**해당 없음 (Not applicable)**. 잔여 리스크 없음.

---

## Case 9 — SVG glow filter가 선택된 요소에만 적용되는지

### 원인 분석
`filter={isSelected ? 'url(#bbox-selected-glow)' : undefined}` — 조건부 attribute 할당.
`undefined`가 JSX에서 어떻게 처리되는지에 달려 있다.

### 발생 가능한 문제
이론: `undefined`가 `"undefined"` string으로 렌더링 → 모든 rect에 broken filter 적용.

**실제로는 발생하지 않음**:
React는 JSX attribute 값이 `undefined`이면 해당 attribute를 DOM에 렌더링하지 않는다.
따라서 선택되지 않은 rect에는 `filter` attribute 자체가 존재하지 않는다.

`<defs>` 내 filter 정의는 문서 전체에 존재하지만, 해당 id를 참조하는 element가 없으면
GPU에서 filter가 실행되지 않는다 — 정의만으로는 렌더링 비용이 없다.

### 수정 방법
수정 불필요.

### 수정 이유
React의 JSX → DOM attribute 변환 규칙이 `undefined`를 올바르게 처리한다.

### 검증 방법
수동 검증: DevTools에서 선택된 rect에만 `filter="url(#bbox-selected-glow)"` attribute 확인.

### 결과
**해결됨 (기존 구현에서 처리됨)**. 잔여 리스크 없음.

---

## Case 10 — 3D `useFrame` scale pulse 해제 시 정상 복구

### 원인 분석
`isSelected`가 `true → false`로 변경될 때:
1. React re-render → 새 `isSelected = false` prop으로 BBox3D 재렌더링
2. R3F의 `useFrame` 콜백이 최신 closure로 업데이트됨
3. 다음 animation frame에서 `isSelected = false` → `scale.setScalar(1)` 실행
4. scale 정상 복원

gap(2 → 3 사이) = 1 프레임 ≈ 16ms (60fps) — 사용자 인지 불가.

### 발생 가능한 문제
이론: 선택 해제 후에도 pulse 애니메이션이 멈추지 않거나, scale이 비정상 값에 고정.

**실제로는 발생하지 않음**:
R3F의 `useFrame`은 React 렌더링 사이클과 연동되어 컴포넌트가 re-render될 때 콜백 closure가
업데이트된다. `isSelected = false` 상태의 콜백은 `else` branch에서 `scale.setScalar(1)`을
호출하므로, 선택 해제 후 최초 frame tick에서 scale이 복원된다.

### 수정 방법
수정 불필요.

### 수정 이유
`useFrame`이 closure를 매 render마다 갱신하는 R3F의 동작 방식에 의해 보장된다.
명시적인 cleanup은 `useFrame` 내의 else branch와 중복이 된다.

### 검증 방법
수동 검증: bbox 선택 후 다른 bbox 클릭 시, 이전 bbox의 pulse가 즉시 멈추고 scale이 1로 복원됨.

### 결과
**해결됨 (기존 구현에서 처리됨)**. 잔여 리스크 없음.

---

## Case 11 — 3D invisible click target이 카메라 내부에서 작동하지 않음 (FIXED)

### 원인 분석
`<meshBasicMaterial transparent opacity={0} />`의 `side` 기본값은 `THREE.FrontSide`다.
Three.js 레이캐스팅은 기본적으로 front-facing 삼각형(법선이 카메라를 향하는 면)만 교차 판정한다.

카메라가 bbox 내부로 이동하면:
- Box 외표면의 법선은 바깥을 향함 (`FrontSide`)
- 내부에서 바라보면 해당 면들이 back-facing → 레이캐스터가 교차 감지 못함
- `mesh.onClick`이 발화되지 않음 → bbox를 클릭해도 선택이 안 됨

이 상황은 OrbitControls로 실제로 발생 가능하다. 큰 detection(이미지에서 큰 bbox → 추정된 3D size도 큰)
근방을 orbit할 때 카메라가 bbox 볼륨 안으로 진입할 수 있다.

### 발생 가능한 문제
사용자 경험: bbox 근처로 orbit한 후 클릭이 작동하지 않아 선택이 불가능.
2D에서는 정상 선택되는 객체가 3D에서만 클릭이 안 되는 비대칭 UX 발생.

### 수정 방법
`BBox3D.tsx`의 보이지 않는 클릭 타깃 메시에 `side={THREE.DoubleSide}` 추가:

```tsx
// Before
<meshBasicMaterial transparent opacity={0} />

// After
<meshBasicMaterial side={THREE.DoubleSide} transparent opacity={0} />
```

`THREE.DoubleSide`는 front face와 back face 모두 레이캐스팅 교차 판정 대상으로 만든다.

### 수정 이유
가장 단순하고 정확한 해결책이다. 대안으로 클릭 타깃 메시를 약간 크게 만드는 방법(`scale 1.05` 등)이
있지만, visual wireframe과의 정렬이 어긋날 수 있다. `DoubleSide`는 기존 geometry와 완전히 동일한
크기를 유지하면서 클릭 가능 영역만 양방향으로 확장한다.

가시적 렌더링 변화 없음: material이 `opacity={0}` + `transparent`이므로 시각적으로 보이지 않는다.

### 검증 방법
수동 검증: OrbitControls로 bbox 안으로 카메라를 이동한 후 클릭이 정상 작동함을 확인.

### 결과
**수정됨**. `BBox3D.tsx` 한 줄 변경 (`side={THREE.DoubleSide}`).
잔여 리스크: 카메라가 bbox 안에서 클릭할 때 의도한 객체 뒤에 있는 다른 객체를 선택할
가능성은 낮지만 이론적으로 존재함. `e.stopPropagation()`이 front-most 교차 객체만
선택되도록 보장하므로 실질적 리스크 없음.

---

## Case 12 — DOM/canvas 렌더링 미검증 영역 문서화

### 원인 분석
통합 테스트(`selection-sync.test.ts`)는 store 상태 계약만 검증한다. 다음 영역은 테스트되지 않는다:
- SVG `filter` attribute가 DOM에 실제로 추가/제거되는지
- `isSelected=true`일 때 stroke 색상이 흰색으로 변경되는지
- `useFrame`이 scale을 실제로 변경하는지
- `onPointerMissed`가 실제로 발화되는지

### 발생 가능한 문제
렌더링 버그가 자동 테스트로 감지되지 않는다. 예를 들어 `isSelected` 조건이 반전되어
비선택 요소에 glow가 적용되어도 통합 테스트를 통과한다.

### 수정 방법
코드 수정 불필요. MVP 테스트 정책상 컴포넌트 렌더링 테스트는 제외한다.
이 경계는 이미 명시적으로 문서화되어 있다:
- `mvp-checklist.md` Step 5: "Still no DOM/canvas rendering tests. Verified data contract only."
- `architecture.md` Testing Boundaries: `components/` 레이어는 MVP 중 자동 테스트 제외.

### 수정 이유
`@testing-library/react` 및 R3F canvas 테스트 setup은 MVP 범위를 벗어나며 (CLAUDE.md),
해당 영역은 수동 브라우저 확인으로 검증 가능하다.

### 검증 방법
수동 검증: 브라우저에서 bbox 클릭 → 2D glow + white stroke, 3D white + pulse 확인.

### 결과
**문서화됨 (이미 mvp-checklist 및 architecture.md에 명시)**. 잔여 리스크: 렌더링 레이어의
회귀는 자동 테스트로 감지되지 않음. Step 9 (UI Cleanup) 후 수동 검증 재실시 권장.
