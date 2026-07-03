# -*- coding: utf-8 -*-
"""
fill_screwholes.py (axis/cylinder based)

핵심 가정(고정 규격):
1) 스크류홀 축은 Z축과 평행하며 원점을 지난다. (x=0, y=0 축)
2) 레귤러 직경은 약 2.35mm, 미니는 더 작고 축/형상 조건은 동일하다.
3) 스크류홀을 제외하면 포스트 메쉬는 닫혀 있다.
4) 스크류홀 개구는 상/하 2개이며, 메워야 할 대상은 상부 개구이다.

로직 요약:
- naked loop들을 축-동심 원기둥 시그니처(반경 분산, 직경 범위)로 필터링
- 필터 통과 loop 중 Z 중심이 가장 높은 loop 1개만 상부 홀로 선택
- 해당 loop만 patch 생성/메움

(실무적으로는 "약간 큰 동축 원기둥으로 찍어 얻는 교차 커브"와 동일한 분류 효과를,
loop의 축-원기둥 적합도 메트릭으로 안정적으로 구현)

- MODE="visualize": 각 loop 메트릭/후보 여부 시각화
- MODE="auto": 상부 스크류홀 1개 자동 메움
- MODE="fill": LOOP_INDICES_TO_FILL 인덱스만 수동 메움

외부 API는 기존과 동일하게 fill_mesh_object(...) 제공.
"""

import math

import Rhino
import Rhino.Geometry as rg

try:
    import rhinoscriptsyntax as rs
except Exception:
    rs = None

try:
    import scriptcontext as sc
except Exception:
    sc = None

# ----------------- 설정값 -----------------
MODE = "auto"

# 최소 loop 둘레(mm): 너무 작은 아티팩트 제거
MIN_LOOP_LENGTH = 3.0

# 스크류홀 레귤러 직경(mm)
REGULAR_DIAMETER = 2.35

# auto 모드에서 허용할 최대 직경(mm)
# - 레귤러 오차 + 메쉬 노이즈 여유
MAX_DIAMETER = 2.75

# 원점 Z축 동심성 판정용 반경 표준편차 허용치(mm)
# - 값이 작을수록 "동축 원기둥" 적합성이 높음
MAX_RADIAL_STD = 0.20

# 너무 작은 루프(노이즈) 제외용 최소 직경(mm)
MIN_DIAMETER = 1.00

# 메시와 교차시킬 탐사용 원기둥 직경(mm)
PROBE_DIAMETER = 2.4

# 원기둥 높이 여유(mm)
PROBE_Z_MARGIN = 1.0

# Ray 샘플링 기반 상부 루프 추출 설정
RAY_ANGLE_SAMPLES = 180
RAY_RADIUS_STEPS = 28
RAY_RADIUS_MIN = 0.10
RAY_BOTTOM_REJECT_RATIO = 0.55  # z_min + ratio*(z_max-z_min) 아래는 바닥 히트로 간주


# MODE = "fill"일 때 수동 인덱스
LOOP_INDICES_TO_FILL = {0: [0]}
# -------------------------------------------


def _log(msg, logger=None):
    if logger:
        try:
            logger(msg)
            return
        except Exception:
            pass
    try:
        print(msg)
    except Exception:
        pass


def _safe_float(v, default=0.0):
    try:
        return float(v)
    except Exception:
        return float(default)


def _unique_loop_points(polyline):
    """닫힌 폴리라인에서 중복 마지막 점 제거한 점 리스트 반환."""
    pts = [p for p in polyline] if polyline is not None else []
    if len(pts) >= 2:
        try:
            if pts[0].DistanceTo(pts[-1]) < 1e-6:
                pts = pts[:-1]
        except Exception:
            pass
    return pts


def _loop_z_centroid(polyline):
    pts = _unique_loop_points(polyline)
    if not pts:
        return 0.0
    s = 0.0
    for p in pts:
        s += _safe_float(p.Z)
    return s / float(len(pts))


