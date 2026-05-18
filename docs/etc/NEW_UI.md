# Step 9.5 — UI Density & Polish 후보 결정 문서

이 문서는 Step 9.5에 들어가기 전에 검토한 UI 기능 후보 전체와 각 후보의 채택/제외
근거를 보존하는 결정 기록(decision log)이다. 진행 상황(체크리스트)은
`.claude/docs/mvp-checklist.md`의 Step 9.5에, 구조적 영향(컴포넌트 책임/계약)은
`.claude/docs/architecture.md`의 "Step 9.5 Component Contracts (planned)" 절에 둔다.

Step 9.5의 목적은 **현재 UI가 빈약해 보이는 문제를 적은 비용으로 해결**하는 것이다.
멋있어 보이는 기능보다 "작지만 확실히 세련된" 기능을 우선했다.

---

## 1. 채택한 기능

### Phase 1 — 안정화 + 톤

| # | 기능 | 핵심 |
|---|---|---|
| 1 | Viewer2D fixed aspect 래퍼 | `aspect-[4/3]`로 SVG 셀 높이 고정. 프레임 전환 시 Timeline 위치 흔들림 제거 |
| 2 | 다크 톤 zinc/neutral 베이스로 교체 | 현재 `gray-900`의 푸른빛 제거. 페이지/패널/3D 캔버스 3계층 분리 |
| 3 | sky 단일 액센트 | 슬라이더에 이미 쓰이는 `sky-400`을 선택/포커스 액센트로 통일 |
| 4 | 클래스 컬러 톤 다운 | `lib/ui/class-colors.ts` 한 곳에서 한 단계 채도 감소 |
| 5 | 3D Scene `<Grid>` 바닥 | drei가 이미 설치돼 있음. 공간 기준점 제공 |
| 6 | 3D Scene `<fog>` | 원근감 + 멀리 있는 point cloud 노이즈 자연스럽게 가려짐 |
| 7 | 3D 조명 보강 | 기존 ambient+directional에 hemisphere light 1개 추가 |
| 8 | OrbitControls 민감도 완화 | `rotateSpeed=0.5`, `zoomSpeed=0.6`, `panSpeed=0.6` |
| 9 | 3D Hint box | Viewer3D 코너에 드래그/휠/클릭 안내 |

### Phase 2 — 정체성 + 인터랙션

| # | 기능 | 핵심 |
|---|---|---|
| 10 | Header 추가 | `AI Detection Viewer · Frame N/M · X detections` |
| 11 | ObjectList confidence 게이지 | 텍스트 신뢰도를 sky 톤 채움 바로 시각화 |
| 12 | ObjectList hover/selected 인터랙션 강화 | ring 전환, 선택 시 자동 scroll-into-view |
| 13 | Filters Reset 버튼 | threshold = 0 + visibleClasses = ∅ 복원 |
| 14 | Filters 가시 카운트 | `N/total visible` inline 표시 |
| 15 | Timeline 객체 수 뱃지 | 썸네일 코너에 작은 카운트 칩 |

### Phase 3 — Analytics Panel

| # | 기능 | 핵심 |
|---|---|---|
| 16 | 12-col 5/7 split 레이아웃 | Viewer2D 5 / Viewer3D 7 / ObjectList 5 / AnalyticsPanel 7 / Timeline 12. 3D 메인 뷰 강조 |
| 17 | AnalyticsPanel 컨테이너 | 우측 패널. Inspector + charts 묶음 |
| 18 | SelectedObjectInfo 카드 | 선택된 객체의 class/confidence/bbox/frame id. 선택 없을 때 placeholder |
| 19 | ConfidenceHistogram (SVG) | 고정 bucket 분포 + 현재 threshold 가이드선 overlay |
| 20 | ClassCountBar (CSS 수평 막대) | 클래스별 객체 수. 행 클릭 시 `toggleClass` — 차트가 필터 역할 겸함 |
| 21 | `lib/selectors/confidence-buckets.ts` | 순수 집계 함수. unit test 필수 |
| 22 | `lib/selectors/class-counts.ts` | 순수 집계 함수. unit test 필수 |

---

## 2. 제외한 기능과 이유

### 라이트 테마 전환 — 제외

