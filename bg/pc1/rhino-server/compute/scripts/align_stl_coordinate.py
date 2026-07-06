#! python3
"""
STL 좌표계 자동 정렬 스크립트 (Rhino 내부 실행/라이브러리 공용)

정렬 순서:
1) BoundingBox 축 길이 기준으로 가장 긴 축을 Z축으로 회전
2) 내부 스크류 홀(원기둥) 축을 추정해 Z축으로 미세 회전 + XY 평행이동
3) 커넥션 외부 직경(target_diameter) 단면의 Z를 찾아 Z=0으로 평행이동
4) 헥스 단면 각도를 one-shot 계산으로 Z축 회전 정렬 (Right(ZY) 뷰에서 헥스 중심이 면)
5) 회전 후 `residual_to_X_deg`를 재측정해 성공 메시지/로그로 노출

직경 결정 우선순위:
- 명시적 target_diameter 인자(또는 ABUTS_CONNECTION_TARGET_DIAMETER)
- 임플란트 정보 기반 정적 매핑(제조사/시스템/규격)
- 기본값 3.33mm
"""

import math
import os
import sys

import Rhino.Geometry as rg

ALIGN_MODULE_VERSION = "2026-07-05.z-orientation-v8-hex-residual-report"
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


def _wrap_angle_deg(value, period=360.0):
    half = period * 0.5
    return ((value + half) % period) - half


def _angle_distance_deg(a, b):
    return abs(_wrap_angle_deg(a - b, 360.0))


def _polyline_xy_points(polyline):
    pts = []
    for i in range(polyline.Count):
        p = polyline[i]
        pts.append((p.X, p.Y))

    if len(pts) >= 2:
        x0, y0 = pts[0]
        x1, y1 = pts[-1]
        if math.hypot(x1 - x0, y1 - y0) <= 1e-6:
            pts = pts[:-1]

    return pts


def _estimate_hex_vertex_phase_from_polyline(polyline):
    """
    단면 polyline에서 6각형 꼭짓점 위상(각도)을 추정.
    반환: {phase_deg, peak_count, confidence, cx, cy, r_mean}
    """
    pts = _polyline_xy_points(polyline)
    if len(pts) < 18:
        return None

    cx = sum(p[0] for p in pts) / len(pts)
    cy = sum(p[1] for p in pts) / len(pts)

    polar = []
    for x, y in pts:
        dx = x - cx
        dy = y - cy
        r = math.hypot(dx, dy)
        if r <= 1e-8:
            continue
        ang = math.degrees(math.atan2(dy, dx))
        polar.append((ang, r))

    if len(polar) < 18:
        return None

    polar.sort(key=lambda t: t[0])
    angles = [t[0] for t in polar]
    radii = [t[1] for t in polar]
    n = len(radii)

    # 간단한 원형 이동평균으로 반경 시퀀스 smoothing
    smoothed = []
    for i in range(n):
        v = (
            radii[(i - 2) % n]
            + radii[(i - 1) % n]
            + radii[i]
            + radii[(i + 1) % n]
            + radii[(i + 2) % n]
        ) / 5.0
        smoothed.append(v)

    # local maxima 찾기(꼭짓점 후보)
    peaks = []
    for i in range(n):
        prev_v = smoothed[(i - 1) % n]
        cur_v = smoothed[i]
        next_v = smoothed[(i + 1) % n]
        if cur_v >= prev_v and cur_v >= next_v:
            peaks.append((angles[i], cur_v))

    if len(peaks) < 4:
        return None

    # 가장 큰 peak 우선 + 각도 간격 NMS
    peaks.sort(key=lambda t: t[1], reverse=True)
    selected = []
    min_sep_deg = 22.0
    for ang, rv in peaks:
        if all(_angle_distance_deg(ang, a2) >= min_sep_deg for a2, _ in selected):
            selected.append((ang, rv))
        if len(selected) >= 8:
            break

    if len(selected) < 4:
        return None

    # 6배 각도의 위상 평균 -> 60도 주기 위상 추정(꼭짓점 기준)
    sx = 0.0
    cx6 = 0.0
    for ang, rv in selected:
        a6 = math.radians(6.0 * ang)
        w = max(rv, 1e-6)
        sx += w * math.sin(a6)
        cx6 += w * math.cos(a6)

    if abs(sx) <= 1e-9 and abs(cx6) <= 1e-9:
        return None

    phase_deg = math.degrees(math.atan2(sx, cx6)) / 6.0

    r_max = max(smoothed)
    r_min = min(smoothed)
    confidence = 0.0
    if r_max > 1e-8:
        confidence = max(0.0, min(1.0, (r_max - r_min) / r_max))

    r_mean = sum(radii) / len(radii)

    return {
        "phase_deg": phase_deg,
        "peak_count": len(selected),
        "confidence": confidence,
        "cx": cx,
        "cy": cy,
        "r_mean": r_mean,
    }


