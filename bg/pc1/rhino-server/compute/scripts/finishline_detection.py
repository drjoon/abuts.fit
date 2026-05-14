"""Finish line detection for abutment STL meshes.

알고리즘(요청 반영):
1) 입력 mesh를 explode해서 분리 파트 후보를 만든다.
2) 후보 중 max-Z 파트를 선택한다.
3) 선택 파트로 `ExtractMeshEdges`(떨어짐/결합) 실행 후, 생성 커브 중 min-Z 폐곡선을
   피니시라인으로 저장한다.
"""

from __future__ import annotations

import math
import os
from typing import Dict, List, Optional, Sequence, Tuple

import Rhino
import Rhino.DocObjects as rdo
import Rhino.Geometry as rg
import Rhino.Geometry.Intersect as intersect
import System.Drawing as drawing
import System

_SECTION_COUNT = 40
_SECTION_STEP_DEG = 9.0
_PT0_Z_RATIO_LOW = 0.2
_PT0_Z_RATIO_HIGH = 0.55
_SHOW_POINT_TEXTDOTS = False
_DEBUG_TRACE = os.environ.get("FINISHLINE_TRACE_DEBUG", "0") in ("1", "true", "TRUE")
_DEBUG_ADD_POLYLINE_CURVE = os.environ.get("FINISHLINE_DEBUG_CURVE_DOC", "1") in ("1", "true", "TRUE")


def _trace_log(msg: str) -> None:
    if not _DEBUG_TRACE:
        return
    try:
        print(msg)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Document / mesh helpers
# ---------------------------------------------------------------------------
def _get_active_doc(doc: Optional[Rhino.RhinoDoc] = None) -> Rhino.RhinoDoc:
    doc = doc or Rhino.RhinoDoc.ActiveDoc
    if doc is None:
        raise RuntimeError("RhinoDoc가 필요합니다 (활성 문서가 없습니다)")
    return doc


def _collect_mesh_objects(doc: Rhino.RhinoDoc) -> List[rdo.MeshObject]:
    meshes: List[rdo.MeshObject] = []
    for obj in doc.Objects:
        if obj is None or obj.ObjectType != rdo.ObjectType.Mesh:
            continue
        meshes.append(obj)
    return meshes


def _mesh_z_key(mesh: rg.Mesh) -> Optional[Tuple[float, float, float, float]]:
    try:
        bbox = mesh.GetBoundingBox(True)
    except Exception:
        return None
    if not bbox.IsValid:
        return None
    return (
        float(bbox.Max.Z),
        float(bbox.Min.Z),
        float(mesh.Vertices.Count),
        float(bbox.Diagonal.Length),
    )


def _pick_primary_mesh(doc: Rhino.RhinoDoc, mesh_id=None) -> Tuple[rdo.MeshObject, rg.Mesh]:
    if mesh_id:
        obj = doc.Objects.FindId(mesh_id)
        if obj and obj.ObjectType == rdo.ObjectType.Mesh and obj.Geometry:
            return obj, obj.Geometry
        raise RuntimeError("지정한 mesh_id를 찾을 수 없습니다")

    meshes = _collect_mesh_objects(doc)
    if not meshes:
        raise RuntimeError("문서에서 Mesh 객체를 찾을 수 없습니다")

    def weight(mo: rdo.MeshObject):
        geom = mo.Geometry
        if geom is None:
            return (-float("inf"), -float("inf"), -float("inf"), -float("inf"))
        key = _mesh_z_key(geom)
        return key if key is not None else (-float("inf"), -float("inf"), -float("inf"), -float("inf"))

    meshes.sort(key=weight, reverse=True)
    target = meshes[0]
    geom = target.Geometry
    if geom is None:
        raise RuntimeError("선택된 Mesh 객체에서 Geometry를 읽을 수 없습니다")
    return target, geom


