# 세 칸 각인 인덱서 3D 모델.
# 출력: stl/*.stl, drawing-side.svg, drawing-top.svg, dimensions.json
# 재생: /tmp/indexer-cad-venv/bin/python build_model.py
#       (venv에 manifold3d 필요)

import json
import math
import struct
from pathlib import Path

from manifold3d import Manifold

OUT = Path(__file__).resolve().parent
STL = OUT / "stl"

# #25 체인. 피치 6.35mm, 24링크 = 바 간격.
CHAIN_PITCH = 6.35
LINKS_PER_BAR = 24
BAR_PITCH = CHAIN_PITCH * LINKS_PER_BAR  # 152.4
BAR_COUNT = 6
CHAIN_LEN = BAR_PITCH * BAR_COUNT  # 914.4
SPROCKET_TEETH = 16
# 피치원 지름 = pitch / sin(pi/N)
PITCH_DIA = CHAIN_PITCH / math.sin(math.pi / SPROCKET_TEETH)
PITCH_R = PITCH_DIA / 2
# 바깥 지름. 표준식 pitch * (0.6 + cot(pi/N))
OD = CHAIN_PITCH * (0.6 + 1 / math.tan(math.pi / SPROCKET_TEETH))
CENTER_DIST = (CHAIN_LEN - math.pi * PITCH_DIA) / 2
FRAME_W = 500.0
PHASE = 16.0  # 오른쪽 접선에서 1번 바까지, mm

# 헥스 포켓. 외부 육각이 닿는 깊이만 두고, 각인은 그 위에 남긴다.
HEX_AF = 2.50
POCKET_AF = 2.60  # 끼워맞춤 여유
POCKET_DEPTH = 0.8
PUCK_H = 8.0
PUCK_R = 6.0
SCREW_DX = 5.0

# 캐리어. 로컬 +Z 가 바의 바깥 방향.
BODY_Z0 = 3.2
BODY_H = 8.0
BODY_TOP = BODY_Z0 + BODY_H

# 스프로킷 축 높이. 아래 복귀 바가 바닥에 닿지 않게.
Z_AXIS = 70.0
FRAME_H = 20.0

# UM20. 설명서 106(L)×106(W)×152(T) mm. 작동거리 22–214mm.
SCOPE_W = 106.0
SCOPE_D = 152.0
SCOPE_H = 106.0
WORK_DIST = 40.0
# 포켓 림 위 1mm 를 광축으로 본다.
AIM_ABOVE = BODY_TOP + PUCK_H + 1.0


def write_stl(path, solid):
    mesh = solid.to_mesh()
    verts = mesh.vert_properties
    tris = mesh.tri_verts
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as f:
        f.write(b"abutment lot indexer".ljust(80, b" ")[:80])
        f.write(struct.pack("<I", len(tris)))
        for tri in tris:
            p = [verts[int(i)] for i in tri]
            ax, ay, az = p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]
            bx, by, bz = p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]
            nx, ny, nz = ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx
            norm = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
            f.write(struct.pack("<3f", nx / norm, ny / norm, nz / norm))
            for pt in p:
                f.write(struct.pack("<3f", float(pt[0]), float(pt[1]), float(pt[2])))
            f.write(struct.pack("<H", 0))


def chain_local(s):
    """체인 좌표. 왼쪽 스프로킷 중심이 x=0, 오른쪽이 x=C. s=0 은 오른쪽 위 접선."""
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
    x, z, tx, tz, ox, oz = chain_local(s)
    yy = tz * ox - tx * oz
    origin = frame_origin()
    return part.transform(
        (
            (tx, 0.0, ox, origin + x),
            (0.0, yy, 0.0, y),
            (tz, 0.0, oz, Z_AXIS + z),
        )
    )


def carrier():
    body = Manifold.cube((18, 16, BODY_H), center=True).translate((0, 0, BODY_Z0 + BODY_H / 2))
    for x in (-CHAIN_PITCH / 2, CHAIN_PITCH / 2):
        rib = Manifold.cube((2.0, 2.6, 4.6), center=True).translate((x, 0, 1.6))
        body = body + rib
    for x in (-SCREW_DX, SCREW_DX):
        hole = Manifold.cylinder(30, 1.6, circular_segments=24).translate((x, 0, -4))
        body = body - hole
    return body


def hex_puck():
    puck = Manifold.cylinder(PUCK_H, PUCK_R, circular_segments=48)
    pocket_r = POCKET_AF / math.sqrt(3)
    pocket = Manifold.cylinder(POCKET_DEPTH + 0.2, pocket_r, circular_segments=6).translate(
        (0, 0, PUCK_H - POCKET_DEPTH)
    )
    puck = puck - pocket
    for x in (-SCREW_DX, SCREW_DX):
        drill = Manifold.cylinder(5.2, 1.25, circular_segments=20).translate((x, 0, -0.1))
        puck = puck - drill
    return puck


