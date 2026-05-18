# 자전거를 클릭했는데 사람이 선택되는 문제 — SVG paint order와 깊이 직관 맞추기

> AI Object Detection Viewer 프로젝트의 Step 7 작업 도중, 직접 마우스를 움직이다 발견한 첫 번째 UX 버그.
> 코드 리뷰가 잡지 못한 것을 손이 잡았다.

## TL;DR

- **증상**: 시각적으로 명백히 앞에 있는 자전거 앞바퀴를 클릭했는데 사람 객체가 선택됨.
- **원인**: SVG에는 CSS의 `z-index`가 없다. 배열 순서대로 그려진다. 우리 데이터는 우연히 자전거가 먼저, 사람이 나중에 그려져서, 사람이 위에 깔렸다.
- **수정**: `Viewer2D`에서 detections를 `bbox 면적 오름차순`으로 정렬한 뒤 그린다. → 큰 박스가 위에 올라옴 → 시각적으로 앞에 있는 객체가 클릭을 받음.
- **변경 라인**: sort 한 줄.
- **결과**: 자전거 bbox 영역 안에서 어디를 클릭해도 자전거가 선택됨. 3D 뷰어와 같은 깊이 모델을 공유하므로 두 뷰가 일관된 동작을 보임.
- **요약**

1. TL;DR — 한눈에 보는 결론
2. 발견 경위 — 코드 리뷰가 못 잡고 손이 잡은 케이스라는 메타 포인트
3. 무엇이 잘못 보였나 — 동작/기대 차이
4. 원인 — SVG paint order 개념 설명 + 우리 데이터 측정값 표
5. 해결 아이디어 — "두 뷰가 같은 깊이 신호를 공유해야 한다"
6. 코드 변경 — Before/After diff, .slice()를 쓰는 이유까지
7. 결과 — 클릭 위치별 동작 변화표 + 두 뷰 일관성 강조
8. 한계 — 면적 휴리스틱이 깨지는 케이스, 부분별 depth 불가능한 이유 (데이터 모델 표현력 한계)
9. 다른 옵션 거부 사유 비교표
10. 학습 포인트 4개 (SVG/멀티뷰 일관성/데이터 모델 한계/검증 경로별 버그 종류)
* 부록: 실측 명령 + 결과


---

## 1. 발견 경위 — 이게 왜 특별한가

이 프로젝트는 매 Step마다 코드 리뷰 + 데이터 audit + 수동 검증을 거치고, 발견된 엣지 케이스는 `docs/edgecases/Edge_#N.md`에 기록해 두고 있다. 지금까지의 패턴은 대부분 이렇다:

