# 세 칸 각인 인덱서 STEP. 단위 mm, AP214 솔리드.
# 라이노·인벤터가 연다. STL 메시를 그대로 감싸지 않는다.
# 재생: /tmp/indexer-cad-venv/bin/python export_step.py

import math
from pathlib import Path

from build123d import Box, Compound, Cylinder, Plane, Pos, RegularPolygon, Rot, export_step, extrude

from build_model import (
    AIM_ABOVE,
    BAR_COUNT,
    BAR_PITCH,
    BODY_H,
    BODY_TOP,
    BODY_Z0,
    CENTER_DIST,
    CHAIN_PITCH,
    FRAME_H,
    FRAME_W,
    OD,
    PHASE,
    POCKET_AF,
    POCKET_DEPTH,
    PUCK_H,
    PUCK_R,
    SCOPE_D,
    SCOPE_H,
    SCOPE_W,
    SCREW_DX,
    SPROCKET_TEETH,
    WORK_DIST,
    Z_AXIS,
    chain_local,
    frame_origin,
)

OUT = Path(__file__).resolve().parent / "stp"


def corner_box(sx, sy, sz, x, y, z):
    return Pos(x + sx / 2, y + sy / 2, z + sz / 2) * Box(sx, sy, sz)


def z_cyl(radius, height, z0):
    return Pos(0, 0, z0 + height / 2) * Cylinder(radius, height)


def hex_prism(across_flats, height):
    sketch = RegularPolygon(
        radius=across_flats / math.sqrt(3),
        side_count=6,
        major_radius=True,
    )
    return extrude(sketch, amount=height)


def carrier():
    body = Pos(0, 0, BODY_Z0 + BODY_H / 2) * Box(18, 16, BODY_H)
    for x in (-CHAIN_PITCH / 2, CHAIN_PITCH / 2):
        body = body + Pos(x, 0, 1.6) * Box(2.0, 2.6, 4.6)
    for x in (-SCREW_DX, SCREW_DX):
        body = body - Pos(x, 0, 8) * Cylinder(1.6, 30)
    return body


def hex_puck():
    puck = z_cyl(PUCK_R, PUCK_H, 0)
    pocket = Pos(0, 0, PUCK_H - POCKET_DEPTH) * hex_prism(POCKET_AF, POCKET_DEPTH + 0.2)
    puck = puck - pocket
    for x in (-SCREW_DX, SCREW_DX):
        puck = puck - Pos(x, 0, 2.5) * Cylinder(1.25, 5.4)
    return puck


def sprocket():
    disk = Cylinder(OD / 2 - 0.6, 3.2)
    body = disk - Cylinder(4.0, 6)
    for i in range(SPROCKET_TEETH):
        tooth = Pos(OD / 2 - 0.7, 0, 0) * Box(2.4, OD * 0.22, 3.2)
        body = body + Rot(0, 0, i * (360 / SPROCKET_TEETH)) * tooth
    return Rot(90, 0, 0) * body


def shaft():
    return Rot(90, 0, 0) * Cylinder(4, 100)


def motor():
    body = Box(42.3, 42.3, 40)
    boss = Pos(0, 0, 21) * Cylinder(11, 2)
    return Rot(90, 0, 0) * (body + boss)


def motor_plate():
    plate = Pos(0, 0, 2.5) * Box(64, 64, 5)
    plate = plate - Pos(0, 0, 2.5) * Cylinder(11.5, 8)
    for sx in (-15.5, 15.5):
        for sy in (-15.5, 15.5):
            plate = plate - Pos(sx, sy, 2.5) * Box(8, 3.4, 8)
    return plate


def scope_body():
    return Box(SCOPE_W, SCOPE_D, SCOPE_H)


def saddle():
    outer = Pos(0, 0, 18) * Box(124, 46, 36)
    pocket = Pos(0, 4, 26) * Box(108, 50, 28)
    return outer - pocket


def sensor_bracket():
    foot = corner_box(16, 28, 4, 0, 0, 0)
    stem = corner_box(16, 4, 28, 0, 24, 0)
    return foot + stem


def frame_parts():
    return [
        ("frame-rail-far", corner_box(FRAME_W, 20, 20, 0, -40, 0)),
        ("frame-rail-near", corner_box(FRAME_W, 20, 20, 0, 20, 0)),
        ("frame-end-left", corner_box(20, 80, 20, 0, -40, 0)),
        ("frame-end-right", corner_box(20, 80, 20, FRAME_W - 20, -40, 0)),
    ]


def riser(x, y):
    block = corner_box(28, 20, 64, -14, 0, FRAME_H)
    hole = Pos(0, 10, Z_AXIS) * Rot(90, 0, 0) * Cylinder(4.2, 24)
    return Pos(x, y, 0) * (block - hole)