def _percentile(values, q):
    if not values:
        return None
    if q <= 0.0:
        return min(values)
    if q >= 1.0:
        return max(values)

    arr = sorted(values)
    pos = (len(arr) - 1) * q
    lo = int(math.floor(pos))
    hi = int(math.ceil(pos))
    if lo == hi:
        return arr[lo]
    t = pos - lo
    return arr[lo] * (1.0 - t) + arr[hi] * t


def _triangle_area(a, b, c):
    ab = rg.Vector3d(b.X - a.X, b.Y - a.Y, b.Z - a.Z)
    ac = rg.Vector3d(c.X - a.X, c.Y - a.Y, c.Z - a.Z)
    cr = rg.Vector3d.CrossProduct(ab, ac)
    return 0.5 * cr.Length


def _collect_hex_face_normal_observations(mesh):
    """
    헥스 구간 side-face 법선 관측치 수집.
    반환: [(angle_deg, weight), ...]

    one-shot 정렬 정확도를 위해:
    - side-face(수직 면)에 더 엄격한 필터(abs(n.Z) 작음)
    - 반경 상위 구간(외곽 헥스 플랫) 우선
    """
    bbox = mesh.GetBoundingBox(True)
    z_bands = [(-2.8, -1.2), (1.2, 2.8)]  # 방향 반전 케이스 대응

    mesh.FaceNormals.ComputeFaceNormals()
    mesh.FaceNormals.UnitizeFaceNormals()

    raw = []  # (angle_deg, weight, radial)

    for fi in range(mesh.Faces.Count):
        f = mesh.Faces[fi]
        n = mesh.FaceNormals[fi]

        # side-face만 강하게 선택 (수직 면일수록 |n.Z|≈0)
        if abs(n.Z) > 0.12:
            continue

        v0 = mesh.Vertices[f.A]
        v1 = mesh.Vertices[f.B]
        v2 = mesh.Vertices[f.C]

        if f.IsQuad:
            v3 = mesh.Vertices[f.D]
            cz = (v0.Z + v1.Z + v2.Z + v3.Z) / 4.0
            cx = (v0.X + v1.X + v2.X + v3.X) / 4.0
            cy = (v0.Y + v1.Y + v2.Y + v3.Y) / 4.0
            area = _triangle_area(v0, v1, v2) + _triangle_area(v0, v2, v3)
        else:
            cz = (v0.Z + v1.Z + v2.Z) / 3.0
            cx = (v0.X + v1.X + v2.X) / 3.0
            cy = (v0.Y + v1.Y + v2.Y) / 3.0
            area = _triangle_area(v0, v1, v2)

        in_band = False
        for z0, z1 in z_bands:
            z_from = max(min(z0, z1), bbox.Min.Z)
            z_to = min(max(z0, z1), bbox.Max.Z)
            if z_to - z_from < 0.05:
                continue
            if z_from <= cz <= z_to:
                in_band = True
                break
        if not in_band:
            continue

        radial = math.hypot(cx, cy)
        if radial < 0.2:
            continue

        angle_deg = math.degrees(math.atan2(n.Y, n.X))
        # 수직성에 가까울수록 가중치 강화
        side_weight = max(0.0, 1.0 - abs(n.Z))
        weight = max(area * side_weight, 1e-6)
        raw.append((angle_deg, weight, radial))

    if not raw:
        return []

    # 외곽 헥스 측면에 더 집중
    radial_cut = _percentile([r for _, _, r in raw], 0.80)
    if radial_cut is None:
        return []

    observations = []
    for angle_deg, weight, radial in raw:
        if radial >= radial_cut:
            observations.append((angle_deg, weight))

    return observations


