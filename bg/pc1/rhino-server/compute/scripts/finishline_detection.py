"""Finish line detection for abutment STL meshes.

## 알고리즘 개요 (전략 A — 단면 외경 최대점 방위 정렬)

1. **대상 Mesh 선택**: 활성 Rhino 문서에서 가장 큰 Mesh(버텍스 수 + 대각선 길이 기준)를
   골라 주 대상으로 사용한다.

2. **pt0 결정 (시각화용)**: Bounding box 높이의 20~55% Z 구간에서 XY 반경이 최대인
   버텍스를 pt0로 선택한다. (녹색 구로 시각화)

3. **단면 평면 생성**: Z축을 포함하는 평면을 40개, 9° 간격으로 회전시켜 만든다.
   각 평면의 XAxis는 (cos θ, sin θ, 0), YAxis는 Z축이다.

4. **단면 교차**: `Intersection.MeshPlane(mesh, plane)`으로 각 평면의 단면 polyline을
   얻는다. 단면은 어버트먼트 외곽선 + (경우에 따라) 내부 루프로 구성된다.

5. **평면별 피니시라인 점 추출 (핵심)**:
   각 단면의 모든 점 P에 대해 `u = plane.XAxis·(P - plane.Origin)`을 계산하고,
   u > 0 (양의 XAxis 쪽 = 해당 평면 방위각 θ 방향)에서 u가 최대인 점을 그 방위각의
   피니시라인 점으로 선택한다.

   기하학적 의미: 피니시라인은 정의상 어버트먼트가 방위각별로 가장 외곽으로 부푸는
   어깨의 능선이다. 따라서 방위각 θ 방향의 최대 수평 돌출거리 u_max = 그 방위각의
   피니시라인 점이다.

6. **방위각 정렬**: 40개 점을 atan2(y, x) 오름차순으로 정렬하고 시작점을 덧붙여
   폐곡선을 만든다. 이전 점과의 거리 제약이나 tracking 없이 각 단면 독립적으로
   결정되므로 drift/지그재그가 원천 차단된다.

7. **시각화**: pt0는 반경 0.05의 녹색 구, 피니시라인은 빨간 튜브(반경 0.05), 필요 시
   40개 단면 교차 곡선을 팔레트 색으로 그린다.
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
_DEBUG_TRACE = os.environ.get("FINISHLINE_TRACE_DEBUG", "1") in ("1", "true", "TRUE")


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
    planes: List[rg.Plane] = []
    z_axis = rg.Vector3d(0, 0, 1)
    for idx in range(count):
        angle = math.radians(step_deg * idx)
        x_dir = rg.Vector3d(math.cos(angle), math.sin(angle), 0)
        if not x_dir.IsValid or x_dir.IsZero:
            x_dir = rg.Vector3d(1, 0, 0)
        planes.append(rg.Plane(rg.Point3d.Origin, x_dir, z_axis))
    return planes


def _intersect_mesh_plane(mesh: rg.Mesh, plane: rg.Plane):
    """Returns (polylines, all_points, curves) from the mesh-plane intersection.

    polylines: Rhino.Geometry.Polyline 리스트 (순서 있는 원본) — local max 탐색에 사용
    all_points: 모든 polyline의 점을 flat 리스트로 모은 것 (디버그/시각화 호환용)
    curves: 시각화용 PolylineCurve 리스트
    """
    try:
        polylines = intersect.Intersection.MeshPlane(mesh, plane)
    except Exception:
        polylines = None

    valid_polylines = []
    pts: List[rg.Point3d] = []
    curves: List[rg.Curve] = []
    if not polylines:
        return valid_polylines, pts, curves

    for pl in polylines:
        if not pl:  # type: ignore[truthy-bool]
            continue
        valid_polylines.append(pl)
        for p in pl:
            pts.append(rg.Point3d(p))
        try:
            curves.append(rg.PolylineCurve(pl))
        except Exception:
            pass
    return valid_polylines, pts, curves


# ---------------------------------------------------------------------------
# 피니시라인 점 추출 (핵심 알고리즘)
# ---------------------------------------------------------------------------
_SIGNIFICANT_RATIO = 0.80  # 전역 max-u 대비 "의미있는" local max 비율 임계


def _find_finishline_point_on_section(
    plane: rg.Plane,
    polylines: Sequence,
) -> Optional[rg.Point3d]:
    """단면 프로파일에서 **가장 낮은 의미있는 local max** 점을 피니시라인 점으로 반환.

    배경:
      단순 max-u(전역 최대 외경)는 상단 돔이 피니시라인보다 넓은 방위각에서 돔 정점을
      잘못 선택한다. 피니시라인의 기하학적 정의는 "각 방위각에서 외곽으로 돌출된
      볼록 능선 중 가장 아래쪽" 이므로 local max 기반 탐색이 정확하다.

    알고리즘:
      1. 각 polyline을 순회하며 u(P) = plane.XAxis·(P-origin) 계산.
      2. u>0 이고 u[i] ≥ u[i-1], u[i] ≥ u[i+1] 인 지점을 local max로 수집.
      3. 전역 최대 u의 _SIGNIFICANT_RATIO(80%) 이상인 후보만 유효로 본다.
      4. 유효 후보 중 v(=Z)가 가장 작은 점 선택.
      5. local max 자체가 없으면 전역 max-u로 fallback.
    """
    origin = plane.Origin
    xaxis = plane.XAxis

    def to_uv(pt: rg.Point3d) -> Tuple[float, float]:
        dx = pt.X - origin.X
        dy = pt.Y - origin.Y
        u = dx * xaxis.X + dy * xaxis.Y
        v = pt.Z - origin.Z
        return u, v

    local_maxima: List[Tuple[float, float, rg.Point3d]] = []
    global_max_u = 0.0
    global_max_pt: Optional[rg.Point3d] = None

    for pl in polylines:
        n = len(pl)
        if n < 3:
            continue
        # 닫힌 polyline 판정 (첫점과 끝점 일치 여부)
        try:
            is_closed = pl[0].DistanceTo(pl[n - 1]) < 1e-6
        except Exception:
            is_closed = False
        count = n - 1 if is_closed else n

        uvs = [to_uv(rg.Point3d(pl[i])) for i in range(count)]

        for i in range(count):
            u_i, v_i = uvs[i]
            if u_i > global_max_u:
                global_max_u = u_i
                global_max_pt = rg.Point3d(pl[i])
            if u_i <= 0:
                continue
            # 이웃 인덱스
            if is_closed:
                u_prev = uvs[(i - 1) % count][0]
                u_next = uvs[(i + 1) % count][0]
            else:
                if i == 0 or i == count - 1:
                    continue
                u_prev = uvs[i - 1][0]
                u_next = uvs[i + 1][0]

            if u_i >= u_prev and u_i >= u_next:
                local_maxima.append((u_i, v_i, rg.Point3d(pl[i])))

    if not local_maxima:
        return global_max_pt  # 프로파일에 명확한 local max 없으면 fallback

    threshold = global_max_u * _SIGNIFICANT_RATIO
    significant = [item for item in local_maxima if item[0] >= threshold]
    if not significant:
        significant = local_maxima

    # 가장 낮은 v(=Z) 선택 → 피니시라인은 프로파일 하단부 local max
    _, _, best_pt = min(significant, key=lambda item: item[1])
    return best_pt


def _order_by_azimuth(pts: Sequence[rg.Point3d]) -> List[rg.Point3d]:
    """XY 평면에서 원점 기준 방위각(atan2) 오름차순으로 정렬 후 폐곡선화."""
    if len(pts) < 2:
        return list(pts)

    ordered = sorted(pts, key=lambda p: math.atan2(p.Y, p.X))
    ordered.append(rg.Point3d(ordered[0]))
    return ordered


def _detect_finishline_points(
    mesh: rg.Mesh,
    planes: Sequence[rg.Plane],
) -> Tuple[List[rg.Point3d], List[Dict[str, object]]]:
    """40개 평면 각각에서 피니시라인 점 1개를 추출해 방위각 정렬로 반환.

    반환값:
      (ordered_points, sections)
        ordered_points: 방위각 정렬된 폐곡선 포인트 리스트
        sections: 시각화/디버그용 단면 데이터 [{plane, curves, points, picked}]
    """
    sections: List[Dict[str, object]] = []
    picked: List[rg.Point3d] = []

    for idx, plane in enumerate(planes):
        polylines, raw_pts, curves = _intersect_mesh_plane(mesh, plane)
        pick = _find_finishline_point_on_section(plane, polylines)
        sections.append({
            "index": idx,
            "plane": plane,
            "curves": curves,
            "points": raw_pts,
            "picked": pick,
        })

        if pick is not None:
            picked.append(pick)
            _trace_log(
                "[section] idx={:02d} pts={} pick=({:.3f},{:.3f},{:.3f}) r={:.3f}".format(
                    idx,
                    len(raw_pts),
                    pick.X, pick.Y, pick.Z,
                    math.sqrt(pick.X ** 2 + pick.Y ** 2),
                )
            )
        else:
            _trace_log("[section] idx={:02d} pts={} pick=None".format(idx, len(raw_pts)))

    ordered = _order_by_azimuth(picked)
    return ordered, sections


# ---------------------------------------------------------------------------
# Visualization
# ---------------------------------------------------------------------------
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

    알고리즘 (전략 A — 유일):
      - 40개 수직 단면 평면(9° 간격)으로 메시 절단
      - 각 단면에서 plane.XAxis 방향 최대 돌출점 선택 (= 방위각별 최대 외경점)
      - 40개 점을 방위각(atan2) 정렬로 폐곡선 구성
    """
    doc = _get_active_doc(doc)
    mesh_obj, mesh_geom = _pick_primary_mesh(doc, mesh_id=mesh_id)
    mesh_copy = mesh_geom.DuplicateMesh()
    if mesh_copy is None:
        raise RuntimeError("Mesh 복제에 실패했습니다")

    pt0 = _select_pt0(mesh_copy)
    planes = _build_section_planes()

    traced_points, sections = _detect_finishline_points(mesh_copy, planes)
    _trace_log(
        "[detect] strategy=A sections={} picked={}".format(
            len(sections), len(traced_points) - 1 if len(traced_points) > 1 else 0
        )
    )

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
        "strategy_used": "A",
    }


def main():
    result = detect_finish_line()
    print("[finishline] plane_count=", result["plane_count"], "pts=", len(result["points"]))


if __name__ == "__main__":
    main()
