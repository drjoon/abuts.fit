# 한 사람 각인 인덱서.
# 레진 부품 STL, 치수 그림, dimensions.json.
# 재생: /tmp/indexer-cad-venv/bin/python build_model.py
# STEP: export_step.py

import json
import math
import struct
from pathlib import Path

from build123d import (
    Box,
    Compound,
    Cylinder,
    Plane,
    Pos,
    RegularPolygon,
    Rot,
    export_stl,
    extrude,
)

OUT = Path(__file__).resolve().parent
STL = OUT / "stl"

# #25. 16링크 = 한 칸 = 스프로킷 한 바퀴.
CHAIN_PITCH = 6.35
LINKS_PER_BAR = 16
BAR_PITCH = CHAIN_PITCH * LINKS_PER_BAR  # 101.6
BAR_COUNT = 6
CHAIN_LEN = BAR_PITCH * BAR_COUNT  # 609.6
SPROCKET_TEETH = 16
PITCH_DIA = CHAIN_PITCH / math.sin(math.pi / SPROCKET_TEETH)
PITCH_R = PITCH_DIA / 2
OD = CHAIN_PITCH * (0.6 + 1 / math.tan(math.pi / SPROCKET_TEETH))
CENTER_DIST = (CHAIN_LEN - math.pi * PITCH_DIA) / 2
FRAME_W = 400.0
PHASE = 24.0

# 축 높이. 스프로킷 아래로 지나는 캐리어가 Y브리지(윗면 40mm)를 넘기게.
Z_AXIS = 84.0
RAIL = 20.0
# Mädler KP08. h=15, 볼트 간격 42, 길이 55, 폭 13, 구멍 Ø4.8.
KP_H = 15.0
KP_LEN = 55.0
KP_WIDTH = 13.0
KP_BOLT = 42.0
KP_HOLE = 4.8
PEDESTAL_H = Z_AXIS - RAIL - KP_H  # 49

HEX_AF = 2.50
POCKET_AF = 2.60
POCKET_DEPTH = 0.70
PUCK_H = 8.0
PUCK_R = 6.0
DOWEL_X = 4.0

BODY_X = 18.0
BODY_Y = 14.0
BODY_H = 6.0
BODY_Z0 = 2.4
BODY_TOP = BODY_Z0 + BODY_H  # 8.4
OUTWARD = BODY_TOP + PUCK_H  # 16.4

PIN_NOSE_D = 2.30
PIN_NOSE_L = 2.6
PIN_SH_D = 4.0
PIN_SH_L = 1.2
PIN_TAIL_L = 4.4

# 손가락은 못 들어가고 어벗은 지나가는 위쪽 슬롯.
SLOT_W = 12.0
GUARD_L = 100.0
HOOD_L = 90.0
STANDOFF_H = 90.0
BAG_MOUTH = 70.0

SCOPE_W = 106.0
SCOPE_D = 152.0
SCOPE_H = 106.0
WORK_DIST = 40.0
AIM_ABOVE = OUTWARD + 1.0

RAIL_Y_REAR = -48.0
RAIL_Y_FRONT = 28.0
FRONT_RAIL_CENTER_Y = RAIL_Y_FRONT + RAIL / 2  # 38
REAR_RAIL_CENTER_Y = RAIL_Y_REAR + RAIL / 2  # -38


def z_cyl(radius, height, z0):
    return Pos(0, 0, z0 + height / 2) * Cylinder(radius, height)


def hex_prism(across_flats, height):
    sketch = RegularPolygon(
        radius=across_flats / math.sqrt(3),
        side_count=6,
        major_radius=True,
    )
    return extrude(sketch, amount=height)


def along_x(radius, length):
    return Rot(0, 90, 0) * Cylinder(radius, length)


def along_y(radius, length):
    return Rot(90, 0, 0) * Cylinder(radius, length)


def chain_local(s):
    """왼쪽 스프로킷 중심이 x=0. s=0 은 오른쪽 위 접선."""
    s = s % CHAIN_LEN
    arc = math.pi * PITCH_R
    if s <= CENTER_DIST:
        return (CENTER_DIST - s, PITCH_R, -1.0, 0.0, 0.0, 1.0)
    s2 = s - CENTER_DIST
    if s2 <= arc:
        a = s2 / PITCH_R
        return (
            -PITCH_R * math.sin(a),
            PITCH_R * math.cos(a),
            -math.cos(a),
            -math.sin(a),
            -math.sin(a),
            math.cos(a),
        )
    s3 = s2 - arc
    if s3 <= CENTER_DIST:
        return (s3, -PITCH_R, 1.0, 0.0, 0.0, -1.0)
    a = (s3 - CENTER_DIST) / PITCH_R
    return (
        CENTER_DIST + PITCH_R * math.sin(a),
        -PITCH_R * math.cos(a),
        math.cos(a),
        math.sin(a),
        math.sin(a),
        -math.cos(a),
    )


def frame_origin():
    span = CENTER_DIST + PITCH_DIA
    return (FRAME_W - span) / 2 + PITCH_R


def place(part, s, y=0.0):
    """로컬 +Z = 체인 바깥, 로컬 +Y = 작업자."""
    x, z, tx, tz, ox, oz = chain_local(s)
    origin = frame_origin()
    plane = Plane(
        origin=(origin + x, y, Z_AXIS + z),
        x_dir=(-tx, 0.0, -tz),
        z_dir=(ox, 0.0, oz),
    )
    return plane.location * part


