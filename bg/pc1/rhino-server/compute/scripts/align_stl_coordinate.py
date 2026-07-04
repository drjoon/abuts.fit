#! python3
"""
STL 좌표계 자동 정렬 스크립트 (Rhino 내부 실행/라이브러리 공용)

정렬 순서:
1) BoundingBox 축 길이 기준으로 가장 긴 축을 Z축으로 회전
2) 내부 스크류 홀(원기둥) 축을 추정해 Z축으로 미세 회전 + XY 평행이동
3) 커넥션 외부 직경(target_diameter) 단면의 Z를 찾아 Z=0으로 평행이동

직경 결정 우선순위:
- 명시적 target_diameter 인자(또는 ABUTS_CONNECTION_TARGET_DIAMETER)
- 임플란트 정보 기반 정적 매핑(제조사/시스템/규격)
- 기본값 3.33mm
"""

import math
import os
import sys

import Rhino.Geometry as rg

ALIGN_MODULE_VERSION = "2026-07-04.z-orientation-v5-hole-axis-robust"
DEFAULT_TARGET_DIAMETER = 3.33

# 표 기준 정적 매핑 (정규화된 키 사용)
# key: (manufacturer, system, spec)
IMPLANT_CONNECTION_DIAMETERS = {
    ("OSSTEM", "TS3", "REGULAR"): 3.35,
    ("OSSTEM", "TS3", "MINI"): 2.60,
    ("DENTIUM", "SUPERLINE", "REGULAR"): 3.33,
    ("NEOBIOTECH", "IS ALX", "REGULAR"): 3.35,
    ("NEOBIOTECH", "IS ALX", "SMALL NARROW"): 2.60,
    ("DIO", "UF", "REGULAR"): 3.35,
    ("DIO", "UF", "NARROW"): 2.30,
    ("MEGAGEN", "ANYONE", "REGULAR"): 3.30,
    ("MEGAGEN", "ANYONE", "MINI"): 3.10,
    ("MEGAGEN", "MINI INTERNAL", ""): 2.30,
    ("DENTIS", "SQ ONE Q", "REGULAR"): 3.35,
    ("DENTIS", "SQ ONE Q", "MINI"): 2.80,
    ("DENTIS", "SQ ONE Q", "NARROW"): 2.30,
}

SYSTEM_ALIASES = {
    "TS": "TS3",
    "TS3": "TS3",
    "SUPERLINE": "SUPERLINE",
    "IS": "IS ALX",
    "ALX": "IS ALX",
    "IS ALX": "IS ALX",
    "UF": "UF",
    "ANYONE": "ANYONE",
    "MINI INTERNAL": "MINI INTERNAL",
    "SQ": "SQ ONE Q",
    "ONE Q": "SQ ONE Q",
    "SQ ONE Q": "SQ ONE Q",
}

SPEC_ALIASES = {
    "REGULAR": "REGULAR",
    "MINI": "MINI",
    "NARROW": "NARROW",
    "SMALL NARROW": "SMALL NARROW",
    "MINI INTERNAL": "MINI INTERNAL",
}

IGNORED_SPEC_TOKENS = {"HEX", "NON HEX", "NONHEX"}


def _log(message):
    print("[align] {}".format(message))


def _log_error(message):
    print("[align][error] {}".format(message))


def _normalize_text(value):
    if value is None:
        return ""
    s = str(value).strip().upper()
    if not s:
        return ""
    # 구분자 통일
    for ch in ["/", "-", "_", "(", ")", "[", "]", ",", "."]:
        s = s.replace(ch, " ")
    s = " ".join(s.split())
    return s


def _normalize_system(value):
    s = _normalize_text(value)
    if not s:
        return ""
    return SYSTEM_ALIASES.get(s, s)


def _normalize_spec(value):
    s = _normalize_text(value)
    if not s:
        return ""
    if s in IGNORED_SPEC_TOKENS:
        return ""
    return SPEC_ALIASES.get(s, s)


def _candidate_values(values, normalizer):
    out = []
    seen = set()
    for raw in values:
        v = normalizer(raw)
        if not v or v in seen:
            continue
        seen.add(v)
        out.append(v)
    return out


