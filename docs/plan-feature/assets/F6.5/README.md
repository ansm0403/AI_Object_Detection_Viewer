# three.js 상시 비용 화면 기록 (전후 캡처)

F6과 F7 사이의 성능 세션(three.js 상시 비용)에서 찍은 실제 앱 캡처다. 기능(F)이 아니라 성능 수정 하나라서 설계 문서는
없다. 결과는 `.claude/docs/post-mvp-checklist.md`의 "F6.5" 항목, 원인과 측정은 `docs/edgecases/Edge_F#6.5.md`에 있다.

- 시각은 모두 **한국 시간(KST, UTC+9)** 이다.
- 캡처는 **배포용 빌드**(`npm run build` 후 `npx next start -p 3100`)를 Playwright(Chromium, `--use-angle=swiftshader`)로
  찍었다. 방법은 `../../HANDOFF.md` 8장.
- 원본 PNG를 1:1 크기 그대로 JPEG(품질 85)로 다시 저장했다. 이미지 11장과 페이지 1개로 약 1.5MB다.
- 픽셀 수 비교는 JPEG가 아니라 **원본 PNG**로 했다.

## 보는 방법

**[compare.html](compare.html)** 을 브라우저로 연다. 숫자키나 `←` `→`로 화면을 고르고, "고치기 전" 그림이 있는 화면(1~3)에서는
이미지를 클릭하거나 `Space`를 누르면 같은 자리에서 전후가 바뀐다. 화면마다 "무엇을 보면 되는지"가 적혀 있다.

## 2026-11-26_captures

| 파일 | 내용 |
|---|---|
| `nuscenes_3d_before.jpg` (05:42), `nuscenes_3d_after.jpg` (13:12) | nuScenes 프레임 1의 3D 칸. 고치기 전 빌드와 고친 빌드를 각각 띄워 찍음. **다른 픽셀 0개** |
| `coco_3d_default_old_style.jpg`, `coco_3d_default_fixed.jpg` (13:20) | COCO의 3D 칸. **같은 화면에서** 클릭용 상자만 옛 방식(그림, 투명도 0)과 지금 방식(그리지 않음)으로 바꿔 찍음. 박스 뒤 바닥 격자 줄만 다름(1.6%) |
| `coco_3d_orbit_old_style.jpg`, `coco_3d_orbit_fixed.jpg` (13:20) | 위와 같고 카메라를 돌린 뒤. 격자 줄만 다름(1.8%) |
| `after_review_1440x900.jpg` (13:16) | 고친 뒤, 검수 모드, 프레임 1 |
| `after_review_selected_1440x900.jpg` | 목록 첫 줄 선택(흰 박스, 이름표, 사진이 오른쪽 뒤 카메라로) |
| `after_evaluate_frame6_1440x900.jpg` | 평가 모드, 프레임 6(초록 28, 빨강 16, 회색 17) |
| `after_review_flow_1440x900.jpg` | A → U → J → K 뒤("Reviewed 2 / 583 · 1 unsure") |
| `after_coco_selected_1440x900.jpg` | COCO에서 3D 박스를 클릭해 선택 |

**COCO의 "고치기 전" 그림을 옛 빌드에서 따로 찍지 않은 이유:** COCO의 추정 점구름은 화면을 띄울 때마다 무작위로 흩어진다
(`lib/geometry/pointcloud-generator.ts`). 따로 띄운 두 화면을 비교하면 점 위치가 달라 4.6%가 다르게 나온다. 그래서 한 화면에서
클릭용 상자의 그리기 방식만 바꿔 찍었다. 옛 빌드에서 같은 방법(상자를 실행 중에 숨김)으로 찍은 결과도 1.6%로 같았다.