def _pick_highest_z_component(mesh: rg.Mesh) -> rg.Mesh:
    """메시를 분해해 Z 최상단 파트만 반환한다.

    배경:
      피니시라인 계산 시 단면 교차에 다른 분리 파트(예: 포스트 하단 파편)의 경계가
      함께 들어오면 일부 방위각에서 잘못된 저부 경계가 선택될 수 있다.

    동작:
      1) ExplodeAtUnweldedEdges
      2) 각 결과를 SplitDisjointPieces
      3) 후보 중 bbox.Max.Z가 가장 큰 파트를 선택 (동률 시 bbox.Min.Z, vertex 수)
    """
    mesh_copy = mesh.DuplicateMesh()
    if mesh_copy is None:
        raise RuntimeError("Mesh 복제에 실패했습니다")

    exploded: List[rg.Mesh] = []
    try:
        raw_exploded = mesh_copy.ExplodeAtUnweldedEdges()
        if raw_exploded:
            exploded = [m for m in raw_exploded if m is not None and m.Vertices.Count > 0]
    except Exception:
        exploded = []

    if not exploded:
        exploded = [mesh_copy]

    candidates: List[rg.Mesh] = []
    for part in exploded:
        if part is None or part.Vertices.Count <= 0:
            continue
        try:
            disjoint = part.SplitDisjointPieces()
        except Exception:
            disjoint = None

        if disjoint:
            for sub in disjoint:
                if sub is not None and sub.Vertices.Count > 0:
                    candidates.append(sub)
        else:
            candidates.append(part)

    if not candidates:
        return mesh_copy

    best_mesh: Optional[rg.Mesh] = None
    best_key = None
    for part in candidates:
        key = _mesh_z_key(part)
        if key is None:
            continue
        if best_key is None or key > best_key:
            best_key = key
            best_mesh = part

    if best_mesh is None:
        return mesh_copy

    _trace_log(
        "[mesh] components={} selected_key(maxZ,minZ,verts)={}".format(
            len(candidates),
            best_key,
        )
    )
    selected = best_mesh.DuplicateMesh()
    return selected if selected is not None else best_mesh


def _explode_components_sorted_by_max_z(mesh: rg.Mesh) -> List[rg.Mesh]:
    mesh_copy = mesh.DuplicateMesh()
    if mesh_copy is None:
        return [mesh]

    exploded: List[rg.Mesh] = []
    try:
        raw_exploded = mesh_copy.ExplodeAtUnweldedEdges()
        if raw_exploded:
            exploded = [m for m in raw_exploded if m is not None and m.Vertices.Count > 0]
    except Exception:
        exploded = []

    if not exploded:
        exploded = [mesh_copy]

    candidates: List[rg.Mesh] = []
    for part in exploded:
        if part is None or part.Vertices.Count <= 0:
            continue
        try:
            disjoint = part.SplitDisjointPieces()
        except Exception:
            disjoint = None

        if disjoint:
            for sub in disjoint:
                if sub is not None and sub.Vertices.Count > 0:
                    candidates.append(sub)
        else:
            candidates.append(part)

    keyed: List[Tuple[Tuple[float, float, float, float], rg.Mesh]] = []
    for part in candidates:
        key = _mesh_z_key(part)
        if key is None:
            continue
        keyed.append((key, part))

    keyed.sort(key=lambda item: item[0], reverse=True)
    ordered: List[rg.Mesh] = []
    for key, part in keyed:
        dup = part.DuplicateMesh()
        ordered.append(dup if dup is not None else part)

    _trace_log("[mesh] ordered_components={}".format(len(ordered)))
    return ordered if ordered else [mesh_copy]


def _collect_new_curve_geometries(
    doc: Rhino.RhinoDoc,
    baseline_ids,
) -> Tuple[List[rg.Curve], List[System.Guid]]:
    curves: List[rg.Curve] = []
    created_ids: List[System.Guid] = []
    for obj in doc.Objects:
        if obj is None or obj.Id in baseline_ids:
            continue
        created_ids.append(obj.Id)
        if obj.ObjectType != rdo.ObjectType.Curve or obj.Geometry is None:
            continue
        try:
            dup = obj.Geometry.DuplicateCurve()
            curves.append(dup if dup is not None else obj.Geometry)
        except Exception:
            continue
    return curves, created_ids


