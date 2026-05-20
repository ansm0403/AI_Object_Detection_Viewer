# AI Object Detection Viewer

AI 객체 탐지 결과를 2D 이미지와 3D 공간에서 동시에 탐색하는 데이터 시각화 뷰어입니다.
사용자가 2D에서 객체를 클릭하면 3D에서도 같은 객체가 강조되고, 반대도 성립합니다.

## 라이브 데모

🔗 https://ai-detection-viewer.vercel.app *(배포 후 URL로 교체)*

> 샘플 데이터로 MS COCO val2017의 person / bicycle / car 카테고리 10장이 들어 있습니다.
> 좌측 2D 이미지의 바운딩 박스, 우측 3D 씬의 wireframe 박스, 우상단 객체 리스트,
> 우하단 분석 패널이 모두 같은 선택 상태를 공유합니다.

---

## 프로젝트 목적과 계기

자율주행 데이터를 시각화하는 프론트엔드 직무 공고를 접하면서 시작한 학습용 포트폴리오입니다.
**해당 공고는 이미 종료되었지만**, 직무에서 요구한 역량(3D 시각화, AI 데이터 도메인, 멀티뷰 동기화)을
실제로 구현해보는 것 자체가 목적으로 남았습니다.

기존 포트폴리오(호텔 예약, 쇼핑몰)에서는 다루지 못했던 **3D 렌더링**과 **AI 데이터 포맷 처리**를
직접 만져보면서, 프론트엔드의 영역을 한 단계 넓히는 것이 핵심 동기입니다.

자율주행 데이터 전체(LiDAR / GPS / IMU / 센서 동기화)는 2~3주 학습으로 다루기 어렵다고 판단해,
**범용 AI 데이터(COCO Object Detection) 기반 3D 시각화**로 범위를 좁혔습니다.

---

## 기술 스택

| 영역 | 스택 | 선택 이유 |
|---|---|---|
| 프레임워크 | Next.js 16, TypeScript 5.9 | App Router, 정적 자원 서빙, 타입 안전 |
| 3D 렌더링 | Three.js 0.184, React Three Fiber 9, @react-three/drei 10 | React 생태계와 자연스러운 연동, useEffect cleanup으로 GPU 메모리 자동 관리 |
| 상태 관리 | Zustand 5 | 4개 뷰(2D / 3D / 리스트 / 분석)가 단일 선택 상태를 공유 — boilerplate 최소 |
| 스타일 | Tailwind CSS 3.4 | 빠른 레이아웃 반복, 다크 톤 디자인 시스템 구축 |
| 2D 오버레이 | SVG (`viewBox` + `<rect>`) | COCO bbox 좌표를 산술 없이 매핑, 브라우저가 스케일링 처리 |
| 테스트 | Vitest | 순수 함수 / Zustand store / 셀렉터 단위 + 통합 테스트 99개 |
| 모노레포 | Nx 22.7 | 단일 워크스페이스에서 client/server 분리 (server는 이번 MVP 범위 외) |
| 배포 | Vercel | Next.js 공식, GitHub 연동 자동 배포 |

---

## 기술 선택 시 고민했던 부분

### 1. Three.js 직접 사용 vs React Three Fiber

Three.js를 직접 쓰면 React 렌더링 루프 충돌, 메모리 수동 관리, Zustand 동기화 코드를 별도로
작성해야 합니다. R3F는 이 셋을 React 방식으로 흡수합니다.

**채택: R3F.** 단순한 타협이 아니라 React + 3D 조합에서 합리적인 선택이며, R3F를 배우면서
geometry / material / camera / lighting 같은 Three.js 핵심 개념도 자연스럽게 학습할 수 있다고 판단했습니다.

### 2. TanStack Query 미도입

데이터 소스가 정적 JSON 한 파일입니다. 캐싱 / 무효화 / 재시도가 필요 없는 환경에서 라이브러리를
들이는 것은 명백한 오버스펙이라고 판단해 `useEffect + fetch + AbortController` 패턴만 사용했습니다.

### 3. Recharts 미도입 (Step 9.5)

분석 패널의 confidence 히스토그램과 클래스 카운트 바를 처음에는 Recharts로 만들 계획이었지만,
프레임당 객체 ≤10개 / 차트 요소 ≤5개 규모에서는 **직접 작성한 SVG / CSS**로 충분했고,
의존성 / 번들 사이즈가 늘지 않는다는 이점이 컸습니다. 핸드-롤된 차트는 confidence 슬라이더와의
threshold 오버레이도 자유롭게 그릴 수 있었습니다.

### 4. 코어 로직과 React의 분리

COCO 파싱, 2D→3D 좌표 변환, 셀렉터는 모두 `lib/` 아래의 순수 함수입니다.
React 컴포넌트와 Zustand store는 이 함수들의 호출자일 뿐, 도메인 로직을 직접 들고 있지 않습니다.
이 경계 덕분에 99개 테스트의 대부분이 React 환경 없이도 빠르게 돌아갑니다.

