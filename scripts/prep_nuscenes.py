"""
F2 / F7 — nuScenes-mini 오프라인 prep 스크립트

목적: nuScenes-mini의 관계형 테이블(여러 JSON)을 JOIN/평탄화해서, 브라우저가 바로
fetch할 수 있는 정적 파일 묶음으로 구워낸다. Step 11의 generate_predictions.py와 같은
"오프라인 1회 도구"이며, 배포되는 웹앱의 일부가 아니다(런타임 백엔드 X — 정적 배포 유지).

F7부터 장면(scene)을 전부 내보내고, 한꺼번에 받지 않도록 파일을 나눈다:

  <out>/scenes.json                         목차: 장면 이름·설명·주행 기록·프레임 수·파일 위치
  <out>/scenes/<장면>/frames.json           박스 + 카메라 보정값 (LiDAR 점은 없다)
  <out>/scenes/<장면>/points/<프레임>.json  그 프레임의 LiDAR 점 + 정렬에 필요한 보정값
  <out>/scenes/<장면>/cam_front/…webp       줄인 사진 (카메라 6대)
  <out>/scenes/<장면>/thumb/<프레임>.webp   앞 카메라의 작은 사진
  <out>/scenes/<장면>/predictions.json      (predict_nuscenes.py 가 쓴다. 여기서는 건드리지 않는다)

의존성: 표준 라이브러리 + Pillow(사진 크기 조절과 WebP 저장). nuscenes-devkit은 쓰지 않는다:
devkit은 opencv/matplotlib 등 무거운 의존성을 끌고 오는데, 우리가 필요한 건 테이블 JSON을
읽어 토큰으로 JOIN하는 것뿐이다. 직접 하면 무엇을 JOIN하는지 코드에 그대로 드러난다.

⚠️ 이 스크립트는 좌표 수학을 절대 하지 않는다(Immutable Rule #3).
   원시 nuScenes 값(global 박스 / ego_pose / calibrated_sensor / intrinsic /
   instance token)을 그대로 복사만 한다. global→ego 변환, 투영 등은 전부
   lib/geometry(transforms.ts / projection.ts) + lib/nuscenes/parser.ts가
   브라우저에서 수행하며 이미 Vitest로 검증됨.
   사진을 줄이는 것은 좌표 변환이 아니다: image.width / height 에는 **원본 크기(1600x900)**를
   그대로 적는다. 박스 좌표, 카메라 intrinsic, 모델 예측이 모두 원본 픽셀 기준이고, 앱은
   사진을 그 좌표계에 맞춰 늘려 그린다. 줄인 파일의 실제 크기는 scenes.json 의 photo 에 있다.

출력 스키마는 apps/.../src/lib/nuscenes/types.ts 와 1:1 대응한다.
  - 쿼터니언은 nuScenes 네이티브 순서 [w, x, y, z] 그대로 (파서가 [x,y,z,w]로 재배열)
  - size는 [w, l, h] 그대로 (파서가 [l, w, h] local 축으로 재배열)
  - 박스는 global 프레임 그대로

LiDAR(F2-B): LIDAR_TOP의 .pcd.bin을 디코드(점당 float32 5개 x,y,z,intensity,ring) → voxel grid로
  데시메이션 → x,y,z만 flat 배열([x,y,z,x,y,z,...])로 싣는다. 점은 LIDAR 센서 프레임 원시
  그대로이고, 정렬에 필요한 LiDAR calibrated_sensor / ego_pose 와 프레임의 ego_pose 도 원시
  복사한다(좌표 수학 없음). 정렬(sensor→global→cam-ego)은 lib가 수행한다(Rule #3).

같은 입력으로 다시 돌리면 같은 파일이 나온다(실행 시각을 적지 않고, 순서를 고정한다).

실행 (저장소 루트에서):
  python scripts/prep_nuscenes.py                      # 장면 전부 → public/sample-data/nuscenes
  python scripts/prep_nuscenes.py --scenes scene-0916  # 장면 하나만 다시 만든다
  python scripts/prep_nuscenes.py --out D:/tmp/out     # 다른 곳에 만들어 본다 (용량 확인용)
  python scripts/prep_nuscenes.py --skip-photos        # 사진은 두고 JSON만 다시 만든다
"""

import argparse
import json
import math
import random
import shutil
import struct
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image

# --- 기본 설정 (CLI로 덮어쓸 수 있음) --------------------------------------

REPO_ROOT = Path(__file__).parent.parent
DEFAULT_DATAROOT = r"C:\data\sets\nuscenes"
DEFAULT_VERSION = "v1.0-mini"

