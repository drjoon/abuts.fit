# -*- coding: utf-8 -*-
"""
fill_screwholes.py
- 선택한 메쉬에서 열린 edge loop들을 찾음
- MODE = "visualize" : 메우지 않고 각 loop을 색깔 커브 + 라벨로 화면에 표시 (확인용)
- MODE = "auto"      : 짧은(아티팩트) loop 제외 후, Z값이 가장 높은 loop을 스크류홀로 자동 판단해 메움
- MODE = "fill"      : LOOP_INDICES_TO_FILL 에 지정한 인덱스의 loop만 메움 (수동 지정, 예외 상황용)

이 파일은 2가지 방식으로 사용 가능:
1) 단독 실행 (Rhino ScriptEditor): 기존과 동일하게 동작
2) 모듈 import: fill_mesh_object(...) API를 통해 외부 스크립트에서 호출
"""

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

# "auto" 모드에서, 이 값(mm)보다 둘레가 짧은 loop은 노이즈/아티팩트로 간주해 후보에서 제외
MIN_LOOP_LENGTH = 3.0

# MODE = "fill" 일 때, 메쉬별로 몇 번째 loop을 메울지 지정
LOOP_INDICES_TO_FILL = {0: [4]}
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


def loop_z_centroid(pl):
    total = 0.0
    count = 0
    for p in pl:
        total += p.Z
        count += 1
    return total / count if count else 0.0