def tag(part, name):
    part.label = name
    return part


def carrier():
    """레진. 핀 구멍과 나사 머리가 체인 쪽, 노치는 카메라 쪽(-Y)."""
    body = Pos(0, 0, BODY_Z0 + BODY_H / 2) * Box(BODY_X, BODY_Y, BODY_H)
    for x in (-CHAIN_PITCH / 2, CHAIN_PITCH / 2):
        body = body - Pos(x, 0, BODY_Z0 + PIN_TAIL_L / 2) * Cylinder(PIN_NOSE_D / 2 + 0.08, PIN_TAIL_L + 0.4)
        body = body - Pos(x, 0, BODY_Z0 - PIN_SH_L / 2 + 0.2) * Cylinder(PIN_SH_D / 2 + 0.15, PIN_SH_L + 0.8)
    body = body - Pos(0, 0, BODY_Z0 + 1.6) * Cylinder(3.0, 3.4)
    body = body - Pos(0, 0, BODY_Z0 + BODY_H / 2) * Cylinder(1.65, BODY_H + 2)
    body = body - Pos(DOWEL_X, 0, BODY_TOP - 1.5) * Cylinder(1.15, 3.4)
    # 카메라 쪽 모서리 노치. 각인을 이 방향으로 돌린다.
    body = body - Pos(0, -BODY_Y / 2, BODY_TOP - 1.0) * Box(4.0, 3.0, 2.6)
    return body


def hex_puck():
    """D20. 암헥스. 평탄면이 ±Y. 카메라가 -Y 를 본다."""
    puck = z_cyl(PUCK_R, PUCK_H, 0)
    pocket = Pos(0, 0, PUCK_H - POCKET_DEPTH) * hex_prism(POCKET_AF, POCKET_DEPTH + 0.4)
    puck = puck - pocket
    puck = puck - Pos(0, 0, 3.0) * Cylinder(1.25, 6.4)
    puck = puck - Pos(DOWEL_X, 0, 2.0) * Cylinder(0.98, 4.4)
    return puck


def dog_pin():
    """D20. 코가 피치선(z=0)에 있다. 꼬리는 +Z, 캐리어 안."""
    nose = Pos(0, 0, 0) * Cylinder(PIN_NOSE_D / 2, PIN_NOSE_L)
    shoulder = Pos(0, 0, PIN_NOSE_L / 2 + PIN_SH_L / 2) * Cylinder(PIN_SH_D / 2, PIN_SH_L)
    tail = Pos(0, 0, PIN_NOSE_L / 2 + PIN_SH_L + PIN_TAIL_L / 2) * Cylinder(PIN_NOSE_D / 2, PIN_TAIL_L)
    return nose + shoulder + tail


def dowel():
    return z_cyl(1.0, 6.0, 0)


def pedestal():
    """KP08 볼트 아래. Ø16 × 49, M4 관통."""
    return z_cyl(8.0, PEDESTAL_H, 0) - Pos(0, 0, PEDESTAL_H / 2) * Cylinder(2.25, PEDESTAL_H + 2)


def standoff():
    """가드·후드 기둥. Ø16 × 90. 양 끝 M4 탭 드릴만. 관통하지 않는다."""
    body = z_cyl(8.0, STANDOFF_H, 0)
    body = body - Pos(0, 0, 7) * Cylinder(1.65, 14)
    body = body - Pos(0, 0, STANDOFF_H - 7) * Cylinder(1.65, 14)
    return body


def hub_adapter():
    """모터 Ø5 축을 스프로킷 보어 Ø8 에 연결. 플랜지가 스프로킷에 닿는다."""
    part = z_cyl(7.0, 2.5, 0) + z_cyl(4.0, 12.0, 2.5)
    part = part - Pos(0, 0, 8) * Cylinder(2.55, 20)
    part = part - Pos(6, 0, 8.5) * along_x(1.25, 10)
    return part


def hinge_pin():
    return z_cyl(1.0, 24.0, 0)


def home_flag():
    """캐리어 +X 끝에 붙는 작은 탭. 폭과 반지름은 캐리어를 넘지 않는다."""
    return Pos(BODY_X / 2 + 1.2, 0, BODY_Z0 + BODY_H / 2) * Box(6.0, 6.0, 2.4)


def sprocket():
    disk = Cylinder(OD / 2 - 0.6, 3.2)
    body = disk - Cylinder(4.0, 8)
    for i in range(SPROCKET_TEETH):
        tooth = Pos(OD / 2 - 0.7, 0, 0) * Box(2.4, OD * 0.22, 3.2)
        body = body + Rot(0, 0, i * (360 / SPROCKET_TEETH)) * tooth
    return along_y_stand(body)


def along_y_stand(body):
    return Rot(90, 0, 0) * body


def kp08():
    """구매 외형. 바닥 z=0, 축은 Y, 중심 높이 15, 볼트 ±21."""
    base = Pos(0, 0, 2.5) * Box(KP_LEN, KP_WIDTH, 5)
    house = Pos(0, 0, 16) * Box(24, KP_WIDTH, 22)
    body = base + house
    body = body - along_y(4.15, 30).translate((0, 0, KP_H))
    for x in (-KP_BOLT / 2, KP_BOLT / 2):
        body = body - Pos(x, 0, 4) * Cylinder(KP_HOLE / 2, 12)
    return body