# F6: 카메라 6대를 모두 내보낸다. 3D 박스를 각 카메라 이미지에 투영해 2D를 만드는 것은
# 여전히 lib의 일이고(Rule #3), 여기서는 카메라마다 사진 + ego_pose + calibrated_sensor를
# 원시 복사만 한다. 목록의 순서가 곧 출력의 순서다(무인자 재실행이 같은 파일을 내도록 고정).
CAMERAS = [
    "CAM_FRONT",
    "CAM_FRONT_LEFT",
    "CAM_FRONT_RIGHT",
    "CAM_BACK",
    "CAM_BACK_LEFT",
    "CAM_BACK_RIGHT",
]
# 프레임의 "기준" 카메라. 프레임 최상위의 image / egoPose / calibratedSensor는 이 카메라의
# 값이며(F2-A부터 그대로), 3D 장면의 기준 좌표(ego 프레임)도 이 카메라의 ego_pose다.
# 바꾸면 3D 박스 위치와 거리 값이 전부 조금씩 달라지므로 그대로 둔다.
CAMERA = CAMERAS[0]
# F2-B는 LIDAR_TOP 점구름을 싣는다 (실측 환경 점). 박스는 CAM_FRONT-ego 프레임에
# 있으므로, 점은 sensor→global→cam-ego로 lib에서 정렬한다(여기선 원시 복사만).
LIDAR = "LIDAR_TOP"

# LiDAR sweep .pcd.bin 한 점의 레이아웃: float32 5개(x, y, z, intensity, ring) = 20 byte.
# 우리는 x, y, z만 쓴다(깊이색 = z 기반, F1-A 재사용). intensity/ring은 버린다.
LIDAR_POINT_FLOATS = 5
LIDAR_POINT_BYTES = LIDAR_POINT_FLOATS * 4  # float32 = 4 byte → 20

# Voxel grid 데시메이션 기본값: 공간을 한 변 VOXEL_SIZE(m)짜리 칸으로 나눠 칸당 점 1개만
# 남긴다 → 공간 밀도 균일. MAX_POINTS는 안전 상한(초과 시 균일 서브샘플). 둘 다 CLI로
# 덮어쓸 수 있고, 렌더 검증하며 조정한다. 좌표값은 소수 3자리(mm)로 반올림해 JSON 용량을 줄인다.
# 0.6m: LiDAR sweep는 공간적으로 넓게 퍼져 있어(점 사이가 멀어) 이 정도 칸이라야 voxel
# 솎기 자체로 ~6.5k/프레임에 수렴한다(더 작으면 점 수가 급증, cap에 의존하게 됨). 환경이
# 너무 성기면 0.4~0.5로 낮춰 재실행. cap은 안전 상한일 뿐(여기선 걸리지 않음).
DEFAULT_VOXEL_SIZE = 0.6
DEFAULT_MAX_POINTS = 8000
COORD_DECIMALS = 3
# 데시메이션 서브샘플의 재현성을 위한 고정 시드(무인자 재실행이 같은 점을 내도록).
DECIMATION_SEED = 42

# 출력 위치: 앱의 public/ 아래 (여기 들어간 것만 배포/커밋된다)
OUTPUT_DIR = REPO_ROOT / "apps" / "ai_detection_viewer_client" / "public" / "sample-data" / "nuscenes"
# 브라우저가 보는 public 경로 접두사 (Frame.imageUrl과 같은 규약)
PUBLIC_PATH_ROOT = "/sample-data/nuscenes"
# 장면별 폴더가 모이는 곳: <out>/scenes/<장면 이름>/
SCENES_SUBDIR = "scenes"

# F7: 화면에 보여 줄 사진의 크기. 원본은 1600x900 JPEG(평균 174KB)이고 전부 넣으면 432MB라
# 줄여서 넣는다. 2026-11-26 실측(표본 300장): 960x540 WebP q75 → 평균 42KB(전체 약 103MB).
# 전체 보기는 원본과 차이가 거의 없고, 먼 물체를 확대하면 조금 흐리다(설계 문서 F7 결정 2).
# 모델(YOLO)은 이 사진이 아니라 원본을 본다 — predict_nuscenes.py 참고.
DEFAULT_PHOTO_WIDTH = 960
DEFAULT_PHOTO_QUALITY = 75
# 타임라인과 결과 목록의 미리 보기용 작은 사진(앞 카메라만). 192x108 WebP q70 → 평균 2.7KB.
THUMB_WIDTH = 192
THUMB_QUALITY = 70
# libwebp 압축 노력(0~6). 값이 바뀌면 파일이 달라지므로 고정해 적는다.
WEBP_METHOD = 4
PHOTO_WORKERS = 8