def place(part, s, y=0.0):
    """로컬 +Z = 바깥, 로컬 +Y = 작업자. Plane의 Y가 반대라 접선 부호를 뒤집는다."""
    x, z, tx, tz, ox, oz = chain_local(s)
    origin = frame_origin()
    plane = Plane(
        origin=(origin + x, y, Z_AXIS + z),
        x_dir=(-tx, 0.0, -tz),
        z_dir=(ox, 0.0, oz),
    )
    return plane.location * part


def label(part, name):
    part.label = name
    return part


def assembly_solids():
    solids = []
    for name, part in frame_parts():
        solids.append(label(part, name))
    origin = frame_origin()
    for side, cx in (("left", origin), ("right", origin + CENTER_DIST)):
        solids.append(label(Pos(cx, 0, Z_AXIS) * sprocket(), f"sprocket-{side}"))
        solids.append(label(Pos(cx, 0, Z_AXIS) * shaft(), f"shaft-{side}"))
        solids.append(label(riser(cx, -40), f"riser-{side}-far"))
        solids.append(label(riser(cx, 20), f"riser-{side}-near"))

    puck_local = Pos(0, 0, BODY_TOP) * hex_puck()
    for i in range(BAR_COUNT):
        s = PHASE + i * BAR_PITCH
        placed_carrier = place(carrier(), s)
        placed_puck = place(puck_local, s)
        if placed_carrier.bounding_box().min.Z < 8 or placed_puck.bounding_box().min.Z < 8:
            raise SystemExit(f"bar {i} too low")
        solids.append(label(placed_carrier, f"carrier-{i + 1}"))
        solids.append(label(placed_puck, f"hex-puck-{i + 1}"))

    s2 = chain_local(PHASE + BAR_PITCH)
    s3 = chain_local(PHASE + 2 * BAR_PITCH)
    x2 = origin + s2[0]
    z_aim = Z_AXIS + s2[1] + AIM_ABOVE
    lens_y = POCKET_AF / 2 + WORK_DIST
    scope_bottom = z_aim - SCOPE_H / 2
    solids.append(label(Pos(x2, lens_y + SCOPE_D / 2, z_aim) * scope_body(), "um20"))
    solids.append(
        label(
            corner_box(36, lens_y + 60, 16, x2 - 18, 20, scope_bottom - 16),
            "scope-arm",
        )
    )
    solids.append(label(Pos(x2, lens_y + 36, scope_bottom - 36) * saddle(), "um20-saddle"))

    x3 = origin + s3[0]
    z3 = Z_AXIS + s3[1] + BODY_TOP + PUCK_H * 0.5
    solids.append(label(Pos(x3 - 8, -36, z3 - 8) * sensor_bracket(), "sensor-bracket"))

    right = origin + CENTER_DIST
    solids.append(
        label(Pos(right, -36, Z_AXIS) * Rot(90, 0, 0) * motor_plate(), "motor-plate")
    )
    solids.append(label(Pos(right, -62, Z_AXIS) * motor(), "nema17"))
    return solids


def save(part, name):
    path = OUT / name
    part.label = path.stem
    ok = export_step(part, path)
    if not ok or path.stat().st_size < 2000:
        raise SystemExit(f"STEP export failed: {path}")
    text = path.read_text(errors="ignore")
    if "ISO-10303-21" not in text or "MILLI" not in text or "METRE" not in text:
        raise SystemExit(f"STEP header is not millimetre AP: {path}")
    if "MANIFOLD_SOLID_BREP" not in text and "ADVANCED_BREP_SHAPE_REPRESENTATION" not in text:
        raise SystemExit(f"STEP is not a solid: {path}")
    return path


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    marker = place(Pos(0, 5, 2) * Box(0.2, 0.2, 0.2), PHASE)
    if marker.bounding_box().center().Y < 1:
        raise SystemExit("carrier +Y does not face the operator")
    prism = hex_prism(POCKET_AF, 1)
    span_y = prism.bounding_box().max.Y - prism.bounding_box().min.Y
    if abs(span_y - POCKET_AF) > 0.05:
        raise SystemExit(f"hex across flats is {span_y}, expected {POCKET_AF}")

    paths = [
        save(carrier(), "carrier.stp"),
        save(hex_puck(), "hex-puck.stp"),
        save(saddle(), "um20-saddle.stp"),
        save(sensor_bracket(), "sensor-bracket.stp"),
        save(motor_plate(), "motor-plate.stp"),
        save(sprocket(), "sprocket.stp"),
    ]
    asm = Compound(children=assembly_solids())
    asm.label = "abutment-lot-indexer"
    paths.append(save(asm, "assembly.stp"))
    for path in paths:
        print(f"{path.name}\t{path.stat().st_size}")


if __name__ == "__main__":
    main()