> "라이트 테마가 무조건 부적합한가"는 정확한 질문이었음. **부적합한 게 아니라 비용이
> 크다.** 라이트는 단순 색상 교체가 아니라:
>
> - 클래스 컬러 5개 hex만 바꾸는 문제가 아니라 흰 배경에서의 대비 검증 필요(WCAG)
> - 흰 배경에서는 현재 `SELECTED_COLOR = '#ffffff'` 선택 색이 보이지 않음 → 액센트
>   교체 + 시각 강도 재튜닝
> - `Viewer2D`의 SVG `feGaussianBlur` glow가 흰 배경에서는 무의미 → fill/ring 기반
>   하이라이트로 재설계
> - 3D Canvas 배경은 고정 다크 — 라이트 페이지로 가면 "흰 페이지 + 검은 캔버스 섬"
>   구조가 되어 컴포넌트 두 톤(light/dark) 이중 설계 필요
>
> Step 9.5 12~15시간 예산에서 위를 동시에 해결하면 Phase 1이 폭발한다.
> 업계 관행도 다크가 우세: Foxglove, RViz, Blender, Unity Editor, Cesium ion, CARLA.
> "다크 톤만 zinc/neutral 베이스로 교체"가 비용 대비 효과 최적.

KITTI 도입 단계에서 v2 비전을 새로 정할 때 재검토한다.

### Recharts 도입 — 제외

> CLAUDE.md "Do NOT add ... Recharts (until post-MVP)" 규칙이 1차 근거.
> 그보다 실질적인 이유:
>
> - 데이터 규모가 작음. 프레임당 ≤10 detection, 전체 10 프레임.
> - 동시에 그릴 차트 요소가 5개 내외.
> - Recharts 도입 시: 번들 크기 증가, Recharts API 학습 비용(여러 차트 타입마다
>   props 모양이 다름), 단일 데이터셋에 비례하지 않는 추상화.
> - 순수 SVG/CSS로 만들 코드량이 Recharts 사용 코드량보다 오히려 적음.
>
> PROJECT_DESIGN.md 5절에 Recharts가 스택으로 적혀 있으나 "기능 우선순위" 12절에서는
> "통계 차트 (Recharts)"가 **하면 좋은 추가 기능**으로 분류되어 있고, 13절 일정에도
> 포함되지 않음. 즉 비결정 상태였음. Step 9.5에서 "미도입"으로 확정한다.

### 순수 SVG / CSS 차트 선택 — 이유

> - 사용자는 [Viewer2D.tsx](../../apps/ai_detection_viewer_client/src/components/viewer-2d/Viewer2D.tsx)에서
>   이미 SVG `viewBox`/`<rect>`/`<text>`/`<filter>`/`feGaussianBlur`를 직접 다룬
>   경험이 있다. Histogram에 필요한 SVG 지식은 그보다 적다(`<rect>` 4개 속성 +
>   `Math.max()`로 정규화).
> - Confidence histogram은 **슬라이더 임계선을 차트와 같은 좌표계에 overlay**하기
>   위해 SVG가 자연스러움. CSS로는 임계선 위치 계산이 어색.
> - Class count는 **수평 막대 5~8개 + 라벨 + 카운트가 한 줄**이라 CSS flex가 더
>   간결. SVG로 가면 텍스트 정렬이 번거로움.
> - 포트폴리오 어필 측면에서도 "SVG로 직접 차트 구현"이 "Recharts 사용"보다 가산점.

### 클래스별 객체 수 — 수평 막대 채택, 도넛 제외

> - 도넛은 3개 클래스에 면적 비교 어려움(인지심리학적으로 각도/면적 비교는 길이
>   비교보다 정확도가 낮음).
> - 도넛은 라벨 배치가 까다로움. 수평 막대는 `[색상칩] 클래스명  [────] N`이
>   한 줄에 자연스럽게 들어감.
> - SVG 호(arc) path 수식 필요 → 초보자가 단순 `<rect>`보다 어려움.
> - KITTI 도입 시 8 클래스로 확장됨. 수평 막대는 행 추가만으로 끝나지만 도넛은
>   각도 재계산 필요.
> - **결론: 수평 막대 채택.**

### 프레임별 탐지 수 라인 차트 — 제외

> 현재 샘플 데이터는 MS COCO val2017의 10개 **독립 이미지**다. 연속 비디오가 아님.
> 라인 차트는 시간/순서 축이 의미 있을 때 가치 있는데 이 전제가 깨짐.
> 사용자가 "실제 영상 흐름"으로 오해할 가능성이 높음.
>
> 같은 정보(프레임당 객체 수)는 Phase 2의 Timeline 객체 수 뱃지로 시간 축 오해
> 없이 표현 가능.

### 프레임 자동 재생 시 객체 tween — 제외

> 결정적 문제: COCO의 `Detection2D.id`는 ``${imageId}-${annotationId}``로 생성되어
> **프레임이 바뀌면 같은 객체라도 다른 id를 갖는다**. 즉 inter-frame object identity가
> 정의되어 있지 않음. tween의 전제 자체가 깨짐.
>
> KITTI Tracking variant는 frame 간 object_id를 제공함 → KITTI 도입 이후에만
> 의미 있는 기능. PROJECT_DESIGN.md 14절 "확장 가능한 추가 기능"의 위치에 그대로
> 둔다.

