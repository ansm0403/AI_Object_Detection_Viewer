"""
F2 — nuScenes-mini 오프라인 prep 스크립트 (의존성 0개, 표준 라이브러리만)

목적: nuScenes-mini의 관계형 테이블(여러 JSON)을 JOIN/평탄화해서, 브라우저가
COCO처럼 바로 fetch할 수 있는 작은 정적 JSON 한 덩이 + CAM_FRONT 이미지 몇 장으로
구워낸다. Step 11의 generate_predictions.py와 같은 "오프라인 1회 도구"이며,
배포되는 웹앱의 일부가 아니다(런타임 백엔드 X — Vercel 정적 배포 정체성 유지).

nuscenes-devkit을 쓰지 않는다: devkit은 opencv/matplotlib 등 무거운 의존성을 끌고
오는데, 우리가 필요한 건 테이블 JSON을 읽어 토큰으로 JOIN하는 것뿐이다. 직접 하면
설치가 0개이고, 무엇을 JOIN하는지 코드에 그대로 드러난다(관계형 DB의 JOIN과 동일).

⚠️ 이 스크립트는 좌표 수학을 절대 하지 않는다(Immutable Rule #3).
   원시 nuScenes 값(global 박스 / ego_pose / calibrated_sensor / intrinsic /
   instance token)을 그대로 복사만 한다. global→ego 변환, 투영 등은 전부
   lib/geometry(transforms.ts / projection.ts) + lib/nuscenes/parser.ts가
   브라우저에서 수행하며 이미 Vitest로 검증됨.

출력 스키마는 apps/.../src/lib/nuscenes/types.ts 의 NuScenesPrepped와 1:1 대응한다.
  - 쿼터니언은 nuScenes 네이티브 순서 [w, x, y, z] 그대로 (파서가 [x,y,z,w]로 재배열)
  - size는 [w, l, h] 그대로 (파서가 [l, w, h] local 축으로 재배열)
  - 박스는 global 프레임 그대로

F2-B: LIDAR_TOP의 .pcd.bin을 디코드(점당 float32 5개 x,y,z,intensity,ring) → voxel grid로
  데시메이션 → 각 프레임의 lidar.points에 x,y,z만 flat 배열([x,y,z,x,y,z,...])로 싣는다.
  점은 LIDAR 센서 프레임 원시 그대로이고, 정렬에 필요한 LiDAR calibrated_sensor / ego_pose도
  원시 복사한다(좌표 수학 없음). 정렬(sensor→global→cam-ego)은 lib/geometry/transforms.ts +
  parser.ts가 수행한다(Rule #3).

실행:
  python scripts/prep_nuscenes.py
  python scripts/prep_nuscenes.py --dataroot C:\\data\\sets\\nuscenes --scene-index 0 --num-keyframes 10
"""

import argparse
import json
import math
import random
import shutil
import struct
from pathlib import Path

# --- 기본 설정 (CLI로 덮어쓸 수 있음) --------------------------------------

REPO_ROOT = Path(__file__).parent.parent
DEFAULT_DATAROOT = r"C:\data\sets\nuscenes"
DEFAULT_VERSION = "v1.0-mini"

# F2-A는 CAM_FRONT 한 대만 사용 (3D 박스를 이 카메라 이미지에 투영해 2D를 만든다)
CAMERA = "CAM_FRONT"
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
IMAGE_SUBDIR = "cam_front"  # 이미지 복사 대상 하위 폴더
# 브라우저가 보는 public 경로 접두사 (Frame.imageUrl과 같은 규약)
PUBLIC_PATH_PREFIX = f"/sample-data/nuscenes/{IMAGE_SUBDIR}"

# 우리 prepped 포맷(우리가 정의한 것)의 버전. nuScenes 버전과 무관.
PREPPED_FORMAT_VERSION = "1.0"


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