def shaft():
    return along_y(4.0, 120)


def motor_body():
    """축이 +Y. 면이 y=0, 몸통은 -Y."""
    body = Pos(0, -24, 0) * Box(42.3, 48, 42.3)
    boss = Pos(0, 1.0, 0) * along_y(11, 2)
    stub = Pos(0, 12, 0) * along_y(2.5, 24)
    return body + boss + stub


def scope_body():
    return Box(SCOPE_W, SCOPE_D, SCOPE_H)


def rail_x(length, x, y):
    return Pos(x + length / 2, y + RAIL / 2, RAIL / 2) * Box(length, RAIL, RAIL)


def bridge_y(x_center):
    """두 레일을 묶는 2020. 윗면 z=40."""
    return Pos(x_center, 0, RAIL + RAIL / 2) * Box(RAIL, 96, RAIL)


def sensor_holder():
    """반사 센서 모듈 32×14×8 을 집는다. 3번 칸용."""
    foot = Pos(0, 0, 2) * Box(28, 16, 4)
    foot = foot - Pos(-6, 0, 2) * Cylinder(2.2, 8)
    back = Pos(0, 6, 14) * Box(34, 3, 20)
    side_a = Pos(-8, -2, 16) * Box(3, 16, 16)
    side_b = Pos(8, -2, 16) * Box(3, 16, 16)
    bed = Pos(0, -2, 8) * Box(14, 16, 3)
    return foot + back + side_a + side_b + bed


def home_bracket():
    """앞 레일에 고정. 받침대는 체인 밖 y 에서 원점 탭을 본다."""
    foot = Pos(0, 0, 2) * Box(18, 18, 4)
    foot = foot - Pos(0, 4, 2) * Cylinder(2.2, 8)
    mast = Pos(0, -6, 22) * Box(8, 8, 40)
    arm = Pos(0, -14, 42) * Box(8, 16, 6)
    cradle = Pos(0, -22, 42) * Box(16, 8, 12)
    return foot + mast + arm + cradle


def envelope_jig():
    """봉투 한 장. 입구 폭은 BAG_MOUTH. 귀는 앞 레일까지 닿는다."""
    deck = Pos(0, 8, 2) * Box(90, 44, 4)
    inner = BAG_MOUTH / 2 + 2
    cheek_l = Pos(-(inner + 1.5), 10, 9) * Box(3, 28, 12)
    cheek_r = Pos(inner + 1.5, 10, 9) * Box(3, 28, 12)
    lip = Pos(0, -10, 6) * Box(BAG_MOUTH - 6, 3, 8)
    ear = Pos(0, -24, 2) * Box(16, 36, 4)
    ear = ear - Pos(0, -38, 2) * Cylinder(2.2, 8)
    pocket = Pos(0, 14, 3.5) * Box(13.2, 6.2, 5)
    return deck + cheek_l + cheek_r + lip + ear - pocket


def reject_cup():
    cup = z_cyl(18, 28, 0) - Pos(0, 0, 16) * Cylinder(15, 28)
    arm = Pos(0, -28, 3) * Box(14, 44, 6)
    arm = arm - Pos(0, -46, 3) * Cylinder(2.2, 10)
    return cup + arm


def pad_center_z():
    """스탠드오프 윗면에 패드 바닥이 닿는 로컬 z. 로컬 0 은 퍽 윗면."""
    top = (RAIL + STANDOFF_H) - (Z_AXIS + PITCH_R + OUTWARD)
    return top + 4.0


def _cap_shell(length, window, ceiling_reach):
    """z=0 이 퍽 윗면. 위쪽 슬롯 폭은 SLOT_W. 아래 스커트는 캐리어를 피한다."""
    half = SLOT_W / 2
    ceiling = Pos(0, (ceiling_reach - 16) / 2, 30) * Box(length, ceiling_reach + 16, 4)
    lip_op = Pos(0, half + 2, 15) * Box(length, 4, 30)
    lip_cam = Pos(0, -(half + 2), 15) * Box(length, 4, 30)
    # 작업자 쪽 스커트만 아래로 내려 손을 막는다. 벽 쪽은 모터·스프로킷을 피한다.
    skirt_op = Pos(0, 11, -6) * Box(length, 6, 16)
    skirt_cam = Pos(0, -11, -2) * Box(length, 6, 8)
    body = ceiling + lip_op + lip_cam + skirt_op + skirt_cam
    if window:
        body = body - Pos(0, -(half + 2), 1.0) * Box(8, 12, 8)
    return body


def guard_cap():
    body = _cap_shell(GUARD_L, window=True, ceiling_reach=42)
    z = pad_center_z()
    for x in (-38, 38):
        pad = Pos(x, FRONT_RAIL_CENTER_Y, z) * Box(22, 22, 8)
        pad = pad - Pos(x, FRONT_RAIL_CENTER_Y, z) * Cylinder(2.3, 12)
        rib = Pos(x, 24, (z + 30) / 2) * Box(6, 30, 34 - z)
        body = body + pad + rib
    return body