---

## 주요 기능

- **2D↔3D 멀티뷰 선택 동기화** — 2D / 3D / 객체 리스트 / 분석 패널이 모두 동일한
  `selectedObjectId`를 단일 source of truth로 공유
- **COCO 어노테이션 파서** — `images` / `categories` / `annotations`를 내부 `Frame[]`로 변환,
  잘못된 bbox / 카테고리 / score를 안전하게 스킵
- **2D bbox → 3D 좌표 추정** — bbox 중심을 (x, y), 면적을 z(작을수록 카메라에 가까움)로 매핑.
  이는 추정값일 뿐 실제 깊이가 아님을 명시합니다
- **포인트 클라우드 렌더링** — Three.js `BufferGeometry`로 bbox 부피 내 랜덤 점 생성,
  detection 단위 disposal 지원
- **필터링** — confidence 임계값 슬라이더 + 클래스 토글, 셀렉터 레이어에서 일괄 처리.
  포인트 클라우드도 렌더 시점에 필터 반영
- **프레임 타임라인** — 썸네일 가로 스트립으로 프레임 전환, 카메라 상태는 `key` remount로 초기화
- **분석 패널** — 선택된 객체 정보 카드, confidence 히스토그램(슬라이더 임계값 오버레이),
  클래스 카운트 바(클릭 시 클래스 필터 토글)

---

## 실행 방법

### 요구 사항

- Node.js 20+
- npm

### 로컬 개발

```bash
# 1. 저장소 클론 후 루트에서 의존성 설치
npm install

# 2. 개발 서버 실행 (Nx CLI 사용)
npx nx dev ai_detection_viewer_client
# → http://localhost:3000

# 3. 테스트 (Vitest, 99개)
npx nx test ai_detection_viewer_client
# 또는 앱 디렉토리에서
cd apps/ai_detection_viewer_client && npm test
```

### 프로덕션 빌드

```bash
npx nx build ai_detection_viewer_client
```

---

## 프로젝트 구조

```
apps/ai_detection_viewer_client/
├── src/
│   ├── app/                # Next.js App Router
│   ├── components/
│   │   ├── viewer-2d/      # SVG 오버레이 이미지 뷰어
│   │   ├── viewer-3d/      # R3F 캔버스, 포인트 클라우드, 3D bbox
│   │   ├── object-list/    # 비공간 선택 경로
│   │   ├── filters/        # confidence 슬라이더 + 클래스 토글
│   │   ├── timeline/       # 프레임 썸네일 스트립
│   │   ├── header/         # 앱 타이틀 + 프레임 메타
│   │   ├── analytics/      # 우측 분석 패널 컨테이너
│   │   ├── charts/         # SVG/CSS 차트 (Recharts 미사용)
│   │   └── inspector/      # 선택된 객체 정보 카드
│   ├── lib/
│   │   ├── coco/           # COCO JSON 파서 (순수 함수)
│   │   ├── geometry/       # 2D→3D 변환, 포인트 클라우드 생성
│   │   ├── selectors/      # 가시 detection / 히스토그램 / 클래스 카운트
│   │   ├── ui/             # 클래스별 색상 매핑
│   │   └── types/          # Frame, Detection2D/3D, Point3D
│   ├── store/              # Zustand store (UI 상태만)
│   └── ...
├── public/sample-data/     # COCO val2017 10장 + sample.json
└── tests/integration/      # 선택 동기화 / 프레임 전환 계약 테스트
```

상세 데이터 모델과 컴포넌트 계약은 [`.claude/docs/architecture.md`](.claude/docs/architecture.md)를 참고하세요.

---

## 현 프로젝트의 한계점

### 1. 3D 좌표는 추정값입니다

이 프로젝트는 COCO 2D 어노테이션을 입력으로 사용합니다. COCO에는 깊이(depth) 정보가 없으므로,
3D 좌표는 2D bbox의 중심과 면적으로부터 추정한 값입니다. **실제 LiDAR 측정값이 아닙니다.**
KITTI 같은 자율주행 데이터셋을 연동하면 이 한계는 해소됩니다(Post-MVP 후보).

### 2. confidence score가 모두 1.0입니다

샘플 데이터는 COCO val2017의 **ground truth annotation**이라 모든 detection의 `score` 필드가
부재합니다 (파서가 `1.0`으로 fallback). confidence 슬라이더와 히스토그램은 동작은 하지만
값이 한 곳에 몰려 있어 분포가 의미를 보이지 못합니다.

해결책: detectron2 같은 실제 추론 모델로 val2017 이미지에 prediction을 돌려 `score`가 채워진
데이터로 swap하면 즉시 의미를 회복합니다(코드 변경 0).

### 3. 프레임마다 letterbox / pillarbox 크기가 다릅니다