def image_subdir(channel: str) -> str:
    """카메라 이름 → 이미지 하위 폴더 이름. 'CAM_FRONT_LEFT' → 'cam_front_left'."""
    return channel.lower()


def photo_filename(source_relpath: str) -> str:
    """원본 사진 경로 → 줄인 사진의 파일 이름. 'samples/CAM_FRONT/xxx.jpg' → 'xxx.webp'."""
    return Path(source_relpath).with_suffix(".webp").name


# 우리 prepped 포맷(우리가 정의한 것)의 버전. nuScenes 버전과 무관.
# 1.1 (F4): annotation에 annotationToken / numLidarPts / visibility 추가. 기존 필드는 그대로라
#           1.0을 읽던 코드는 1.1도 읽는다(파서는 새 필드를 선택 값으로 다룬다).
# 1.2 (F6): 프레임에 cameras[] 추가(카메라 6대의 사진 + ego_pose + calibrated_sensor).
#           최상위 image / egoPose / calibratedSensor는 그대로(= CAM_FRONT)라 1.1을 읽던
#           코드는 1.2도 읽는다. cameras가 없는 옛 파일은 파서가 카메라 한 대로 다룬다.
# 1.3 (F7): 파일을 나눈다. 장면마다 frames.json 하나, 프레임마다 점 파일 하나, 그리고 목차
#           scenes.json. 달라진 필드:
#             - frame.lidar 는 점 대신 { path, pointCount } 만 가진다(점은 path 의 파일에 있다).
#             - image 에 source(원본 사진의 nuScenes 상대 경로) 추가. path 는 줄인 WebP.
#             - frame.thumb(작은 사진의 경로) 추가.
#           박스와 카메라 필드는 1.2 그대로다. 파서는 1.2 이하의 한 파일도 계속 읽는다.
PREPPED_FORMAT_VERSION = "1.3"


# --- 테이블 로딩 + 인덱싱 (관계형 JOIN을 위한 준비) -------------------------

def load_table(meta_dir: Path, name: str) -> list:
    with open(meta_dir / f"{name}.json", encoding="utf-8") as f:
        return json.load(f)


def index_by_token(records: list) -> dict:
    """레코드 리스트 → {token: record}. PK 인덱스(=DB의 기본키 조회)."""
    return {r["token"]: r for r in records}


# --- LiDAR .pcd.bin 디코드 + 데시메이션 (좌표 수학 아님 — 솎기일 뿐) ---------

def read_pcd_bin_xyz(path: Path) -> list[tuple[float, float, float]]:
    """nuScenes LiDAR sweep(.pcd.bin)을 디코드해 (x, y, z) 리스트로 반환한다.

    헤더 없는 순수 바이너리: 점 하나가 float32 5개(x, y, z, intensity, ring)로
    연속 저장돼 있다(점당 20 byte). struct로 끝까지 언팩한다. 우리는 x, y, z만
    쓰므로 intensity/ring은 버린다. (numpy/devkit 불필요 — stdlib만)
    """
    data = path.read_bytes()
    count = len(data) // LIDAR_POINT_BYTES
    points: list[tuple[float, float, float]] = []
    for i in range(count):
        x, y, z, _intensity, _ring = struct.unpack_from(
            "<fffff", data, i * LIDAR_POINT_BYTES
        )
        points.append((x, y, z))
    return points


def voxel_decimate(
    points: list[tuple[float, float, float]],
    voxel_size: float,
    max_points: int,
    rng: random.Random,
) -> list[tuple[float, float, float]]:
    """Voxel grid 데시메이션: 공간을 한 변 voxel_size(m) 칸으로 나눠 칸당 첫 점만 남긴다.

    한 칸에 여러 점이 떨어지면 첫 점만 keep → 공간적으로 고른 밀도가 된다(가까운 곳
    과밀, 먼 곳 희박이 완화). 이것은 좌표 변환이 아니라 부분추출(subsample)이므로
    Rule #3과 무관하다. 그래도 max_points를 넘으면 균일 서브샘플로 상한을 건다.
    """
    inv = 1.0 / voxel_size
    seen: set[tuple[int, int, int]] = set()
    kept: list[tuple[float, float, float]] = []
    for x, y, z in points:
        key = (math.floor(x * inv), math.floor(y * inv), math.floor(z * inv))
        if key in seen:
            continue
        seen.add(key)
        kept.append((x, y, z))
    if max_points and len(kept) > max_points:
        kept = rng.sample(kept, max_points)
    return kept