def resolve_target_diameter(target_diameter=None, implant_profile=None):
    """
    목표 직경 결정

    Args:
        target_diameter: 명시적 직경(mm). 유효하면 최우선 사용
        implant_profile: 제조사/시스템/규격 관련 dict

    Returns:
        (diameter_mm, source_text)
    """
    if target_diameter is not None:
        try:
            td = float(target_diameter)
            if td > 0:
                return td, "explicit"
        except Exception:
            pass

    profile = implant_profile or {}
    manufacturer = _normalize_text(
        profile.get("manufacturer") or profile.get("implantManufacturer")
    )

    if manufacturer:
        system_candidates = _candidate_values(
            [
                profile.get("system"),
                profile.get("implantSystem"),
                profile.get("brand"),
                profile.get("implantBrand"),
                profile.get("family"),
                profile.get("implantFamily"),
            ],
            _normalize_system,
        )
        spec_candidates = _candidate_values(
            [
                profile.get("spec"),
                profile.get("specification"),
                profile.get("implantSpec"),
                profile.get("type"),
                profile.get("implantType"),
                profile.get("family"),
                profile.get("implantFamily"),
            ],
            _normalize_spec,
        )

        # exact match 우선
        for sys_name in system_candidates:
            for spec_name in spec_candidates:
                key = (manufacturer, sys_name, spec_name)
                if key in IMPLANT_CONNECTION_DIAMETERS:
                    return IMPLANT_CONNECTION_DIAMETERS[
                        key
                    ], "implant_profile:{}".format("/".join(key))

            # spec 비어있는 key 허용 (ex. Megagen Mini internal)
            key_no_spec = (manufacturer, sys_name, "")
            if key_no_spec in IMPLANT_CONNECTION_DIAMETERS:
                return IMPLANT_CONNECTION_DIAMETERS[
                    key_no_spec
                ], "implant_profile:{}".format("/".join(key_no_spec))

    return DEFAULT_TARGET_DIAMETER, "default"


def _estimate_circle_from_polyline(polyline):
    points = []
    for i in range(polyline.Count):
        pt = polyline[i]
        points.append((pt.X, pt.Y))

    if len(points) < 3:
        return None

    center_x = sum(p[0] for p in points) / len(points)
    center_y = sum(p[1] for p in points) / len(points)

    max_radius = 0.0
    for px, py in points:
        r = math.sqrt((px - center_x) ** 2 + (py - center_y) ** 2)
        if r > max_radius:
            max_radius = r

    return (center_x, center_y, max_radius)


def _solve_3x3(m, b):
    def det3(a):
        return (
            a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1])
            - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0])
            + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0])
        )

    d = det3(m)
    if abs(d) <= 1e-12:
        return None

    m0 = [[b[0], m[0][1], m[0][2]], [b[1], m[1][1], m[1][2]], [b[2], m[2][1], m[2][2]]]
    m1 = [[m[0][0], b[0], m[0][2]], [m[1][0], b[1], m[1][2]], [m[2][0], b[2], m[2][2]]]
    m2 = [[m[0][0], m[0][1], b[0]], [m[1][0], m[1][1], b[1]], [m[2][0], m[2][1], b[2]]]

    return (det3(m0) / d, det3(m1) / d, det3(m2) / d)


def _fit_circle_xy_least_squares(points):
    """
    x^2 + y^2 + A x + B y + C = 0 를 최소제곱으로 적합.
    반환: (cx, cy, r, r_std)
    """
    n = len(points)
    if n < 6:
        return None

    sx = sy = sxx = syy = sxy = 0.0
    sq = sxq = syq = 0.0

    for x, y in points:
        q = -(x * x + y * y)
        sx += x
        sy += y
        sxx += x * x
        syy += y * y
        sxy += x * y
        sq += q
        sxq += x * q
        syq += y * q

    m = [
        [sxx, sxy, sx],
        [sxy, syy, sy],
        [sx, sy, float(n)],
    ]
    b = [sxq, syq, sq]

    solved = _solve_3x3(m, b)
    if solved is None:
        return None

    a, bb, c = solved
    cx = -a / 2.0
    cy = -bb / 2.0
    r2 = cx * cx + cy * cy - c
    if r2 <= 1e-10:
        return None

    r = math.sqrt(r2)
    residuals = []
    for x, y in points:
        rr = math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy))
        residuals.append(rr - r)

    mean_res = sum(residuals) / len(residuals)
    var = sum((v - mean_res) * (v - mean_res) for v in residuals) / len(residuals)
    r_std = math.sqrt(max(var, 0.0))

    return (cx, cy, r, r_std)