def hood_frame():
    """고정. 경첩 두 곳과 솔레노이드 자리가 있다. 뚜껑은 따로 움직인다."""
    z = pad_center_z()
    body = None
    for x in (-40, 40):
        pad = Pos(x, FRONT_RAIL_CENTER_Y, z) * Box(18, 22, 8)
        pad = pad - Pos(x, FRONT_RAIL_CENTER_Y, z) * Cylinder(2.3, 12)
        rib = Pos(x, 26, 12) * Box(6, 20, 32)
        knuckle = Pos(x, 34, 30) * along_x(3.2, 8)
        link = Pos(x, 38, 30) * Box(8, 8, 8)
        piece = pad + rib + knuckle + link
        body = piece if body is None else body + piece
    beam = Pos(0, 42, 30) * Box(88, 6, 8)
    sole = Pos(0, 34, 14) * Box(18, 12, 12) - Pos(0, 34, 14) * along_y(3.0, 18)
    web = Pos(0, 38, 23) * Box(12, 12, 14)
    body = body + beam + sole + web
    for x in (-40, 40):
        body = body - Pos(x, 34, 30) * along_x(1.35, 16)
    return body


def load_hood():
    """닫힌 자세. 경첩 축은 y=34, z=30. 작업자 쪽으로 젖힌다."""
    shell = _cap_shell(HOOD_L, window=False, ceiling_reach=22)
    body = shell
    for x in (-30, 30):
        body = body + Pos(x, 34, 30) * along_x(3.0, 10)
        body = body + Pos(x, 28, 28) * Box(10, 16, 10)
    body = body + Pos(0, 16, 16) * Box(12, 16, 8)
    body = body + Pos(0, 22, 14) * Box(14, 8, 10)
    for x in (-30, 30):
        body = body - Pos(x, 34, 30) * along_x(1.25, 14)
    body = body - Pos(0, 22, 14) * along_y(2.6, 14)
    return body


def drop_on_bed(part):
    box = part.bounding_box()
    return Pos(-box.center().X, -box.center().Y, -box.min.Z) * part


def print_pose(name, part):
    """베드에 넓은 면이 닿게. 구멍은 되도록 수직."""
    if name == "carrier":
        part = Rot(180, 0, 0) * part
    elif name in ("guard-cap", "load-hood", "hood-frame"):
        part = Rot(180, 0, 0) * part
    elif name == "home-flag":
        part = Rot(90, 0, 0) * part
    return drop_on_bed(part)


def write_stl(path, part, tolerance=0.05):
    path.parent.mkdir(parents=True, exist_ok=True)
    ok = export_stl(part, path, tolerance=tolerance, angular_tolerance=0.3)
    if not ok or path.stat().st_size < 200:
        raise SystemExit(f"STL export failed: {path}")
    count = struct.unpack_from("<I", path.read_bytes(), 80)[0]
    if count < 4:
        raise SystemExit(f"STL has no triangles: {path}")


def puck_top_z():
    return Z_AXIS + PITCH_R + OUTWARD


def station_s(index):
    return PHASE + index * BAR_PITCH


def station_x(index):
    x, _z, _tx, _tz, _ox, _oz = chain_local(station_s(index))
    return frame_origin() + x


