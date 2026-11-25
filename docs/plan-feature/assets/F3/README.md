# F3 화면 기록 (시안과 캡처)

F3(스크롤 없는 작업 화면)을 진행하면서 만든 시안과 실제 앱 캡처를 남긴다. 화면에 관한 결정을 무엇을 보고
내렸는지 나중에 확인하기 위한 기록이다. 설계는 [../../F3_workspace_layout.md](../../F3_workspace_layout.md),
결과는 `.claude/docs/post-mvp-checklist.md`의 F3 완료 기록에 있다.

- 시각은 모두 **한국 시간(KST, UTC+9)** 이다.
- 캡처는 Playwright(Chromium, `--use-angle=swiftshader`)로 찍었다. 방법은 `../../HANDOFF.md` 8장.
- 용량을 줄이려고 화면 캡처는 원본 PNG를 1:1 크기 그대로 JPEG(품질 85)로 다시 저장했다.
- 선택 상태: nuScenes는 보행자 `cb5fdf…`, COCO는 `1-1`(person)을 선택한 화면이다.
  `after/`의 nuScenes 1440×900만 카메라 밖 차량 `ca5b3c…`를 선택한 상태다(목록·3D 동기화 확인 중 찍음).

## 2026-11-25_before — F3 전 화면 (06:25 KST)

F3 구현 전, 커밋 `0ca4260` 상태의 앱. 페이지 높이 1380px(스크롤 필요), 내용 폭 1280px 고정이라
1440×900과 1280×720에서 배치가 같다.

| 파일 | 내용 |
|---|---|
| `nuscenes_1440x900.jpg`, `nuscenes_1280x720.jpg` | 첫 화면(스크롤 전). 목록과 분석 패널은 화면 밖 |
| `coco_1440x900.jpg`, `coco_1280x720.jpg` | 같은 조건, COCO |
| `nuscenes_1440x900_fullpage.jpg` | 페이지 전체 길이(스크롤해야 보이는 부분 포함) |

## 2026-11-25_mockup — 화면 시안 (06:21~06:23 KST)

설계 문서 결정 9에 따라 구현 전에 만든 정적 시안. 사용자가 이 시안을 보고 방향과 추가 제안 4개를 승인했다.

| 파일 | 내용 |
|---|---|
| `mockup_*.jpg` | 시안 캡처 (nuScenes·COCO × 1440×900·1280×720) |
| `mockup.html` + `data.js` | 시안 원본. 브라우저로 열 수 있다. 예: `mockup.html?ds=nuscenes&shot=shots/3d_nuscenes_1440x900.png`. Tailwind 3.4.3을 CDN에서 불러오므로 인터넷 연결이 필요하다 |
| `shots/3d_*.png` | 시안의 3D 칸. 실제 앱의 3D 뷰를 시안 칸 크기(736×708, 648×528)로 다시 그려 찍은 정적 캡처 |

시안의 카메라 칸은 실제 앱이 그린 2D SVG를 그대로 가져온 것이고, 목록은 nuScenes 첫 프레임의 실제 3D 박스 40개다.

## 2026-11-25_after — F3 완료 화면 (18:05~18:06 KST)

F3-A~D를 모두 적용한 실제 앱.

| 파일 | 내용 |
|---|---|
| `nuscenes_1440x900.jpg`, `nuscenes_1280x720.jpg`, `coco_1440x900.jpg`, `coco_1280x720.jpg` | 스크롤 없는 작업 화면 |
| `nuscenes_390x844.jpg` | 모바일. 세로로 쌓이고 페이지가 스크롤된다 |
| `loading_1440x900.jpg` | 데이터 도착 전(로딩 중). 칸 위치가 로딩 후와 같다 |
| `camera_behaviour.jpg` | 3D 카메라 확인. 위: nuScenes에서 화면을 돌린 뒤 프레임 전환·재생해도 시점 유지. 아래: COCO는 프레임 전환 시 처음 시점으로 돌아감 |