COCO val2017은 다양한 aspect ratio를 포함합니다. Viewer2D는 `aspect-[4/3]` 컨테이너에 이미지를
contain 방식으로 맞추므로 프레임마다 위/아래 또는 좌/우 여백 크기가 달라 보입니다.
이미지와 bbox는 동일한 viewBox 좌표계로 정렬되므로 **bbox 정확도는 무손실**입니다.

---

## 배운 점

- **WebGL 메모리 모델** — `BufferGeometry`, `EdgesGeometry`는 GC가 회수하지 않습니다.
  `useEffect` cleanup에서 명시적으로 `.dispose()`를 호출해야 한다는 것을 메모리 누수
  audit으로 직접 확인하면서 익혔습니다.
- **순수 함수와 React의 경계** — 도메인 로직을 `lib/`에 가두니 테스트 작성 비용이 크게
  줄었습니다. React 컴포넌트는 props 받는 입출력 노드로만 남았고, 통합 테스트도 store +
  selector만 검증하는 패턴이 자연스러워졌습니다.
- **선택 상태의 단일 source of truth** — 처음에는 2D / 3D 각각 selection 상태를 두려 했지만
  곧 동기화 지옥이 되리라 깨달았습니다. `selectedObjectId` 하나로 통일한 결정이 후속 단계
  (객체 리스트, 필터, 분석 패널)에서 모두 자연스럽게 확장된 점이 가장 큰 학습이었습니다.
- **SVG paint order = z-order** — 2D에서 큰 bbox가 작은 bbox를 가려 클릭이 막히는 문제를
  3D 추정기의 "큰 면적 → 가까운 z"와 정렬해 해결한 경험은, 2D와 3D를 동시에 다룰 때
  좌표 변환만큼이나 **렌더 순서**가 중요하다는 것을 보여주었습니다.

---

## 아쉬웠던 점 / 향후 개선 방향

- **실제 3D 데이터셋 미연동** — KITTI 연동은 calibration matrix, Velodyne `.bin` 로더,
  3D bbox 좌표계 변환 등 추가 학습이 필요해 MVP 범위에서 제외했습니다. "추정값"이라는
  꼬리표를 떼는 것이 다음 우선순위 작업입니다.
- **샘플 데이터의 confidence 빈약** — 실제 추론 결과(detectron2 또는 HuggingFace 모델)로
  swap하면 slider / 히스토그램이 의미를 회복합니다. 코드 변경이 필요 없는 작업이라 다음
  스텝에서 가장 적은 비용으로 가장 큰 시각적 개선이 가능합니다.
- **프레임 간 객체 추적 없음** — COCO는 `Detection.id`의 프레임 간 연속성을 보장하지
  않습니다. 진짜 tracking 없이 휴리스틱으로 흉내내는 것은 포트폴리오에서 오히려 신뢰를
  깎는다고 판단해 의도적으로 제외했습니다.
- **백엔드 API 미연동** — 현재는 정적 JSON. Nest.js로 frame API 서버를 만들고 TanStack
  Query를 도입하면 풀스택 경험이 자연스럽게 추가됩니다.

---

## 성능 개선 기록

| 항목 | 문제 | 해결 |
|---|---|---|
| GPU 메모리 누수 | `BufferGeometry` / `EdgesGeometry`가 dispose되지 않아 프레임 전환마다 누적 | `PointCloud.tsx` / `BBox3D.tsx`에 `useEffect` cleanup으로 `geometry.dispose()` 호출 |
| 카메라 상태 누적 | 프레임 전환 시 이전 프레임의 카메라 위치 / 회전이 새 씬에 그대로 적용 | `<Viewer3D key={frame.id}>` remount 패턴으로 R3F 캔버스 전체 재초기화 |
| 포인트 클라우드 필터링 | 필터 변경 시 enrich 단계의 전체 포인트가 모두 렌더링됨 | `Point3D.detectionId` 필드 추가, `PointCloud`가 렌더 시점에 `visibleIds`로 필터 → 필터 변경 시 geometry만 재빌드 |
| GPU 메모리 audit | 누수 의심 잔존 | 10 프레임 라운드트립 후 `WebGLRenderer.info.memory.geometries` 측정: 9 ↔ 13 oscillation, monotonic growth 없음 확인 |
| 차트 번들 사이즈 | Recharts 도입 시 ~50KB+ 추가 | SVG / CSS로 confidence 히스토그램 / 클래스 바 직접 작성, 의존성 0 추가 |
| Tailwind JIT arbitrary class | 상수 문자열에서 추출 실패로 그리드가 무너짐 | grid 클래스를 `page.tsx` JSX className에 직접 기입(상수 분리 포기), JIT extraction 신뢰성 회복 |

세부 사례와 의사결정 근거는 [`docs/edgecases/`](docs/edgecases/) 하위 문서에 남겨두었습니다.

---

## 라이선스

MIT