def assembly_parts():
    parts = []
    parts.append(tag(rail_x(FRAME_W, 0, RAIL_Y_REAR), "rail-rear"))
    parts.append(tag(rail_x(FRAME_W, 0, RAIL_Y_FRONT), "rail-front"))

    left = frame_origin()
    right = left + CENTER_DIST
    parts.append(tag(bridge_y(left), "bridge-left"))
    parts.append(tag(bridge_y(right + 58), "bridge-right"))

    parts.append(tag(Pos(left, 0, Z_AXIS) * shaft(), "shaft"))
    parts.append(tag(Pos(left, 0, Z_AXIS) * sprocket(), "sprocket-idler"))
    parts.append(tag(Pos(right, 0, Z_AXIS) * sprocket(), "sprocket-drive"))

    for y in (REAR_RAIL_CENTER_Y, FRONT_RAIL_CENTER_Y):
        side = "rear" if y < 0 else "front"
        parts.append(tag(Pos(left, y, RAIL + PEDESTAL_H) * kp08(), f"kp08-{side}"))
        for sign, end in ((-1, "minus"), (1, "plus")):
            parts.append(
                tag(
                    Pos(left + sign * KP_BOLT / 2, y, RAIL) * pedestal(),
                    f"pedestal-{side}-{end}",
                )
            )

    motor_y = -18.0
    parts.append(tag(Pos(right, motor_y, Z_AXIS) * motor_body(), "nema17"))
    parts.append(tag(Pos(right, -4.0, Z_AXIS) * Rot(90, 0, 0) * hub_adapter(), "hub-adapter"))
    post = Pos(right + 40, RAIL_Y_REAR + RAIL / 2, 70) * Box(20, 20, 140)
    parts.append(tag(post, "motor-post"))
    bracket = Pos(right + 22, -28, Z_AXIS) * Box(36, 4, 50)
    bracket = bracket - Pos(right, -28, Z_AXIS) * along_y(12, 12)
    parts.append(tag(bracket, "motor-bracket"))

    puck_local = Pos(0, 0, BODY_TOP) * hex_puck()
    pin_local = []
    for x in (-CHAIN_PITCH / 2, CHAIN_PITCH / 2):
        pin_local.append(Pos(x, 0, 0) * dog_pin())
    dowel_local = Pos(DOWEL_X, 0, BODY_TOP - 2.5) * dowel()

    for i in range(BAR_COUNT):
        s = station_s(i)
        parts.append(tag(place(carrier(), s), f"carrier-{i + 1}"))
        parts.append(tag(place(puck_local, s), f"hex-puck-{i + 1}"))
        for n, pin in enumerate(pin_local):
            parts.append(tag(place(pin, s), f"dog-pin-{i + 1}-{n + 1}"))
        parts.append(tag(place(dowel_local, s), f"dowel-{i + 1}"))

    flag_i = 4  # 아래 직선 한가운데
    flag = place(home_flag(), station_s(flag_i))
    parts.append(tag(flag, "home-flag"))
    flag_box = flag.bounding_box()
    parts.append(
        tag(
            Pos(flag_box.center().X, FRONT_RAIL_CENTER_Y, RAIL) * home_bracket(),
            "home-bracket",
        )
    )

    cap_z = puck_top_z()
    parts.append(tag(Pos(station_x(1), 0, cap_z) * guard_cap(), "guard-cap"))
    parts.append(tag(Pos(station_x(0), 0, cap_z) * hood_frame(), "hood-frame"))
    parts.append(tag(Pos(station_x(0), 0, cap_z) * load_hood(), "load-hood"))
    for x, name in (
        (station_x(1) - 38, "standoff-guard-a"),
        (station_x(1) + 38, "standoff-guard-b"),
        (station_x(0) - 40, "standoff-hood-a"),
        (station_x(0) + 40, "standoff-hood-b"),
    ):
        parts.append(tag(Pos(x, FRONT_RAIL_CENTER_Y, RAIL) * standoff(), name))

    for sign, name in ((-1, "hinge-pin-a"), (1, "hinge-pin-b")):
        parts.append(
            tag(
                Pos(station_x(0) + sign * 35.5, 34, cap_z + 30) * along_x(1.0, 22),
                name,
            )
        )
    parts.append(tag(Pos(120, 44, 26) * Cylinder(8, 14), "ready-button"))

    aim_z = Z_AXIS + PITCH_R + AIM_ABOVE
    lens_y = -POCKET_AF / 2 - WORK_DIST
    parts.append(
        tag(
            Pos(station_x(1), lens_y - SCOPE_D / 2, aim_z) * scope_body(),
            "um20",
        )
    )

    parts.append(tag(Pos(station_x(2), 78, RAIL) * envelope_jig(), "envelope-jig"))
    parts.append(tag(Pos(station_x(2) - 86, 78, RAIL) * reject_cup(), "reject-cup"))

    # 3번 센서는 벽 쪽, 손은 작업자 쪽.
    parts.append(tag(Pos(station_x(2) - 8, -24, cap_z - 6) * Rot(0, 0, 180) * sensor_holder(), "sensor-unload"))
    return parts


def bbox_of(part):
    box = part.bounding_box()
    return (box.min.X, box.min.Y, box.min.Z, box.max.X, box.max.Y, box.max.Z)


def intersection_volume(a, b):
    hit = a.intersect(b)
    if hit is None:
        return 0.0
    return float(hit.volume)


def gap_between(a, b):
    """음수면 겹친다. 축정렬 상자 기준."""
    gaps = []
    for i in range(3):
        gaps.append(max(a[i] - b[i + 3], b[i] - a[i + 3]))
    return max(gaps)