### 가짜 tracking (휴리스틱 매칭) — 제외

> 클래스가 같고 거리가 가까운 객체를 같은 객체로 간주하는 휴리스틱.
>
> - 프로젝트의 [Edge_#4 Case 6](../edgecases/Edge_#4.md) (카메라 리셋), [Edge_#5
>   Case 6](../edgecases/Edge_#5.md) (선택 클리어), Edge_#4 Case 4 (GPU dispose)
>   세 계약과 충돌.
> - "가짜 동기화 위의 애니메이션"은 면접 질문에서 약점이 됨.
> - KITTI Tracking을 도입하면 자연스럽게 진짜 tracking이 들어옴.

### 프레임 전환 시 3D fade 효과 — 제외

> 현재 `<Viewer3D key={currentFrame.id}>`는 [Edge_#4 Case 6](../edgecases/Edge_#4.md)
> 해결책으로 의도적으로 동기 remount하도록 설계됨. fade를 넣으려면:
>
> - 이전 Canvas를 살려둔 채 새 Canvas를 띄우고 opacity 전환 → key remount 전략 폐기
> - 또는 신규 의존성(framer-motion) 도입
> - 또는 CSS opacity 트릭 → key 변경 시점에 이전 DOM이 즉시 제거되어 fade 불가
>
> 즉 안정된 카메라 리셋 전략을 갈아엎고 GPU dispose / 선택 클리어 / OrbitControls
> 리셋 상호작용을 재검증해야 함. **비용 vs 시각 효과 트레이드오프에서 효과가 약함**.
> 프레임 전환은 자주 발생하지 않고 현재 전환 속도도 충분히 빠르다.

---

## 3. KITTI 도입과의 관계

KITTI는 PROJECT_DESIGN.md 14절 "확장 가능한 추가 기능"의 우선순위 높음 항목이다.
**Step 9.5에서는 KITTI를 별도로 의식해 설계를 바꾸지 않는다.** 이유:

- `architecture.md`의 "COCO Raw Schema Types" 절은 이미 "KITTI in the future가 앱
  나머지에 leak되지 않도록" 외부/내부 타입을 분리해 둠. 데이터 경계가 이미 KITTI를
  예상한 설계.
- `lib/coco/`와 병렬로 `lib/kitti/` 신설하면 충분. 컴포넌트 시그니처/Zustand store는
  무변.
- Step 9.5에서 새로 추가되는 `lib/selectors/`의 집계 함수도 KITTI 데이터에서 그대로
  동작함(클래스 색상은 `getClassColor`의 fallback이 이미 처리).
- Class count 차트를 **수평 막대로 선택**한 것이 KITTI 호환성을 자연스럽게 확보 —
  3 → 8 클래스 확장이 행 추가만으로 끝남.

KITTI 자체의 진짜 비용은 코드가 아니라:
- KITTI 데이터셋 크기(샘플도 수백 MB) — 호스팅 인프라
- Velodyne `.bin` 바이너리 point cloud 파서(별도 작업)

코드 측 수정은 다음 영역에 국한:
- `lib/kitti/parser.ts` 신설 (중간 비용)
- `lib/geometry/frame-enricher.ts`에 "이미 detections3D가 있으면 estimation 스킵"
  조건 1줄
- `domain-glossary.md`에 Velodyne, calibration 용어 추가

KITTI 이후에 비로소 의미를 갖는 후속 기능들:
- 프레임 자동 재생 시 객체 tween (KITTI Tracking variant 필요)
- 실제 LiDAR point cloud 시각화
- 진짜 inter-frame tracking 통계

---

## 4. 결정 요약

| 결정 | 값 |
|---|---|
| 테마 | 다크 유지, zinc/neutral 베이스, sky 단일 액센트 |
| 차트 라이브러리 | 미도입 (순수 SVG/CSS) |
| Confidence 차트 | SVG histogram + threshold overlay |
| Class count 차트 | CSS 수평 막대 + 클릭 시 toggleClass |
| 프레임별 라인 차트 | 미채택 (Timeline 뱃지로 대체) |
| 레이아웃 | 12-col 5/7 split (제안 B) |
| Timeline 흔들림 해결 | Viewer2D fixed aspect 래퍼 |
| 3D 분위기 | Grid + Fog + hemisphere light (postprocessing/HDRI 없음) |
| 카메라 민감도 | OrbitControls 0.5/0.6/0.6 |
| 프레임 전환 fade | 미채택 |
| 객체 tween / tracking | 미채택 (KITTI 이후) |
| 라이트 테마 | 미채택 (KITTI v2 단계에서 재검토) |
| KITTI | Step 9.5 설계에 영향 없음 (이미 호환 구조) |