# --- 한 키프레임 평탄화 -----------------------------------------------------

def build_camera(channel: str, sd: dict, ctx: dict) -> dict:
    """카메라 한 대의 사진 + 그 사진을 찍은 순간의 ego_pose + calibrated_sensor (원시 복사).

    카메라 6대는 같은 순간에 찍히지 않는다(이 씬에서 CAM_FRONT 기준 -8 ~ +35 ms). 그래서
    nuScenes는 sample_data마다 ego_pose를 따로 둔다. 3D 박스를 이 카메라의 사진에 정확히
    비추려면 "이 사진을 찍은 순간의 차 위치"가 필요하므로 카메라마다 함께 싣는다.
    """
    ego = ctx["ego_poses"][sd["ego_pose_token"]]
    calib = ctx["calibs"][sd["calibrated_sensor_token"]]
    return {
        "channel": channel,
        "image": {
            # 화면이 받는 줄인 사진. 'samples/CAM_FRONT/xxx.jpg' → '…/cam_front/xxx.webp'
            "path": f"{ctx['scene_public']}/{image_subdir(channel)}/{photo_filename(sd['filename'])}",
            # 원본의 픽셀 크기(1600x900). 박스·intrinsic·예측의 좌표계이므로 줄인 크기를 적지 않는다.
            "width": sd["width"],
            "height": sd["height"],
            # 원본 사진의 nuScenes 상대 경로. 모델은 이 파일을 본다(predict_nuscenes.py).
            "source": sd["filename"],
        },
        "egoPose": {
            "translation": ego["translation"],
            "rotation": ego["rotation"],  # [w, x, y, z]
        },
        "calibratedSensor": {
            "translation": calib["translation"],
            "rotation": calib["rotation"],                 # [w, x, y, z]
            "cameraIntrinsic": calib["camera_intrinsic"],  # 3x3
        },
    }


