<img width="400" alt="Honeycam 2026-06-09 22-10-56" src="https://github.com/user-attachments/assets/40e91d32-44a4-4dbd-b8bb-b7f5d19d6e67" />
<img width="400" alt="Honeycam 2026-06-09 22-12-30" src="https://github.com/user-attachments/assets/c7aaa461-b561-431e-aca9-197492939ad1" />
<img width="400" alt="Honeycam 2026-06-09 22-11-44" src="https://github.com/user-attachments/assets/352c492d-117a-4271-9733-97022ff44c7c" />
<img width="400" alt="Honeycam 2026-05-22 11-32-13" src="https://github.com/user-attachments/assets/bfbda11d-0157-4bdc-8b7c-31cfdbf595b4" />
<img width="400" alt="Honeycam 2026-05-22 11-33-05" src="https://github.com/user-attachments/assets/7732a033-3844-4c8a-b901-4e588b0b60f0" />
<img width="400" alt="Honeycam 2026-05-22 11-36-51" src="https://github.com/user-attachments/assets/2696eb39-998b-4136-8f65-e189e9b15df0" />
<img width="400" alt="Honeycam 2026-05-22 11-36-51" src="https://github.com/user-attachments/assets/2696eb39-998b-4136-8f65-e189e9b15df0" />
<img width="400" alt="Honeycam 2026-05-22 11-36-51" src="https://github.com/user-attachments/assets/2696eb39-998b-4136-8f65-e189e9b15df0" />


<br>

---

<br>

<details>
<summary><b>2D 뷰어와 3D 뷰어의 버스 위치가 다르게 보이는 이유(클릭하여 펼치기)</b></summary>

## 2D 뷰어와 3D 뷰어가 다르게 보이는 이유

앱을 처음 보면 두 뷰어가 같은 물체를 표현하는데 위치·거리감이 다르게 느껴질 수 있습니다.  
**이는 버그가 아닙니다.** 두 뷰어가 완전히 다른 카메라 위치와 시야각으로 같은 공간을 찍기 때문입니다.

### 에고 차량이란?

자율주행 데이터에서 **에고(Ego) 차량**은 카메라·LiDAR 센서를 달고 실제로 주행한 *기록 차량 자체*입니다.  
3D 뷰어의 원점(0, 0, 0)이 항상 에고 차량이고, 다른 모든 물체의 위치는 "에고로부터 몇 m 앞/옆"의  
상대 좌표로 표현됩니다.

### 2D 뷰어 — 에고 정면 수평 카메라

에고 차량 앞에 달린 카메라(CAM_FRONT)가 찍은 사진입니다.  
전방 약 **70° 범위**만 담기며, 물체가 카메라에 가까울수록 이미지에서 크게 보입니다.

```
[에고 차량] ─── 카메라 시야(약 70°) ───▶

╔═══════════════════════════╗
║    나무  (도로)  나무       ║  ← 2D 뷰어에 보이는 것
║         🚗                 ║    (전방 70° 범위만)
╚═══════════════════════════╝
```

### 3D 뷰어 — 에고 뒤에서 비스듬히 내려다보는 시점

3D 뷰어의 카메라는 에고 차량보다 뒤쪽 높은 위치에서 씬 전체를 내려다봅니다.  
자동차 레이싱 게임의 **3인칭 시점(체이스 캠)** 과 비슷합니다.

```
    👁 [3D 뷰어 카메라 — 에고 뒤+위]
      ╲ (비스듬히 내려다봄)
       ╲
    ────────────────────────────
    [에고 차량] ──▶ [🚗] [🚌] [🚶]   ← 3D 뷰어에 보이는 것
    ────────────────────────────        (에고 주변 전체가 보임)
```

### 같은 물체가 왜 다르게 느껴지는가

| | 2D 뷰어 | 3D 뷰어 |
|---|---|---|
| 카메라 위치 | 에고 정면, 수평으로 찍음 | 에고 뒤+위, 비스듬히 내려다봄 |
| 보이는 범위 | 전방 70° 만 | 에고 주변 공간 전체 |
| "가깝다"의 기준 | 이미지에서 차지하는 픽셀 크기 | 3D 씬 전체에서 박스가 얼마나 두드러지는가 |

에고 **15m 앞**에 있는 물체가 **2D에서는 화면 중앙을 크게 차지**하지만,  
**3D에서는 씬 전체 중 작은 박스 하나**로 표시됩니다.  
좌표 데이터는 완전히 동일하고, 카메라 시점이 달라 같은 공간이 다르게 표현되는 것입니다.