def _compute_loop_metrics(polyline):
    """
    loop를 Z축(원점 통과) 기준으로 평가한다.

    Returns dict keys:
      length, z_centroid, z_span,
      r_mean, r_std, r_min, r_max,
      diameter_est, circularity_err,
      ok_geom
    """
    m = {
        "length": 0.0,
        "z_centroid": 0.0,
        "z_span": 0.0,
        "r_mean": 0.0,
        "r_std": 0.0,
        "r_min": 0.0,
        "r_max": 0.0,
        "diameter_est": 0.0,
        "circularity_err": 1e9,
        "ok_geom": False,
    }

    if polyline is None:
        return m

    pts = _unique_loop_points(polyline)
    if len(pts) < 3:
        return m

    try:
        m["length"] = _safe_float(polyline.Length)
    except Exception:
        m["length"] = 0.0

    zs = []
    rs_ = []
    for p in pts:
        x = _safe_float(p.X)
        y = _safe_float(p.Y)
        z = _safe_float(p.Z)
        r = math.sqrt(x * x + y * y)  # 원점 Z축 거리
        zs.append(z)
        rs_.append(r)

    if not rs_:
        return m

    n = float(len(rs_))
    r_mean = sum(rs_) / n
    var = 0.0
    for rv in rs_:
        d = rv - r_mean
        var += d * d
    r_std = math.sqrt(var / n)

    z_min = min(zs)
    z_max = max(zs)
    z_cent = sum(zs) / float(len(zs))

    m["z_centroid"] = z_cent
    m["z_span"] = z_max - z_min
    m["r_mean"] = r_mean
    m["r_std"] = r_std
    m["r_min"] = min(rs_)
    m["r_max"] = max(rs_)
    m["diameter_est"] = 2.0 * r_mean

    # 원형일수록 실제 둘레와 2πr 평균이 유사
    c_ref = 2.0 * math.pi * max(r_mean, 1e-9)
    c_len = max(m["length"], 1e-9)
    m["circularity_err"] = abs(c_len - c_ref) / c_ref

    m["ok_geom"] = True
    return m


def _is_screwhole_candidate(metrics, min_loop_length):
    """고정 규격/축 가정에 따른 후보 판정.

    주의: 상부 개구는 포스트 경사에 따라 비평면/기울어진 루프일 수 있으므로
    z_span(평면성)으로 배제하지 않는다.
    """
    if not metrics or not metrics.get("ok_geom"):
        return False, "bad-geom"

    length = _safe_float(metrics.get("length"))
    dia = _safe_float(metrics.get("diameter_est"))
    r_std = _safe_float(metrics.get("r_std"))

    if length < float(min_loop_length):
        return False, "short"

    if dia < float(MIN_DIAMETER):
        return False, "too-small-dia"

    # 미니는 더 작을 수 있으므로 하한을 작게 두고, 상한으로 큰 외곽 개구를 배제
    if dia > float(MAX_DIAMETER):
        return False, "too-large-dia"

    # 동축 원기둥 적합도
    if r_std > float(MAX_RADIAL_STD):
        return False, "off-axis"

    return True, "ok"


def _curve_to_polyline(curve, seg_count=128):
    if curve is None:
        return None

    # 1) PolylineCurve 캐스팅 시도
    try:
        plc = rg.PolylineCurve(curve)
        pl = plc.ToPolyline()
        if pl is not None and pl.Count >= 4:
            return pl
    except Exception:
        pass

    # 2) 샘플링 폴백
    pts = []
    try:
        t_vals = curve.DivideByCount(int(max(16, seg_count)), True)
        if t_vals:
            for t in t_vals:
                pts.append(curve.PointAt(t))
    except Exception:
        pass

    if len(pts) < 4:
        return None

    try:
        if pts[0].DistanceTo(pts[-1]) > 1e-6:
            pts.append(rg.Point3d(pts[0]))
    except Exception:
        pass

    try:
        pl = rg.Polyline(pts)
        return pl if pl.Count >= 4 else None
    except Exception:
        return None