def orient_print(part):
    flipped = part.scale((1, 1, -1))
    box = flipped.bounding_box()
    return flipped.translate((-0.5 * (box[0] + box[3]), -0.5 * (box[1] + box[4]), -box[2]))


def sprocket():
    disk = Manifold.cylinder(3.2, OD / 2 - 0.6, circular_segments=64, center=True)
    bore = Manifold.cylinder(6, 4.0, circular_segments=32, center=True)
    body = disk - bore
    for i in range(SPROCKET_TEETH):
        tooth = Manifold.cube((2.4, OD * 0.22, 3.2), center=True).translate((OD / 2 - 0.7, 0, 0))
        body = body + tooth.rotate((0, 0, i * (360 / SPROCKET_TEETH)))
    return body.rotate((90, 0, 0))


def extrusion(length, axis):
    if axis == "x":
        return Manifold.cube((length, 20, 20))
    if axis == "y":
        return Manifold.cube((20, length, 20))
    return Manifold.cube((20, 20, length))


def shaft():
    return Manifold.cylinder(100, 4, circular_segments=32, center=True).rotate((90, 0, 0))


def motor():
    body = Manifold.cube((42.3, 42.3, 40), center=True)
    boss = Manifold.cylinder(2, 11, circular_segments=32).translate((0, 0, 20))
    return (body + boss).rotate((90, 0, 0))


def motor_plate():
    plate = Manifold.cube((64, 64, 5), center=True).translate((0, 0, 2.5))
    plate = plate - Manifold.cylinder(8, 11.5, circular_segments=40).translate((0, 0, -1))
    for sx in (-15.5, 15.5):
        for sy in (-15.5, 15.5):
            slot = Manifold.cube((8, 3.4, 8), center=True).translate((sx, sy, 2.5))
            plate = plate - slot
    return plate


def scope_body():
    return Manifold.cube((SCOPE_W, SCOPE_D, SCOPE_H), center=True)


def saddle():
    """UM20 아래 받침대. 안쪽 폭 108mm."""
    outer = Manifold.cube((124, 46, 36), center=True).translate((0, 0, 18))
    pocket = Manifold.cube((108, 50, 28), center=True).translate((0, 4, 26))
    return outer - pocket


def sensor_bracket():
    foot = Manifold.cube((16, 28, 4))
    stem = Manifold.cube((16, 4, 28)).translate((0, 24, 0))
    return foot + stem


def frame():
    parts = []
    parts.append(extrusion(FRAME_W, "x").translate((0, -40, 0)))
    parts.append(extrusion(FRAME_W, "x").translate((0, 20, 0)))
    parts.append(extrusion(80, "y").translate((0, -40, 0)))
    parts.append(extrusion(80, "y").translate((FRAME_W - 20, -40, 0)))
    return parts


def riser(x, y):
    block = Manifold.cube((28, 20, 64)).translate((-14, 0, FRAME_H))
    hole = Manifold.cylinder(24, 4.2, circular_segments=24, center=True).rotate((90, 0, 0))
    hole = hole.translate((0, 10, Z_AXIS))
    return (block - hole).translate((x, y, 0))


def assembly():
    parts = frame()
    origin = frame_origin()
    for cx in (origin, origin + CENTER_DIST):
        parts.append(sprocket().translate((cx, 0, Z_AXIS)))
        parts.append(shaft().translate((cx, 0, Z_AXIS)))
        parts.append(riser(cx, -40))
        parts.append(riser(cx, 20))

    unit = carrier() + hex_puck().translate((0, 0, BODY_TOP))
    for i in range(BAR_COUNT):
        placed = place(unit, PHASE + i * BAR_PITCH)
        box = placed.bounding_box()
        if box[2] < 8:
            raise SystemExit(f"bar {i} too low: {box}")
        parts.append(placed)

    s2 = chain_local(PHASE + BAR_PITCH)
    s3 = chain_local(PHASE + 2 * BAR_PITCH)
    x2 = origin + s2[0]
    z_aim = Z_AXIS + s2[1] + AIM_ABOVE
    lens_y = POCKET_AF / 2 + WORK_DIST
    scope_bottom = z_aim - SCOPE_H / 2
    parts.append(scope_body().translate((x2, lens_y + SCOPE_D / 2, z_aim)))
    # 앞 프로파일에서 현미경 아래로 뻗는 팔. 안장 윗면이 본체 바닥에 닿는다.
    parts.append(
        Manifold.cube((36, lens_y + 80 - 20, 16)).translate((x2 - 18, 20, scope_bottom - 16))
    )
    parts.append(saddle().translate((x2, lens_y + 36, scope_bottom - 36)))

    x3 = origin + s3[0]
    z3 = Z_AXIS + s3[1] + BODY_TOP + PUCK_H * 0.5
    parts.append(sensor_bracket().translate((x3 - 8, -36, z3 - 8)))

    # 모터는 오른쪽 스프로킷의 벽 쪽(-Y).
    right = origin + CENTER_DIST
    parts.append(motor_plate().rotate((90, 0, 0)).translate((right, -36, Z_AXIS)))
    parts.append(motor().translate((right, -62, Z_AXIS)))
    return parts