> **예시:** 에고 앞 코너를 돌아 진입하는 차량이 2D에서는 "이미 꽤 가까이 진입"처럼 보일 때,  
> 3D에서는 "이제 막 코너를 돌아오는 중"처럼 보일 수 있습니다.  
> 두 뷰어가 보여주는 절대 거리는 같지만, **화면에 얼마나 두드러지는가의 기준이 다릅니다.**

</details>

<br>

---

<br>

# AI Object Detection Viewer

AI 객체 탐지 결과를 2D 이미지와 3D 공간에서 동시에 탐색하는 데이터 시각화 뷰어입니다.
사용자가 2D에서 객체를 클릭하면 3D에서도 같은 객체가 강조되고, 반대도 성립합니다.

**COCO(추정 3D)와 nuScenes(실측 3D) 두 데이터셋을 데이터셋 스위처로 전환**하며 비교할 수 있습니다.
COCO 프레임은 2D bbox에서 *추정한* 3D를, nuScenes 프레임은 실제 LiDAR로 *측정한* 3D 박스와 점구름을
보여주며, 각 프레임은 `Estimated` / `Measured` 배지로 깊이의 출처를 명시합니다.

## 라이브 데모

🔗 ai-object-detection-viewer-ai-detec.vercel.app

> 두 가지 샘플 데이터가 내장되어 있습니다 (앱은 nuScenes로 기본 진입):
>
> - **nuScenes-mini `scene-0916`** *(기본)* — 실측 3D 박스(쿼터니언 회전) + 실측 LiDAR 점구름 +
>   10 키프레임 시퀀스(자동재생 · 객체 추적 · 카메라 Follow). `Measured` 배지.
> - **MS COCO val2017** — person / bicycle / car 10장에 YOLOv8n 추론을 돌려 실제 confidence
>   분포를 채운 데이터. 2D bbox로부터 3D를 추정. `Estimated` 배지.
>
> 좌측 2D 이미지의 바운딩 박스, 우측 3D 씬의 박스/점구름, 우상단 객체 리스트,
> 우하단 분석 패널이 모두 같은 선택 상태(`selectedObjectId`)를 공유합니다.

---

## 주요 기능

### 멀티뷰 & 선택 동기화 (두 데이터셋 공통)

- **2D↔3D 멀티뷰 선택 동기화** — 2D / 3D / 객체 리스트 / 분석 패널이 모두 동일한
  `selectedObjectId`를 단일 source of truth로 공유
- **데이터셋 스위처 + Estimated/Measured 배지** — COCO(추정)와 nuScenes(실측)를 토글로 전환,
  프레임마다 깊이의 출처를 정직하게 표기
- **필터링** — confidence 슬라이더(COCO) ↔ 거리(미터) 슬라이더(nuScenes)를 데이터셋별로 스왑 +
  클래스 토글. 모두 셀렉터 레이어에서 일괄 처리
- **프레임 타임라인** — 썸네일 가로 스트립으로 프레임 전환
- **분석 패널** — 선택된 객체 정보 카드, confidence 히스토그램(슬라이더 임계값 오버레이),
  클래스 카운트 바(클릭 시 클래스 필터 토글)

### COCO — 추정 3D

- **COCO 어노테이션 파서** — `images` / `categories` / `annotations`를 내부 `Frame[]`로 변환,
  잘못된 bbox / 카테고리 / score를 안전하게 스킵
- **2D bbox → 3D 좌표 추정** — bbox 중심을 (x, y), 면적을 z(작을수록 카메라에 가까움)로 매핑.
  이는 추정값일 뿐 실제 깊이가 아님을 UI/배지로 명시
- **실측 confidence 분포** — ground truth가 아니라 YOLOv8n 추론 결과(`score` 0.0–1.0)를 사용하므로
  confidence 슬라이더 / 히스토그램이 실제 의미 있는 분포를 보여줌

### nuScenes — 실측 3D

- **실측 3D 박스 (쿼터니언 회전)** — nuScenes의 global 좌표 어노테이션을 `global → ego → three`로
  변환하고 회전을 쿼터니언으로 적용 (주차된 차량들이 일관된 대각 방향으로 정렬)