def _build_upper_loop_by_vertical_rays(mesh, logger=None):
    """위→아래 수직 ray 샘플링으로 상부 개구 경계(loop) 1개를 구성.

    아이디어:
    - 각 각도(theta)마다 반지름 r을 작게→크게 스캔하며 수직 ray 교차점을 수집
    - 낮은 z(바닥) 히트는 버리고
    - 남은 점 중 z축(원점)에서 가장 가까운 점을 선택
    - 선택점들을 theta 순서로 이으면 상부 홀 경계 근사 루프가 됨
    """
    if mesh is None:
        return None

    try:
        bbox = mesh.GetBoundingBox(True)
        z_min = _safe_float(bbox.Min.Z)
        z_max = _safe_float(bbox.Max.Z)
    except Exception:
        z_min = -10.0
        z_max = 10.0

    z_top = z_max + float(PROBE_Z_MARGIN)
    z_cut = z_min + (z_max - z_min) * float(RAY_BOTTOM_REJECT_RATIO)

    r_max = max(0.5 * float(MAX_DIAMETER) + 0.35, 0.5 * float(PROBE_DIAMETER) + 0.15)
    n_ang = max(24, int(RAY_ANGLE_SAMPLES))
    n_rad = max(8, int(RAY_RADIUS_STEPS))

    pts = []
    for ai in range(n_ang):
        th = (2.0 * math.pi * float(ai)) / float(n_ang)
        ct = math.cos(th)
        st = math.sin(th)

        best_pt = None
        best_r = 1e18

        for ri in range(n_rad):
            t = float(ri) / float(max(1, n_rad - 1))
            r = float(RAY_RADIUS_MIN) + (r_max - float(RAY_RADIUS_MIN)) * t
            origin = rg.Point3d(r * ct, r * st, z_top)
            ray = rg.Ray3d(origin, -rg.Vector3d.ZAxis)

            try:
                hit_t = rg.Intersect.Intersection.MeshRay(mesh, ray)
            except Exception:
                hit_t = -1.0

            if hit_t is None or _safe_float(hit_t, -1.0) < 0.0:
                continue

            p = ray.PointAt(hit_t)
            if p is None:
                continue

            # 바닥쪽 히트 제거
            if _safe_float(p.Z) < z_cut:
                continue

            pr = math.sqrt(_safe_float(p.X) ** 2 + _safe_float(p.Y) ** 2)
            if pr < best_r:
                best_r = pr
                best_pt = p

        if best_pt is not None:
            pts.append(best_pt)

    # 최소 샘플 충족
    if len(pts) < max(18, int(0.35 * n_ang)):
        _log(
            "ray-loop failed: insufficient points {} / {}".format(len(pts), n_ang),
            logger,
        )
        return None

    try:
        pl = rg.Polyline(pts + [rg.Point3d(pts[0])])
        if pl is None or pl.Count < 4:
            return None
        return pl
    except Exception:
        return None