def assert_geometry(parts):
    by = {part.label: part for part in parts}

    poses = [chain_local(station_s(i)) for i in range(3)]
    for pose in poses:
        if pose[5] < 0.99:
            raise SystemExit(f"station not on top straight: {pose}")
    if abs((poses[0][0] - poses[1][0]) - BAR_PITCH) > 1e-6:
        raise SystemExit("station pitch is not one bar")
    reach = station_x(0) - station_x(2)
    if abs(reach - 2 * BAR_PITCH) > 0.1:
        raise SystemExit(f"reach {reach}")

    marker = place(Pos(0, 8, 4) * Box(0.4, 0.4, 0.4), station_s(0))
    if marker.bounding_box().center().Y < 1:
        raise SystemExit("carrier +Y does not face the operator")

    prism = hex_prism(POCKET_AF, 1)
    span_y = prism.bounding_box().max.Y - prism.bounding_box().min.Y
    if abs(span_y - POCKET_AF) > 0.05:
        raise SystemExit(f"hex across flats is {span_y}")

    for i in range(BAR_COUNT):
        puck = by[f"hex-puck-{i + 1}"]
        if puck.bounding_box().min.Z < 12:
            raise SystemExit(f"puck {i + 1} too low: {puck.bounding_box().min.Z}")

    # 스프로킷을 도는 캐리어 바깥이 브리지 윗면(40)보다 높아야 한다.
    wrap_bottom = Z_AXIS - (PITCH_R + OUTWARD)
    if wrap_bottom < 48:
        raise SystemExit(f"carrier hits the bridge: bottom {wrap_bottom:.1f}")

    pairs = (
        ("um20", "guard-cap", 2),
        ("um20", "rail-rear", 2),
        ("envelope-jig", "guard-cap", 2),
        ("envelope-jig", "reject-cup", 8),
        ("guard-cap", "load-hood", 1),
        ("standoff-hood-b", "bridge-right", 1),
        ("motor-post", "nema17", 1),
    )
    boxes = {name: bbox_of(part) for name, part in by.items()}
    for left_name, right_name, minimum in pairs:
        gap = gap_between(boxes[left_name], boxes[right_name])
        if gap < minimum:
            raise SystemExit(f"{left_name} vs {right_name} gap {gap:.1f} < {minimum}")

    hood_hit = intersection_volume(by["load-hood"], by["hood-frame"])
    if hood_hit > 5:
        raise SystemExit(f"hood intersects frame by {hood_hit:.1f} mm3")
    for step in range(12):
        s = step * CHAIN_LEN / 12.0
        moving = (
            ("carrier", place(carrier(), s)),
            ("puck", place(Pos(0, 0, BODY_TOP) * hex_puck(), s)),
            ("flag", place(home_flag(), s)),
        )
        for label, solid in moving:
            for name in ("guard-cap", "load-hood", "hood-frame", "home-bracket", "um20", "nema17"):
                overlap = intersection_volume(solid, by[name])
                if overlap > 2:
                    raise SystemExit(f"{label} at s={s:.0f} hits {name} by {overlap:.1f} mm3")

    for name in ("nema17", "sprocket-drive", "carrier-1", "hex-puck-1"):
        overlap = intersection_volume(by["load-hood"], by[name])
        if overlap > 1:
            raise SystemExit(f"load-hood intersects {name} by {overlap:.1f} mm3")
    for name in ("carrier-2", "hex-puck-2", "um20"):
        overlap = intersection_volume(by["guard-cap"], by[name])
        if overlap > 1:
            raise SystemExit(f"guard-cap intersects {name} by {overlap:.1f} mm3")

    # 카메라 창. 각인 높이의 가는 상자가 가드와 거의 겹치지 않아야 한다.
    aim_z = Z_AXIS + PITCH_R + AIM_ABOVE
    probe = Pos(station_x(1), -8, aim_z) * Box(3, 16, 3)
    hit = by["guard-cap"].intersect(probe)
    volume = 0 if hit is None else hit.volume
    if volume > 8:
        raise SystemExit(f"camera window blocked, overlap {volume:.1f} mm3")

    jig = boxes["envelope-jig"]
    cup = boxes["reject-cup"]
    if jig[0] - cup[3] < 20:
        raise SystemExit("reject cup is too close to the envelope jig")

    scope = boxes["um20"]
    if scope[4] > -30:
        raise SystemExit("scope intrudes into the operator side")

    return {
        "reachMm": round(reach, 2),
        "wrapClearanceMm": round(wrap_bottom - 40, 2),
        "cameraGapMm3": round(volume, 2),
    }


def resin_parts():
    return {
        "carrier": carrier(),
        "home-flag": home_flag(),
        "sensor-holder": sensor_holder(),
        "envelope-jig": envelope_jig(),
        "reject-cup": reject_cup(),
        "guard-cap": guard_cap(),
        "hood-frame": hood_frame(),
        "load-hood": load_hood(),
        "home-bracket": home_bracket(),
    }


def lathe_parts():
    return {
        "hex-puck": hex_puck(),
        "dog-pin": dog_pin(),
        "dowel": dowel(),
        "pedestal": pedestal(),
        "standoff": standoff(),
        "hub-adapter": hub_adapter(),
        "hinge-pin": hinge_pin(),
    }