def _cluster_hex_face_normals(observations):
    """
    6방향(60도 주기)으로 법선 각도를 클러스터링.
    반환: {phase_deg, clusters:[{angle_deg,weight,count}], samples}
    """
    if not observations:
        return None

    sx = 0.0
    cx6 = 0.0
    for ang, w in observations:
        a6 = math.radians(6.0 * ang)
        sx += w * math.sin(a6)
        cx6 += w * math.cos(a6)

    if abs(sx) <= 1e-9 and abs(cx6) <= 1e-9:
        return None

    phase_deg = math.degrees(math.atan2(sx, cx6)) / 6.0

    clusters = []
    for k in range(6):
        target = phase_deg + 60.0 * k
        sum_sin = 0.0
        sum_cos = 0.0
        sum_w = 0.0
        cnt = 0

        for ang, w in observations:
            d = _angle_distance_deg(ang, target)
            if d > 18.0:
                continue
            a = math.radians(ang)
            sum_sin += w * math.sin(a)
            sum_cos += w * math.cos(a)
            sum_w += w
            cnt += 1

        if cnt == 0 or sum_w <= 1e-9:
            continue

        mean_ang = math.degrees(math.atan2(sum_sin, sum_cos))
        clusters.append({"angle_deg": mean_ang, "weight": sum_w, "count": cnt})

    if not clusters:
        return None

    return {
        "phase_deg": phase_deg,
        "clusters": clusters,
        "samples": len(observations),
    }


def _best_delta_to_align_face_normal_with_zy_plane_normal(face_normal_angle_deg):
    """
    ZY 평면의 법선은 X축(±X). 면 법선을 ±X로 정렬하는 최소 회전각 반환.
    """
    d1 = _wrap_angle_deg(-face_normal_angle_deg, 360.0)
    d2 = _wrap_angle_deg(180.0 - face_normal_angle_deg, 360.0)
    return d1 if abs(d1) <= abs(d2) else d2


def _compute_hex_phase_from_face_normal_observations(observations):
    """
    관측된 side-face 법선 각도들로 60도 주기 위상을 계산.
    반환: {phase_deg, coherence, sum_w}
    """
    if not observations:
        return None

    sum_w = 0.0
    sx = 0.0
    cx6 = 0.0
    for ang, w in observations:
        ww = max(w, 1e-9)
        a6 = math.radians(6.0 * ang)
        sx += ww * math.sin(a6)
        cx6 += ww * math.cos(a6)
        sum_w += ww

    if sum_w <= 1e-12 or (abs(sx) <= 1e-9 and abs(cx6) <= 1e-9):
        return None

    phase_deg = math.degrees(math.atan2(sx, cx6)) / 6.0
    coherence = math.hypot(sx, cx6) / max(sum_w, 1e-12)

    return {
        "phase_deg": phase_deg,
        "coherence": coherence,
        "sum_w": sum_w,
    }