def _estimate_hole_circle_candidate(polyline):
    """
    홀 단면 후보용 엄격 필터:
    - 충분한 포인트 수
    - 폐곡선에 가까움
    - 너무 짧은 루프 제외
    - 원 적합 잔차(r_std) 기준 통과
    """
    pts = []
    for i in range(polyline.Count):
        p = polyline[i]
        pts.append((p.X, p.Y))

    if len(pts) < 10:
        return None

    # XY 길이/닫힘 품질
    perimeter = 0.0
    for i in range(len(pts) - 1):
        x1, y1 = pts[i]
        x2, y2 = pts[i + 1]
        perimeter += math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)

    x0, y0 = pts[0]
    xN, yN = pts[-1]
    close_gap = math.sqrt((xN - x0) ** 2 + (yN - y0) ** 2)

    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    scale = max(max(xs) - min(xs), max(ys) - min(ys))
    close_tol = max(0.05, 0.04 * max(scale, 1.0))

    is_closed = close_gap <= close_tol
    if not is_closed:
        return None

    # 아주 짧은 루프(노이즈) 제거
    if perimeter < 4.0:
        return None

    fitted = _fit_circle_xy_least_squares(pts)
    if fitted is None:
        return None

    cx, cy, r, r_std = fitted
    if r <= 0.0:
        return None

    # 원형성 체크 (절대/상대 잔차)
    rel = r_std / max(r, 1e-9)
    if r_std > 0.18 and rel > 0.12:
        return None

    return {
        "cx": cx,
        "cy": cy,
        "r": r,
        "r_std": r_std,
        "perimeter": perimeter,
        "close_gap": close_gap,
    }


def _find_hole_circle_candidates_at_z(mesh, z_height):
    plane = rg.Plane(rg.Point3d(0, 0, z_height), rg.Vector3d(0, 0, 1))
    polylines = rg.Intersect.Intersection.MeshPlane(mesh, plane)

    if not polylines or len(polylines) == 0:
        return []

    out = []
    for pl in polylines:
        cand = _estimate_hole_circle_candidate(pl)
        if cand is not None:
            out.append(cand)
    return out


def find_all_circles_at_z(mesh, z_height):
    plane = rg.Plane(rg.Point3d(0, 0, z_height), rg.Vector3d(0, 0, 1))
    polylines = rg.Intersect.Intersection.MeshPlane(mesh, plane)

    if not polylines or len(polylines) == 0:
        return []

    circles = []
    for pl in polylines:
        info = _estimate_circle_from_polyline(pl)
        if info is not None:
            circles.append(info)
    return circles


def find_circle_at_z(mesh, z_height):
    """
    기존 호환 API: 해당 Z 단면에서 가장 바깥 원(최대 반지름)을 반환
    """
    circles = find_all_circles_at_z(mesh, z_height)
    if not circles:
        return None
    return max(circles, key=lambda c: c[2])


def _bbox_axis_lengths(mesh):
    bbox = mesh.GetBoundingBox(True)
    lx = bbox.Max.X - bbox.Min.X
    ly = bbox.Max.Y - bbox.Min.Y
    lz = bbox.Max.Z - bbox.Min.Z
    return bbox, lx, ly, lz


def _rotate_longest_axis_to_z(mesh):
    bbox, lx, ly, lz = _bbox_axis_lengths(mesh)
    center = bbox.Center

    axis = "Z"
    from_vec = rg.Vector3d(0, 0, 1)
    if lx >= ly and lx >= lz:
        axis = "X"
        from_vec = rg.Vector3d(1, 0, 0)
    elif ly >= lx and ly >= lz:
        axis = "Y"
        from_vec = rg.Vector3d(0, 1, 0)

    _log(
        "BBox lengths: X={:.3f} Y={:.3f} Z={:.3f} -> longest={} axis".format(
            lx, ly, lz, axis
        )
    )

    if axis == "Z":
        return False

    to_vec = rg.Vector3d(0, 0, 1)
    rot = rg.Transform.Rotation(from_vec, to_vec, center)
    if mesh.Transform(rot):
        _log("Rotated longest axis {} -> Z".format(axis))
        return True

    _log_error("Failed to rotate longest axis {} -> Z".format(axis))
    return False


