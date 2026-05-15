# CLAUDE.md

## 프로젝트

AI 객체 검출 뷰어 — 3D 시각화, AI 검출 데이터 파싱, 2D/3D 멀티뷰 동기화를 보여주는 포트폴리오 프로젝트.
프로덕션용 AI 시스템이 아님.

## 사용자 컨텍스트

- 능숙함: React, Next.js, TypeScript, 상태 관리, API 연동, 프론트엔드 성능 최적화
- 초보: Three.js, WebGL, React Three Fiber, 3D 시각화, AI 도메인(Object Detection, Bounding Box, Point Cloud, Annotation), Zustand
- New to 에 나열된 모든 주제를 설명할 때는 3D 관련 기술, AI 데이터 도메인 개념, Zustand를 포함하여 초보자도 이해하기 쉽게 설명하세요.
- AI 도메인 및 3D 구현 영역은 익숙하지 않은 영역이지만, 프로젝트 전체와 
  동일한 엔지니어링 기준을 적용할 것 — 적절한 에러 핸들링, 합리적인 추상화, 
  성능 인식 포함. 불필요한 레이어 추가나 과도한 일반화 같은 과설계는 
  피하되, 프로덕션 품질 이하로 단순화하지도 말 것.

## 핵심 기술 스택

Next.js, TypeScript, Tailwind CSS, Zustand, Three.js, React Three Fiber, @react-three/drei,
2D 바운딩 박스용 SVG 오버레이, 배포는 Vercel.

MVP에서는 TanStack Query, Recharts(MVP 이후), DB, 백엔드, 인증 추가 금지.

## 참고 문서

필요할 때만 읽을 것. 매번 전부 로드하지 말 것.

- `.claude/docs/architecture.md` — 데이터 모델, 폴더 구조, 데이터 흐름, 2D↔3D 매핑
- `.claude/docs/domain-glossary.md` — 3D/AI 용어 정의 (Point Cloud, COCO 등)
- `.claude/docs/mvp-checklist.md` — MVP 단계 목록과 완료 기준

3D/AI 용어가 헷갈리면 답하기 전에 `domain-glossary.md` 읽기.
구조적 변경이나 다중 파일 변경 시 `architecture.md` 먼저 읽기.
사용자가 "N단계"라고 하면 `mvp-checklist.md` 읽기.

## 불변 규칙

다음 규칙은 절대 어기지 말 것. 요청이 충돌하면 대안 제안할 것.

1. 같은 객체의 `Detection2D.id`와 `Detection3D.id`는 반드시 동일해야 함.
2. `selectedObjectId`는 객체 선택의 유일한 진실 공급원(single source of truth).
   `selected2DObjectId`나 `selected3DObjectId` 만들지 말 것.
3. COCO 파싱과 좌표 변환 로직은 React 컴포넌트 밖, Zustand 스토어 밖에 둘 것.
4. 사용자 명시적 승인 없이 MVP 스코프 확장 금지.
5. 3D 뷰어가 메인 뷰, 2D 뷰어는 보조 컨텍스트 뷰.
6. 3D 좌표는 2D bbox 데이터에서 추정한 값. 시각화 근사치이지 실제 depth가 아님.
   코드 주석이나 UI에서 실제 depth인 것처럼 표현 금지.
7. COCO는 2D 전용 데이터셋 포맷. COCO JSON에서 3D 필드 읽으려 시도 금지.

## 워크플로우 규칙

- 다중 파일/구조 변경 전 짧은 계획 제안 후 승인 대기.
- 구현 후 요약: 변경 파일, 핵심 로직, 규칙 충돌 발생 여부.
- 패키지 스크립트 필요 시 추측하지 말고 `package.json` 확인.
- 무관한 파일 수정 금지. 현재 단계 범위 내에서만 작업.
- 새 라이브러리 설치 시 기존 Three.js / R3F 버전과 호환되는 최신 안정 버전인지 확인 후 설치.

## 에러 및 엣지케이스 기본 동작

- 잘못되거나 빈 COCO JSON → 빈 상태/에러 상태 명확히 렌더링, 절대 크래시 X.
- detection 필드 누락 → console.warn으로 알리고 해당 detection만 스킵, throw X.
- detection이 0개인 프레임 → 오버레이 없이 이미지/포인트클라우드만 렌더링.
- 신뢰도 threshold 필터링은 selector 레벨에서, 파싱 시점에서 X.

