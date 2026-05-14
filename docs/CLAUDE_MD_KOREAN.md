# CLAUDE.md 한국어 번역본

## 프로젝트

AI Object Detection Viewer

이 프로젝트는 다음 역량을 보여주기 위한 포트폴리오 프로젝트입니다.

- 3D 시각화
- AI 객체 탐지 데이터 파싱
- 2D와 3D 멀티뷰 동기화
- TypeScript 기반 프론트엔드 아키텍처

목표는 실제 운영용 AI 시스템을 만드는 것이 아닙니다.

목표는 포트폴리오 프로젝트를 통해 3D 시각화와 데이터 처리 능력을 증명하는 것입니다.

## 사용자 컨텍스트

사용자는 React, Next.js, TypeScript, 프론트엔드 상태 관리, API 연동, 프론트엔드 성능 최적화, 기본적인 Nest.js 백엔드 개발 경험이 있습니다.

사용자는 Three.js, WebGL, React Three Fiber, 3D 시각화, AI 데이터 도메인 개념, Object Detection, Bounding Box, Point Cloud, Annotation, Zustand에 익숙하지 않습니다.

3D 또는 AI 데이터 개념을 설명할 때는 초보자 친화적으로 설명해야 합니다.

## 기술 스택

다음 스택을 사용합니다.

- Next.js
- TypeScript
- Tailwind CSS
- Zustand
- Three.js
- React Three Fiber
- @react-three/drei
- 2D bounding box용 SVG overlay
- MVP 이후 선택 기능에만 Recharts 사용
- 배포는 Vercel 사용

MVP에서는 TanStack Query를 추가하지 않습니다.

## MVP 범위

우선 MVP만 구현합니다.

1. COCO annotation JSON 파싱
2. 내부 TypeScript 데이터 변환
3. 프레임 리스트와 프레임 선택
4. SVG bounding box를 포함한 2D 이미지 뷰어
5. point cloud, 3D bounding box, OrbitControls를 포함한 3D 뷰어
6. 2D ↔ 3D 객체 선택 동기화
7. 객체 목록 패널
8. confidence threshold 필터
9. class 필터
10. 프레임 타임라인

## MVP 비목표

MVP에서는 다음 기능을 구현하지 않습니다.

- 로그인 또는 회원가입
- 데이터베이스
- 백엔드 API
- 실시간 스트리밍
- 실시간 AI 추론
- AI 모델 학습
- ROS 연동
- LiDAR 원본 바이너리 파싱
- GPS / IMU 데이터
- 센서 타임스탬프 동기화
- 저장 기능 없는 가짜 annotation 편집 UI
- JSON inspector
- KITTI 데이터셋 연동

## 핵심 데이터 규칙

데이터 소스로 COCO annotation JSON을 사용합니다.

렌더링 전에 COCO 데이터를 내부 `Frame` 구조로 변환해야 합니다.

내부 모델에는 다음 타입이 포함되어야 합니다.

- `Frame`
- `Detection2D`
- `Detection3D`
- `Point3D`

같은 객체에 대해 `Detection2D.id`와 `Detection3D.id`는 반드시 동일해야 합니다.

이 공유 id가 2D ↔ 3D 동기화의 핵심입니다.

COCO 파싱과 좌표 변환 로직은 React 컴포넌트 외부에 유지해야 합니다.

COCO 파싱 로직을 Zustand store 내부에 넣지 않습니다.

## 핵심 상태 규칙

전역 뷰어 UI 상태 관리를 위해 Zustand를 사용합니다.

store에는 다음 상태가 포함되어야 합니다.

- `selectedFrameId`
- `selectedObjectId`
- `confidenceThreshold`
- `visibleClasses`

`selectedObjectId`는 객체 선택 상태의 단일 기준(source of truth)이어야 합니다.

`selectedObjectId`가 변경되면:

- 2D bounding box 하이라이트가 업데이트되어야 함
- 3D bounding box 하이라이트가 업데이트되어야 함
- 객체 목록 선택 상태가 업데이트되어야 함

`selected2DObjectId` 또는 `selected3DObjectId` 같은 별도의 선택 상태를 만들지 않습니다.

## 3D 데이터 규칙

MVP에서는 실제 LiDAR depth 데이터를 사용하지 않습니다.