- **3D→2D 투영** — 3D 박스를 카메라 intrinsic으로 이미지 평면에 투영해 2D 박스를 생성.
  2D · 3D가 같은 `instance` 토큰에서 나오므로 **id가 동일**(Immutable Rule #1 유지)
- **실측 LiDAR 점구름** — `.pcd.bin`을 디코드해 voxel-grid로 데시메이션(~6.5k pts/frame),
  박스와 정확히 정렬, 깊이별 색상 인코딩
- **거리(미터) 필터** — 실제 측정 거리이므로 "50m 밖 숨기기" 같은 필터가 의미를 가짐
- **시퀀스 추적 + 자동재생** — `instance` 토큰이 프레임 간 유지되어, 자동재생(~2Hz) 시
  **같은 객체가 실제로 움직이는** 것을 추적. 객체가 사라졌다 다시 나타나면 다시 강조됨
- **카메라 Follow 모드 + 프레임 간 box tween** — 선택 객체를 중심에 두는 옵트인 카메라 모드,
  키프레임 사이를 lerp(위치)/slerp(회전)로 부드럽게 보간

### 3D 뷰어 인터랙션

- **점구름 깊이 색상 인코딩** — 각 점을 z(깊이)로 색칠해 평면 회색 덩어리가 아닌 입체로 읽힘
- **3D 호버 강조** — bbox 위에 마우스를 올리면 강조 + 커서 `pointer` 피드백
- **`<Html>` 앵커 라벨** — 객체에 매달려 카메라 회전/줌을 따라다니는 정보 말풍선(클래스 + confidence)

<!-- TODO(스크린샷): 이 섹션 아래에 nuScenes 실측 3D / LiDAR / 자동재생 / Follow 모드 캡처 추가 -->

<br>

---

<br>

## 프로젝트 목적과 계기

자율주행 데이터를 시각화하는 프론트엔드 직무 공고를 접하면서 시작한 학습용 포트폴리오입니다.
**해당 공고는 이미 종료되었지만**, 직무에서 요구한 역량(3D 시각화, AI 데이터 도메인, 멀티뷰 동기화)을
실제로 구현해보는 것 자체가 목적으로 남았습니다.

기존 포트폴리오(호텔 예약, 쇼핑몰)에서는 다루지 못했던 **3D 렌더링**과 **AI 데이터 포맷 처리**를
직접 만져보면서, 프론트엔드의 영역을 한 단계 넓히는 것이 핵심 동기입니다.

처음에는 자율주행 데이터 전체(LiDAR / 센서 동기화 / 좌표계 변환)를 한 번에 다루기 어렵다고 판단해,
**범용 AI 데이터(COCO Object Detection)의 2D bbox에서 3D를 *추정*하는 것**으로 범위를 좁혀 MVP를
완성했습니다.

이후 MVP의 가장 큰 약점이었던 *"3D가 실제 측정값이 아닌 추정값"*이라는 꼬리표를 떼기 위해,
**nuScenes(자율주행 데이터셋)의 실측 3D 박스와 실측 LiDAR 점구름**을 추가했습니다.
COCO를 대체하지 않고 **데이터셋 스위처로 공존**시켜, "추정 → 실측"으로 나아간 과정 자체를
보여주는 것이 현재 프로젝트의 서사입니다.

---

## 기술 스택

![Next JS](https://img.shields.io/badge/Next-black.svg?style=for-the-badge&logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)<br>
![TailwindCSS](https://img.shields.io/badge/tailwindcss-%2338B2AC.svg?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Threejs](https://img.shields.io/badge/threejs-black?style=for-the-badge&logo=three.js&logoColor=white)<br>
![Vitest](https://img.shields.io/badge/-Vitest-252529?style=for-the-badge&logo=vitest&logoColor=FCC72B)
![Python](https://img.shields.io/badge/python-3670A0?style=for-the-badge&logo=python&logoColor=ffdd54)<br>
![GitHub Actions](https://img.shields.io/badge/github%20actions-%232671E5.svg?style=for-the-badge&logo=githubactions&logoColor=white)
![Vercel](https://img.shields.io/badge/vercel-%23000000.svg?style=for-the-badge&logo=vercel&logoColor=white)


| 영역 | 스택 | 선택 이유 |
|---|---|---|
| 프레임워크 | Next.js 16, TypeScript 5.9 | App Router, 정적 자원 서빙, 타입 안전 |
| 3D 렌더링 | Three.js 0.184, React Three Fiber 9, @react-three/drei 10 | React 생태계와 자연스러운 연동, useEffect cleanup으로 GPU 메모리 자동 관리 |
| 상태 관리 | Zustand 5 | 4개 뷰(2D / 3D / 리스트 / 분석)가 단일 선택 상태를 공유 — boilerplate 최소 |
| 스타일 | Tailwind CSS 3.4 | 빠른 레이아웃 반복, 다크 톤 디자인 시스템 구축 |
| 2D 오버레이 | SVG (`viewBox` + `<rect>`) | bbox 좌표를 산술 없이 매핑, 브라우저가 스케일링 처리 |
| 3D 데이터 | nuScenes-mini, COCO val2017 | 실측 3D(nuScenes)와 추정 3D(COCO)를 데이터셋 스위처로 공존·비교 |
| 데이터 파이프라인 | Python 3.13 (stdlib만) | 오프라인 prep 스크립트가 nuScenes 관계형 테이블 → 정적 JSON으로 평탄화, `.pcd.bin` LiDAR를 `struct`로 디코드 (devkit 미설치) |
| 테스트 | Vitest | 순수 함수 / Zustand store / 셀렉터 / 좌표변환·투영 단위 + 통합 테스트 **203개** |
| 모노레포 | Nx 22.7 | 단일 워크스페이스에서 client/server 분리 (server는 현재 범위 외) |
| 배포 | Vercel | Next.js 공식, GitHub 연동 자동 배포. 런타임 백엔드 없이 정적 서빙 유지 |

---

## 기술 선택 시 고민했던 부분

### 1. Three.js 직접 사용 vs React Three Fiber

Three.js를 직접 쓰면 React 렌더링 루프 충돌, 메모리 수동 관리, Zustand 동기화 코드를 별도로
작성해야 합니다. R3F는 이 셋을 React 방식으로 흡수합니다.

**채택: R3F.** 단순한 타협이 아니라 React + 3D 조합에서 합리적인 선택이며, R3F를 배우면서
geometry / material / camera / lighting 같은 Three.js 핵심 개념도 자연스럽게 학습할 수 있다고 판단했습니다.

### 2. TanStack Query 미도입

데이터 소스가 정적 JSON입니다. 캐싱 / 무효화 / 재시도가 필요 없는 환경에서 라이브러리를
들이는 것은 명백한 오버스펙이라고 판단해 `useEffect + fetch + AbortController` 패턴만 사용했습니다.

### 3. Recharts 미도입

분석 패널의 confidence 히스토그램과 클래스 카운트 바를 처음에는 Recharts로 만들 계획이었지만,
프레임당 객체 ≤10개 / 차트 요소 ≤5개 규모에서는 **직접 작성한 SVG / CSS**로 충분했고,
의존성 / 번들 사이즈가 늘지 않는다는 이점이 컸습니다. 핸드-롤된 차트는 confidence 슬라이더와의
threshold 오버레이도 자유롭게 그릴 수 있었습니다.

### 4. 코어 로직과 React의 분리

COCO/nuScenes 파싱, 2D→3D·3D→2D 좌표 변환, 셀렉터는 모두 `lib/` 아래의 순수 함수입니다.
React 컴포넌트와 Zustand store는 이 함수들의 호출자일 뿐, 도메인 로직을 직접 들고 있지 않습니다.
이 경계 덕분에 203개 테스트의 대부분이 React 환경 없이도 빠르게 돌아갑니다.

### 5. nuScenes 선택 (KITTI / Waymo 대신)

실측 3D 데이터셋 후보로 KITTI / Waymo / nuScenes를 비교했습니다. **nuScenes를 채택한 이유**는
(1) 어노테이션이 웹친화적인 JSON 관계형 테이블이라 기존 DB 경험을 활용하기 좋고,
(2) 360°·현대적 센서 구성이라 시각화 임팩트가 크며, (3) mini 셋이 가벼워 정적 번들에 적합하기
때문입니다. KITTI는 라벨 구조와 좌표계를 익히는 *학습용 디딤돌*로만 사용하고 실제 연동은 하지 않았습니다.

### 6. 오프라인 prep → 정적 JSON, 좌표 변환은 lib/ TS

nuScenes는 KITTI Level 1 같은 "무변환 경로"가 없습니다 — 어노테이션이 global 좌표라 박스만 그려도
`global→ego` 변환과 축 관례(z-up→y-up)가 필요합니다. 이를 **런타임 백엔드 없이** 처리하기 위해,
빌드타임 Python 스크립트가 관계형 테이블을 평탄화해 **원시 값만 담은 정적 JSON**으로 내보내고(좌표
계산 없음), **모든 좌표 변환·투영은 브라우저의 `lib/` TS 순수 함수**가 담당해 Vitest로 검증합니다.
덕분에 Vercel 정적 서빙 정체성을 그대로 유지합니다. (Immutable Rule #3)

### 7. 교체가 아닌 공존 (데이터셋 스위처)

nuScenes 실측 3D를 추가하면서 COCO를 *대체*할 수도 있었지만, 그러면 YOLO confidence /
히스토그램 / 추정 3D 같은 기존 작업이 사라집니다. 대신 **데이터셋 스위처로 공존**시켜 "추정 vs 실측"을
나란히 비교할 수 있게 했고, 한쪽 작업을 버리지 않으면서 서사를 강화했습니다.

---

## 실행 방법

### 요구 사항

- Node.js 20+
- npm
- (선택) Python 3.13 — nuScenes 샘플 데이터를 직접 재생성할 때만 필요. 생성된 JSON은 이미
  저장소에 포함되어 있어 앱 실행에는 불필요합니다.

### 로컬 개발

```bash
# 1. 저장소 클론 후 루트에서 의존성 설치
npm install

# 2. 개발 서버 실행 (Nx CLI 사용)
npx nx dev ai_detection_viewer_client
# → http://localhost:3000

# 3. 테스트 (Vitest, 203개)
npx nx test ai_detection_viewer_client
# 또는 앱 디렉토리에서
cd apps/ai_detection_viewer_client && npm test
```

### 프로덕션 빌드

```bash
npx nx build ai_detection_viewer_client
```

### (선택) nuScenes 샘플 데이터 재생성

```bash
# nuScenes-mini를 로컬에 받아둔 경우에만. 다른 scene으로 교체 가능.
python apps/ai_detection_viewer_client/scripts/prep_nuscenes.py \
  --dataroot C:\data\sets\nuscenes --scene-index 0 --num-keyframes 10
# → public/sample-data/nuscenes/nuscenes.json + cam_front/*.jpg 생성
```

---

## 프로젝트 구조

```
apps/ai_detection_viewer_client/
├── src/
│   ├── app/                # Next.js App Router
│   ├── components/
│   │   ├── viewer-2d/      # SVG 오버레이 이미지 뷰어
│   │   ├── viewer-3d/      # R3F 캔버스, 포인트 클라우드, 3D bbox, Html 라벨
│   │   ├── object-list/    # 비공간 선택 경로
│   │   ├── filters/        # confidence(COCO) / 거리(nuScenes) 슬라이더 + 클래스 토글
│   │   ├── timeline/       # 프레임 썸네일 스트립 + 재생/Follow 컨트롤
│   │   ├── header/         # 앱 타이틀 + 데이터셋 스위처 + Estimated/Measured 배지
│   │   ├── analytics/      # 우측 분석 패널 컨테이너
│   │   ├── charts/         # SVG/CSS 차트 (Recharts 미사용)
│   │   └── inspector/      # 선택된 객체 정보 카드
│   ├── lib/
│   │   ├── coco/           # COCO JSON 파서 (순수 함수)
│   │   ├── nuscenes/       # nuScenes prepped-JSON 파서 + 타입 (순수 함수)
│   │   ├── geometry/       # 2D→3D 추정, 좌표변환(global→ego→three), 3D→2D 투영,
│   │   │                   #   카메라 framing, 깊이 색상, 프레임 보간(lerp/slerp)
│   │   ├── sequence/       # 자동재생 프레임 진행 (순수 nextFrameIndex)
│   │   ├── selectors/      # 가시 detection / 거리 필터 / 히스토그램 / 클래스 카운트
│   │   ├── ui/             # 클래스별 색상 / 거리 상수 매핑
│   │   └── types/          # Frame, Detection2D/3D, Point3D, source 플래그
│   ├── store/              # Zustand store (UI 상태만)
│   └── ...
├── scripts/
│   ├── generate_predictions.py   # COCO val2017 → YOLOv8n 추론 (confidence 채움)
│   └── prep_nuscenes.py          # nuScenes 관계형 테이블 → 정적 JSON + LiDAR 디코드
├── public/sample-data/
│   ├── frame_*.jpg + sample.json # COCO 10장 + YOLO 추론
│   └── nuscenes/                 # scene-0916 10 키프레임 + LiDAR + cam_front/
└── tests/integration/            # 선택 동기화 / 프레임 전환 / 추적 계약 테스트
```

상세 데이터 모델과 컴포넌트 계약은 [`.claude/docs/architecture.md`](.claude/docs/architecture.md)를 참고하세요.

---

## 현 프로젝트의 한계점

### 1. COCO 프레임의 3D는 추정값입니다 (nuScenes는 실측)

COCO에는 깊이(depth) 정보가 없으므로, COCO 프레임의 3D 좌표는 2D bbox의 중심과 면적으로부터
추정한 값입니다. **실제 LiDAR 측정값이 아닙니다.** 반면 **nuScenes 프레임은 실측 3D**라 이 한계가
없으며, 각 프레임은 `Estimated` / `Measured` 배지로 출처를 명시합니다. 두 데이터셋을 스위처로
나란히 비교할 수 있으므로, 한계 자체가 "추정 vs 실측"을 보여주는 장치가 됩니다.

### 2. nuScenes는 단일 카메라(CAM_FRONT)·단일 scene입니다

현재 nuScenes 샘플은 `scene-0916` 10 키프레임을 CAM_FRONT 한 대 기준으로만 투영합니다.
다른 scene은 prep 스크립트의 `--scene-index`로 교체할 수 있지만, 멀티카메라(6-up)·radar는
범위 밖입니다.

### 3. 자동재생 중 박스는 보간, LiDAR 점구름은 스냅

자동재생 시 박스는 키프레임 사이를 lerp/slerp로 부드럽게 보간하지만, LiDAR 점구름은 키프레임
단위로 스냅합니다(박스는 미끄럽고 점은 튀는 부조화). 보간된 중간값은 측정값이 아니므로,
**재생 중에만** 보간하고 일시정지/스크럽 시에는 실측 키프레임을 그대로 보여줍니다 — 깊이 출처를
오인시키지 않기 위한 의도된 선택입니다(Immutable Rule #6).

### 4. COCO 프레임마다 letterbox / pillarbox 크기가 다릅니다

COCO val2017은 다양한 aspect ratio를 포함합니다. Viewer2D는 `aspect-[4/3]` 컨테이너에 이미지를
contain 방식으로 맞추므로 프레임마다 위/아래 또는 좌/우 여백 크기가 달라 보입니다.
이미지와 bbox는 동일한 viewBox 좌표계로 정렬되므로 **bbox 정확도는 무손실**입니다.

---

## 트러블슈팅

프로젝트에서 직접 겪고 해결한 사례들입니다. root cause / 대안 분석은
[`docs/edgecases/`](docs/edgecases/) 문서에 자세히 남겨두었습니다.

### 1. 3D 깊이 반전 — 큰 객체가 화면 뒤로 밀려나던 문제

- **문제**: estimator는 z를 "카메라까지의 거리"로 인코딩(작은 z = 가까움)하지만,
  카메라가 `+z` 쪽에 있어 `-z` 방향을 응시하고 있어 깊이 의미가 정반대로 나타남.
- **해결**: 카메라 위치를 `[0, 0, +14]` → `[0, 0, -10]`로 옮겨 `+z` 방향을 응시하게 함.
  estimator·tests·spec 한 줄도 건드리지 않고 한 줄만 변경.
- **코드**: [`Viewer3D.tsx#L18-L25`](apps/ai_detection_viewer_client/src/components/viewer-3d/Viewer3D.tsx#L18-L25)
  · 상세: `docs/edgecases/Edge_#4.md` Case 2

### 2. 겹친 2D bbox 클릭 우선순위 불일치

- **문제**: SVG는 CSS `z-index`를 무시하고 paint order(배열 순서)대로 hit-test 하므로,
  COCO `annotations` 배열 순서에 따라 시각적으로 앞에 있는 큰 객체를 클릭해도 가려진
  작은 객체가 선택되는 경우 발생.
- **해결**: detection 목록을 bbox 면적 오름차순으로 정렬해 큰 bbox가 마지막에 paint되어
  hit-test 스택 최상단을 차지하게 함. 3D estimator의 "큰 면적 = 가까운 z" 컨벤션과
  동일한 proxy를 공유하므로 2D/3D 두 뷰가 단일 깊이 모델을 공유.
- **코드**: [`Viewer2D.tsx#L22-L34`](apps/ai_detection_viewer_client/src/components/viewer-2d/Viewer2D.tsx#L22-L34)
  · 상세: `docs/edgecases/Edge_#2.md` Case 1

### 3. drei `<Grid>` raycast가 "빈 공간 deselect" 깨뜨림

- **문제**: R3F의 `<Canvas onPointerMissed>`는 raycast가 *아무것도* 맞히지 않을 때만
  발화. UI 다듬기에서 추가한 drei `<Grid infiniteGrid>`는 시각적으로는 페이드되지만
  실제로는 거대한 plane mesh라 거의 모든 클릭이 grid를 맞춰 `onPointerMissed`가 발화하지
  않음 → "빈 공간 클릭 = 선택 해제" 계약이 시각적 회귀 없이 조용히 깨짐.
- **해결**: `useRef`로 grid mesh를 잡고 mount 직후 `useEffect`에서 해당 mesh의 `raycast`
  메소드를 no-op으로 덮어씀. 시각은 유지하면서 raycaster에는 "보이지 않게" 만들어
  deselect 계약을 복구.
- **코드**: [`Scene.tsx#L31-L38`](apps/ai_detection_viewer_client/src/components/viewer-3d/Scene.tsx#L31-L38)
  · 상세: `docs/edgecases/Edge_#9.5.md` Case A

<details>
<summary><b>nuScenes 실측 3D 통합 중 겪은 사례 (클릭하여 펼치기)</b></summary>

### 4. nuScenes 점구름이 COCO용 카메라/fog에 가려짐

- **문제**: COCO 추정 씬에 맞춰 튜닝한 카메라(`-z` 응시)와 fog `[10, 28]`이, 수십 미터 밖
  `-z` 방향에 펼쳐진 실측 nuScenes 박스 클라우드를 **등지거나 안개로 완전히 가림** → 렌더해보니
  ~2개 박스만 보임. (rendering으로 검증해서 발견)
- **해결**: 데이터셋별 카메라 framing. nuScenes는 박스 클라우드에 맞춰 카메라를 fit(뒤+위에서
  전방 응시)하고 `far`를 600으로 넓히며 fog를 끔. COCO는 기존 튜닝을 유지(`source`로 분기).
- **코드**: `lib/geometry/camera-framing.ts` · 상세: `docs/edgecases/Edge_F#2.md` Case 3

### 5. LiDAR 점구름이 박스와 어긋남

- **문제**: 점은 **LiDAR 센서 프레임**에서 태어나고 박스는 **CAM_FRONT ego 프레임**에 있는데,
  두 센서의 촬영 시점 사이에 차가 몇 cm 움직여 단순 정렬 시 점과 박스가 어긋남.
- **해결**: `sensor → GLOBAL → cam-ego`를 경유해 정렬. GLOBAL을 거치면서 ego_pose 타임스탬프
  불일치를 흡수. (LiDAR 동심원 링이 센서 원점을 중심으로 박스를 감싸는지로 렌더 검증)
- **코드**: `lib/geometry/transforms.ts` `sensorToGlobal` · 상세: `docs/edgecases/Edge_F#2.md` Case 4

### 6. 깊이 색상 그라데이션이 안 보임

- **문제**: estimator가 COCO 객체를 z∈[7, 8]로 압축해, 고정 `[1, 8]` 색 램프의 상위 ~15%만
  사용 → 거의 단색으로 보임.
- **해결**: 프레임별 실제 z 범위로 램프를 fit(`depthRange`). "모두 비슷한 깊이"인 프레임도
  전체 램프를 채우게 됨. (트레이드오프: 같은 객체가 프레임마다 다르게 칠해질 수 있음 — 깊이는
  추정값이라 수용)
- **코드**: `lib/geometry/depth-color.ts` · 상세: `docs/edgecases/Edge_F#1.md` Case 1

</details>

---

## 성능 개선 기록

| 항목 | 문제 | 해결 |
|---|---|---|
| GPU 메모리 누수 | `BufferGeometry` / `EdgesGeometry`가 dispose되지 않아 프레임 전환마다 누적 | `PointCloud.tsx` / `BBox3D.tsx`에 `useEffect` cleanup으로 `geometry.dispose()` 호출 |
| 카메라 상태 누적 (COCO) | 프레임 전환 시 이전 프레임의 카메라 위치 / 회전이 새 씬에 그대로 적용 | `<Viewer3D key={frame.id}>` remount 패턴으로 R3F 캔버스 전체 재초기화 |
| 자동재생 카메라 바운스 (nuScenes) | remount 패턴이 자동재생 시 0.5초마다 카메라를 리셋해 화면이 튐 | nuScenes는 **stable key**로 캔버스를 유지(no-remount) + 초기 framing을 freeze → 박스만 움직이고 카메라는 고정 |
| 포인트 클라우드 필터링 | 필터 변경 시 enrich 단계의 전체 포인트가 모두 렌더링됨 | `Point3D.detectionId`로 렌더 시점에 `visibleIds` 필터, 필터 변경 시 geometry만 재빌드 |
| LiDAR 점 개수 | 1 스윕 ~34.7k점은 웹 전송/렌더에 과함 | 오프라인 **voxel-grid 데시메이션**으로 ~6.5k pts/frame(균일 밀도)로 축소, CLI 튜닝 가능 |
| nuScenes JSON 용량 | 점 배열을 pretty-print하니 파일 크기 3배 | 점 배열은 **무들여쓰기 compact dump**로 직렬화 → ~1.4MB(10프레임) |
| 깊이 색 가시성 | 고정 `[1,8]` 램프가 압축된 z 분포에서 단색처럼 보임 | 프레임별 `depthRange` fit으로 전체 램프 활용 |
| 프레임 간 box tween 비용 | ~58박스를 매 프레임 보간 | lerp+slerp는 박스당 수 연산이라 60fps에서 무시 가능 — 측정 후 전체 박스에 적용 |
| GPU 메모리 audit | 누수 의심 잔존 | 10 프레임 라운드트립 후 `WebGLRenderer.info.memory.geometries` 측정: monotonic growth 없음 확인 |
| 차트 번들 사이즈 | Recharts 도입 시 ~50KB+ 추가 | SVG / CSS로 차트 직접 작성, 의존성 0 추가 |
| Tailwind JIT arbitrary class | 상수 문자열에서 추출 실패로 그리드가 무너짐 | grid 클래스를 `page.tsx` JSX className에 직접 기입, JIT extraction 신뢰성 회복 |

세부 사례와 의사결정 근거는 [`docs/edgecases/`](docs/edgecases/) 하위 문서에 남겨두었습니다.

---

## 배운 점

- **좌표계 변환 파이프라인** — nuScenes의 global 좌표를 `global → ego → three`로 옮기고,
  z-up→y-up 축 관례와 쿼터니언 회전을 다루면서, 3D 데이터는 "어느 프레임의 좌표인가"가
  값 자체만큼 중요하다는 것을 익혔습니다. 변환을 전부 `lib/` 순수 함수로 가두고 Vitest로 검증한
  덕에, 눈으로 안 보이는 좌표 버그를 테스트로 먼저 잡을 수 있었습니다.
- **3D→2D 투영** — 카메라 intrinsic(K 행렬)으로 3D 박스를 이미지 평면에 투영해 2D 박스를
  만들면서, 2D와 3D가 별개 데이터가 아니라 같은 객체의 두 표현임을 코드로 체감했습니다
  (같은 `instance` → 같은 id).
- **LiDAR 바이너리 + 오프라인 파이프라인** — 헤더 없는 `.pcd.bin`(점당 5×float32)을 stdlib만으로
  디코드하고 voxel-grid로 데시메이션하면서, "무거운 원시 데이터를 빌드타임에 정적 자원으로
  전처리"하는 설계 감각을 얻었습니다. 관계형 nuScenes 테이블을 평탄 JSON으로 내보내는 과정도
  DB 경험과 맞닿아 있었습니다.
- **프레임레이트 디커플링** — 씬은 ~60fps로 그려지지만 키프레임은 ~2Hz로 갱신됩니다. 이 간극을
  `useFrame`의 시간 기반 보간(lerp/slerp)으로 메우는 패턴은 처음 다뤄본 개념이었습니다.
- **WebGL 메모리 모델** — `BufferGeometry`, `EdgesGeometry`는 GC가 회수하지 않습니다.
  `useEffect` cleanup에서 명시적으로 `.dispose()`를 호출해야 한다는 것을 메모리 누수
  audit으로 직접 확인하며 익혔습니다.
- **순수 함수와 React의 경계** — 도메인 로직을 `lib/`에 가두니 테스트 작성 비용이 크게
  줄었습니다. React 컴포넌트는 props 받는 입출력 노드로만 남았고, 통합 테스트도 store +
  selector만 검증하는 패턴이 자연스러워졌습니다.
- **선택 상태의 단일 source of truth** — 처음에는 2D / 3D 각각 selection 상태를 두려 했지만
  곧 동기화 지옥이 되리라 깨달았습니다. `selectedObjectId` 하나로 통일한 결정이 후속 작업
  (객체 리스트, 필터, 분석 패널, nuScenes 추적)에서 모두 자연스럽게 확장된 점이 가장 큰
  학습이었습니다.
- **SVG paint order = z-order** — 2D에서 큰 bbox가 작은 bbox를 가려 클릭이 막히는 문제를
  3D 추정기의 "큰 면적 → 가까운 z"와 정렬해 해결한 경험은, 2D와 3D를 동시에 다룰 때
  좌표 변환만큼이나 **렌더 순서**가 중요하다는 것을 보여주었습니다.

---

## 향후 개선 방향

- **멀티카메라 / radar** — 현재 nuScenes는 CAM_FRONT 단일 카메라만 투영합니다. 6-up 카메라
  뷰나 radar 포인트를 추가하면 360° 센서 융합 시각화로 확장됩니다.
- **scene 다양화** — 현재 `scene-0916` 하나만 번들합니다(용량 고려). prep 스크립트로 여러
  scene을 선택/전환할 수 있게 하면 데모 다양성이 커집니다.
- **카메라 follow의 거리 추적** — 현재 Follow 모드는 `target`(응시점)만 객체를 따라가고 카메라
  위치는 고정이라, 멀어지는 객체는 점점 작아집니다. 위치까지 따라가는 모드가 다음 후보입니다.
- **백엔드 API 미연동** — 현재는 정적 JSON. Nest.js로 frame API 서버를 만들고 TanStack
  Query를 도입하면 풀스택 경험이 자연스럽게 추가됩니다.
- **COCO 프레임 간 추적 없음** — COCO는 `Detection.id`의 프레임 간 연속성을 보장하지 않습니다.
  휴리스틱으로 흉내내는 것은 포트폴리오에서 오히려 신뢰를 깎는다고 판단해 의도적으로 제외했습니다
  (nuScenes는 `instance` 토큰으로 실제 추적 제공).