def build_prepped_frame(sample: dict, ctx: dict) -> tuple[dict, dict | None, list[tuple[str, str]]]:
    """한 sample(키프레임)을 평탄화된 prepped 프레임 dict로 변환한다.

    JOIN 경로(전부 토큰 → 레코드 조회):
      sample
        └─ (카메라 6대의 sample_data)  이미지 파일/크기 + ego_pose/calibrated_sensor 토큰
              ├─ ego_pose            (그 사진을 찍은 순간의) 차의 global 위치/자세
              └─ calibrated_sensor   카메라의 ego 기준 위치/자세 + intrinsic
        └─ (LIDAR_TOP sample_data)  .pcd.bin 파일 + LiDAR ego_pose/calibrated_sensor 토큰
              ├─ ego_pose            (라이다 촬영 시각의) 차 global 위치/자세
              └─ calibrated_sensor   라이다의 ego 기준 위치/자세 (intrinsic 없음)
        └─ sample_annotation[]  global 3D 박스 → instance → category (클래스명)
                                           └→ visibility (가려짐 단계, F4)

    반환: (prepped frame dict,
           점 파일의 내용 dict 또는 None(LiDAR가 없는 프레임),
           만들 사진 목록 [(원본 상대경로, 대상 하위 폴더), ...])
    """
    cam_sds = ctx["cam_sd_by_sample"][sample["token"]]
    missing = [c for c in CAMERAS if c not in cam_sds]
    if missing:
        raise SystemExit(f"sample {sample['token']}에 키프레임 사진이 없는 카메라: {missing}")
    cameras = [build_camera(channel, cam_sds[channel], ctx) for channel in CAMERAS]
    copies = [(cam_sds[channel]["filename"], image_subdir(channel)) for channel in CAMERAS]
    # 프레임의 기준 카메라(CAM_FRONT). 최상위 필드는 F2-A부터의 형식 그대로 둔다.
    base = cameras[0]

    annotations = []
    for ann in ctx["anns_by_sample"].get(sample["token"], []):
        instance = ctx["instances"][ann["instance_token"]]
        category = ctx["categories"][instance["category_token"]]
        visibility = ctx["visibilities"].get(ann["visibility_token"])
        annotations.append(
            {
                "instanceToken": ann["instance_token"],  # 같은 객체의 안정적 id (Rule #1 / track id)
                "category": category["name"],
                "translation": ann["translation"],  # global center [x,y,z] (m)
                "size": ann["size"],                 # [w, l, h] (m) — nuScenes 순서 그대로
                "rotation": ann["rotation"],         # [w, x, y, z] — nuScenes 순서 그대로
                # F4(3D 박스 검수)용. 전부 nuScenes 원본 값의 복사/JOIN이며 계산은 없다.
                # annotationToken: 이 프레임의 이 박스 하나를 가리키는 고유 id. instanceToken은
                #   같은 객체면 프레임이 달라도 같지만, 박스는 프레임마다 따로 그려진 것이다.
                # numLidarPts: 이 박스 안에 들어온 LiDAR 점 개수(nuScenes가 원본 sweep 기준으로
                #   센 값 — 우리가 솎아낸 lidar.points 기준이 아니다). 0이면 센서 근거가 없는 박스.
                # visibility: 물체가 얼마나 보이는지의 4단계 ("v0-40" ~ "v80-100").
                "annotationToken": ann["token"],
                "numLidarPts": ann["num_lidar_pts"],
                "visibility": visibility["level"] if visibility else None,
            }
        )

    # LIDAR_TOP 점구름(F2-B): 같은 키프레임의 LiDAR sample_data를 조인해 .pcd.bin을
    # 디코드·데시메이션한다. 점은 LIDAR 센서 프레임 원시 그대로 싣고, 정렬에 필요한
    # LiDAR calibrated_sensor / ego_pose도 원시 복사한다(좌표 수학 없음 — Rule #3).
    lidar_sd = ctx["lidar_sd_by_sample"].get(sample["token"])
    lidar = None
    points_file = None
    if lidar_sd is not None:
        lidar_ego = ctx["ego_poses"][lidar_sd["ego_pose_token"]]
        lidar_calib = ctx["calibs"][lidar_sd["calibrated_sensor_token"]]
        raw_points = read_pcd_bin_xyz(Path(ctx["dataroot"]) / lidar_sd["filename"])
        kept = voxel_decimate(raw_points, ctx["voxel_size"], ctx["max_points"], ctx["rng"])
        flat: list[float] = []
        for x, y, z in kept:
            flat.extend(
                (round(x, COORD_DECIMALS), round(y, COORD_DECIMALS), round(z, COORD_DECIMALS))
            )
        # F7: 점은 프레임마다 따로 받는 파일에 싣는다(전체 데이터의 85%가 점이라, 박스 정보와
        # 한 파일에 두면 보지 않을 프레임의 점까지 받게 된다). 그 파일은 혼자서 해석되도록
        # 정렬에 필요한 값을 모두 가진다: LiDAR의 보정값 + 프레임의 ego_pose(박스의 기준 좌표).
        points_file = {
            "token": sample["token"],
            "frameEgoPose": base["egoPose"],
            "lidar": {
                "points": flat,  # [x, y, z, x, y, z, ...] LIDAR 센서 프레임 원시
                "egoPose": {
                    "translation": lidar_ego["translation"],
                    "rotation": lidar_ego["rotation"],  # [w, x, y, z]
                },
                "calibratedSensor": {
                    "translation": lidar_calib["translation"],
                    "rotation": lidar_calib["rotation"],  # [w, x, y, z]
                },
            },
        }
        # frames.json 에는 "어디에 있고 몇 개인지"만 남긴다.
        lidar = {
            "path": f"{ctx['scene_public']}/points/{sample['token']}.json",
            "pointCount": len(kept),
        }

    frame = {
        "token": sample["token"],
        "timestamp": sample["timestamp"],  # 마이크로초
        "image": base["image"],
        "egoPose": base["egoPose"],
        "calibratedSensor": base["calibratedSensor"],
        # F6: 카메라 6대. cameras[0]은 위의 최상위 필드와 같은 값(CAM_FRONT)이다.
        "cameras": cameras,
        # F7: 앞 카메라의 작은 사진(타임라인·결과 목록의 미리 보기).
        "thumb": f"{ctx['scene_public']}/thumb/{sample['token']}.webp",
        "annotations": annotations,
    }
    if lidar is not None:
        frame["lidar"] = lidar
    return frame, points_file, copies


def iter_scene_keyframes(scene: dict, samples_by_token: dict, limit: int):
    """한 씬의 키프레임(sample)을 시간순으로 최대 limit개 순회한다.

    sample은 'next' 토큰으로 연결된 링크드 리스트다(2Hz 키프레임).
    first_sample_token에서 시작해 next가 빌 때까지 따라간다.
    """
    token = scene["first_sample_token"]
    count = 0
    while token and count < limit:
        sample = samples_by_token[token]
        yield sample
        token = sample["next"]
        count += 1