def _extract_mesh_edges_with_command(doc: Rhino.RhinoDoc, mesh: rg.Mesh) -> List[rg.Curve]:
    temp_mesh_id = doc.Objects.AddMesh(mesh)
    if temp_mesh_id == System.Guid.Empty:
        return []

    baseline_ids = set(obj.Id for obj in doc.Objects)
    curve_geometries: List[rg.Curve] = []
    created_ids: List[System.Guid] = []

    # Rhino 버전에 따라 ExtractMeshEdges 옵션 토큰명이 다를 수 있어 순차 시도.
    macros = [
        "! _SelNone _SelID {} _-ExtractMeshEdges _Extract=_Unwelded _Join=_Yes _Enter".format(temp_mesh_id),
        "! _SelNone _SelID {} _-ExtractMeshEdges _EdgeType=_Unwelded _Join=_Yes _Enter".format(temp_mesh_id),
        "! _SelNone _SelID {} _-ExtractMeshEdges _Unwelded=_Yes _Join=_Yes _Enter".format(temp_mesh_id),
    ]

    try:
        for idx, macro in enumerate(macros):
            _trace_log("[extract_edges] try[{}/{}] macro={}".format(idx + 1, len(macros), macro))
            try:
                Rhino.RhinoApp.RunScript(macro, False)
            except Exception:
                _trace_log("[extract_edges] macro exception")
                continue

            curve_geometries, created_ids = _collect_new_curve_geometries(doc, baseline_ids)
            if curve_geometries:
                _trace_log("[extract_edges] command ok curves={}".format(len(curve_geometries)))
                break
        if not curve_geometries:
            _trace_log("[extract_edges] command failed: no curves created")
    finally:
        for oid in created_ids:
            try:
                doc.Objects.Delete(oid, True)
            except Exception:
                pass
        try:
            doc.Objects.Delete(temp_mesh_id, True)
        except Exception:
            pass

    return curve_geometries


def _extract_naked_edges_fallback(mesh: rg.Mesh) -> List[rg.Curve]:
    curves: List[rg.Curve] = []
    try:
        loops = mesh.GetNakedEdges()
    except Exception:
        loops = None

    if not loops:
        return curves

    for loop in loops:
        if not loop or len(loop) < 3:
            continue
        try:
            curves.append(rg.PolylineCurve(loop))
        except Exception:
            continue
    return curves


def _curve_to_closed_points(curve: rg.Curve) -> Optional[List[rg.Point3d]]:
    if curve is None:
        return None
    try:
        joined = curve.DuplicateCurve()
    except Exception:
        joined = curve

    if joined is None or not joined.IsClosed:
        return None

    try:
        ok, poly = joined.TryGetPolyline()
    except Exception:
        ok, poly = False, None

    points: List[rg.Point3d]
    if ok and poly and len(poly) >= 3:
        points = [rg.Point3d(p) for p in poly]
    else:
        try:
            t_values = joined.DivideByCount(180, True)
        except Exception:
            t_values = None
        if not t_values:
            return None
        points = [joined.PointAt(t) for t in t_values]

    if len(points) < 3:
        return None
    if points[0].DistanceTo(points[-1]) > 1e-6:
        points.append(rg.Point3d(points[0]))
    return points


def _pick_min_z_closed_curve_points(curves: Sequence[rg.Curve], tolerance: float) -> Optional[List[rg.Point3d]]:
    if not curves:
        _trace_log("[finishline] no input curves")
        return None

    try:
        joined = rg.Curve.JoinCurves(list(curves), tolerance)
    except Exception:
        joined = None
    source = list(joined) if joined else list(curves)
    _trace_log(
        "[finishline] pick_min_z input_curves={} joined_curves={} tolerance={:.6f}".format(
            len(curves),
            len(source),
            float(tolerance),
        )
    )

    candidates = []
    for cv in source:
        pts = _curve_to_closed_points(cv)
        if not pts:
            continue
        try:
            min_z = min(p.Z for p in pts)
            length = cv.GetLength()
        except Exception:
            continue
        candidates.append((float(min_z), -float(length), pts))

    if not candidates:
        _trace_log("[finishline] closed curve candidates=0")
        return None

    selected_min_z, _, selected_points = min(candidates, key=lambda item: (item[0], item[1]))
    _trace_log(
        "[finishline] closed_curves={} selected_min_z={:.6f} selected_pts={}".format(
            len(candidates),
            selected_min_z,
            len(selected_points),
        )
    )
    return selected_points