2D bounding box의 위치와 크기를 기반으로 3D 좌표를 추정합니다.

추정된 point cloud 데이터를 생성하고 Three.js `BufferGeometry`를 사용해 렌더링합니다.

추정된 3D 데이터는 실제 세계의 depth 데이터가 아니라 시각화를 위한 근사값으로 취급해야 합니다.

## 3D 뷰어 규칙

3D 렌더링에는 React Three Fiber를 사용합니다.

3D 뷰어는 다음 기능을 포함해야 합니다.

- point cloud 렌더링
- 3D bounding box 렌더링
- OrbitControls
- 객체 클릭 선택
- 선택 객체 하이라이트

3D 뷰어는 애플리케이션의 메인 뷰입니다.

2D 이미지 뷰어는 보조 컨텍스트 뷰입니다.

## 권장 구현 순서

다음 순서를 권장합니다.

1. 데이터 파싱
2. 2D 뷰어
3. Zustand store
4. 3D 씬
5. 2D ↔ 3D 동기화
6. 필터와 타임라인
7. UI 정리
8. README 및 배포

## 구현 규칙

- 코드는 단순하고 읽기 쉽게 유지합니다.
- 초보자 친화적인 TypeScript를 우선합니다.
- 명시적인 승인 없이 MVP 범위를 확장하지 않습니다.
- 관련 없는 파일 수정은 피합니다.
- 데이터 파싱, UI 렌더링, 3D 렌더링, 상태 관리를 분리합니다.
- 여러 파일에 걸친 큰 변경이나 아키텍처 변경 전에는 짧은 계획을 먼저 제안합니다.
- 구현 후에는 변경된 파일과 핵심 로직을 요약합니다.
- package script가 필요하면 명령어를 추측하지 말고 `package.json`을 확인합니다.


---

# 아래는 CLAUDE.md 에 존재하지 않는 내용.

# 엣지케이스 검증

## 엣지케이스 1: 데이터 모델 전체를 빼면 Claude가 이상한 타입을 만들지 않을까?

가능성은 있습니다.

그래서 완전히 제거하지 않고, 최소 규칙만 남겼습니다.

```md id="neq81m"
The internal model must include:

- Frame
- Detection2D
- Detection3D
- Point3D

Detection2D.id and Detection3D.id must be identical for the same object.
```

이 정도면 핵심 구조는 유지됩니다.
정확한 타입은 구현 단계에서 별도 프롬프트로 지정하면 됩니다.

예:

```txt id="haueua"
Read @docs/data-model.md and implement the exact internal TypeScript types.
```

---

## 엣지케이스 2: “Do not implement backend API” 때문에 나중에 백엔드 연동을 막지 않을까?

괜찮습니다. 문맥이 `Non-goals for MVP` 아래에 있기 때문에 **MVP에서만 금지**입니다.

나중에 백엔드 연동 단계가 오면 `CLAUDE.md`를 이렇게 바꾸면 됩니다.

```md id="4du6z2"
Backend API integration is allowed only after the frontend MVP is complete.
```

---

## 엣지케이스 3: `Do not add TanStack Query in the MVP` 때문에 API 연동 때도 못 쓰게 되지 않을까?

현재 표현은 안전합니다.

```md id="2s5bxr"
Do not add TanStack Query in the MVP.
```

“MVP에서만 금지”이므로 나중에 백엔드 API가 생기면 수정하면 됩니다.

---

## 엣지케이스 4: `Avoid modifying unrelated files`가 너무 약하지 않을까?

적당합니다.

`Do not modify unrelated files`처럼 강하게 쓰면 Claude가 필요한 import 정리나 타입 수정까지 망설일 수 있습니다.
`Avoid`가 더 실전적입니다.

---

## 엣지케이스 5: 3D 좌표가 실제 깊이값처럼 오해될 수 있지 않을까?

최종본에는 이 문장을 추가했습니다.

```md id="q3y3pe"
The estimated 3D data should be treated as a visualization approximation, not real-world depth.
```

이 문장은 꼭 넣는 게 좋습니다.
COCO는 기본적으로 2D annotation 데이터이므로, 3D 좌표는 실제 LiDAR나 depth 센서 값이 아니라 시각화를 위한 추정값입니다.

---

