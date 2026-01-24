"""Finish line detection helpers for abutment STL meshes.

요구 사항
1. 모델 높이 20~80% 구간에서 r=√(x²+y²) 최대 버텍스를 pt0로 선택
2. XZ 평면 기준 3도 간격으로 회전하며 Z축을 포함하는 120개 평면 생성
3. 각 평면과 STL의 단면 교차(polyline)로 후보 점 수집 (mesh vertices 직접 사용 X)
4. 이전 평면에서 확정된 점에 가장 가까운 후보를 연속 추적하여 120개 점 폐곡선 형성
5. 시각화: pt0는 반경 0.1 구(Sphere) 녹색, 추적 곡선은 빨간색 튜브(반경 0.03)

이 모듈은 Rhino Python 환경에서 실행/임포트 할 수 있도록 작성되었다.

## Finish Line Detection 알고리즘 요약
1. **대상 Mesh 선택**: 활성 Rhino 문서에서 가장 큰 Mesh(버텍스 수 + 대각선 길이 기준)를 골라 주 대상으로 사용한다.
2. **pt0 결정**: Bounding box 높이의 20~60% Z 구간에서 XY 반경(r=√x²+y²)이 최대인 버텍스를 pt0로 선택한다.
3. **단면 평면 생성**: Z축을 포함하는 평면을 60개, 6° 간격으로 회전시키며 만들어 한 바퀴를 샘플링한다.
4. **단면 샘플링**: 각 평면과 Mesh의 교차를 PolylineCurve로 얻고, 곡선 제어점/샘플점을 추출한 뒤 동일한 20~60% Z 범위로 필터링한다.
5. **후보 정리**: 평면별로 필터링된 후보 점 목록을 저장하고, pt0가 속한 평면 인덱스를 시작점으로 잡는다.
6. **곡선 추적**: 이전 선택점과의 3D 거리가 1mm 이하인 후보 중 XY 반경이 가장 큰 점을 `_NEAREST_LIMIT=20` 내에서 고르며 순차적으로 이동한다. 조건을 만족하는 후보가 없으면 추적을 중단한다.
7. **시각화**: pt0는 반경 0.1의 녹색 구, 추적 결과는 빨간 튜브(반경 0.03)로 표현하며 필요 시 모든 단면 곡선을 팔레트 색으로 그린다.

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

_SECTION_COUNT = 60
_SECTION_STEP_DEG = 6.0
_NEAREST_LIMIT = 20
_MAX_STEP_DISTANCE = 1
_DIST_TOL = 1e-8
_DEBUG_TRACE = os.environ.get("FINISHLINE_TRACE_DEBUG", "1") in ("1", "true", "TRUE")


def _trace_log(msg):
    if not _DEBUG_TRACE:
        return
    try:
        print(msg)
    except Exception:
        pass


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


def _pick_primary_mesh(doc: Rhino.RhinoDoc, mesh_id=None) -> Tuple[rdo.MeshObject, rg.Mesh]:
    if mesh_id:
        obj = doc.Objects.FindId(mesh_id)
        if obj and obj.ObjectType == rdo.ObjectType.Mesh and obj.Geometry:
            return obj, obj.Geometry
        raise RuntimeError("지정한 mesh_id를 찾을 수 없습니다")

    meshes = _collect_mesh_objects(doc)
    if not meshes:
        raise RuntimeError("문서에서 Mesh 객체를 찾을 수 없습니다")

    def weight(mo: rdo.MeshObject) -> float:
        geom = mo.Geometry
        if geom is None:
            return -1.0
        try:
            bbox = geom.GetBoundingBox(True)
            diag = bbox.Diagonal.Length
        except Exception:
            diag = 0.0
        return float(geom.Vertices.Count) + diag

    meshes.sort(key=weight, reverse=True)
    target = meshes[0]
    geom = target.Geometry
    if geom is None:
        raise RuntimeError("선택된 Mesh 객체에서 Geometry를 읽을 수 없습니다")
    return target, geom


def _select_pt0(mesh: rg.Mesh) -> rg.Point3d:
    bbox = mesh.GetBoundingBox(True)
    z_min = bbox.Min.Z
    z_max = bbox.Max.Z
    height = max(1e-6, z_max - z_min)
    low = z_min + 0.2 * height
    high = z_min + 0.6 * height

    best_pt: Optional[rg.Point3d] = None
    best_r = -1.0

    def consider_vertex(pt: rg.Point3f, best: Tuple[Optional[rg.Point3d], float]) -> Tuple[Optional[rg.Point3d], float]:
        r = math.sqrt(pt.X * pt.X + pt.Y * pt.Y)
        if r > best[1]:
            return rg.Point3d(pt), r
        return best

    for v in mesh.Vertices:
        if low <= v.Z <= high:
            best_pt, best_r = consider_vertex(v, (best_pt, best_r))

    if best_pt is None:
        for v in mesh.Vertices:
            best_pt, best_r = consider_vertex(v, (best_pt, best_r))

    if best_pt is None:
        raise RuntimeError("pt0 후보를 찾을 수 없습니다 (Mesh에 버텍스가 없습니다)")
    return best_pt


def _build_section_planes(count: int = _SECTION_COUNT, step_deg: float = _SECTION_STEP_DEG) -> List[rg.Plane]:
    planes: List[rg.Plane] = []
    z_axis = rg.Vector3d(0, 0, 1)
    for idx in range(count):
        angle = math.radians(step_deg * idx)
        x_dir = rg.Vector3d(math.cos(angle), math.sin(angle), 0)
        if not x_dir.IsValid or x_dir.IsZero:
            x_dir = rg.Vector3d(1, 0, 0)
        planes.append(rg.Plane(rg.Point3d.Origin, x_dir, z_axis))
    return planes


def _curve_control_points(curve: rg.Curve) -> List[rg.Point3d]:
    pts: List[rg.Point3d] = []
    nurbs = None
    try:
        nurbs = curve.ToNurbsCurve()
    except Exception:
        nurbs = None

    if nurbs is not None:
        try:
            for i in range(nurbs.Points.Count):
                pts.append(nurbs.Points[i].Location)
            return pts
        except Exception:
            pts = []

    try:
        polyline = curve.ToPolyline(0, 0, 0, 0, 0, 0, True)
        if polyline:
            pts.extend([rg.Point3d(pt) for pt in polyline])
    except Exception:
        pass

    return pts


def _filter_points_by_z(points: Sequence[rg.Point3d], low_z: float, high_z: float) -> List[rg.Point3d]:
    return [pt for pt in points if low_z <= pt.Z <= high_z]


def _sample_plane_section(
    mesh: rg.Mesh,
    plane: rg.Plane,
    low_z: float,
    high_z: float,
) -> Tuple[List[rg.Point3d], List[rg.Curve], List[rg.Point3d]]:
    try:
        polylines = intersect.Intersection.MeshPlane(mesh, plane)
    except Exception:
        polylines = None

    points: List[rg.Point3d] = []
    curves: List[rg.Curve] = []
    control_points: List[rg.Point3d] = []

    if not polylines:
        return points, curves, control_points

    for pl in polylines:
        if not pl:  # type: ignore[truthy-bool]
            continue
        sample_pts = [rg.Point3d(pt) for pt in pl]
        points.extend(sample_pts)
        try:
            poly_curve = rg.PolylineCurve(pl)
        except Exception:
            poly_curve = None
        if poly_curve is not None:
            curves.append(poly_curve)
            control_points.extend(_curve_control_points(poly_curve))

    filtered_points = _filter_points_by_z(points, low_z, high_z)
    filtered_controls = _filter_points_by_z(control_points, low_z, high_z)
    return filtered_points, curves, filtered_controls


def _collect_section_data(mesh: rg.Mesh, planes: Sequence[rg.Plane]):
    sections = []
    bbox = mesh.GetBoundingBox(True)
    z_min = bbox.Min.Z
    z_max = bbox.Max.Z
    height = max(1e-6, z_max - z_min)

    # _select_pt0와 동일한 20~60% 구간 필터
    low_z = z_min + 0.2 * height
    high_z = z_min + 0.6 * height

    for idx, plane in enumerate(planes):
        pts, curves, ctrl_pts = _sample_plane_section(mesh, plane, low_z, high_z)
        sections.append(
            {
                "index": idx,
                "points": pts,
                "curves": curves,
                "controls": ctrl_pts,
                "plane": plane,
            }
        )
    return sections


def _select_outermost_nearby(
    ref_point: rg.Point3d,
    candidates: Sequence[rg.Point3d],
    limit: int = _NEAREST_LIMIT,
    max_distance: Optional[float] = None,
):
    if not candidates:
        return None

    filtered: List[Tuple[float, rg.Point3d]] = []
    for pt in candidates:
        try:
            dist = pt.DistanceTo(ref_point)
            if max_distance is not None and dist > (max_distance + _DIST_TOL):
                continue
            filtered.append((dist, pt))
        except Exception:
            continue

    if not filtered:
        return None

    filtered.sort(key=lambda pair: pair[0])
    limited = [pair[1] for pair in filtered[: max(1, limit)]]

    return max(limited, key=lambda pt: (pt.X * pt.X + pt.Y * pt.Y))


def _pick_start_pt(pt0: rg.Point3d, sections: Sequence[Dict[str, Sequence]]):
    best = None
    for idx, section in enumerate(sections):
        candidates = section.get("controls") or section.get("points") or []
        # 시작점은 거리 제한 없이 pt0에서 가장 가까운 영역 중 외곽 선택
        chosen = _select_outermost_nearby(pt0, candidates, max_distance=None)
        if chosen is not None:
            dist = chosen.DistanceTo(pt0)
            if best is None or dist < best[0]:
                best = (dist, idx, chosen)
    if best is None:
        raise RuntimeError("단면 교차에서 어떤 점도 얻지 못했습니다")
    return best[1], best[2]


def _trace_finishline_points(
    start_idx: int,
    start_pt: rg.Point3d,
    sections: Sequence[Dict[str, Sequence]],
) -> Tuple[List[rg.Point3d], Dict[int, rg.Point3d]]:
    total = len(sections)
    if total == 0:
        raise RuntimeError("Plane 후보가 없습니다")

    traced: List[rg.Point3d] = [rg.Point3d(start_pt)]
    last = rg.Point3d(start_pt)
    section_points: Dict[int, rg.Point3d] = {start_idx: rg.Point3d(start_pt)}

    for step in range(1, total):
        idx = (start_idx + step) % total
        candidates = sections[idx].get("controls") or sections[idx].get("points", [])
        
        # 3D 거리 1mm 제한 적용
        best_pt = _select_outermost_nearby(
            last,
            candidates,
            max_distance=_MAX_STEP_DISTANCE,
        )

        if best_pt is None:
            all_sorted = sorted(candidates, key=lambda p: p.DistanceTo(last)) if candidates else []
            min_dist = all_sorted[0].DistanceTo(last) if all_sorted else -1
            _trace_log(
                "[trace] STOP: no candidates within {:.3f}mm at step {} (closest {:.3f}mm)".format(
                    _MAX_STEP_DISTANCE, step, min_dist
                )
            )
            break

        new_pt = rg.Point3d(best_pt)
        move_len = new_pt.DistanceTo(last)
        _trace_log(
            "[trace] step={} plane_idx={} move_len={:.4f}mm".format(step, idx, move_len)
        )

        if move_len > (_MAX_STEP_DISTANCE + _DIST_TOL):
            _trace_log(
                "[trace] ERROR: jump {:.3f}mm at step {}, terminating trace".format(
                    move_len, step
                )
            )
            break

        section_points[idx] = new_pt
        traced.append(new_pt)
        last = new_pt  # 기준점 갱신 (반드시 수행)

    if len(traced) > 2:
        traced.append(rg.Point3d(traced[0]))

    return traced, section_points


def _add_colored_object(doc: Rhino.RhinoDoc, geom, color: drawing.Color):
    attrs = rdo.ObjectAttributes()
    attrs.ObjectColor = color
    attrs.ColorSource = rdo.ObjectColorSource.ColorFromObject
    return doc.Objects.Add(geom, attrs)


def _visualize(
    doc: Rhino.RhinoDoc,
    pt0: rg.Point3d,
    points: Sequence[rg.Point3d],
) -> Dict[str, List[str]]:
    added_ids: Dict[str, List[str]] = {"points": [], "mesh": []}

    sphere = rg.Sphere(pt0, 0.02)
    sphere_id = _add_colored_object(doc, sphere.ToBrep(), drawing.Color.FromArgb(0, 200, 0))
    added_ids["points"].append(str(sphere_id))

    polyline = rg.Polyline(points)
    tube_curve = polyline.ToNurbsCurve()

    radii = System.Array[System.Double]([0.03])
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
        # 파이프 생성 실패 시 폴리라인만 추가
        obj_id = _add_colored_object(doc, tube_curve, drawing.Color.FromArgb(220, 30, 30))
        added_ids["mesh"].append(str(obj_id))

    doc.Views.Redraw()
    return added_ids


def _visualize_all_sections(doc: Rhino.RhinoDoc, sections: Sequence[Dict[str, Sequence]]):
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


def detect_finish_line(
    doc: Optional[Rhino.RhinoDoc] = None,
    mesh_id=None,
    visualize: bool = True,
) -> Dict[str, object]:
    """Compute finish line polyline and optionally add visualization geometry."""

    doc = _get_active_doc(doc)
    mesh_obj, mesh_geom = _pick_primary_mesh(doc, mesh_id=mesh_id)
    mesh_copy = mesh_geom.DuplicateMesh()
    if mesh_copy is None:
        raise RuntimeError("Mesh 복제에 실패했습니다")

    pt0 = _select_pt0(mesh_copy)
    planes = _build_section_planes()
    sections = _collect_section_data(mesh_copy, planes)
    start_idx, start_pt = _pick_start_pt(pt0, sections)
    traced_points, _ = _trace_finishline_points(start_idx, start_pt, sections)

    viz_ids: Dict[str, List[str]] = {"points": [], "mesh": []}
    if visualize:
        viz_ids = _visualize(doc, pt0, traced_points)
        section_ids = _visualize_all_sections(doc, sections)
        if section_ids:
            viz_ids["sections"] = section_ids

    return {
        "pt0": pt0,
        "points": traced_points,
        "plane_count": len(planes),
        "mesh_object_id": mesh_obj.Id,
        "visualization": viz_ids,
    }


def main():
    result = detect_finish_line()
    print("[finishline] plane_count=", result["plane_count"], "pts=", len(result["points"]))


if __name__ == "__main__":
    main()