def _pick_inner_hole_circle(candidates, bbox_center_x, bbox_center_y, prev_circle=None):
    if not candidates:
        return None

    outer = max(candidates, key=lambda c: c["r"])
    outer_r = outer["r"]

    scored = []
    for c in candidates:
        cx = c["cx"]
        cy = c["cy"]
        r = c["r"]

        # 비정상적으로 작은 노이즈/과도한 원은 제외
        if r < 0.2 or r > 4.0:
            continue

        # 큰 외곽 원이 함께 잡힌 경우 제외
        if len(candidates) >= 2 and c is outer and outer_r >= 3.8:
            continue
        if len(candidates) >= 2 and outer_r >= 3.8 and r >= outer_r * 0.95:
            continue

        dist_bbox = math.sqrt((cx - bbox_center_x) ** 2 + (cy - bbox_center_y) ** 2)

        if prev_circle is None:
            score = dist_bbox + (0.12 * r) + (0.8 * c["r_std"])
            dist_prev = 0.0
            dr = 0.0
        else:
            dist_prev = math.sqrt(
                (cx - prev_circle[0]) ** 2 + (cy - prev_circle[1]) ** 2
            )
            dr = abs(r - prev_circle[2])
            score = (
                (2.0 * dist_prev) + (1.2 * dr) + (0.35 * dist_bbox) + (0.8 * c["r_std"])
            )

        scored.append((score, dist_prev, dr, c))

    if not scored:
        return None

    scored.sort(key=lambda x: x[0])
    best_score, best_dist_prev, best_dr, best = scored[0]

    # 연속성 가드: 이전 slice 대비 과도한 점프는 채택하지 않음
    if prev_circle is not None and (best_dist_prev > 1.2 or best_dr > 0.8):
        return None

    return (best["cx"], best["cy"], best["r"])


def _fit_hole_axis(mesh, sample_count=28):
    bbox = mesh.GetBoundingBox(True)
    z_min = bbox.Min.Z
    z_max = bbox.Max.Z
    z_span = z_max - z_min
    if z_span <= 0.01:
        return None

    bbox_cx = (bbox.Min.X + bbox.Max.X) / 2.0
    bbox_cy = (bbox.Min.Y + bbox.Max.Y) / 2.0

    points = []  # (z, x, y, r)
    prev_circle = None

    # 끝단 노이즈를 더 피하기 위해 유효 샘플 구간을 중앙으로 좁힘
    z_start = z_min + z_span * 0.10
    z_end = z_max - z_span * 0.10

    for i in range(sample_count):
        t = (i + 0.5) / float(sample_count)
        z = z_start + (z_end - z_start) * t

        candidates = _find_hole_circle_candidates_at_z(mesh, z)
        hole = _pick_inner_hole_circle(
            candidates, bbox_cx, bbox_cy, prev_circle=prev_circle
        )
        if hole is None:
            continue

        hx, hy, hr = hole
        points.append((z, hx, hy, hr))
        prev_circle = hole

    if len(points) < 4:
        _log(
            "Hole-axis fit skipped: insufficient valid hole slices ({})".format(
                len(points)
            )
        )
        return None

    # x(z), y(z) 선형 회귀
    zs = [p[0] for p in points]
    xs = [p[1] for p in points]
    ys = [p[2] for p in points]

    mz = sum(zs) / len(zs)
    mx = sum(xs) / len(xs)
    my = sum(ys) / len(ys)

    szz = sum((z - mz) * (z - mz) for z in zs)
    if szz <= 1e-12:
        return None

    sxz = sum((z - mz) * (x - mx) for z, x in zip(zs, xs))
    syz = sum((z - mz) * (y - my) for z, y in zip(zs, ys))

    ax = sxz / szz
    ay = syz / szz

    direction = rg.Vector3d(ax, ay, 1.0)
    if not direction.Unitize():
        return None

    avg_r = sum(p[3] for p in points) / len(points)
    axis_point = rg.Point3d(mx, my, mz)
    return {
        "axis_point": axis_point,
        "axis_dir": direction,
        "avg_radius": avg_r,
        "samples": len(points),
    }