def draw_loop_debug(pl, idx, obj_index):
    if sc is None or rs is None:
        return

    color = [
        (255, 0, 0),
        (0, 200, 0),
        (0, 120, 255),
        (255, 180, 0),
        (200, 0, 255),
        (0, 200, 200),
    ][idx % 6]
    crv = pl.ToPolylineCurve()
    crv_id = sc.doc.Objects.AddCurve(crv)
    rs.ObjectColor(crv_id, color)
    rs.ObjectColorSource(crv_id, 1)  # 오브젝트 색 사용
    mid = pl.PointAt(pl.Count // 2) if pl.Count else pl[0]
    rs.AddTextDot("obj{}-loop{} ({:.2f}mm)".format(obj_index, idx, pl.Length), mid)


def fan_fill_polyline(polyline):
    """단순 팬(fan) 삼각분할로 폐곡선 폴리라인을 메쉬 패치로 만든다.
    loop이 볼록(convex)하고 중심점이 폴리곤 내부에 있을 때만 안전하다.
    오목(concave)한 loop에서는 삼각형이 꼬일 수 있으므로,
    가능하면 planar_fill_polyline을 우선 사용하고 이 함수는 폴백으로만 쓴다."""
    pts = list(polyline)
    if not pts:
        return None

    if pts[0].DistanceTo(pts[-1]) < 1e-6:
        pts = pts[:-1]  # 중복 시작/끝점 제거

    if len(pts) < 3:
        return None

    # 중심점 계산
    centroid = rg.Point3d(0, 0, 0)
    for p in pts:
        centroid += p
    centroid = centroid / len(pts)

    mesh = rg.Mesh()
    mesh.Vertices.Add(centroid)  # index 0 = 중심점
    for p in pts:
        mesh.Vertices.Add(p)

    n = len(pts)
    for i in range(n):
        a = i + 1
        b = (i + 1) % n + 1
        mesh.Faces.AddFace(0, a, b)

    mesh.Normals.ComputeNormals()
    mesh.FaceNormals.ComputeFaceNormals()
    mesh.Compact()
    return mesh


def planar_fill_polyline(polyline, tolerance=0.001, logger=None):
    """평면 영역 메싱(Brep.CreatePlanarBreps -> Mesh.CreateFromBrep) 기반 홀 메움.
    오목(concave)한 loop, 별모양 등도 안전하게 처리 가능.
    loop이 평면이 아니거나 CreatePlanarBreps가 실패하면 None을 반환한다."""
    pts = list(polyline)
    if not pts:
        return None

    if pts[0].DistanceTo(pts[-1]) > 1e-6:
        pts = pts + [rg.Point3d(pts[0])]

    if len(pts) < 4:  # 최소 삼각형(닫힘 포함 4점) 필요
        return None

    try:
        poly = rg.Polyline(pts)
        curve = poly.ToPolylineCurve()
    except Exception as e:
        _log(
            "planar_fill_polyline: polyline curve 생성 실패: {}".format(str(e)), logger
        )
        return None

    if curve is None or not curve.IsValid or not curve.IsClosed:
        return None

    breps = None
    try:
        breps = rg.Brep.CreatePlanarBreps(curve, tolerance)
    except Exception as e:
        _log("planar_fill_polyline: CreatePlanarBreps 예외: {}".format(str(e)), logger)
        breps = None

    if not breps or len(breps) == 0:
        return None

    mesh_params = rg.MeshingParameters.Default
    try:
        mesh_params.SimplePlanes = True
    except Exception:
        pass

    combined = rg.Mesh()
    for b in breps:
        try:
            sub_meshes = rg.Mesh.CreateFromBrep(b, mesh_params)
        except Exception:
            sub_meshes = None
        if not sub_meshes:
            continue
        for m in sub_meshes:
            if m is not None:
                combined.Append(m)
        try:
            b.Dispose()
        except Exception:
            pass

    if combined.Faces.Count == 0:
        return None

    combined.Normals.ComputeNormals()
    combined.FaceNormals.ComputeFaceNormals()
    combined.Compact()
    return combined


def _mesh_centroid(mesh):
    try:
        vcount = int(mesh.Vertices.Count)
    except Exception:
        vcount = 0
    if vcount <= 0:
        return rg.Point3d.Unset

    sx = sy = sz = 0.0
    n = 0
    for i in range(vcount):
        try:
            v = mesh.Vertices[i]
            sx += float(v.X)
            sy += float(v.Y)
            sz += float(v.Z)
            n += 1
        except Exception:
            continue

    if n <= 0:
        return rg.Point3d.Unset
    return rg.Point3d(sx / n, sy / n, sz / n)


def _mesh_avg_face_normal(mesh):
    try:
        mesh.FaceNormals.ComputeFaceNormals()
    except Exception:
        pass

    sx = sy = sz = 0.0
    n = 0
    try:
        fcount = int(mesh.FaceNormals.Count)
    except Exception:
        fcount = 0

    for i in range(fcount):
        try:
            fn = mesh.FaceNormals[i]
            sx += float(fn.X)
            sy += float(fn.Y)
            sz += float(fn.Z)
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
    # Rhino 버전에 따라 Flip 시그니처가 달라 안전하게 순차 시도
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
    """패치 노멀을 host mesh의 바깥 방향과 맞춘다.
    기준: (patch_centroid - host_centroid) 벡터와 patch 평균 법선의 내적 부호."""
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
    """loop 하나를 메울 패치를 만든다.
    1순위: 평면 영역 메싱 (오목한 loop도 안전)
    2순위(폴백): fan 삼각분할 (평면 메싱이 실패한 경우에만)
    + 생성 후 host mesh 기준 노멀 방향 보정
    Returns: (mesh_or_None, method_str)
    """
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
    """
    외부 호출용 API.

    Returns:
      {
        "filled_count": int,
        "selected_loop_index": int|None,
        "candidate_count": int,
        "loop_count": int,
        "ok": bool,
        "reason": str,
      }
    """
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

    naked_polylines = work_mesh.GetNakedEdges()
    if not naked_polylines:
        result["reason"] = "no naked loops"
        result["ok"] = True
        return result

    tolerance = planar_tolerance
    if tolerance is None:
        try:
            tolerance = float(doc.ModelAbsoluteTolerance)
        except Exception:
            tolerance = 0.001
    if not tolerance or tolerance <= 0:
        tolerance = 0.001

    result["loop_count"] = len(naked_polylines)

    effective_mode = mode
    if visualize:
        effective_mode = "visualize"

    if effective_mode == "visualize":
        _log(
            "=== obj {} ({}) : naked loop {}개 발견 ===".format(
                obj_index, obj_id, len(naked_polylines)
            ),
            logger,
        )
        for idx, pl in enumerate(naked_polylines):
            _log(
                "  loop {} : 둘레 = {:.2f} mm, 점 개수 = {}, Z중심 = {:.2f}".format(
                    idx, pl.Length, pl.Count, loop_z_centroid(pl)
                ),
                logger,
            )
            draw_loop_debug(pl, idx, obj_index)
        result["ok"] = True
        result["reason"] = "visualized"
        return result

    patches = []

    if effective_mode == "auto":
        candidates = [
            (idx, pl)
            for idx, pl in enumerate(naked_polylines)
            if float(pl.Length) >= float(min_loop_length)
        ]
        result["candidate_count"] = len(candidates)
        if not candidates:
            result["reason"] = "no candidates"
            _log(
                "obj {} : 스크류홀 후보(둘레 {}mm 이상)를 찾지 못했습니다.".format(
                    obj_index, min_loop_length
                ),
                logger,
            )
            return result

        best_idx, best_pl = max(candidates, key=lambda t: loop_z_centroid(t[1]))
        result["selected_loop_index"] = int(best_idx)
        _log(
            "obj {} : 자동 선택된 스크류홀 = loop {} (둘레 {:.2f}mm, Z중심 {:.2f})".format(
                obj_index, best_idx, best_pl.Length, loop_z_centroid(best_pl)
            ),
            logger,
        )

        patch, method = build_hole_patch(
            best_pl,
            tolerance=tolerance,
            logger=logger,
            host_mesh=work_mesh,
        )
        _log(
            "obj {} : loop {} patch method={}".format(obj_index, best_idx, method),
            logger,
        )
        if patch:
            patches.append(patch)

    elif effective_mode == "fill":
        indices_to_fill = loop_indices_to_fill or []
        if not indices_to_fill:
            result["reason"] = "no manual indices"
            _log(
                "obj {} : 메울 loop 인덱스가 지정되지 않았습니다.".format(obj_index),
                logger,
            )
            return result

        for idx in indices_to_fill:
            if idx >= len(naked_polylines):
                _log(
                    "obj {} : loop 인덱스 {} 가 범위를 벗어남 (총 {}개)".format(
                        obj_index, idx, len(naked_polylines)
                    ),
                    logger,
                )
                continue
            pl = naked_polylines[idx]
            patch, method = build_hole_patch(
                pl,
                tolerance=tolerance,
                logger=logger,
                host_mesh=work_mesh,
            )
            if patch:
                patches.append(patch)
                _log(
                    "obj {} : loop {} (둘레 {:.2f}mm) 메움 method={}".format(
                        obj_index, idx, pl.Length, method
                    ),
                    logger,
                )

    else:
        result["reason"] = "unsupported mode"
        return result

    if not patches:
        result["reason"] = "no patches"
        _log("obj {} : 메울 patch가 생성되지 않았습니다.".format(obj_index), logger)
        return result

    for patch in patches:
        work_mesh.Append(patch)
        result["filled_count"] += 1

    work_mesh.Weld(Rhino.RhinoMath.ToRadians(5))
    try:
        work_mesh.UnifyNormals()
    except Exception:
        pass
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


def main():
    if rs is None or sc is None:
        print("rhinoscriptsyntax/scriptcontext 를 사용할 수 없는 환경입니다.")
        return

    obj_ids = rs.GetObjects("스크류홀을 메울 메쉬 선택", rs.filter.mesh, preselect=True)
    if not obj_ids:
        return

    filled_count = 0

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
        filled_count += int(ret.get("filled_count") or 0)

    sc.doc.Views.Redraw()
    print("총 {}개의 스크류홀(추정) 루프를 메웠습니다.".format(filled_count))


if __name__ == "__main__":
    main()