def draw_loop_debug(polyline, idx, obj_index, text):
    if sc is None or rs is None or polyline is None:
        return

    color = [
        (255, 0, 0),
        (0, 200, 0),
        (0, 120, 255),
        (255, 180, 0),
        (200, 0, 255),
        (0, 200, 200),
    ][idx % 6]

    crv = polyline.ToPolylineCurve()
    cid = sc.doc.Objects.AddCurve(crv)
    rs.ObjectColor(cid, color)
    rs.ObjectColorSource(cid, 1)

    pts = _unique_loop_points(polyline)
    if pts:
        mid = pts[len(pts) // 2]
    else:
        mid = rg.Point3d.Origin
    rs.AddTextDot("obj{}-loop{} {}".format(obj_index, idx, text), mid)


def fan_fill_polyline(polyline):
    """폴백용 fan 삼각분할."""
    pts = _unique_loop_points(polyline)
    if len(pts) < 3:
        return None

    c = rg.Point3d(0, 0, 0)
    for p in pts:
        c += p
    c = c / len(pts)

    mesh = rg.Mesh()
    mesh.Vertices.Add(c)
    for p in pts:
        mesh.Vertices.Add(p)

    n = len(pts)
    for i in range(n):
        a = i + 1
        b = ((i + 1) % n) + 1
        mesh.Faces.AddFace(0, a, b)

    try:
        mesh.Normals.ComputeNormals()
        mesh.FaceNormals.ComputeFaceNormals()
    except Exception:
        pass
    mesh.Compact()
    return mesh


def planar_fill_polyline(polyline, tolerance=0.001, logger=None):
    """우선 경로: planar brep -> mesh."""
    pts = [p for p in polyline] if polyline is not None else []
    if not pts:
        return None

    try:
        if pts[0].DistanceTo(pts[-1]) > 1e-6:
            pts.append(rg.Point3d(pts[0]))
    except Exception:
        pass

    if len(pts) < 4:
        return None

    try:
        curve = rg.Polyline(pts).ToPolylineCurve()
    except Exception as e:
        _log("planar_fill_polyline: curve fail: {}".format(str(e)), logger)
        return None

    if curve is None or not curve.IsValid or not curve.IsClosed:
        return None

    try:
        breps = rg.Brep.CreatePlanarBreps(curve, float(max(1e-6, tolerance)))
    except Exception as e:
        _log("planar_fill_polyline: CreatePlanarBreps fail: {}".format(str(e)), logger)
        breps = None

    if not breps:
        return None

    params = rg.MeshingParameters.Default
    try:
        params.SimplePlanes = True
    except Exception:
        pass

    out = rg.Mesh()
    for b in breps:
        try:
            subs = rg.Mesh.CreateFromBrep(b, params)
        except Exception:
            subs = None
        if subs:
            for sm in subs:
                if sm is not None:
                    out.Append(sm)
        try:
            b.Dispose()
        except Exception:
            pass

    if out.Faces.Count <= 0:
        return None

    try:
        out.Normals.ComputeNormals()
        out.FaceNormals.ComputeFaceNormals()
    except Exception:
        pass
    out.Compact()
    return out


def _mesh_centroid(mesh):
    if mesh is None:
        return rg.Point3d.Unset
    try:
        vc = int(mesh.Vertices.Count)
    except Exception:
        vc = 0
    if vc <= 0:
        return rg.Point3d.Unset

    sx = sy = sz = 0.0
    n = 0
    for i in range(vc):
        try:
            v = mesh.Vertices[i]
            sx += _safe_float(v.X)
            sy += _safe_float(v.Y)
            sz += _safe_float(v.Z)
            n += 1
        except Exception:
            continue

    if n <= 0:
        return rg.Point3d.Unset
    return rg.Point3d(sx / n, sy / n, sz / n)


def _mesh_avg_face_normal(mesh):
    if mesh is None:
        return rg.Vector3d.Unset

    try:
        mesh.FaceNormals.ComputeFaceNormals()
    except Exception:
        pass

    try:
        fc = int(mesh.FaceNormals.Count)
    except Exception:
        fc = 0

    if fc <= 0:
        return rg.Vector3d.Unset

    sx = sy = sz = 0.0
    n = 0
    for i in range(fc):
        try:
            fn = mesh.FaceNormals[i]
            sx += _safe_float(fn.X)
            sy += _safe_float(fn.Y)
            sz += _safe_float(fn.Z)
            n += 1
        except Exception:
            continue

    if n <= 0:
        return rg.Vector3d.Unset

    v = rg.Vector3d(sx / n, sy / n, sz / n)
    try:
        if v.IsTiny():
            return rg.Vector3d.Unset
    except Exception:
        pass

    try:
        v.Unitize()
    except Exception:
        pass
    return v


def _flip_mesh(mesh):
    if mesh is None:
        return False
    try:
        mesh.Flip(True, True, True)
        return True
    except Exception:
        pass
    try:
        mesh.Flip(True, True)
        return True
    except Exception:
        pass
    try:
        mesh.Flip()
        return True
    except Exception:
        return False


def _orient_patch_normals(patch, host_mesh, logger=None):
    if patch is None or host_mesh is None:
        return False

    host_c = _mesh_centroid(host_mesh)
    patch_c = _mesh_centroid(patch)
    if not host_c.IsValid or not patch_c.IsValid:
        return False

    ref = patch_c - host_c
    try:
        if ref.IsTiny():
            return False
    except Exception:
        pass

    try:
        ref.Unitize()
    except Exception:
        pass

    nrm = _mesh_avg_face_normal(patch)
    if not nrm.IsValid:
        return False

    try:
        dot = rg.Vector3d.Multiply(nrm, ref)
    except Exception:
        try:
            dot = nrm * ref
        except Exception:
            return False

    if dot < 0.0:
        flipped = _flip_mesh(patch)
        _log("patch normal flipped={} dot={:.6f}".format(flipped, dot), logger)
        return flipped
    return False


def build_hole_patch(polyline, tolerance=0.001, logger=None, host_mesh=None):
    patch = planar_fill_polyline(polyline, tolerance=tolerance, logger=logger)
    if patch is not None and patch.Faces.Count > 0:
        _orient_patch_normals(patch, host_mesh, logger=logger)
        return patch, "planar"

    patch = fan_fill_polyline(polyline)
    if patch is not None and patch.Faces.Count > 0:
        _orient_patch_normals(patch, host_mesh, logger=logger)
        return patch, "fan"

    return None, "none"


def fill_mesh_object(
    doc,
    obj_id,
    obj_index=0,
    mode="auto",
    min_loop_length=3.0,
    loop_indices_to_fill=None,
    visualize=False,
    logger=None,
    redraw=False,
    planar_tolerance=None,
):
    """외부 호출용 API(호환 유지)."""
    result = {
        "filled_count": 0,
        "selected_loop_index": None,
        "candidate_count": 0,
        "loop_count": 0,
        "ok": False,
        "reason": "",
    }

    if doc is None:
        result["reason"] = "doc is None"
        return result

    rh_obj = doc.Objects.FindId(obj_id)
    if rh_obj is None:
        result["reason"] = "object not found"
        return result

    mesh = rh_obj.Geometry
    if mesh is None:
        result["reason"] = "mesh is None"
        return result

    try:
        work_mesh = mesh.DuplicateMesh()
    except Exception:
        work_mesh = None
    if work_mesh is None:
        result["reason"] = "duplicate mesh failed"
        return result

    tol = planar_tolerance
    if tol is None:
        try:
            tol = float(doc.ModelAbsoluteTolerance)
        except Exception:
            tol = 0.001
    if not tol or tol <= 0:
        tol = 0.001

    effective_mode = "visualize" if visualize else mode

    # 1) 수직 ray 기반 상부 루프 생성
    ray_loop = _build_upper_loop_by_vertical_rays(work_mesh, logger=logger)

    loop_source = "ray"
    if ray_loop is None:
        result["ok"] = True
        result["reason"] = "no loops (ray)"
        _log("obj {} : ray-loop 실패".format(obj_index), logger)
        return result

    loops = [ray_loop]
    result["loop_count"] = 1
    _log("obj {} : ray-loop 추출 성공".format(obj_index), logger)

    analyzed = []
    for idx, pl in enumerate(loops):
        met = _compute_loop_metrics(pl)
        ok, why = _is_screwhole_candidate(met, min_loop_length=min_loop_length)
        analyzed.append(
            {"idx": idx, "pl": pl, "metrics": met, "is_candidate": ok, "why": why}
        )

    if effective_mode == "visualize":
        _log(
            "=== obj {} ({}) : {} loop {}개 ===".format(
                obj_index, obj_id, loop_source, len(loops)
            ),
            logger,
        )
        for item in analyzed:
            met = item["metrics"]
            msg = "loop {}: cand={}({}), len={:.2f}, dia={:.3f}, rStd={:.3f}, zC={:.3f}".format(
                item["idx"],
                item["is_candidate"],
                item["why"],
                _safe_float(met.get("length")),
                _safe_float(met.get("diameter_est")),
                _safe_float(met.get("r_std")),
                _safe_float(met.get("z_centroid")),
            )
            _log("  " + msg, logger)
            draw_loop_debug(
                polyline=item["pl"], idx=item["idx"], obj_index=obj_index, text=msg
            )

        result["candidate_count"] = len([a for a in analyzed if a["is_candidate"]])
        result["ok"] = True
        result["reason"] = "visualized"
        return result

    patches = []

    if effective_mode == "auto":
        candidates = [a for a in analyzed if a["is_candidate"]]
        result["candidate_count"] = len(candidates)

        if not candidates:
            # ray에서 직접 얻은 loop 1개는 규격 필터 실패하더라도 상부 홀 후보로 사용
            if loop_source == "ray" and len(loops) == 1:
                candidates = [analyzed[0]]
                result["candidate_count"] = 1
                _log(
                    "obj {} : ray-loop 1개를 상부 홀로 강제 채택".format(obj_index),
                    logger,
                )
            else:
                result["reason"] = "no axis-based candidates"
                _log(
                    "obj {} : ray-loop 후보 조건 불일치".format(obj_index),
                    logger,
                )
                return result

        # 상부 개구 1개만 메움
        upper = max(
            candidates, key=lambda a: _safe_float(a["metrics"].get("z_centroid"))
        )
        idx = int(upper["idx"])
        result["selected_loop_index"] = idx

        patch, method = build_hole_patch(
            upper["pl"],
            tolerance=tol,
            logger=logger,
            host_mesh=work_mesh,
        )
        if patch is None:
            result["reason"] = "patch failed"
            return result

        patches.append(patch)
        _log(
            "obj {} : auto-fill upper loop {} method={}".format(obj_index, idx, method),
            logger,
        )

    elif effective_mode == "fill":
        indices_to_fill = loop_indices_to_fill or []
        if not indices_to_fill:
            result["reason"] = "no manual indices"
            return result

        for idx in indices_to_fill:
            if idx < 0 or idx >= len(loops):
                _log(
                    "obj {} : loop index out of range: {}".format(obj_index, idx),
                    logger,
                )
                continue
            patch, method = build_hole_patch(
                loops[idx],
                tolerance=tol,
                logger=logger,
                host_mesh=work_mesh,
            )
            if patch is not None:
                patches.append(patch)
                _log(
                    "obj {} : manual-fill loop {} method={}".format(
                        obj_index, idx, method
                    ),
                    logger,
                )

    else:
        result["reason"] = "unsupported mode"
        return result

    if not patches:
        result["reason"] = "no patches"
        return result

    for p in patches:
        work_mesh.Append(p)
        result["filled_count"] += 1

    # 요청사항: join/boolean union 없이 패치만 추가
    try:
        work_mesh.Normals.ComputeNormals()
        work_mesh.FaceNormals.ComputeFaceNormals()
    except Exception:
        pass
    work_mesh.Compact()

    replaced = bool(doc.Objects.Replace(obj_id, work_mesh))
    if not replaced:
        result["reason"] = "replace failed"
        return result

    if redraw:
        try:
            doc.Views.Redraw()
        except Exception:
            pass

    result["ok"] = True
    result["reason"] = "filled"
    return result


def _collect_mesh_ids(doc):
    if doc is None:
        return []

    out = []
    try:
        settings = Rhino.DocObjects.ObjectEnumeratorSettings()
        settings.ObjectTypeFilter = Rhino.DocObjects.ObjectType.Mesh
        settings.HiddenObjects = False
        settings.LockedObjects = False
        objs = list(doc.Objects.GetObjectList(settings))
    except Exception:
        objs = []
        try:
            for o in list(doc.Objects):
                if o and o.ObjectType == Rhino.DocObjects.ObjectType.Mesh:
                    objs.append(o)
        except Exception:
            objs = []

    for o in objs:
        if o is None:
            continue
        g = getattr(o, "Geometry", None)
        if g is None:
            continue
        try:
            if int(g.Faces.Count) <= 0:
                continue
        except Exception:
            pass
        out.append(o.Id)

    return out


def _pick_target_mesh_ids(doc):
    mesh_ids = _collect_mesh_ids(doc)
    if len(mesh_ids) == 1:
        return mesh_ids

    # 여러 개인 경우에만 수동 선택
    if rs is not None:
        picked = rs.GetObjects(
            "스크류홀을 메울 메쉬 선택", rs.filter.mesh, preselect=True
        )
        return list(picked) if picked else []

    return []


def main():
    if rs is None or sc is None:
        print("rhinoscriptsyntax/scriptcontext 를 사용할 수 없는 환경입니다.")
        return

    obj_ids = _pick_target_mesh_ids(sc.doc)
    if not obj_ids:
        print("처리할 메쉬를 찾지 못했습니다.")
        return

    if len(obj_ids) == 1:
        print("메쉬 1개 자동 선택: {}".format(obj_ids[0]))

    total = 0
    for obj_index, obj_id in enumerate(obj_ids):
        indices = LOOP_INDICES_TO_FILL.get(obj_index, []) if MODE == "fill" else None
        ret = fill_mesh_object(
            doc=sc.doc,
            obj_id=obj_id,
            obj_index=obj_index,
            mode=MODE,
            min_loop_length=MIN_LOOP_LENGTH,
            loop_indices_to_fill=indices,
            visualize=(MODE == "visualize"),
            logger=None,
            redraw=False,
        )
        total += int(ret.get("filled_count") or 0)

    sc.doc.Views.Redraw()
    print("총 {}개의 스크류홀 loop를 메웠습니다.".format(total))


if __name__ == "__main__":
    main()