def _estimate_hex_rotation_delta_deg_from_face_normals(mesh):
    """
    one-shot 방식:
    헥스 side-face 법선 관측치로 60도 주기 위상을 한 번 측정하고,
    계산된 delta를 한 번만 적용하도록 Z회전량을 산출.
    """
    observations = _collect_hex_face_normal_observations(mesh)
    if not observations:
        return None

    solved = _compute_hex_phase_from_face_normal_observations(observations)
    if solved is None:
        return None

    phase_deg = solved["phase_deg"]
    coherence = solved["coherence"]

    # 목표: 한 면 법선이 ±X(= ZY 평면 법선)으로 정렬되게 회전
    # phase를 60도 주기 기준으로 0에 맞추면 된다.
    phase_mod = _wrap_angle_deg(phase_deg, 60.0)
    delta_deg = -phase_mod

    if coherence < 0.20:
        return None

    return {
        "delta_deg": delta_deg,
        "phase_deg": phase_deg,
        "samples": len(observations),
        "coherence": coherence,
        "method": "face_normals_one_shot",
    }


def _estimate_hex_rotation_delta_deg_from_sections(mesh):
    """
    폴백 방식: 단면 꼭짓점 위상 기반 추정.
    """
    bbox = mesh.GetBoundingBox(True)

    # 경험적 탐색 구간: 주로 -1.5~-2.5mm, 방향 반전 케이스 대비 +1.5~+2.5mm도 포함
    z_bands = [(-2.5, -1.5), (1.5, 2.5)]

    observations = []

    for z0, z1 in z_bands:
        z_from = max(min(z0, z1), bbox.Min.Z)
        z_to = min(max(z0, z1), bbox.Max.Z)
        if z_to - z_from < 0.05:
            continue

        sample_count = 6
        for i in range(sample_count):
            t = (i + 0.5) / float(sample_count)
            z = z_from + (z_to - z_from) * t

            plane = rg.Plane(rg.Point3d(0, 0, z), rg.Vector3d(0, 0, 1))
            polylines = rg.Intersect.Intersection.MeshPlane(mesh, plane)
            if not polylines:
                continue

            for pl in polylines:
                est = _estimate_hex_vertex_phase_from_polyline(pl)
                if est is None:
                    continue

                # 헥스는 축 근처에 위치해야 함 (이미 홀축 정렬됨)
                center_dist = math.hypot(est["cx"], est["cy"])
                if center_dist > 1.2:
                    continue

                # 너무 작거나 큰 루프 제외
                if est["r_mean"] < 0.35 or est["r_mean"] > 5.0:
                    continue

                # 원형 단면(신뢰도 매우 낮음) 제외
                if est["confidence"] < 0.06 or est["peak_count"] < 5:
                    continue

                weight = max(0.1, est["confidence"]) * max(1.0, est["peak_count"] / 4.0)
                observations.append((est["phase_deg"], weight))

    if not observations:
        return None

    # 60도 주기 위상 평균
    sx = 0.0
    cx6 = 0.0
    for phase_deg, w in observations:
        a6 = math.radians(6.0 * phase_deg)
        sx += w * math.sin(a6)
        cx6 += w * math.cos(a6)

    if abs(sx) <= 1e-9 and abs(cx6) <= 1e-9:
        return None

    phase_deg = math.degrees(math.atan2(sx, cx6)) / 6.0

    # 목표: phase ≡ 0 (mod 60)
    phase_mod = _wrap_angle_deg(phase_deg, 60.0)
    delta_deg = -phase_mod

    return {
        "delta_deg": delta_deg,
        "phase_deg": phase_deg,
        "samples": len(observations),
        "method": "section_phase_fallback",
    }


def _estimate_hex_rotation_delta_deg(mesh):
    info = _estimate_hex_rotation_delta_deg_from_face_normals(mesh)
    if info is not None:
        return info
    return _estimate_hex_rotation_delta_deg_from_sections(mesh)