def draw_svg(checks):
    left = frame_origin()
    right = left + CENTER_DIST
    xs = [station_x(i) for i in range(3)]
    names = ("1 꽂기", "2 촬영", "3 담기")

    def side():
        w, h = 980, 460
        sx, sy, scale = 70, 390, 1.7

        def X(x):
            return sx + x * scale

        def Z(z):
            return sy - z * scale

        lines = [
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}">',
            '<rect width="100%" height="100%" fill="#ffffff"/>',
            '<g fill="none" stroke="#222" stroke-width="1.4">',
            f'<rect x="{X(0):.1f}" y="{Z(RAIL):.1f}" width="{FRAME_W * scale:.1f}" height="{RAIL * scale:.1f}"/>',
        ]
        for cx in (left, right):
            lines.append(f'<circle cx="{X(cx):.1f}" cy="{Z(Z_AXIS):.1f}" r="{PITCH_R * scale:.1f}"/>')
            lines.append(f'<circle cx="{X(cx):.1f}" cy="{Z(Z_AXIS):.1f}" r="{(OD / 2) * scale:.1f}"/>')
        top = Z(Z_AXIS + PITCH_R)
        bot = Z(Z_AXIS - PITCH_R)
        lines.append(f'<line x1="{X(left):.1f}" y1="{top:.1f}" x2="{X(right):.1f}" y2="{top:.1f}"/>')
        lines.append(f'<line x1="{X(left):.1f}" y1="{bot:.1f}" x2="{X(right):.1f}" y2="{bot:.1f}"/>')
        lines.append("</g>")
        lines.append('<g fill="#c45c00">')
        for x in xs:
            lines.append(f'<circle cx="{X(x):.1f}" cy="{Z(puck_top_z()):.1f}" r="4"/>')
        lines.append("</g>")
        lines.append('<g font-family="sans-serif" font-size="14" fill="#222">')
        for x, name in zip(xs, names):
            lines.append(f'<text x="{X(x):.1f}" y="{Z(puck_top_z()) - 14:.1f}" text-anchor="middle">{name}</text>')
        lines.append(
            f'<text x="{X(FRAME_W / 2):.1f}" y="{Z(-6):.1f}" text-anchor="middle">폭 {FRAME_W:.0f} mm · 축 높이 {Z_AXIS:.0f} mm</text>'
        )
        lines.append(
            f'<text x="{X(xs[0]):.1f}" y="28" text-anchor="middle">오른쪽이 1번 · 한 칸 {BAR_PITCH:.1f} mm</text>'
        )
        lines.append("</g></svg>")
        (OUT / "drawing-side.svg").write_text("\n".join(lines), encoding="utf-8")

    def top():
        w, h = 980, 520
        sx, sy, scale = 70, 250, 1.7

        def X(x):
            return sx + x * scale

        def Y(y):
            return sy - y * scale

        aim_y = -POCKET_AF / 2 - WORK_DIST
        lines = [
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}">',
            '<rect width="100%" height="100%" fill="#ffffff"/>',
            f'<rect x="{X(0):.1f}" y="{Y(RAIL_Y_FRONT + RAIL):.1f}" width="{FRAME_W * scale:.1f}" height="{((RAIL_Y_FRONT + RAIL) - RAIL_Y_REAR) * scale:.1f}" fill="none" stroke="#222"/>',
            f'<rect x="{X(xs[1] - SCOPE_W / 2):.1f}" y="{Y(aim_y - SCOPE_D):.1f}" width="{SCOPE_W * scale:.1f}" height="{SCOPE_D * scale:.1f}" fill="none" stroke="#0b57d0"/>',
            f'<rect x="{X(xs[1] - GUARD_L / 2):.1f}" y="{Y(16):.1f}" width="{GUARD_L * scale:.1f}" height="{28 * scale:.1f}" fill="none" stroke="#0b57d0"/>',
            f'<rect x="{X(xs[0] - HOOD_L / 2):.1f}" y="{Y(16):.1f}" width="{HOOD_L * scale:.1f}" height="{28 * scale:.1f}" fill="none" stroke="#b45309"/>',
            f'<rect x="{X(xs[2] - 48):.1f}" y="{Y(78 + 52):.1f}" width="{96 * scale:.1f}" height="{68 * scale:.1f}" fill="none" stroke="#15803d"/>',
            f'<circle cx="{X(xs[2] - 86):.1f}" cy="{Y(78):.1f}" r="{18 * scale:.1f}" fill="none" stroke="#b91c1c"/>',
            '<g fill="#c45c00">',
        ]
        for x in xs:
            lines.append(f'<circle cx="{X(x):.1f}" cy="{Y(0):.1f}" r="4"/>')
        lines.append("</g>")
        lines.append('<g font-family="sans-serif" font-size="14" fill="#222">')
        lines.append(f'<text x="{X(xs[1]):.1f}" y="{Y(aim_y - SCOPE_D) - 8:.1f}" text-anchor="middle">UM20 벽 쪽</text>')
        lines.append(f'<text x="{X(xs[0]):.1f}" y="{Y(20):.1f}" text-anchor="middle">1 후드</text>')
        lines.append(f'<text x="{X(xs[1]):.1f}" y="{Y(20):.1f}" text-anchor="middle">2 가드</text>')
        lines.append(f'<text x="{X(xs[2]):.1f}" y="{Y(150):.1f}" text-anchor="middle">봉투 지그</text>')
        lines.append(f'<text x="{X(xs[2] - 86):.1f}" y="{Y(78) + 28:.1f}" text-anchor="middle">불량컵</text>')
        lines.append(
            f'<text x="{X(200):.1f}" y="32" text-anchor="middle">위가 작업자. 1번과 3번 사이 {checks["reachMm"]:.0f} mm. 손은 앞쪽만 쓴다.</text>'
        )
        lines.append("</g></svg>")
        (OUT / "drawing-top.svg").write_text("\n".join(lines), encoding="utf-8")

    side()
    top()