def write_json(path: Path, document) -> int:
    """컴팩트 덤프(공백 없음)로 쓰고 바이트 수를 돌려준다.

    이 JSON들은 사람이 읽는 문서가 아니라 브라우저가 fetch하는 데이터라 용량을 우선한다
    (점 배열에 indent를 주면 숫자마다 줄바꿈이 붙어 몇 배로 부푼다). 줄 끝은 OS와 무관하게
    LF로 고정해 어느 컴퓨터에서 돌려도 같은 파일이 나오게 한다.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(document, f, separators=(",", ":"), ensure_ascii=False)
    return path.stat().st_size


def write_photo(job: tuple[Path, Path, int, int, Path | None]) -> tuple[int, int]:
    """원본 JPEG 한 장을 줄여 WebP로 저장한다. (사진 바이트, 썸네일 바이트)를 돌려준다.

    가로를 photo_width 로 맞추고 세로는 원본 비율을 따른다(1600x900 → 960x540).
    thumb_path 가 있으면(앞 카메라) 같은 원본에서 작은 사진도 만든다.
    """
    source, dest, photo_width, photo_quality, thumb_path = job
    with Image.open(source) as original:
        image = original.convert("RGB")
        width, height = image.size
        size = (photo_width, round(height * photo_width / width))
        image.resize(size, Image.LANCZOS).save(dest, "WEBP", quality=photo_quality, method=WEBP_METHOD)
        thumb_bytes = 0
        if thumb_path is not None:
            thumb_size = (THUMB_WIDTH, round(height * THUMB_WIDTH / width))
            image.resize(thumb_size, Image.LANCZOS).save(
                thumb_path, "WEBP", quality=THUMB_QUALITY, method=WEBP_METHOD
            )
            thumb_bytes = thumb_path.stat().st_size
    return dest.stat().st_size, thumb_bytes


def main():
    parser = argparse.ArgumentParser(description="nuScenes-mini → prepped static files (scenes)")
    parser.add_argument("--dataroot", default=DEFAULT_DATAROOT, help="nuScenes dataroot 경로")
    parser.add_argument("--version", default=DEFAULT_VERSION, help="nuScenes 버전 (예: v1.0-mini)")
    parser.add_argument(
        "--scenes", default="all",
        help="내보낼 장면. 'all' 또는 쉼표로 나눈 이름(예: scene-0916,scene-1094). "
             "목차(scenes.json)에는 항상 모든 장면을 적는다",
    )
    parser.add_argument("--out", default=str(OUTPUT_DIR), help="출력 폴더 (기본: 앱의 public/sample-data/nuscenes)")
    parser.add_argument("--photo-width", type=int, default=DEFAULT_PHOTO_WIDTH, help="줄인 사진의 가로 픽셀")
    parser.add_argument("--photo-quality", type=int, default=DEFAULT_PHOTO_QUALITY, help="WebP 품질(0~100)")
    parser.add_argument("--skip-photos", action="store_true", help="사진과 썸네일은 건드리지 않고 JSON만 만든다")
    parser.add_argument(
        "--voxel-size", type=float, default=DEFAULT_VOXEL_SIZE,
        help="LiDAR voxel grid 데시메이션 칸 크기(m). 클수록 점이 적어짐",
    )
    parser.add_argument(
        "--max-points", type=int, default=DEFAULT_MAX_POINTS,
        help="프레임당 LiDAR 점 안전 상한(초과 시 균일 서브샘플). 0이면 무제한",
    )
    args = parser.parse_args()

    meta_dir = Path(args.dataroot) / args.version
    if not meta_dir.is_dir():
        raise SystemExit(f"메타데이터 폴더를 찾을 수 없음: {meta_dir}")
    out_dir = Path(args.out)

    # 1) 테이블 로딩 + PK 인덱싱
    scenes = load_table(meta_dir, "scene")
    logs = index_by_token(load_table(meta_dir, "log"))  # F7: 주행 기록(어느 날, 어디서, 어느 차)
    samples_by_token = index_by_token(load_table(meta_dir, "sample"))
    ego_poses = index_by_token(load_table(meta_dir, "ego_pose"))
    calibs = index_by_token(load_table(meta_dir, "calibrated_sensor"))
    sensors = index_by_token(load_table(meta_dir, "sensor"))
    instances = index_by_token(load_table(meta_dir, "instance"))
    categories = index_by_token(load_table(meta_dir, "category"))
    visibilities = index_by_token(load_table(meta_dir, "visibility"))  # F4: 가려짐 단계 이름
    sample_data = load_table(meta_dir, "sample_data")
    sample_annotation = load_table(meta_dir, "sample_annotation")

    # 2) 역인덱스(devkit이 만들어주던 것) — 직접 JOIN으로 구성
    #    (a) calibrated_sensor → sensor.channel  (어느 calib이 CAM_FRONT인가)
    calib_channel = {
        c["token"]: sensors[c["sensor_token"]]["channel"] for c in calibs.values()
    }
    #    (b) sample_token → 그 프레임의 카메라 6대 / LIDAR_TOP 키프레임 sample_data
    cam_sd_by_sample = {}  # {sample_token: {channel: sample_data}}
    lidar_sd_by_sample = {}
    for sd in sample_data:
        if not sd["is_key_frame"]:
            continue
        channel = calib_channel.get(sd["calibrated_sensor_token"])
        if channel in CAMERAS:
            cam_sd_by_sample.setdefault(sd["sample_token"], {})[channel] = sd
        elif channel == LIDAR:
            lidar_sd_by_sample[sd["sample_token"]] = sd
    #    (c) sample_token → 그 프레임의 3D 박스 어노테이션들
    anns_by_sample = {}
    for ann in sample_annotation:
        anns_by_sample.setdefault(ann["sample_token"], []).append(ann)

    # 3) 어느 장면을 내보낼지. 순서는 이름순으로 고정한다(목차의 순서 = 화면의 순서).
    scenes = sorted(scenes, key=lambda scene: scene["name"])
    names = [scene["name"] for scene in scenes]
    if args.scenes == "all":
        wanted = set(names)
    else:
        wanted = {name.strip() for name in args.scenes.split(",") if name.strip()}
        unknown = sorted(wanted - set(names))
        if unknown:
            raise SystemExit(f"없는 장면: {unknown} (있는 장면: {names})")

    catalog_scenes = []
    totals = {"frames": 0, "boxes": 0, "points": 0, "photos": 0}
    sizes = {"frames.json": 0, "points": 0, "photos": 0, "thumbs": 0}
    source_size = None  # 원본 사진의 (가로, 세로)

    for scene in scenes:
        name = scene["name"]
        scene_dir = out_dir / SCENES_SUBDIR / name
        scene_public = f"{PUBLIC_PATH_ROOT}/{SCENES_SUBDIR}/{name}"
        log = logs[scene["log_token"]]

        ctx = {
            "ego_poses": ego_poses,
            "calibs": calibs,
            "instances": instances,
            "categories": categories,
            "visibilities": visibilities,
            "cam_sd_by_sample": cam_sd_by_sample,
            "lidar_sd_by_sample": lidar_sd_by_sample,
            "anns_by_sample": anns_by_sample,
            "scene_public": scene_public,
            # F2-B LiDAR 디코드/데시메이션 파라미터
            "dataroot": args.dataroot,
            "voxel_size": args.voxel_size,
            "max_points": args.max_points,
            # 장면마다 새 난수기: 어느 장면을 함께 내보내든 한 장면의 결과가 같다.
            "rng": random.Random(DECIMATION_SEED),
        }

        samples = list(iter_scene_keyframes(scene, samples_by_token, limit=10**9))
        box_count = sum(len(anns_by_sample.get(sample["token"], [])) for sample in samples)
        if source_size is None and samples:
            first_sd = cam_sd_by_sample[samples[0]["token"]][CAMERA]
            source_size = (first_sd["width"], first_sd["height"])
        # 목차에는 내보내지 않는 장면도 적는다(장면 하나만 다시 만들어도 목차가 줄지 않게).
        catalog_scenes.append(
            {
                "name": name,
                "token": scene["token"],
                # 데이터셋이 적어 둔 설명 글(영어). 낮/밤 필드는 nuScenes에 없고, 이 글에만 있다.
                "description": scene["description"],
                # 주행 기록. 같은 log 의 장면은 같은 날 같은 차로 이어서 찍은 것이다
                # (mini의 밤 장면 3개는 log 하나에서 나왔다 — 서로 독립인 표본이 아니다).
                "log": {
                    "name": log["logfile"],
                    "location": log["location"],
                    "dateCaptured": log["date_captured"],
                    "vehicle": log["vehicle"],
                },
                "frameCount": len(samples),
                "boxCount": box_count,
                "firstTimestamp": samples[0]["timestamp"] if samples else None,
                "framesPath": f"{scene_public}/frames.json",
                "predictionsPath": f"{scene_public}/predictions.json",
            }
        )
        if name not in wanted:
            continue

        # 다시 만들 때 이전 파일이 남지 않도록 이 스크립트가 쓰는 것만 비운다
        # (predictions.json 은 다른 스크립트의 출력이라 그대로 둔다).
        photo_dirs = ["thumb", *map(image_subdir, CAMERAS)]
        for sub in ["points"] if args.skip_photos else ["points", *photo_dirs]:
            shutil.rmtree(scene_dir / sub, ignore_errors=True)
        for sub in ["points", *photo_dirs]:
            (scene_dir / sub).mkdir(parents=True, exist_ok=True)

        frames = []
        photo_jobs = []
        scene_points = 0
        for sample in samples:
            frame, points_file, copies = build_prepped_frame(sample, ctx)
            frames.append(frame)
            if points_file is not None:
                sizes["points"] += write_json(scene_dir / "points" / f"{sample['token']}.json", points_file)
                scene_points += frame["lidar"]["pointCount"]
            for src_relpath, subdir in copies:
                is_base = subdir == image_subdir(CAMERA)
                photo_jobs.append(
                    (
                        Path(args.dataroot) / src_relpath,
                        scene_dir / subdir / photo_filename(src_relpath),
                        args.photo_width,
                        args.photo_quality,
                        scene_dir / "thumb" / f"{sample['token']}.webp" if is_base else None,
                    )
                )

        sizes["frames.json"] += write_json(
            scene_dir / "frames.json",
            {"version": PREPPED_FORMAT_VERSION, "scene": name, "frames": frames},
        )

        scene_photo_bytes = 0
        if not args.skip_photos:
            # 사진 변환은 순서와 무관하다(파일마다 독립) → 여러 장을 동시에 처리한다.
            with ThreadPoolExecutor(max_workers=PHOTO_WORKERS) as pool:
                for photo_bytes, thumb_bytes in pool.map(write_photo, photo_jobs):
                    scene_photo_bytes += photo_bytes
                    sizes["photos"] += photo_bytes
                    sizes["thumbs"] += thumb_bytes
            totals["photos"] += len(photo_jobs)

        totals["frames"] += len(frames)
        totals["boxes"] += box_count
        totals["points"] += scene_points
        print(
            f"[scene] {name}: frames={len(frames)} boxes={box_count} "
            f"points={scene_points} (~{scene_points // max(1, len(frames))}/frame) "
            f"photos={0 if args.skip_photos else len(photo_jobs)} "
            f"({scene_photo_bytes / 1024 / 1024:.1f} MB)  log={log['logfile']}",
            flush=True,
        )

    # 4) 목차. 화면이 가장 먼저 받는 파일이다.
    source_width, source_height = source_size
    catalog = {
        "version": PREPPED_FORMAT_VERSION,
        "source": {
            "dataset": "nuScenes",
            "version": args.version,
            "license": "CC BY-NC-SA 4.0",
            "url": "https://www.nuscenes.org/nuscenes",
        },
        "cameras": CAMERAS,
        # 화면이 받는 사진은 줄인 사본이다. 박스·예측의 좌표는 원본(source) 픽셀 기준이다.
        "photo": {
            "format": "webp",
            "width": args.photo_width,
            "height": round(source_height * args.photo_width / source_width),
            "quality": args.photo_quality,
            "sourceWidth": source_width,
            "sourceHeight": source_height,
        },
        "thumb": {
            "format": "webp",
            "width": THUMB_WIDTH,
            "height": round(source_height * THUMB_WIDTH / source_width),
            "camera": CAMERA,
        },
        "scenes": catalog_scenes,
    }
    catalog_bytes = write_json(out_dir / "scenes.json", catalog)

    def mb(n: int) -> str:
        return f"{n / 1024 / 1024:.2f} MB"

    print(f"[done] scenes={len(wanted)} / {len(scenes)} frames={totals['frames']} boxes={totals['boxes']} "
          f"points={totals['points']} photos={totals['photos']}")
    print(f"[done] scenes.json {catalog_bytes} B | frames.json {mb(sizes['frames.json'])} | "
          f"points {mb(sizes['points'])} | photos {mb(sizes['photos'])} | thumbs {mb(sizes['thumbs'])}")
    print(f"[done] → {out_dir}")


if __name__ == "__main__":
    main()