def _extract_lowest_boundary_loop_points(mesh: rg.Mesh) -> Optional[List[rg.Point3d]]:
    # LEGACY 비활성: 메시에지 추출 기반(C 전략)만 사용.
    _trace_log("[legacy-disabled] _extract_lowest_boundary_loop_points")
    return None


def _extract_lowest_cross_section(mesh: rg.Mesh) -> Optional[List[rg.Point3d]]:
    # LEGACY 비활성: 메시에지 추출 기반(C 전략)만 사용.
    _trace_log("[legacy-disabled] _extract_lowest_cross_section")
    return None


def _select_pt0(mesh: rg.Mesh) -> rg.Point3d:
    bbox = mesh.GetBoundingBox(True)
    z_min = bbox.Min.Z
    z_max = bbox.Max.Z
    height = max(1e-6, z_max - z_min)
    low = z_min + _PT0_Z_RATIO_LOW * height
    high = z_min + _PT0_Z_RATIO_HIGH * height

    best_pt: Optional[rg.Point3d] = None
    best_r = -1.0

    for v in mesh.Vertices:
        if low <= v.Z <= high:
            r = math.sqrt(v.X * v.X + v.Y * v.Y)
            if r > best_r:
                best_r = r
                best_pt = rg.Point3d(v)

    if best_pt is None:
        for v in mesh.Vertices:
            r = math.sqrt(v.X * v.X + v.Y * v.Y)
            if r > best_r:
                best_r = r
                best_pt = rg.Point3d(v)

    if best_pt is None:
        raise RuntimeError("pt0 후보를 찾을 수 없습니다 (Mesh에 버텍스가 없습니다)")
    return best_pt


# ---------------------------------------------------------------------------
# Section sampling
# ---------------------------------------------------------------------------
def _build_section_planes(count: int = _SECTION_COUNT, step_deg: float = _SECTION_STEP_DEG) -> List[rg.Plane]:
    # LEGACY 비활성: 메시에지 추출 기반(C 전략)만 사용.
    _trace_log("[legacy-disabled] _build_section_planes")
    return []


def _intersect_mesh_plane(mesh: rg.Mesh, plane: rg.Plane):
    # LEGACY 비활성: 메시에지 추출 기반(C 전략)만 사용.
    _trace_log("[legacy-disabled] _intersect_mesh_plane")
    return [], [], []


# ---------------------------------------------------------------------------
# 피니시라인 점 추출 (핵심 알고리즘)
# ---------------------------------------------------------------------------
_SIGNIFICANT_RATIO = 0.80  # 전역 max-u 대비 "의미있는" local max 비율 임계


def _find_finishline_point_on_section(
    plane: rg.Plane,
    polylines: Sequence,
) -> Optional[rg.Point3d]:
    # LEGACY 비활성: 메시에지 추출 기반(C 전략)만 사용.
    _trace_log("[legacy-disabled] _find_finishline_point_on_section")
    return None


def _order_by_azimuth(pts: Sequence[rg.Point3d]) -> List[rg.Point3d]:
    # LEGACY 비활성: 메시에지 추출 기반(C 전략)만 사용.
    _trace_log("[legacy-disabled] _order_by_azimuth")
    return list(pts)


def _detect_finishline_points(
    mesh: rg.Mesh,
    planes: Sequence[rg.Plane],
) -> Tuple[List[rg.Point3d], List[Dict[str, object]]]:
    # LEGACY 비활성: 메시에지 추출 기반(C 전략)만 사용.
    _trace_log("[legacy-disabled] _detect_finishline_points")
    return [], []