def _align_screw_hole_axis_to_z(mesh):
    """
    스크류 홀 축을 추정해 Z축 정렬 + XY 중심 원점 이동.
    """
    info = _fit_hole_axis(mesh)
    if info is None:
        return (False, "Could not detect screw hole axis")

    axis_point = info["axis_point"]
    axis_dir = info["axis_dir"]
    _log(
        "Screw hole axis detected: dir=({:.5f}, {:.5f}, {:.5f}) samples={} avg_r={:.4f}".format(
            axis_dir.X,
            axis_dir.Y,
            axis_dir.Z,
            info["samples"],
            info["avg_radius"],
        )
    )

    z_axis = rg.Vector3d(0, 0, 1)
    rot = rg.Transform.Rotation(axis_dir, z_axis, axis_point)
    if not mesh.Transform(rot):
        return (False, "Failed to rotate screw hole axis to Z")

    # 회전 후 다시 축 추정해서 XY 중심 보정
    info2 = _fit_hole_axis(mesh)
    if info2 is not None:
        p2 = info2["axis_point"]
        if abs(p2.X) > 1e-4 or abs(p2.Y) > 1e-4:
            mesh.Translate(rg.Vector3d(-p2.X, -p2.Y, 0))
            _log(
                "Screw hole axis XY translated by ({:.5f}, {:.5f})".format(-p2.X, -p2.Y)
            )

    return (True, "Screw hole aligned to Z")


def _xy_span_metric_from_vertices(vertices):
    if not vertices:
        return None
    xs = [p.X for p in vertices]
    ys = [p.Y for p in vertices]
    span_x = max(xs) - min(xs)
    span_y = max(ys) - min(ys)
    return max(span_x, span_y)


def _xy_metric_at_z(mesh, z):
    circle = find_circle_at_z(mesh, z)
    if circle is not None:
        return circle[2] * 2.0  # diameter
    return None


def _ensure_narrower_end_points_to_positive_z(mesh):
    """
    +Z 방향 1차 강제:
    Z 하단/상단 단면의 XY 크기를 비교해, XY가 더 작은(좁은) 쪽이 +Z(상단)로 오도록 만든다.
    즉, 포스트(좁은 쪽)=+Z, 커넥션(넓은 쪽)=-Z.
    """
    bbox = mesh.GetBoundingBox(True)
    z_min = bbox.Min.Z
    z_max = bbox.Max.Z
    z_span = z_max - z_min
    if z_span <= 1e-6:
        return False

    z_low = z_min + z_span * 0.08
    z_high = z_max - z_span * 0.08

    low_metric = _xy_metric_at_z(mesh, z_low)
    high_metric = _xy_metric_at_z(mesh, z_high)

    # intersection 실패 시, 끝단 band의 vertex XY span으로 폴백
    if low_metric is None or high_metric is None:
        band = z_span * 0.10
        low_vertices = []
        high_vertices = []
        for i in range(mesh.Vertices.Count):
            v = mesh.Vertices[i]
            if v.Z <= z_min + band:
                low_vertices.append(v)
            if v.Z >= z_max - band:
                high_vertices.append(v)

        if low_metric is None:
            low_metric = _xy_span_metric_from_vertices(low_vertices)
        if high_metric is None:
            high_metric = _xy_span_metric_from_vertices(high_vertices)

    if low_metric is None or high_metric is None:
        _log("Could not evaluate end XY size for +Z direction check")
        return False

    _log(
        "End XY metric: low={:.4f}, high={:.4f} (high should be smaller for +Z)".format(
            low_metric, high_metric
        )
    )

    # 상단(+Z) 쪽이 더 넓으면, 원점 기준 180도 회전으로 뒤집기
    if high_metric > low_metric:
        rot = rg.Transform.Rotation(
            math.pi,
            rg.Vector3d(1, 0, 0),
            rg.Point3d(0, 0, 0),
        )
        if mesh.Transform(rot):
            _log("Flipped mesh 180° around X at origin to enforce narrower end at +Z")
            return True
        _log_error("Failed to flip mesh for +Z direction enforcement")

    return False