def _measure_hex_residual_to_x_deg(mesh):
    """
    회전 적용 후 잔차 측정.
    목표는 face-normal 위상 phase_mod=0 (mod 60), 즉 면 법선이 ±X.

    반환값 `residual_deg`는 파이프라인 로그의 품질 판정 기준으로 사용된다.
    (운영 기준 예: residual_to_X_deg <= 0.01)

    반환: {residual_deg, method, samples, coherence}
    """
    observations = _collect_hex_face_normal_observations(mesh)
    if observations:
        solved = _compute_hex_phase_from_face_normal_observations(observations)
        if solved is not None:
            phase_mod = _wrap_angle_deg(solved["phase_deg"], 60.0)
            return {
                "residual_deg": abs(phase_mod),
                "method": "face_normals_postcheck",
                "samples": len(observations),
                "coherence": solved["coherence"],
            }

    # 폴백: section 위상 기반 residual
    sec = _estimate_hex_rotation_delta_deg_from_sections(mesh)
    if sec is not None:
        return {
            "residual_deg": abs(_wrap_angle_deg(sec.get("phase_deg", 0.0), 60.0)),
            "method": "section_phase_postcheck",
            "samples": sec.get("samples", 0),
            "coherence": None,
        }

    return None


def _align_hex_angle_for_right_view(mesh):
    info = _estimate_hex_rotation_delta_deg(mesh)
    if info is None:
        return (False, "Could not estimate hex angle")

    delta_deg = info["delta_deg"]
    phase_deg = info["phase_deg"]

    method = info.get("method", "unknown")
    if method == "face_normals_one_shot":
        _log(
            "Hex(face_normals_one_shot): phase={:.6f}deg samples={} coherence={:.4f} -> z-rotation delta={:.6f}deg".format(
                phase_deg,
                info.get("samples", 0),
                info.get("coherence", 0.0),
                delta_deg,
            )
        )
    else:
        _log(
            "Hex({}): phase={:.6f}deg samples={} -> z-rotation delta={:.6f}deg".format(
                method,
                phase_deg,
                info.get("samples", 0),
                delta_deg,
            )
        )

    # 0.01도 요구사항 대비, 매우 작은 수치만 no-op 처리
    if abs(delta_deg) >= 1e-4:
        rot = rg.Transform.Rotation(
            math.radians(delta_deg),
            rg.Vector3d(0, 0, 1),
            rg.Point3d(0, 0, 0),
        )
        if not mesh.Transform(rot):
            return (False, "Failed to rotate mesh for hex angle alignment")

    # 적용 후 잔차 측정 로그
    residual = _measure_hex_residual_to_x_deg(mesh)
    if residual is not None:
        if residual.get("coherence") is None:
            _log(
                "Hex residual: residual_to_X_deg={:.6f} method={} samples={} target<=0.010000".format(
                    residual.get("residual_deg", 999.0),
                    residual.get("method", "unknown"),
                    residual.get("samples", 0),
                )
            )
        else:
            _log(
                "Hex residual: residual_to_X_deg={:.6f} method={} samples={} coherence={:.4f} target<=0.010000".format(
                    residual.get("residual_deg", 999.0),
                    residual.get("method", "unknown"),
                    residual.get("samples", 0),
                    residual.get("coherence", 0.0),
                )
            )
    else:
        _log("Hex residual: unavailable (could not re-measure)")

    return (True, "Hex angle aligned")


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

    # 6) 헥스 각도 정렬: Right(ZY) 뷰에서 헥스 중심이 '면'이 되도록 Z축 회전
    ok_hex, hex_msg = _align_hex_angle_for_right_view(mesh)
    if not ok_hex:
        _log("{} (skip hex-angle alignment)".format(hex_msg))

    # 7) 최종 잔차 재측정(성공 메시지로도 전달)
    residual = _measure_hex_residual_to_x_deg(mesh)

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

    if residual is None:
        summary = "Successfully aligned; residual_to_X_deg=unavailable"
    else:
        summary = "Successfully aligned; residual_to_X_deg={:.6f}; residual_method={}; target<=0.010000".format(
            residual.get("residual_deg", 999.0),
            residual.get("method", "unknown"),
        )

    return (True, summary, translation)


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