# ---------------------------------------------------------------------------
# Visualization
# ---------------------------------------------------------------------------
def _add_colored_object(doc: Rhino.RhinoDoc, geom, color: drawing.Color):
    attrs = rdo.ObjectAttributes()
    attrs.ObjectColor = color
    attrs.ColorSource = rdo.ObjectColorSource.ColorFromObject
    return doc.Objects.Add(geom, attrs)


def _add_debug_finishline_polyline_curve(
    doc: Rhino.RhinoDoc,
    points: Sequence[rg.Point3d],
) -> Optional[str]:
    if not points or len(points) < 2:
        return None
    try:
        polyline = rg.Polyline(points)
        curve = rg.PolylineCurve(polyline)
    except Exception:
        return None

    try:
        obj_id = _add_colored_object(doc, curve, drawing.Color.FromArgb(0, 255, 255))
    except Exception:
        return None

    if obj_id == System.Guid.Empty:
        return None

    try:
        doc.Views.Redraw()
    except Exception:
        pass

    _trace_log("[debug] finishline polyline curve added id={}".format(obj_id))
    return str(obj_id)


def _visualize(
    doc: Rhino.RhinoDoc,
    pt0: rg.Point3d,
    points: Sequence[rg.Point3d],
) -> Dict[str, List[str]]:
    added_ids: Dict[str, List[str]] = {"points": [], "mesh": []}

    sphere = rg.Sphere(pt0, 0.05)
    sphere_id = _add_colored_object(doc, sphere.ToBrep(), drawing.Color.FromArgb(0, 200, 0))
    added_ids["points"].append(str(sphere_id))

    if len(points) < 2:
        doc.Views.Redraw()
        return added_ids

    polyline = rg.Polyline(points)
    tube_curve = polyline.ToNurbsCurve()

    radii = System.Array[System.Double]([0.05])
    params = System.Array[System.Double]([tube_curve.Domain.T0])
    pipes = rg.Brep.CreatePipe(
        tube_curve,
        radii,
        params,
        False,
        rg.PipeCapMode.Round,
        True,
        doc.ModelAbsoluteTolerance,
        doc.ModelAngleToleranceRadians,
    )

    if pipes:
        for brep in pipes:
            obj_id = _add_colored_object(doc, brep, drawing.Color.FromArgb(220, 30, 30))
            added_ids["mesh"].append(str(obj_id))
    else:
        obj_id = _add_colored_object(doc, tube_curve, drawing.Color.FromArgb(220, 30, 30))
        added_ids["mesh"].append(str(obj_id))

    if _SHOW_POINT_TEXTDOTS:
        dot_ids: List[str] = []
        for idx, point in enumerate(points):
            if point is None:
                continue
            try:
                dot_attrs = rdo.ObjectAttributes()
                dot_attrs.ObjectColor = drawing.Color.FromArgb(255, 255, 255)
                dot_attrs.ColorSource = rdo.ObjectColorSource.ColorFromObject
                dot_id = doc.Objects.AddTextDot(str(idx), point, dot_attrs)
                dot_ids.append(str(dot_id))
            except Exception:
                continue

        if dot_ids:
            added_ids["dots"] = dot_ids

    doc.Views.Redraw()
    return added_ids