def _bbox_metric_from_vertices(vertices):
    if not vertices:
        return None
    xs = [p.X for p in vertices]
    ys = [p.Y for p in vertices]
    zs = [p.Z for p in vertices]

    span_x = max(xs) - min(xs)
    span_y = max(ys) - min(ys)
    span_z = max(zs) - min(zs)

    # "바운딩박스 크기"를 volume으로 정의
    volume = span_x * span_y * span_z
    return {
        "volume": volume,
        "span_x": span_x,
        "span_y": span_y,
        "span_z": span_z,
    }


def _half_space_bbox_metric(mesh, positive=True):
    pts = []
    for i in range(mesh.Vertices.Count):
        v = mesh.Vertices[i]
        if positive:
            if v.Z >= 0:
                pts.append(v)
        else:
            if v.Z <= 0:
                pts.append(v)
    return _bbox_metric_from_vertices(pts)


def _enforce_positive_z_side_longer_in_zspan(mesh):
    """
    최종 방향 강제:
    원점 기준 +Z 반공간의 Z span(높이 범위)이 -Z 반공간보다 길어야 한다.
    조건이 반대면 원점 기준 X축 180° 회전한다.
    """
    pos_metric = _half_space_bbox_metric(mesh, positive=True)
    neg_metric = _half_space_bbox_metric(mesh, positive=False)

    if pos_metric is None or neg_metric is None:
        _log("Could not evaluate +/-Z half-space bbox metrics")
        return False

    pos_z = pos_metric["span_z"]
    neg_z = neg_metric["span_z"]

    _log(
        "Half-space Z-span metric: +Z={:.4f}, -Z={:.4f} (+Z should be longer)".format(
            pos_z, neg_z
        )
    )

    if pos_z < neg_z:
        rot_180 = rg.Transform.Rotation(
            math.pi,
            rg.Vector3d(1, 0, 0),
            rg.Point3d(0, 0, 0),
        )
        if mesh.Transform(rot_180):
            _log("Applied 180° flip around X at origin (+Z Z-span now longer)")
            return True
        _log_error("Failed to apply 180° flip for +/-Z Z-span enforcement")

    return False


def find_z_for_diameter(mesh, target_diameter, z_min, z_max, tolerance=0.01):
    """
    외부 직경이 target_diameter가 되는 Z 높이를 이진 탐색으로 찾기
    """
    target_radius = target_diameter / 2.0
    iterations = 0
    max_iterations = 50

    while iterations < max_iterations and (z_max - z_min) > 0.001:
        z_mid = (z_min + z_max) / 2.0
        result = find_circle_at_z(mesh, z_mid)

        if result is None:
            z_max = z_mid
            iterations += 1
            continue

        _, _, radius = result
        diff = abs(radius - target_radius)

        if diff < tolerance:
            return z_mid

        if radius > target_radius:
            z_min = z_mid
        else:
            z_max = z_mid

        iterations += 1

    return (z_min + z_max) / 2.0