def render_previews(stl_path):
    data = stl_path.read_bytes()
    count = struct.unpack_from("<I", data, 80)[0]
    tris = []
    off = 84
    for _ in range(count):
        vals = struct.unpack_from("<12fH", data, off)
        tris.append((vals[3:6], vals[6:9], vals[9:12]))
        off += 50

    def paint(path, project, shade_axis, w, h):
        projected = []
        depths = []
        for a, b, c in tris:
            pa, pb, pc = project(a), project(b), project(c)
            depth = (a[shade_axis] + b[shade_axis] + c[shade_axis]) / 3
            depths.append(depth)
            projected.append((depth, pa, pb, pc))
        dmin, dmax = min(depths), max(depths)
        xs = [p[0] for _, pa, pb, pc in projected for p in (pa, pb, pc)]
        ys = [p[1] for _, pa, pb, pc in projected for p in (pa, pb, pc)]
        minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
        pad = 28
        scale = min((w - 2 * pad) / (maxx - minx or 1), (h - 2 * pad) / (maxy - miny or 1))

        def pix(pt):
            return (
                int(pad + (pt[0] - minx) * scale),
                int(h - pad - (pt[1] - miny) * scale),
            )

        img = bytearray(b"\xff" * (w * h * 3))

        def put(x, y, color):
            if 0 <= x < w and 0 <= y < h:
                i = (y * w + x) * 3
                img[i : i + 3] = bytes(color)

        projected.sort(key=lambda item: item[0])
        for depth, a, b, c in projected:
            tone = 55 + int(170 * (depth - dmin) / ((dmax - dmin) or 1))
            color = (tone, tone, tone + 8)
            pa, pb, pc = pix(a), pix(b), pix(c)
            ys_ = sorted((pa[1], pb[1], pc[1]))
            if ys_[2] == ys_[0]:
                continue
            for y in range(ys_[0], ys_[2] + 1):
                xs_at = []
                for p, q in ((pa, pb), (pb, pc), (pc, pa)):
                    if (p[1] <= y <= q[1]) or (q[1] <= y <= p[1]):
                        if p[1] == q[1]:
                            xs_at.extend((p[0], q[0]))
                        else:
                            t = (y - p[1]) / (q[1] - p[1])
                            xs_at.append(int(p[0] + t * (q[0] - p[0])))
                if len(xs_at) < 2:
                    continue
                for x in range(min(xs_at), max(xs_at) + 1):
                    put(x, y, color)
        path.write_bytes(f"P6\n{w} {h}\n255\n".encode() + bytes(img))

    views = ("preview-side", "preview-top", "preview-front")
    paint(OUT / "preview-side.ppm", lambda p: (p[0], p[2]), 1, 960, 420)
    paint(OUT / "preview-top.ppm", lambda p: (p[0], p[1]), 2, 960, 520)
    paint(OUT / "preview-front.ppm", lambda p: (p[1], p[2]), 0, 860, 420)
    sips = __import__("shutil").which("sips")
    if sips:
        for name in views:
            ppm = OUT / f"{name}.ppm"
            png = OUT / f"{name}.png"
            __import__("subprocess").check_call(
                [sips, "-s", "format", "png", str(ppm), "--out", str(png)],
                stdout=__import__("subprocess").DEVNULL,
            )
            ppm.unlink()


def delete_stale():
    stale = [
        "motor-plate",
        "um20-saddle",
        "sensor-bracket",
    ]
    for folder, suffix in ((STL, ".stl"), (OUT / "stp", ".stp")):
        for name in stale:
            path = folder / f"{name}{suffix}"
            if path.exists():
                path.unlink()


def main():
    if abs(BAR_PITCH - 101.6) > 1e-9:
        raise SystemExit("bar pitch")
    if abs(PEDESTAL_H - 49) > 1e-9:
        raise SystemExit("pedestal height")
    if SLOT_W > 13:
        raise SystemExit("slot admits a finger")

    STL.mkdir(parents=True, exist_ok=True)
    resin = resin_parts()
    for name, part in resin.items():
        posed = print_pose(name, part)
        box = posed.bounding_box()
        size = (box.max.X - box.min.X, box.max.Y - box.min.Y, box.max.Z - box.min.Z)
        if max(size) > 130 or sorted(size)[1] > 80:
            raise SystemExit(f"{name} print bbox {tuple(round(v, 1) for v in size)} does not fit 130×80")
        if size[2] > 80:
            raise SystemExit(f"{name} print height {size[2]:.1f}")
        write_stl(STL / f"{name}.stl", posed)

    parts = assembly_parts()
    checks = assert_geometry(parts)
    solid = Compound(children=parts)
    solid.label = "abutment-lot-indexer"
    write_stl(STL / "assembly.stl", solid, tolerance=0.2)
    draw_svg(checks)
    render_previews(STL / "assembly.stl")
    delete_stale()

    left = frame_origin()
    stations = []
    for i, name in enumerate(("load", "photo", "unload")):
        stations.append(
            {
                "name": name,
                "x": round(station_x(i), 2),
                "pitchZ": round(Z_AXIS + PITCH_R, 2),
                "puckTopZ": round(puck_top_z(), 2),
                "aimZ": round(Z_AXIS + PITCH_R + AIM_ABOVE, 2),
            }
        )
    data = {
        "chainPitchMm": CHAIN_PITCH,
        "linksPerBar": LINKS_PER_BAR,
        "barPitchMm": BAR_PITCH,
        "barCount": BAR_COUNT,
        "chainLengthMm": round(CHAIN_LEN, 3),
        "sprocketTeeth": SPROCKET_TEETH,
        "pitchDiameterMm": round(PITCH_DIA, 3),
        "outsideDiameterMm": round(OD, 3),
        "centerDistanceMm": round(CENTER_DIST, 3),
        "frameWidthMm": FRAME_W,
        "shaftHeightMm": Z_AXIS,
        "pedestalMm": PEDESTAL_H,
        "indexTurns": 1,
        "hexAfMm": HEX_AF,
        "pocketAfMm": POCKET_AF,
        "pocketDepthMm": POCKET_DEPTH,
        "slotWidthMm": SLOT_W,
        "bagMouthMm": BAG_MOUTH,
        "scopeMm": [SCOPE_W, SCOPE_D, SCOPE_H],
        "workingDistanceMm": WORK_DIST,
        "stations": stations,
        "idlerX": round(left, 2),
        "driveX": round(left + CENTER_DIST, 2),
        "checks": checks,
    }
    (OUT / "dimensions.json").write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(data, indent=2))


if __name__ == "__main__":
    main()