## 테스트 정책 (MVP)

MVP에서 유닛 테스트 작성 안 함. 작동하는 기능과 깔끔한 구조에 집중.
MVP 이후 테스트 정책은 추후 결정.

## 커밋 컨벤션

Conventional Commits 사용: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`.
가능하면 커밋 하나는 MVP 한 단계 범위로 유지.

---

####################################################################################################

---

# architecture.md

## 폴더 구조

(위 영문 구조와 동일)

src/
├── app/                    # Next.js app router 페이지
├── components/
│   ├── viewer-2d/          # 2D 이미지 + SVG 바운딩 박스 오버레이
│   ├── viewer-3d/          # R3F 캔버스, 포인트 클라우드, 3D bbox
│   ├── object-list/        # 검출 목록 패널
│   ├── filters/            # 신뢰도/클래스 필터
│   └── timeline/           # 프레임 타임라인
├── lib/
│   ├── coco/               # COCO JSON 파싱 → 내부 Frame[]
│   ├── geometry/           # 2D bbox → 3D bbox/point cloud 추정
│   └── types/              # Frame, Detection2D, Detection3D, Point3D
├── store/                  # Zustand 스토어 (UI 상태만)
└── public/
    └── sample-data/        # 개발용 샘플 COCO JSON

## 핵심 데이터 타입

Frame, Detection2D, Detection3D, Point3D는 위 코드 참고.
- Detection2D와 Detection3D는 같은 객체에 대해 동일한 `id` 공유.

## 데이터 흐름

COCO JSON
  → lib/coco/parser.ts (파싱)
  → Frame[] (메모리 상)
  → 최상위 페이지 컴포넌트의 React state로 로드
  → Zustand store(선택/필터)와 양방향 통신하며 Viewer-2D / Viewer-3D / ObjectList로 전달

Zustand는 UI 상태만 보관. Frame 데이터는 페이지 레벨 React state에 보관.

## Zustand 스토어 스키마

- selectedFrameId: 현재 선택된 프레임 ID
- selectedObjectId: 2D/3D 공유 선택 ID (단일 소스)
- confidenceThreshold: 0.0~1.0
- visibleClasses: 보일 클래스 Set

## 2D → 3D 추정 전략

COCO에 실제 depth 데이터가 없으므로 2D bbox로 3D 좌표 추정:

- bbox 면적이 클수록 → 객체가 가까움 (z 거리 작음)
- bbox 중심 x → 3D x (이미지 좌표 → 월드 좌표 매핑)
- bbox 중심 y → 3D y (보통 수직 뒤집기 적용)
- 추정된 3D bbox 주변에 점을 샘플링해 가짜 포인트 클라우드 생성

이건 시각화 트릭이지 실제 인식이 아님. `lib/geometry/`에 주석으로 명확히 표기할 것.

## R3F 성능 규칙

- 포인트 클라우드는 `THREE.BufferGeometry` 직접 사용. React state가 아닌 `useRef`로 관리.
- 매 렌더마다 geometry 재생성 금지. `useMemo`로 메모이제이션.
- 무거운 3D 컴포넌트는 `<Suspense>`로 감싸기.
- 비슷한 3D bbox 여러 개면 `instancedMesh` 사용.

## 관심사 분리

| 레이어           | 책임                                  | 하면 안 되는 것              |
|------------------|---------------------------------------|------------------------------|
| `lib/coco/`      | COCO JSON → Frame[] 파싱              | React / Zustand 건드리기     |
| `lib/geometry/`  | 2D→3D 수학, 포인트 클라우드 생성       | React / Zustand 건드리기     |
| `store/`         | UI 상태 (선택, 필터)                  | Frame 데이터 보관, 파싱      |
| `components/`    | 렌더링, 이벤트 처리                   | 파싱이나 좌표 계산           |

## 샘플 데이터

샘플 COCO JSON은 `public/sample-data/sample.json`.
표준 COCO detection 포맷(`images`, `annotations`, `categories`) 따름.

---

####################################################################################################

---

# domain-gloss.md

이 프로젝트에서 쓰이는 3D/AI 용어의 초보자 친화적 정의.
사용자에게 3D/AI 개념을 설명하기 전 항상 이 문서를 읽을 것.

## AI / 검출 용어

**Object Detection (객체 검출)**
이미지에서 객체의 위치와 클래스를 찾는 작업. 출력: 검출된 객체별 {class, confidence, 위치}.

**Bounding Box (바운딩 박스, bbox)**
객체를 둘러싸는 박스.
- 2D bbox: 이미지 위 사각형. 보통 `[x, y, width, height]` 또는 `[x1, y1, x2, y2]`.
- 3D bbox: 3D 공간의 박스. 보통 `{center, size, rotation}`.

**Confidence (신뢰도)**
모델이 검출 결과를 얼마나 확신하는지, 0~1. threshold(예: 0.5)로 낮은 신뢰도 제거.

**Class / Category (클래스)**
검출된 객체의 라벨 (예: "car", "person").

**Annotation (어노테이션)**
이미지에 사람이 붙인 라벨 데이터. 학습/평가용. 이 프로젝트는 어노테이션을 검출 결과처럼 사용.

**COCO (Common Objects in Context)**
널리 쓰이는 객체 검출 데이터셋 및 JSON 포맷.
구조: `images[]`, `annotations[]`, `categories[]`. **2D 전용**.

## 3D / 그래픽스 용어

**Point Cloud (포인트 클라우드)**
공간을 표현하는 3D 점들의 집합 `{x, y, z}`. intensity나 color 같은 추가 속성 가능.
실제 포인트 클라우드는 보통 LiDAR에서 나옴. 이 프로젝트에서는 추정(가짜) 포인트 클라우드.

**LiDAR (라이다)**
레이저로 거리를 측정하는 센서. 실제 포인트 클라우드 생성. 이 프로젝트에서는 사용 X.

**Three.js**
WebGL을 감싸는 JavaScript 3D 라이브러리.

**WebGL**
브라우저의 GPU 가속 3D 렌더링 API.

**React Three Fiber (R3F)**
Three.js의 React 렌더러. JSX 컴포넌트로 3D 씬 작성 가능.

**@react-three/drei**
R3F 헬퍼 라이브러리. `<OrbitControls />` 같은 즉시 사용 가능한 컴포넌트 제공.

**OrbitControls**
마우스로 카메라를 타겟 주변에서 회전/팬/줌 시키는 컨트롤러.

**BufferGeometry**
Three.js에서 geometry를 raw 배열(positions, colors 등)로 저장하는 클래스.
포인트 클라우드 같은 큰 데이터에 효율적.

**Mesh (메쉬)**
geometry(형태) + material(색/텍스처)로 구성된 3D 객체.

**InstancedMesh**
같은 geometry의 여러 복사본을 한 번의 draw call로 효율적으로 렌더링.
비슷한 객체 여러 개(예: 3D bbox 50개)에 유용.

## 상태 관리 용어

**Zustand**
React용 작고 간단한 상태 관리 라이브러리. Hook 기반, 보일러플레이트 없음.

**Single Source of Truth (단일 진실 공급원)**
하나의 데이터는 한 곳에만 존재한다는 원칙.
이 프로젝트: `selectedObjectId`가 객체 선택 상태의 유일한 위치.

## 프로젝트 전용 용어

**Estimated 3D (추정 3D)**
실제 depth 센서가 아닌 2D bbox 데이터로 추정한 3D 좌표.
이 포트폴리오의 핵심 단순화 전략.

**Frame (프레임)**
데이터의 한 단위: 이미지 1장 + 그 이미지의 2D 검출 + 추정 3D 검출 + 추정 포인트 클라우드.

**2D ↔ 3D Synchronization (동기화)**
2D 뷰에서 객체 선택 시 3D 뷰의 같은 객체가 하이라이트되고, 그 반대도 동일.
공유 `selectedObjectId`로 구현.

---

####################################################################################################

---

# MVP 체크리스트

MVP 진행 상황 추적. 각 단계는 목표, 범위, "완료 기준"을 가짐.
한 번에 한 단계씩. 완료 시 [x] 표시.

## 1단계 — COCO 파싱
- [ ] 목표: COCO JSON을 내부 `Frame[]` 구조로 변환.
- 범위: `lib/coco/parser.ts`, `lib/types/*`.
- 완료 기준:
  - 샘플 COCO JSON이 에러 없이 로드.
  - 각 `Frame`이 올바른 `detections2D`를 가짐.
  - `Detection2D.id`가 프레임 내 유니크하게 생성.
  - 잘못되거나 빈 입력 시 console.warn 후 `[]` 반환, 크래시 X.

## 2단계 — 2D 이미지 뷰어
- [ ] 목표: 이미지 + SVG 오버레이로 2D 바운딩 박스 표시.
- 범위: `components/viewer-2d/*`.
- 완료 기준:
  - 이미지가 bbox 함께 올바른 위치에 렌더링.
  - bbox 클릭 가능(지금은 placeholder 핸들러 OK).
  - bbox 라벨에 클래스명, 신뢰도 표시.

## 3단계 — Zustand 스토어
- [ ] 목표: 전역 UI 상태 설정.
- 범위: `store/viewer-store.ts`.
- 완료 기준:
  - 스토어에 `selectedFrameId`, `selectedObjectId`, `confidenceThreshold`, `visibleClasses` 노출.
  - setter 동작 및 리렌더 트리거.
  - Frame 데이터는 여기 저장 X.

## 4단계 — 3D 씬 (기본)
- [ ] 목표: R3F로 포인트 클라우드 + 3D bbox + OrbitControls 렌더링.
- 범위: `components/viewer-3d/*`, `lib/geometry/*`.
- 완료 기준:
  - `lib/geometry/`로 `Detection2D` → `Detection3D` + `Point3D[]` 변환.
  - `BufferGeometry`로 포인트 클라우드 렌더링.
  - 추정 위치에 와이어프레임 3D bbox 렌더링.
  - OrbitControls로 마우스 조작 가능.

## 5단계 — 2D ↔ 3D 선택 동기화
- [ ] 목표: 2D에서 객체 클릭 시 3D에 하이라이트, 반대도 동일.
- 범위: viewer-2d, viewer-3d, store.
- 완료 기준:
  - 2D bbox 클릭 → `selectedObjectId` 설정.
  - 3D bbox 클릭 → `selectedObjectId` 설정.
  - 양쪽 뷰에서 선택된 객체 하이라이트.
  - 빈 공간 클릭 → 선택 해제.

## 6단계 — 객체 목록 패널
- [ ] 목표: 현재 프레임의 검출 목록 사이드 패널.
- 범위: `components/object-list/*`.
- 완료 기준:
  - 목록에 class, confidence, id 표시.
  - 아이템 클릭 시 객체 선택 (2D/3D와 동기화).
  - 선택된 아이템 시각적 하이라이트.

## 7단계 — 필터
- [ ] 목표: 신뢰도 threshold 슬라이더 + 클래스 가시성 토글.
- 범위: `components/filters/*`, store.
- 완료 기준:
  - 슬라이더가 스토어의 `confidenceThreshold` 업데이트.
  - 클래스 토글이 스토어의 `visibleClasses` 업데이트.
  - 2D, 3D 뷰어 모두 필터 반영.

## 8단계 — 프레임 타임라인
- [ ] 목표: 프레임 전환용 가로 타임라인.
- 범위: `components/timeline/*`.
- 완료 기준:
  - 모든 프레임 표시.
  - 프레임 클릭 시 `selectedFrameId` 설정.
  - 현재 프레임 시각적 하이라이트.

## 9단계 — UI 정리
- [ ] 목표: 레이아웃, 여백, 색상, 반응형 다듬기.
- 범위: 모든 컴포넌트, Tailwind 클래스.
- 완료 기준:
  - 데스크톱에서 깔끔한 레이아웃.
  - 디버그 로그/임시 스타일 제거.

## 10단계 — README & 배포
- [ ] 목표: README 작성, Vercel 배포.
- 완료 기준:
  - README에 프로젝트 목표, 기술 스택, 실행 방법, 알려진 한계(특히: 3D 데이터는 추정값, 실제 LiDAR 아님) 명시.
  - Vercel 라이브 데모 URL 작동.

---

## 이 체크리스트 사용법

Claude Code에 단계 작업 요청 시 이렇게 말할 것:
> "4단계 작업하자. 먼저 architecture 문서 읽어. 코드 짜기 전에 파일 계획 보여줘."

단계 건너뛰지 말 것. 각 단계는 이전 단계 위에 쌓임.
한 단계에서 이전 단계의 문제 발견 시, 이전 단계 먼저 수정 후 진행.