def draw_svg():
    origin = frame_origin()
    stations = []
    for i, name in enumerate(("1 꽂기", "2 촬영", "3 빼서 담기")):
        x, z, tx, tz, ox, oz = chain_local(PHASE + i * BAR_PITCH)
        stations.append((origin + x, Z_AXIS + z, ox, oz, name))

    def side():
        w, h = 980, 460
        sx = 80
        sy = 360
        scale = 1.55

        def X(x):
            return sx + x * scale

        def Z(z):
            return sy - z * scale

        lines = [
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}">',
            '<rect width="100%" height="100%" fill="#ffffff"/>',
            '<g fill="none" stroke="#222" stroke-width="1.4">',
            f'<rect x="{X(0):.1f}" y="{Z(FRAME_H):.1f}" width="{FRAME_W * scale:.1f}" height="{FRAME_H * scale:.1f}"/>',
        ]
        for cx in (origin, origin + CENTER_DIST):
            lines.append(
                f'<circle cx="{X(cx):.1f}" cy="{Z(Z_AXIS):.1f}" r="{PITCH_R * scale:.1f}"/>'
            )
            lines.append(
                f'<circle cx="{X(cx):.1f}" cy="{Z(Z_AXIS):.1f}" r="{(OD / 2) * scale:.1f}"/>'
            )
        top_y = Z(Z_AXIS + PITCH_R)
        bot_y = Z(Z_AXIS - PITCH_R)
        lines.append(
            f'<line x1="{X(origin):.1f}" y1="{top_y:.1f}" x2="{X(origin + CENTER_DIST):.1f}" y2="{top_y:.1f}"/>'
        )
        lines.append(
            f'<line x1="{X(origin):.1f}" y1="{bot_y:.1f}" x2="{X(origin + CENTER_DIST):.1f}" y2="{bot_y:.1f}"/>'
        )
        lines.append("</g>")
        lines.append('<g stroke="#0b57d0" stroke-width="2" fill="none">')
        for x, z, ox, oz, name in stations:
            x2 = x + ox * 28
            z2 = z + oz * 28
            lines.append(f'<line x1="{X(x):.1f}" y1="{Z(z):.1f}" x2="{X(x2):.1f}" y2="{Z(z2):.1f}"/>')
            lines.append(f'<circle cx="{X(x2):.1f}" cy="{Z(z2):.1f}" r="3" fill="#c45c00" stroke="none"/>')
        lines.append("</g>")
        lines.append('<g font-family="sans-serif" font-size="14" fill="#222">')
        for x, z, ox, oz, name in stations:
            lines.append(
                f'<text x="{X(x + ox * 28):.1f}" y="{Z(z + oz * 28) - 12:.1f}" text-anchor="middle">{name}</text>'
            )
        lines.append(
            f'<text x="{X(FRAME_W / 2):.1f}" y="{Z(-8):.1f}" text-anchor="middle">폭 {FRAME_W:.0f} mm</text>'
        )
        lines.append(
            f'<text x="{X(stations[0][0]):.1f}" y="28" text-anchor="middle">오른쪽이 1번</text>'
        )
        lines.append("</g></svg>")
        (OUT / "drawing-side.svg").write_text("\n".join(lines), encoding="utf-8")

    def top():
        w, h = 980, 420
        sx, sy = 80, 300
        scale = 1.55

        def X(x):
            return sx + x * scale

        def Y(y):
            return sy - y * scale

        s2 = chain_local(PHASE + BAR_PITCH)
        x2 = origin + s2[0]
        lens_y = POCKET_AF / 2 + WORK_DIST
        lines = [
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}">',
            '<rect width="100%" height="100%" fill="#ffffff"/>',
            f'<rect x="{X(0):.1f}" y="{Y(40):.1f}" width="{FRAME_W * scale:.1f}" height="{80 * scale:.1f}" fill="none" stroke="#222"/>',
            '<g fill="#c45c00">',
        ]
        for i in range(3):
            x, z, tx, tz, ox, oz = chain_local(PHASE + i * BAR_PITCH)
            lines.append(f'<circle cx="{X(origin + x):.1f}" cy="{Y(0):.1f}" r="5"/>')
        lines.append("</g>")
        lines.append(
            f'<rect x="{X(x2 - SCOPE_W / 2):.1f}" y="{Y(lens_y + SCOPE_D):.1f}" width="{SCOPE_W * scale:.1f}" height="{SCOPE_D * scale:.1f}" fill="none" stroke="#0b57d0"/>'
        )
        lines.append(
            f'<text x="{X(x2):.1f}" y="{Y(lens_y + SCOPE_D) - 8:.1f}" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#222">UM20</text>'
        )
        lines.append(
            f'<text x="{X(FRAME_W / 2):.1f}" y="36" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#222">위에서 봄. 위쪽이 작업자.</text>'
        )
        lines.append("</svg>")
        (OUT / "drawing-top.svg").write_text("\n".join(lines), encoding="utf-8")

    side()
    top()