- **Step 2** — 라벨이 이미지 바깥으로 잘리는 케이스를 데이터 audit이 잡았다 (Edge_#2 Case 2, 3).
- **Step 4** — 카메라가 -z를 보지 않아 큰 객체가 뒤에 깔리는 케이스를 코드 리뷰가 잡았다 (Edge_#4 Case 2).
- **Step 6** — 2D SVG가 3D Canvas에 가려진 케이스를 브라우저에서 잡았다 (Edge_#6 Case 1).

이번 케이스는 결이 다르다. **수동으로 마우스를 움직이지 않았으면 발견되지 않았을** 케이스다. 코드 리뷰 관점에서는 모든 게 "맞다":

- 모든 detection은 고유한 `id`를 가진다 ✓
- 모든 bbox에 클릭 핸들러가 붙어 있다 ✓
- `onSelect(id)`는 항상 결정적인 결과를 반환한다 ✓
- `Detection2D.id`와 `Detection3D.id`가 동일하다 (불변 조건 ✓)

데이터 계약 관점에서는 완벽하다. **사용자 직관과의 일관성**이라는 또 다른 축에서만 깨져 있었던 것이다.

이런 케이스는 어차피 코드만 들여다봐서는 보이지 않는다. "직접 써본다"가 검증 과정의 한 종류로 들어가야 한다는 학습.

---

## 2. 무엇이 잘못 보였나

샘플 데이터 `frame_001.jpg`에는 자전거를 탄 사람이 있다.

- 자전거 bbox는 사람 bbox의 아래쪽 절반을 포함한다 (안장, 페달, 바퀴).
- 자전거 앞바퀴는 사람의 다리보다 명백히 앞에 보인다.
- 3D 뷰어에서도 자전거가 사람보다 카메라에 가깝게 렌더링된다.

기대했던 동작:
- 자전거 bbox 안 어디든 클릭하면 → **자전거** 선택
- 사람 bbox 안이지만 자전거 bbox 바깥(예: 상반신)을 클릭하면 → **사람** 선택

실제 동작:
- 자전거 bbox와 사람 bbox가 겹치는 영역(앞바퀴 포함)을 클릭하면 → **사람**이 선택됨
- 사람 bbox 바깥(예: 자전거 앞바퀴의 가장 왼쪽 끝)을 클릭하면 → **자전거** 선택

즉, 시각적으로 자전거가 더 앞에 있는데도, *겹치는 영역에서는* 사람이 우선했다.

---

## 3. 원인 — SVG는 paint order만 안다

### 3-1. SVG는 z-index를 무시한다

CSS에서 우리는 보통 `z-index: 10` 같은 식으로 깊이 순서를 지정한다. 하지만 이는 **HTML 일반 요소**에만 의미가 있다. SVG 내부 요소는 이 규칙을 따르지 않는다.

SVG의 깊이 규칙은 단순하다:

> **나중에 그려진 것이 위에 있다 (paint order = document order).**

즉 `<svg>` 안에 `<rect>` 두 개가 있다면, 마크업에서 **뒤에 있는** rect가 화면에서는 **위에** 보인다.

### 3-2. 우리 코드의 그리기 순서

`Viewer2D.tsx`는 다음과 같이 detections를 순회한다:

```tsx
{frame.detections2D.map((d) => (
  <rect ... onClick={() => onSelect(d.id)} />
))}
```

순서는 `frame.detections2D` 배열의 순서 그대로다. 그리고 그 배열은 `parseCoco`가 COCO JSON의 `annotations` 순서를 그대로 옮겨 담은 것이다. 즉 **annotation 입력 순서 = 그리기 순서 = 클릭 우선순위**.

annotation 입력 순서는 본질적으로 의미가 없다 — 데이터셋이 어떻게 만들어졌는지에 따라 우연히 결정되는 값이다.

### 3-3. frame_001의 실제 데이터

샘플 데이터를 까봤다:

| annotation 순서 | 클래스 | bbox area |
|---|---|---|
| 1 | bicycle | 98,268 |
| 2 | car | 37,869 |
| 3 | car | 10,176 |
| 4 | car | 4,207 |
| 5 | **person** | 68,387 |
| 6 | car | 18,304 |

자전거가 첫 번째로 그려지고, 사람은 다섯 번째로 그려진다. → 사람 rect가 자전거 rect 위에 깔린다 → 겹치는 영역에서 사람이 클릭을 가져간다.

### 3-4. 비교: 3D 뷰어는 왜 멀쩡한가

같은 데이터를 쓰는 3D 뷰어에서는 같은 문제가 안 생긴다. 왜냐하면 Three.js의 클릭(레이캐스팅)은 **카메라에서 쏜 광선이 가장 먼저 부딪힌 오브젝트**를 선택하기 때문이다. 즉 z 좌표를 *실제로* 계산해서 가까운 걸 고른다.

SVG는 z 좌표가 없다. 평면뿐이다. 그래서 "가깝다"는 개념을 표현할 유일한 수단이 **paint order**다. 이걸 의도적으로 정렬해 주지 않으면 우리가 가진 "깊이 정보"가 2D 뷰어에 반영되지 않는다.

---

## 4. 해결 아이디어 — 두 뷰가 같은 깊이 모델을 공유해야 한다

### 4-1. 우리 시스템의 "깊이" 정의

`lib/geometry/bbox-estimator.ts`는 이미 다음과 같이 깊이를 정의해 두고 있다:

```ts
const areaRatio = (bbox.width * bbox.height) / (W * H);
const z = MAX_Z - areaRatio * (MAX_Z - MIN_Z);
// 면적이 크다 → z가 작다 → 카메라에 가깝다 (= "앞")
// 면적이 작다 → z가 크다 → 카메라에서 멀다 (= "뒤")
```

**bbox 면적 = 깊이 proxy.** 이게 우리 프로젝트의 mental model이다. 3D 뷰어가 이미 이 규칙으로 객체를 배치한다. 사용자도 (의식하지 못한 채로) 이 규칙대로 보고 있다 — 그래서 "자전거가 앞에 있다"고 느낀 거다 (자전거 bbox가 가장 크니까).

### 4-2. 같은 규칙을 2D paint order에 적용한다

핵심 통찰:

> 3D estimator와 2D paint order가 **같은 깊이 신호**(= bbox 면적)를 기반으로 결정되어야 두 뷰가 일관된다.

3D에서는 "면적 큰 게 가까움 = 앞" → SVG에서도 면적 큰 게 마지막에 그려져야 함 (= 위에 있어야 함) → **면적 오름차순으로 정렬해서 그린다.**

---

## 5. 코드 변경

### Before — `Viewer2D.tsx`

```tsx
export function Viewer2D({ frame, selectedId, onSelect, visibleIds }: Viewer2DProps) {
  const detections = visibleIds
    ? frame.detections2D.filter((d) => visibleIds.has(d.id))
    : frame.detections2D;

  return (
    <svg ...>
      {detections.map((d) => (
        <rect ... />
      ))}
    </svg>
  );
}
```

`detections` 변수는 단순히 visibleIds 필터만 적용된 원본 순서의 배열.

### After

```tsx
export function Viewer2D({ frame, selectedId, onSelect, visibleIds }: Viewer2DProps) {
  // Paint smaller bboxes first so larger ones land on top. This mirrors the
  // 3D estimator's depth convention (larger bbox area → smaller z → closer to
  // camera) so a click in an overlap region selects the same object the 3D
  // viewer shows as front-most. See docs/edgecases/Edge_#2.md Case 1 and
  // docs/edgecases/Edge_#4.md Case 1. Heuristic limit: frames where a larger
  // background object encloses a smaller foreground object will be wrong;
  // ObjectList remains the non-spatial fallback.
  const detections = (
    visibleIds
      ? frame.detections2D.filter((d) => visibleIds.has(d.id))
      : frame.detections2D
  )
    .slice()
    .sort(
      (a, b) =>
        a.bbox.width * a.bbox.height - b.bbox.width * b.bbox.height,
    );

  return (
    <svg ...>
      {detections.map((d) => (
        <rect ... />
      ))}
    </svg>
  );
}
```

### 핵심 변경 한 줄

```ts
.sort((a, b) => a.bbox.width * a.bbox.height - b.bbox.width * b.bbox.height)
```

- **오름차순 정렬**이므로 *작은 면적이 먼저*, *큰 면적이 마지막에* 그려진다.
- SVG는 나중에 그린 게 위에 → 큰 bbox가 위로.
- 클릭은 위에 있는 요소가 우선 → 큰 bbox가 클릭을 가져간다.

### `.slice()`를 먼저 호출하는 이유

`Array.prototype.sort`는 **원본 배열을 변형**한다. `frame.detections2D`는 부모 컴포넌트가 가진 props인데, 이걸 그 자리에서 정렬하면 부모 입장에서 갑자기 데이터 순서가 바뀐 셈이 된다 (불변성 위반). `.slice()`로 얕은 복사본을 만든 뒤 정렬하면, 원본 배열은 그대로고 정렬은 로컬 변수에만 적용된다.

React에서 props로 받은 객체/배열은 변경하지 않는 게 원칙이다. 이런 작은 코드도 그 원칙을 지키는 게 디버깅 비용을 크게 줄여 준다.

---

## 6. 결과

### 동작 변화

| 클릭 위치 | Before | After |
|---|---|---|
| 자전거 앞바퀴(사람 bbox 안) | 사람 ❌ | 자전거 ✓ |
| 자전거 뒷바퀴(사람 bbox 안) | 사람 | 자전거 |
| 사람 상체(자전거 bbox 바깥) | 사람 ✓ | 사람 ✓ |
| 자전거 손잡이(사람 bbox 바깥) | 자전거 ✓ | 자전거 ✓ |

자전거 뒷바퀴 케이스는 의견이 갈릴 수 있는 영역이다. 자전거 부품이긴 하지만 사람 다리에 가려져 있어, "사람을 선택해도 자연스럽다"고 볼 수도 있다. 하지만 우리가 가진 데이터(객체당 단일 z)로 그 미세한 구분을 표현할 수는 없다 — 자세한 한계 분석은 아래 7장에서.

### 두 뷰의 일관성

이제 2D 뷰의 paint order와 3D 뷰의 depth 정렬이 같은 신호(`bbox.area`)를 사용한다. 사용자가 어느 쪽 뷰에서 클릭하든 "가장 앞에 보이는 객체"가 일관되게 선택된다. 이게 사실은 이 수정의 가장 큰 가치다 — 단일 버그 수정이 아니라 **두 뷰의 mental model을 정합시키는 작업**이었던 것.

---

## 7. 한계 — 무엇은 이걸로 해결되지 않는가

이 수정으로 풀리지 않는 케이스들을 정직하게 정리해 둔다.

### 7-1. 면적 휴리스틱이 깨지는 프레임

`bbox 면적 = 깊이`는 어디까지나 *추정*이다. 다음 같은 경우 휴리스틱이 틀린다:

- 크기가 큰 사람이 멀리 서 있고, 작은 자전거가 카메라 바로 앞에 있는 경우.
- 사람 bbox 안에 작은 객체(들고 있는 가방, 휴대폰 같은 detection)가 *전부* 들어 있는 경우 — "감싸는 객체 vs 감싸진 객체" 케이스에서, 감싸진 객체가 시각적으로 앞이라도 면적이 더 작으므로 paint 순서에서 *아래*로 간다.

이 한계의 좋은 점은: **3D 뷰어도 같은 방향으로 틀린다.** 두 뷰가 *함께* 틀리므로 사용자 입장에서 *일관*된다. 무엇보다 ObjectList(Step 6)가 비공간 선택 경로로 남아 있어서, 휴리스틱 실패 시에도 객체를 선택할 방법이 있다.

### 7-2. 객체 *내부*의 부분별 depth

"자전거 앞바퀴 = 자전거 선택, 뒷바퀴 = 사람 선택"처럼 한 객체의 *부분별*로 깊이를 다르게 다루는 것은 본질적으로 불가능하다. 이유:

- 우리 데이터 모델에서 `Detection3D`는 `bbox3D.center: [x, y, z]`라는 **단일 z**만 가진다.
- 즉 "이 객체는 z=3.2에 있다"까지가 우리가 표현할 수 있는 전부.
- 객체 내부 변동(앞바퀴 vs 뒷바퀴)은 표현할 수 있는 어휘 자체가 없다.

이걸 풀려면:
1. **COCO segmentation polygon 사용** — 각 detection이 가진 픽셀 폴리곤을 파싱해서 클릭 시 polygon point-in-polygon 테스트로 어느 객체의 픽셀인지 결정. 하지만 한 객체 폴리곤 내부의 부분별 depth는 여전히 모름. → 객체 단위 정확도는 올라가나 부분별 depth는 못 푼다.
2. **Instance segmentation 모델 추가** — 모델을 실행해 픽셀별 객체 마스크 생성. 위의 1번과 같은 한계.
3. **Part segmentation** — 객체 부분(앞바퀴, 뒷바퀴)을 별도 detection으로 데이터에서 분리. 데이터셋과 모델 전체를 재정의하는 작업.

1번은 *중* 난이도(MVP 안에 가능은 함), 3번은 *MVP 밖*. 우리 프로젝트는 "포트폴리오용 시각화"가 목표이므로 1-3번 모두 적용하지 않기로 결정.

### 7-3. 라벨 텍스트 클릭

라벨 텍스트(`<text>`)는 `pointer-events: none`이라 클릭을 받지 않는다 (Edge_#2 Case 4). 그래서 라벨을 정확히 클릭해도 그 아래에 있는 rect나 image가 클릭을 받게 된다. 이번 수정과는 별개의 이슈로, 이건 그대로 둔다.

---

## 8. 왜 다른 방법을 안 골랐는가

기록 차원에서 검토한 다른 옵션들과 거부 사유:

| 방법 | 거부 사유 |
|---|---|
| Hover 시 bring-to-front | 새로운 상호작용(호버) 학습 비용. 마우스 이동 핸들러 + 상태 + 애니메이션. 키보드/터치에서 동작 모호. |
| 같은 위치 재클릭 시 cycle | 후보 큐 + "방금 어디를 클릭했나" 상태 관리. 발견성 낮음(사용자가 두 번 클릭해 보려고 하지 않으면 모름). |
| `Ctrl+Click`으로 뒷 객체 선택 | 키보드 단축키 학습 필요. 데스크톱 전용. UX 발견성 낮음. |
| COCO segmentation polygon point-in-polygon | 파서/타입/폴리곤 수학/UI 영역 모두 확장. MVP 밖. 본 문서 7-2 참조. |
| Instance segmentation 모델 | 모델 추가. MVP 밖. |
| **bbox 면적 ascending sort (채택)** | 1줄 변경. 3D 뷰어의 깊이 모델과 정합. ObjectList가 fallback으로 남음. |

기준은 단순했다: *비용 대비 사용자 직관과의 일관성 회복.* sort 한 줄이 다른 어떤 옵션보다 큰 효과를 낸다.

---

## 9. 학습 포인트

이번 케이스에서 챙겨갈 만한 것들.

### 9-1. SVG는 paint order가 곧 z-order다

CSS `z-index`가 적용되지 않는다. 깊이 순서가 의미 있는 SVG 콘텐츠라면 **정렬을 명시적으로** 해야 한다.

### 9-2. 두 뷰가 같은 데이터를 다르게 표현할 때, 깊이/순서 의미가 같은 원천에서 나오게 하라

우리 케이스에서 2D와 3D는 둘 다 "bbox 면적"을 깊이 신호로 쓴다. 만약 2D는 annotation 순서를, 3D는 면적 기반 z를 쓴다면 두 뷰 사이에 *의미적 불일치*가 생긴다. 사용자는 "어느 뷰가 맞는 거지?"라는 인지 부하를 떠안게 되고, 둘 중 하나가 *조용히* 틀린 정보를 보여 주는 셈이 된다.

이런 다중 뷰 시스템에서 가장 중요한 원칙은 **"하나의 사실, 여러 표현(Single source of truth, multiple renders)"**이다. 깊이라는 사실 하나가 있고, 그게 2D 정렬, 3D 배치, 클릭 우선순위, 시각화 모두에 일관되게 흐른다.

### 9-3. 데이터 모델이 표현할 수 없는 것은 UI도 표현할 수 없다

"자전거 앞바퀴 vs 뒷바퀴" 같은 부분별 깊이 구분은 객체당 단일 z 모델로는 본질적으로 불가능하다. 더 정교한 UX를 원하면 데이터 모델을 먼저 확장해야 한다 — 반대 순서는 거짓말이 된다.

### 9-4. 검증 경로마다 잡는 버그의 종류가 다르다

- **코드 리뷰**: 데이터 계약 위반, 메모리 누수, 타입 안전성, 명세 위반.
- **데이터 audit**: 엣지 데이터 케이스, 경계 값.
- **수동 검증**: 사용자 직관과의 일관성, 시각적 자연스러움, 인지 부하.

세 경로 모두 필요하다. 어느 하나도 다른 둘을 대체하지 못한다. 이번 케이스는 앞의 둘이 통과시킨 코드를 세 번째가 잡은 사례.

---

## 10. 관련 문서

- `docs/edgecases/Edge_#2.md` Case 1 — 이 이슈의 최초 기록 (Step 2). FIXED 상태 갱신됨, Resolution 섹션에 위 코드 변경 정리.
- `docs/edgecases/Edge_#4.md` Case 1 — Step 4 시점에 한 번 더 검토하면서 deferral 결정. FIXED 상태 갱신됨.
- `.claude/docs/mvp-checklist.md` Step 7 — 본 follow-up 작업 항목.
- `.claude/docs/architecture.md` — Viewer2D / Viewer3D 깊이 컨벤션이 본문에 명시되어 있음.
- `apps/ai_detection_viewer_client/src/lib/geometry/bbox-estimator.ts` — "면적 → z" 매핑의 정의 위치.

---

## 부록: 측정 명령

샘플 데이터에서 frame_001의 클래스별 bbox 면적을 확인하고 싶다면:

```bash
node -e "
const data = require('./apps/ai_detection_viewer_client/public/sample-data/sample.json');
const cat = Object.fromEntries(data.categories.map(c => [c.id, c.name]));
const img1 = data.images[0];
const ann1 = data.annotations.filter(a => a.image_id === img1.id);
console.log('Frame 1:', img1.file_name, img1.width + 'x' + img1.height);
for (const a of ann1) {
  const [x,y,w,h] = a.bbox;
  console.log('  ' + cat[a.category_id].padEnd(10) + ' bbox(' + x + ',' + y + ',' + w + ',' + h + ')  area=' + (w*h).toFixed(0));
}
"
```

결과:

```
Frame 1: frame_001.jpg 426x640
  bicycle    bbox(74.62,272.65,278.38,353)       area=98268
  car        bbox(3.64,132.5,269.38,140.58)      area=37869
  car        bbox(303.63,137.6,98.17,103.66)     area=10176
  car        bbox(0,127.84,61.78,68.1)           area=4207
  person     bbox(117.4,123.27,199.02,343.62)    area=68387
  car        bbox(210.82,103.85,166.43,109.98)   area=18304
```

자전거(98,268)와 사람(68,387)의 차이가 명확하다. paint order 정렬 후, 자전거가 가장 위에 그려진다.