def _visualize_all_sections(
    doc: Rhino.RhinoDoc,
    sections: Sequence[Dict[str, object]],
) -> List[str]:
    palette = [
        drawing.Color.FromArgb(255, 215, 0),   # gold
        drawing.Color.FromArgb(135, 206, 250), # light sky blue
        drawing.Color.FromArgb(255, 105, 180), # hot pink
        drawing.Color.FromArgb(152, 251, 152), # pale green
        drawing.Color.FromArgb(238, 130, 238), # violet
        drawing.Color.FromArgb(255, 165, 0),   # orange
        drawing.Color.FromArgb(176, 196, 222), # steel blue light
    ]

    ids: List[str] = []
    for idx, section in enumerate(sections):
        curves = section.get("curves") or []
        if not curves:
            continue
        color = palette[idx % len(palette)]
        for curve in curves:
            if curve is None:
                continue
            cid = _add_colored_object(doc, curve, color)
            ids.append(str(cid))
    return ids


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------
def detect_finish_line(
    doc: Optional[Rhino.RhinoDoc] = None,
    mesh_id=None,
    visualize: bool = True,
    strategy: str = "A",  # 호환성 유지용 (A만 지원)
) -> Dict[str, object]:
    """피니시라인 폐곡선을 계산하고 시각화 geometry를 추가한다.

    알고리즘:
      - Mesh explode 후 max-Z 파트 선택
      - 선택 파트에서 ExtractMeshEdges(떨어짐/결합) 실행
      - 결과 커브 중 min-Z 폐곡선 선택
    """
    doc = _get_active_doc(doc)
    _trace_log("[detect] strategy=C_EDGE_ONLY")
    mesh_obj, mesh_geom = _pick_primary_mesh(doc, mesh_id=mesh_id)
    mesh_copy = mesh_geom.DuplicateMesh()
    if mesh_copy is None:
        raise RuntimeError("Mesh 복제에 실패했습니다")

    candidates = _explode_components_sorted_by_max_z(mesh_copy)
    if not candidates:
        candidates = [mesh_copy]

    pt0 = _select_pt0(candidates[0])
    traced_points: Optional[List[rg.Point3d]] = None
    strategy_used = "C_EXTRACT_MESH_EDGES_UNWELDED"

    for idx, target_mesh in enumerate(candidates):
        _trace_log(
            "[detect] candidate[{}] vertices={} faces={} key={}".format(
                idx,
                target_mesh.Vertices.Count,
                target_mesh.Faces.Count,
                _mesh_z_key(target_mesh),
            )
        )

        edge_curves = _extract_mesh_edges_with_command(doc, target_mesh)
        strategy_used = "C_EXTRACT_MESH_EDGES_UNWELDED"
        if not edge_curves:
            _trace_log("[detect] candidate[{}] edge command produced 0 curves, fallback=naked_edges".format(idx))
            edge_curves = _extract_naked_edges_fallback(target_mesh)
            strategy_used = "C_FALLBACK_NAKED_EDGES"

        _trace_log(
            "[detect] candidate[{}] edge_curves={} strategy={}".format(
                idx,
                len(edge_curves),
                strategy_used,
            )
        )

        traced_points = _pick_min_z_closed_curve_points(edge_curves, doc.ModelAbsoluteTolerance)
        if traced_points and len(traced_points) >= 3:
            strategy_used = "{}#candidate{}".format(strategy_used, idx)
            break

    if not traced_points or len(traced_points) < 3:
        raise RuntimeError(
            "ExtractMeshEdges 결과에서 min-Z 폐곡선을 찾지 못했습니다 (candidates={})".format(len(candidates))
        )

    sections: List[Dict[str, object]] = []
    planes = []

    viz_ids: Dict[str, List[str]] = {"points": [], "mesh": []}
    if _DEBUG_ADD_POLYLINE_CURVE:
        debug_curve_id = _add_debug_finishline_polyline_curve(doc, traced_points)
        if debug_curve_id:
            viz_ids["debug_curve"] = [debug_curve_id]

    if visualize:
        base_viz = _visualize(doc, pt0, traced_points)
        for key, values in base_viz.items():
            viz_ids[key] = values
        section_ids = _visualize_all_sections(doc, sections)
        if section_ids:
            viz_ids["sections"] = section_ids

    return {
        "pt0": pt0,
        "points": traced_points,
        "plane_count": len(traced_points),
        "mesh_object_id": mesh_obj.Id,
        "visualization": viz_ids,
        "strategy_used": strategy_used,
    }


def main():
    result = detect_finish_line()
    print("[finishline] plane_count=", result["plane_count"], "pts=", len(result["points"]))


if __name__ == "__main__":
    main()