def render_previews(stl_path):
    """조립 STL을 옆·위·앞에서 본 음영 그림으로 저장한다."""
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
        scale = min((w - 2 * pad) / (maxx - minx), (h - 2 * pad) / (maxy - miny))

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
            ys_ = sorted([pa[1], pb[1], pc[1]])
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

    render_dir = stl_path.parent.parent
    views = ("preview-side", "preview-top", "preview-front")
    paint(render_dir / "preview-side.ppm", lambda p: (p[0], p[2]), 1, 960, 420)
    paint(render_dir / "preview-top.ppm", lambda p: (p[0], p[1]), 2, 960, 480)
    paint(render_dir / "preview-front.ppm", lambda p: (p[1], p[2]), 0, 720, 420)
    sips = __import__("shutil").which("sips")
    if sips:
        for name in views:
            ppm = render_dir / f"{name}.ppm"
            png = render_dir / f"{name}.png"
            __import__("subprocess").check_call(
                [sips, "-s", "format", "png", str(ppm), "--out", str(png)],
                stdout=__import__("subprocess").DEVNULL,
            )
            ppm.unlink()


def main():
    assert abs(BAR_PITCH - 152.4) < 1e-9
    assert abs(CHAIN_LEN - 914.4) < 1e-6
    span = CENTER_DIST + PITCH_DIA
    assert 430 < span < 460, span
    poses = [chain_local(PHASE + i * BAR_PITCH) for i in range(3)]
    for pose in poses:
        assert pose[5] > 0.99, pose
    assert abs((poses[0][0] - poses[1][0]) - BAR_PITCH) < 1e-6
    assert abs((poses[1][0] - poses[2][0]) - BAR_PITCH) < 1e-6

    STL.mkdir(parents=True, exist_ok=True)
    write_stl(STL / "carrier.stl", orient_print(carrier()))
    write_stl(STL / "hex-puck.stl", hex_puck())
    write_stl(STL / "um20-saddle.stl", saddle())
    write_stl(STL / "sensor-bracket.stl", sensor_bracket())
    write_stl(STL / "motor-plate.stl", motor_plate())

    parts = assembly()
    solid = parts[0]
    for part in parts[1:]:
        solid = solid + part
    box = solid.bounding_box()
    assert box[2] >= -0.01, box
    write_stl(STL / "assembly.stl", solid)
    draw_svg()
    render_previews(STL / "assembly.stl")

    origin = frame_origin()
    stations = []
    for i, name in enumerate(("load", "photo", "unload")):
        x, z, tx, tz, ox, oz = chain_local(PHASE + i * BAR_PITCH)
        stations.append(
            {
                "name": name,
                "x": round(origin + x, 2),
                "pitchZ": round(Z_AXIS + z, 2),
                "aimZ": round(Z_AXIS + z + AIM_ABOVE, 2),
            }
        )
    data = {
        "chainPitchMm": CHAIN_PITCH,
        "linksPerBar": LINKS_PER_BAR,
        "barPitchMm": BAR_PITCH,
        "barCount": BAR_COUNT,
        "chainLengthMm": CHAIN_LEN,
        "sprocketTeeth": SPROCKET_TEETH,
        "pitchDiameterMm": round(PITCH_DIA, 3),
        "outsideDiameterMm": round(OD, 3),
        "centerDistanceMm": round(CENTER_DIST, 3),
        "outerSpanMm": round(span, 3),
        "frameWidthMm": FRAME_W,
        "shaftHeightMm": Z_AXIS,
        "hexAfMm": HEX_AF,
        "pocketAfMm": POCKET_AF,
        "pocketDepthMm": POCKET_DEPTH,
        "puckHeightMm": PUCK_H,
        "scopeMm": [SCOPE_W, SCOPE_D, SCOPE_H],
        "workingDistanceMm": WORK_DIST,
        "stations": stations,
        "assemblyBboxMm": [round(v, 2) for v in box],
        "stlTriangles": solid.num_tri(),
    }
    (OUT / "dimensions.json").write_text(json.dumps(data, indent=2), encoding="utf-8")
    print(json.dumps(data, indent=2))


if __name__ == "__main__":
    main()