def align_mesh_to_origin(mesh, target_diameter=None, implant_profile=None):
    """
    메시를 원점에 정렬

    Args:
        mesh: Rhino Mesh 객체
        target_diameter: 커넥션 외부 직경(mm). None이면 implant_profile/기본값 사용
        implant_profile: 제조사/시스템/규격 정보 dict

    Returns:
        (success, message, translation_vector)
        - translation_vector: 마지막 Z 정렬 평행이동 벡터
    """
    if mesh is None or mesh.Vertices.Count == 0:
        return (False, "Invalid mesh", None)

    _log("align module version={}".format(ALIGN_MODULE_VERSION))

    # 0) BBox 최장축을 Z로 정렬
    _rotate_longest_axis_to_z(mesh)

    # 1) 스크류 홀 축 정렬 (실패 시 로그 후 계속)
    ok_hole, hole_msg = _align_screw_hole_axis_to_z(mesh)
    if not ok_hole:
        _log("{} (fallback to diameter-only Z alignment)".format(hole_msg))

    # 1.5) (선행 방향 강제는 생략)
    # 최종 단계에서 원점 기준 +/-Z 반공간 Z-span으로 방향을 결정한다.

    # 2) 임플란트 정보/명시값으로 목표 직경 결정
    resolved_diameter, source = resolve_target_diameter(
        target_diameter=target_diameter,
        implant_profile=implant_profile,
    )
    _log(
        "Target connection diameter: {:.4f}mm (source={})".format(
            resolved_diameter, source
        )
    )

    bbox = mesh.GetBoundingBox(True)
    z_min = bbox.Min.Z
    z_max = bbox.Max.Z
    _log("Mesh Z range: {:.2f} to {:.2f}".format(z_min, z_max))

    # 3) target_diameter에 해당하는 Z 찾기
    z_target = find_z_for_diameter(mesh, resolved_diameter, z_min, z_max)
    if z_target is None:
        return (False, "Could not find Z height for target diameter", None)

    _log("Found Z height for target diameter: {:.3f}mm".format(z_target))

    result = find_circle_at_z(mesh, z_target)
    if result is None:
        return (False, "Could not find circle at target Z height", None)

    center_x, center_y, radius = result
    _log(
        "Circle at target Z: center=({:.3f}, {:.3f}) radius={:.3f}mm diameter={:.3f}mm".format(
            center_x, center_y, radius, radius * 2.0
        )
    )

    # 4) 최종 단계: Z축 평행이동 (요구사항)
    translation = rg.Vector3d(0, 0, -z_target)
    mesh.Translate(translation)

    # 5) 최종 방향 보정: 원점 기준 +Z 반공간의 Z-span이 -Z보다 길어야 함
    _enforce_positive_z_side_longer_in_zspan(mesh)

    _log("Final Z translation: {:.3f}".format(translation.Z))

    final_bbox = mesh.GetBoundingBox(True)
    _log(
        "Final bbox: X[{:.2f}, {:.2f}] Y[{:.2f}, {:.2f}] Z[{:.2f}, {:.2f}]".format(
            final_bbox.Min.X,
            final_bbox.Max.X,
            final_bbox.Min.Y,
            final_bbox.Max.Y,
            final_bbox.Min.Z,
            final_bbox.Max.Z,
        )
    )

    return (True, "Successfully aligned", translation)


# Rhino.Compute 또는 스크립트 실행 시 사용할 메인 함수
def main(input_path, output_path, target_diameter=None, implant_profile=None):
    """
    STL 파일을 로드하여 정렬하고 저장
    """
    if target_diameter is None:
        raw = os.environ.get("ABUTS_CONNECTION_TARGET_DIAMETER", "").strip()
        if raw:
            try:
                td = float(raw)
                if td > 0:
                    target_diameter = td
            except Exception:
                pass

    if implant_profile is None:
        implant_profile = {
            "implantManufacturer": os.environ.get("ABUTS_IMPLANT_MANUFACTURER", ""),
            "implantBrand": os.environ.get("ABUTS_IMPLANT_BRAND", ""),
            "implantFamily": os.environ.get("ABUTS_IMPLANT_FAMILY", ""),
            "implantType": os.environ.get("ABUTS_IMPLANT_TYPE", ""),
            "system": os.environ.get("ABUTS_IMPLANT_SYSTEM", ""),
            "spec": os.environ.get("ABUTS_IMPLANT_SPEC", ""),
        }

    mesh = rg.Mesh()
    success = mesh.Read(input_path)

    if not success or mesh.Vertices.Count == 0:
        _log_error("Failed to load STL: {}".format(input_path))
        return False

    _log("Loaded: {} vertices, {} faces".format(mesh.Vertices.Count, mesh.Faces.Count))

    success, message, _translation = align_mesh_to_origin(
        mesh,
        target_diameter=target_diameter,
        implant_profile=implant_profile,
    )

    if not success:
        _log_error("{}".format(message))
        return False

    success = mesh.Write(output_path)
    if not success:
        _log_error("Failed to write STL: {}".format(output_path))
        return False

    _log("Saved to: {}".format(output_path))
    return True


if __name__ == "__main__" and "rhinoscript" not in __name__.lower():
    if len(sys.argv) >= 3:
        input_file = sys.argv[1]
        output_file = sys.argv[2]
        target = None
        if len(sys.argv) >= 4:
            try:
                parsed = float(sys.argv[3])
                if parsed > 0:
                    target = parsed
            except Exception:
                target = None
        success = main(input_file, output_file, target_diameter=target)
        sys.exit(0 if success else 1)