def build_prepped_frame(sample: dict, ctx: dict) -> tuple[dict, str]:
    """한 sample(키프레임)을 평탄화된 prepped 프레임 dict로 변환한다.

    JOIN 경로(전부 토큰 → 레코드 조회):
      sample
        └─ (CAM_FRONT sample_data)  이미지 파일/크기 + ego_pose/calibrated_sensor 토큰
              ├─ ego_pose            차의 global 위치/자세
              └─ calibrated_sensor   카메라의 ego 기준 위치/자세 + intrinsic
        └─ (LIDAR_TOP sample_data)  .pcd.bin 파일 + LiDAR ego_pose/calibrated_sensor 토큰
              ├─ ego_pose            (라이다 촬영 시각의) 차 global 위치/자세
              └─ calibrated_sensor   라이다의 ego 기준 위치/자세 (intrinsic 없음)
        └─ sample_annotation[]  global 3D 박스 → instance → category (클래스명)

    반환: (prepped frame dict, 복사할 원본 이미지 상대경로)
    """
    sd = ctx["cam_sd_by_sample"][sample["token"]]
    ego = ctx["ego_poses"][sd["ego_pose_token"]]
    calib = ctx["calibs"][sd["calibrated_sensor_token"]]

    image_filename = Path(sd["filename"]).name  # 'samples/CAM_FRONT/xxx.jpg' → 'xxx.jpg'

    annotations = []
    for ann in ctx["anns_by_sample"].get(sample["token"], []):
        instance = ctx["instances"][ann["instance_token"]]
        category = ctx["categories"][instance["category_token"]]
        annotations.append(
            {
                "instanceToken": ann["instance_token"],  # 같은 객체의 안정적 id (Rule #1 / track id)
                "category": category["name"],
                "translation": ann["translation"],  # global center [x,y,z] (m)
                "size": ann["size"],                 # [w, l, h] (m) — nuScenes 순서 그대로
                "rotation": ann["rotation"],         # [w, x, y, z] — nuScenes 순서 그대로
            }
        )

    # LIDAR_TOP 점구름(F2-B): 같은 키프레임의 LiDAR sample_data를 조인해 .pcd.bin을
    # 디코드·데시메이션한다. 점은 LIDAR 센서 프레임 원시 그대로 싣고, 정렬에 필요한
    # LiDAR calibrated_sensor / ego_pose도 원시 복사한다(좌표 수학 없음 — Rule #3).
    lidar_sd = ctx["lidar_sd_by_sample"].get(sample["token"])
    lidar = None
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
        lidar = {
            "points": flat,  # [x, y, z, x, y, z, ...] LIDAR 센서 프레임 원시
            "egoPose": {
                "translation": lidar_ego["translation"],
                "rotation": lidar_ego["rotation"],  # [w, x, y, z]
            },
            "calibratedSensor": {
                "translation": lidar_calib["translation"],
                "rotation": lidar_calib["rotation"],  # [w, x, y, z]
            },
        }

    frame = {
        "token": sample["token"],
        "timestamp": sample["timestamp"],  # 마이크로초
        "image": {
            "path": f"{PUBLIC_PATH_PREFIX}/{image_filename}",
            "width": sd["width"],
            "height": sd["height"],
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
        "annotations": annotations,
    }
    if lidar is not None:
        frame["lidar"] = lidar
    return frame, sd["filename"]


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


def main():
    parser = argparse.ArgumentParser(description="nuScenes-mini → prepped static JSON")
    parser.add_argument("--dataroot", default=DEFAULT_DATAROOT, help="nuScenes dataroot 경로")
    parser.add_argument("--version", default=DEFAULT_VERSION, help="nuScenes 버전 (예: v1.0-mini)")
    # 기본 6 = scene-0916 (주간, car/person/bicycle 고루 + clutter 거의 0). 10개 씬의
    # 클래스 구성을 조사해 데모용으로 선정. 무인자 재실행이 현재 샘플을 재현하도록 함.
    parser.add_argument("--scene-index", type=int, default=6, help="사용할 씬 인덱스 (기본 6=scene-0916)")
    parser.add_argument("--num-keyframes", type=int, default=10, help="해당 씬에서 가져올 키프레임 수")
    parser.add_argument(
        "--voxel-size", type=float, default=DEFAULT_VOXEL_SIZE,
        help="LiDAR voxel grid 데시메이션 칸 크기(m). 클수록 점이 적어짐 (기본 0.2)",
    )
    parser.add_argument(
        "--max-points", type=int, default=DEFAULT_MAX_POINTS,
        help="프레임당 LiDAR 점 안전 상한(초과 시 균일 서브샘플). 0이면 무제한",
    )
    args = parser.parse_args()

    meta_dir = Path(args.dataroot) / args.version
    if not meta_dir.is_dir():
        raise SystemExit(f"메타데이터 폴더를 찾을 수 없음: {meta_dir}")

    # 1) 테이블 로딩 + PK 인덱싱
    scenes = load_table(meta_dir, "scene")
    samples_by_token = index_by_token(load_table(meta_dir, "sample"))
    ego_poses = index_by_token(load_table(meta_dir, "ego_pose"))
    calibs = index_by_token(load_table(meta_dir, "calibrated_sensor"))
    sensors = index_by_token(load_table(meta_dir, "sensor"))
    instances = index_by_token(load_table(meta_dir, "instance"))
    categories = index_by_token(load_table(meta_dir, "category"))
    sample_data = load_table(meta_dir, "sample_data")
    sample_annotation = load_table(meta_dir, "sample_annotation")

    # 2) 역인덱스(devkit이 만들어주던 것) — 직접 JOIN으로 구성
    #    (a) calibrated_sensor → sensor.channel  (어느 calib이 CAM_FRONT인가)
    calib_channel = {
        c["token"]: sensors[c["sensor_token"]]["channel"] for c in calibs.values()
    }
    #    (b) sample_token → 그 프레임의 CAM_FRONT / LIDAR_TOP 키프레임 sample_data
    cam_sd_by_sample = {}
    lidar_sd_by_sample = {}
    for sd in sample_data:
        if not sd["is_key_frame"]:
            continue
        channel = calib_channel.get(sd["calibrated_sensor_token"])
        if channel == CAMERA:
            cam_sd_by_sample[sd["sample_token"]] = sd
        elif channel == LIDAR:
            lidar_sd_by_sample[sd["sample_token"]] = sd
    #    (c) sample_token → 그 프레임의 3D 박스 어노테이션들
    anns_by_sample = {}
    for ann in sample_annotation:
        anns_by_sample.setdefault(ann["sample_token"], []).append(ann)

    ctx = {
        "ego_poses": ego_poses,
        "calibs": calibs,
        "instances": instances,
        "categories": categories,
        "cam_sd_by_sample": cam_sd_by_sample,
        "lidar_sd_by_sample": lidar_sd_by_sample,
        "anns_by_sample": anns_by_sample,
        # F2-B LiDAR 디코드/데시메이션 파라미터
        "dataroot": args.dataroot,
        "voxel_size": args.voxel_size,
        "max_points": args.max_points,
        "rng": random.Random(DECIMATION_SEED),
    }

    # 3) 씬 선택 + 키프레임 순회 + 평탄화
    if not (0 <= args.scene_index < len(scenes)):
        raise SystemExit(f"scene-index {args.scene_index}가 범위를 벗어남 (0 ~ {len(scenes) - 1})")
    scene = scenes[args.scene_index]
    print(f"[scene] index={args.scene_index} name={scene['name']} nbr_samples={scene['nbr_samples']}")

    image_out_dir = OUTPUT_DIR / IMAGE_SUBDIR
    image_out_dir.mkdir(parents=True, exist_ok=True)
    # 재실행(특히 다른 씬으로 교체) 시 이전 씬 이미지가 남지 않도록 출력 폴더를 비운다.
    for old in image_out_dir.glob("*.jpg"):
        old.unlink()

    frames = []
    total_annotations = 0
    total_lidar_points = 0
    for sample in iter_scene_keyframes(scene, samples_by_token, args.num_keyframes):
        frame, src_relpath = build_prepped_frame(sample, ctx)
        frames.append(frame)
        total_annotations += len(frame["annotations"])
        if "lidar" in frame:
            total_lidar_points += len(frame["lidar"]["points"]) // 3

        # 이 키프레임의 CAM_FRONT 이미지를 public/으로 복사
        shutil.copy2(Path(args.dataroot) / src_relpath, image_out_dir / Path(src_relpath).name)

    prepped = {"version": PREPPED_FORMAT_VERSION, "frames": frames}
    output_json = OUTPUT_DIR / "nuscenes.json"
    # 컴팩트 덤프(공백 없음): lidar.points가 프레임당 수천 개라 indent를 주면 숫자마다
    # 줄바꿈+들여쓰기가 붙어 파일이 몇 배로 부푼다. 이 JSON은 사람이 읽는 문서가 아니라
    # 브라우저가 fetch하는 데이터 아티팩트이므로 용량을 우선한다.
    with open(output_json, "w", encoding="utf-8") as f:
        json.dump(prepped, f, separators=(",", ":"))

    avg_pts = total_lidar_points // len(frames) if frames else 0
    print(f"[done] frames={len(frames)} annotations={total_annotations}")
    print(f"[done] lidar  → {total_lidar_points} points total (~{avg_pts}/frame, "
          f"voxel={args.voxel_size}m, cap={args.max_points})")
    print(f"[done] JSON   → {output_json}")
    print(f"[done] images → {image_out_dir} ({len(frames)}장)")


if __name__ == "__main__":
    main()
