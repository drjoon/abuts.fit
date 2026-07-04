"""Finish line detection helpers for abutment STL meshes.

요구 사항
1) Edge 기반(ExtractMeshEdges) 피니시라인을 먼저 시도
2) edge 결과 min-Z가 0.5mm 이하면 비정상으로 간주
3) 비정상 시 단면 추적 기반으로 재시도
4) 단면 추적은 XZ 평면 40개(9도 간격) 사용
5) 시각화: pt0 반경 0.1 구(녹색), 추적 곡선 빨간 튜브(반경 0.03)
"""

from __future__ import annotations

import math
import os
from typing import Dict, List, Optional, Sequence, Tuple

import Rhino
import Rhino.DocObjects as rdo
import Rhino.Geometry as rg
import Rhino.Geometry.Intersect as intersect
import System
import System.Drawing as drawing

_SECTION_COUNT = 40  # increased sampling (was 20)
_SECTION_STEP_DEG = 9.0  # 360/40 = 9 degrees
_NEAREST_LIMIT = 10
_MAX_STEP_DISTANCE = 1.5  # allow slightly larger step to tolerate gaps
_PT0_Z_RATIO_LOW = 0.2
_PT0_Z_RATIO_HIGH = 0.6
_Z_RATIO_LOW = 0.2
_Z_RATIO_HIGH = 0.7
_TARGET_TRACE_POINT_COUNT = 120
_SHOW_POINT_TEXTDOTS = False
_DIST_TOL = 1e-8
_DEBUG_TRACE = os.environ.get("FINISHLINE_TRACE_DEBUG", "0") in ("1", "true", "TRUE")
_DEBUG_KEEP_TEMP_OBJECTS = os.environ.get(
    "FINISHLINE_DEBUG_KEEP_TEMP_OBJECTS", "0"
) in (
    "1",
    "true",
    "TRUE",
)
_DEBUG_ADD_POLYLINE_CURVE = os.environ.get("FINISHLINE_DEBUG_CURVE_DOC", "0") in (
    "1",
    "true",
    "TRUE",
)
# 섹션 곡선(40개 평면)을 문서에 모두 그리면 느려질 수 있어 기본 비활성
_SHOW_ALL_SECTION_CURVES = os.environ.get("FINISHLINE_SHOW_ALL_SECTIONS", "0") in (
    "1",
    "true",
    "TRUE",
)
# ExtractMeshEdges 결과가 너무 낮은 Z로 잡히는 경우(포스트/치은 미분리 샘플) 차단 임계값
_EDGE_MIN_Z_VALID_THRESHOLD_MM = 0.5
# edge 루프가 pt0 대비 지나치게 안쪽(내부 홀)일 때 차단하는 반경 비율 임계값
_EDGE_MIN_RADIUS_TO_PT0_RATIO = 0.45
# edge 루프가 메시 외곽 반경 대비 너무 작으면(내부 스크류홀/내부 경계) 차단
_EDGE_MIN_RADIUS_TO_MESH_BAND_RATIO = 0.55
# edge 루프가 pt0 대비 과도하게 상단에 있으면 오검출로 간주
_EDGE_MAX_Z_ABOVE_PT0_MM = 2.5
# edge 루프가 pt0 대비 과도하게 하단에 있으면 내부 루프/홀 경계 오검출로 간주
_EDGE_MAX_Z_BELOW_PT0_MM = 2.5
# edge 루프의 Z 변화폭이 지나치게 작으면(거의 수평 링) 내부 경계 오검출로 간주
_EDGE_MIN_Z_SPAN_MM = 0.08

# traced finishline 품질 검증(아웃라이어 세그먼트) 임계값
_OUTLIER_SEGMENT_RATIO = 2.8  # max(segment) / median(segment)
_OUTLIER_SEGMENT_ABS_MM = 2.0  # mm
_OUTLIER_DZ_RATIO = 4.0  # max(|dz|) / median(|dz|)
_OUTLIER_DZ_ABS_MM = 1.5  # mm

_EXTERNAL_LOGGER = None


def set_external_logger(logger_fn) -> None:
    global _EXTERNAL_LOGGER
    _EXTERNAL_LOGGER = logger_fn


def _merge_candidates(
    primary: Sequence[rg.Point3d], secondary: Sequence[rg.Point3d]
) -> List[rg.Point3d]:
    # 기존 O(n^2) Distance 비교를 피하기 위해 좌표 quantization 기반으로 dedup
    # (동일/근접 중복 제거 목적에는 충분하고, 단면 추적 성능을 크게 개선)
    merged: List[rg.Point3d] = []
    seen = set()

    def _add(pt: rg.Point3d) -> None:
        if pt is None:
            return
        try:
            key = (
                int(round(float(pt.X) * 1e6)),
                int(round(float(pt.Y) * 1e6)),
                int(round(float(pt.Z) * 1e6)),
            )
        except Exception:
            return
        if key in seen:
            return
        seen.add(key)
        merged.append(rg.Point3d(pt))

    for pt in primary:
        _add(pt)
    for pt in secondary:
        _add(pt)

    return merged


def _trace_log(msg: str) -> None:
    if not _DEBUG_TRACE:
        return
    try:
        print(msg)
    except Exception:
        pass

    if _EXTERNAL_LOGGER is not None:
        try:
            _EXTERNAL_LOGGER("[finishline-debug] " + str(msg))
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


def _detect_finishline_points_edge(
    doc: Rhino.RhinoDoc,
    mesh: rg.Mesh,
) -> Tuple[Optional[List[rg.Point3d]], str]:
    candidates = _explode_components_sorted_by_max_z(mesh)
    if not candidates:
        candidates = [mesh]

    ref_pt0 = None
    ref_pt0_radius = None
    try:
        ref_pt0 = _select_pt0(mesh)
        ref_pt0_radius = float(math.sqrt(ref_pt0.X * ref_pt0.X + ref_pt0.Y * ref_pt0.Y))
    except Exception:
        ref_pt0 = None
        ref_pt0_radius = None

    rejected_low_z = 0
    rejected_high_z = 0
    rejected_low_vs_pt0 = 0
    rejected_small_radius = 0
    rejected_below_band = 0
    rejected_flat_z = 0

    best_score = None
    best_points: Optional[List[rg.Point3d]] = None
    best_strategy: Optional[str] = None

    for idx, target_mesh in enumerate(candidates):
        _trace_log(
            "[detect-edge] candidate[{}] vertices={} faces={} key={}".format(
                idx,
                target_mesh.Vertices.Count,
                target_mesh.Faces.Count,
                _mesh_z_key(target_mesh),
            )
        )

        edge_curves = _extract_mesh_edges_with_command(doc, target_mesh)
        strategy_used = "C_EXTRACT_MESH_EDGES_UNWELDED"
        if not edge_curves:
            edge_curves = _extract_naked_edges_fallback(target_mesh)
            strategy_used = "C_FALLBACK_NAKED_EDGES"

        _trace_log(
            "[detect-edge] candidate[{}] edge_curves_count={}".format(
                idx, len(edge_curves) if edge_curves else 0
            )
        )
        mesh_band_max_r = _mesh_max_radius_in_z_band(target_mesh)
        traced_points = _pick_best_edge_loop_points(
            edge_curves,
            doc.ModelAbsoluteTolerance,
            ref_pt0,
            ref_pt0_radius,
            mesh_band_max_radius=mesh_band_max_r,
        )
        if traced_points and len(traced_points) >= 3:
            edge_min_z = _points_min_z(traced_points)
            edge_max_z = _points_max_z(traced_points)
            edge_z_span = (
                float(edge_max_z - edge_min_z)
                if edge_min_z is not None and edge_max_z is not None
                else None
            )
            _trace_log(
                "[detect-edge] candidate[{}] traced_pts={} min_z={} max_z={} z_span={}".format(
                    idx,
                    len(traced_points),
                    edge_min_z if edge_min_z is not None else float("nan"),
                    edge_max_z if edge_max_z is not None else float("nan"),
                    edge_z_span if edge_z_span is not None else float("nan"),
                )
            )
            # 요구 사항: edge 결과 min-Z가 0.5mm 이하면 비정상으로 간주
            # -> 해당 후보는 버리고 다음 edge 후보를 계속 탐색한다.
            if edge_min_z is not None and edge_min_z <= _EDGE_MIN_Z_VALID_THRESHOLD_MM:
                rejected_low_z += 1
                _trace_log(
                    "[detect-edge] candidate[{}] rejected min_z={:.6f} <= {:.3f}".format(
                        idx,
                        edge_min_z,
                        _EDGE_MIN_Z_VALID_THRESHOLD_MM,
                    )
                )
                continue

            # 거의 수평인 edge 링은 finishline이 아닌 내부 경계일 가능성이 높아 제외
            if edge_z_span is not None and edge_z_span <= _EDGE_MIN_Z_SPAN_MM:
                rejected_flat_z += 1
                _trace_log(
                    "[detect-edge] candidate[{}] rejected flat_z z_span={:.6f} <= {:.3f}".format(
                        idx,
                        edge_z_span,
                        _EDGE_MIN_Z_SPAN_MM,
                    )
                )
                continue

            # 단면 추적과 동일한 높이 대역(20~70%)의 하한보다 지나치게 낮은 edge 루프는
            # 커넥션 내부 루프/홀 경계일 가능성이 높아 제외한다.
            if edge_min_z is not None:
                try:
                    cbbox = target_mesh.GetBoundingBox(True)
                    if cbbox.IsValid:
                        cheight = max(1e-6, float(cbbox.Max.Z - cbbox.Min.Z))
                        band_low = float(cbbox.Min.Z + _Z_RATIO_LOW * cheight)
                        if edge_min_z < band_low:
                            rejected_below_band += 1
                            _trace_log(
                                "[detect-edge] candidate[{}] rejected below_band min_z={:.6f} < band_low={:.6f}".format(
                                    idx,
                                    edge_min_z,
                                    band_low,
                                )
                            )
                            continue
                except Exception:
                    pass

            if ref_pt0 is not None and edge_min_z is not None:
                max_allowed_z = ref_pt0.Z + _EDGE_MAX_Z_ABOVE_PT0_MM
                if edge_min_z >= max_allowed_z:
                    rejected_high_z += 1
                    _trace_log(
                        "[detect-edge] candidate[{}] rejected high_z min_z={:.6f} >= pt0_z+{:.3f} ({:.6f})".format(
                            idx,
                            edge_min_z,
                            _EDGE_MAX_Z_ABOVE_PT0_MM,
                            max_allowed_z,
                        )
                    )
                    continue

                min_allowed_z = ref_pt0.Z - _EDGE_MAX_Z_BELOW_PT0_MM
                if edge_min_z <= min_allowed_z:
                    rejected_low_vs_pt0 += 1
                    _trace_log(
                        "[detect-edge] candidate[{}] rejected low_vs_pt0 min_z={:.6f} <= pt0_z-{:.3f} ({:.6f})".format(
                            idx,
                            edge_min_z,
                            _EDGE_MAX_Z_BELOW_PT0_MM,
                            min_allowed_z,
                        )
                    )
                    continue

            edge_median_radius = _points_median_radius(traced_points)
            if (
                ref_pt0_radius is not None
                and ref_pt0_radius > _DIST_TOL
                and edge_median_radius is not None
            ):
                radius_ratio = edge_median_radius / ref_pt0_radius
                if radius_ratio <= _EDGE_MIN_RADIUS_TO_PT0_RATIO:
                    rejected_small_radius += 1
                    _trace_log(
                        "[detect-edge] candidate[{}] rejected radius_ratio={:.4f} edge_median_r={:.4f} pt0_r={:.4f} <= {:.3f}".format(
                            idx,
                            radius_ratio,
                            edge_median_radius,
                            ref_pt0_radius,
                            _EDGE_MIN_RADIUS_TO_PT0_RATIO,
                        )
                    )
                    continue

            if edge_median_radius is not None and mesh_band_max_r > _DIST_TOL:
                mesh_ratio = edge_median_radius / mesh_band_max_r
                if mesh_ratio <= _EDGE_MIN_RADIUS_TO_MESH_BAND_RATIO:
                    rejected_small_radius += 1
                    _trace_log(
                        "[detect-edge] candidate[{}] rejected mesh_ratio={:.4f} edge_median_r={:.4f} mesh_band_max_r={:.4f} <= {:.3f}".format(
                            idx,
                            mesh_ratio,
                            edge_median_radius,
                            mesh_band_max_r,
                            _EDGE_MIN_RADIUS_TO_MESH_BAND_RATIO,
                        )
                    )
                    continue

            # 첫 valid 즉시 반환하지 않고, 전체 후보 중 최적 루프를 선택한다.
            z_score = (
                -abs(float(edge_min_z) - float(ref_pt0.Z))
                if (ref_pt0 is not None and edge_min_z is not None)
                else float(edge_min_z)
                if edge_min_z is not None
                else -float("inf")
            )
            score = (
                float(edge_median_radius) if edge_median_radius is not None else -1.0,
                float(z_score),
                float(len(traced_points)),
            )
            _trace_log(
                "[detect-edge] candidate[{}] accepted score=(r={:.6f},z={:.6f},n={:.0f})".format(
                    idx,
                    score[0],
                    score[1],
                    score[2],
                )
            )
            if best_score is None or score > best_score:
                best_score = score
                best_points = traced_points
                best_strategy = "{}#candidate{}".format(strategy_used, idx)
        else:
            _trace_log(
                "[detect-edge] candidate[{}] no valid closed traced points (found={})".format(
                    idx, len(traced_points) if traced_points else 0
                )
            )

    if best_points and len(best_points) >= 3:
        _trace_log(
            "[detect-edge] selected best strategy={} score={}".format(
                best_strategy,
                best_score,
            )
        )
        return best_points, str(best_strategy or "C_EXTRACT_MESH_EDGES_UNWELDED")

    if rejected_low_z > 0:
        return None, "C_EDGE_REJECTED_LOW_Z"
    if rejected_flat_z > 0:
        return None, "C_EDGE_REJECTED_FLAT_Z"
    if rejected_high_z > 0:
        return None, "C_EDGE_REJECTED_HIGH_Z"
    if rejected_low_vs_pt0 > 0:
        return None, "C_EDGE_REJECTED_LOW_VS_PT0"
    if rejected_small_radius > 0:
        return None, "C_EDGE_REJECTED_SMALL_RADIUS"
    if rejected_below_band > 0:
        return None, "C_EDGE_REJECTED_BELOW_BAND"
    return None, "C_EDGE_FAILED"


def _mesh_xy_radius_from_bbox(mesh: rg.Mesh) -> float:
    try:
        bbox = mesh.GetBoundingBox(True)
    except Exception:
        return 0.0
    if not bbox.IsValid:
        return 0.0
    try:
        corners = bbox.GetCorners()
    except Exception:
        corners = None
    if not corners:
        return 0.0

    max_r = 0.0
    for p in corners:
        try:
            rr = float(math.sqrt(p.X * p.X + p.Y * p.Y))
            if rr > max_r:
                max_r = rr
        except Exception:
            continue
    return max_r


def _mesh_max_radius_in_z_band(
    mesh: rg.Mesh,
    low_ratio: float = _Z_RATIO_LOW,
    high_ratio: float = _Z_RATIO_HIGH,
) -> float:
    try:
        bbox = mesh.GetBoundingBox(True)
    except Exception:
        return 0.0
    if not bbox.IsValid:
        return 0.0

    z_min = float(bbox.Min.Z)
    z_max = float(bbox.Max.Z)
    height = max(1e-6, z_max - z_min)
    low_z = z_min + float(low_ratio) * height
    high_z = z_min + float(high_ratio) * height

    max_r = 0.0
    found = False
    try:
        vcount = int(mesh.Vertices.Count)
    except Exception:
        vcount = 0

    for i in range(vcount):
        try:
            v = mesh.Vertices[i]
            z = float(v.Z)
            if z < low_z or z > high_z:
                continue
            rr = float(math.sqrt(v.X * v.X + v.Y * v.Y))
            if rr > max_r:
                max_r = rr
            found = True
        except Exception:
            continue

    if found and max_r > 0.0:
        return max_r

    # band 내 점이 부족한 경우 bbox 기반으로 fallback
    return _mesh_xy_radius_from_bbox(mesh)


def _pick_primary_mesh(
    doc: Rhino.RhinoDoc, mesh_id=None
) -> Tuple[rdo.MeshObject, rg.Mesh]:
    if mesh_id:
        obj = doc.Objects.FindId(mesh_id)
        if obj and obj.ObjectType == rdo.ObjectType.Mesh and obj.Geometry:
            return obj, obj.Geometry
        raise RuntimeError("지정한 mesh_id를 찾을 수 없습니다")

    meshes = _collect_mesh_objects(doc)
    if not meshes:
        raise RuntimeError("문서에서 Mesh 객체를 찾을 수 없습니다")

    # 다중 Mesh 문서(분해/보조 파편 포함)에서 max-Z만으로 고르면
    # 작은 상단 파편이 선택될 수 있다. 먼저 XY 외곽 반경이 큰 후보군을 잡고,
    # 그 안에서 max-Z/vertex 수로 최종 선택한다.
    infos: List[Tuple[float, Tuple[float, float, float, float], rdo.MeshObject]] = []
    for mo in meshes:
        geom = mo.Geometry
        if geom is None:
            continue
        z_key = _mesh_z_key(geom)
        if z_key is None:
            continue
        xy_r = _mesh_xy_radius_from_bbox(geom)
        infos.append((xy_r, z_key, mo))

    if not infos:
        # 기존 동작과 유사한 안전 fallback
        target = meshes[0]
        geom = target.Geometry
        if geom is None:
            raise RuntimeError("선택된 Mesh 객체에서 Geometry를 읽을 수 없습니다")
        return target, geom

    max_r = max(item[0] for item in infos)
    band = max(0.05, max_r * 0.01)
    top_band = [item for item in infos if item[0] >= (max_r - band)]
    if not top_band:
        top_band = infos

    # (xy_r, z_key(maxZ,minZ,verts,diag)) 내에서 z_key 우선 + xy_r 보조
    top_band.sort(key=lambda item: (item[1], item[0]), reverse=True)
    target = top_band[0][2]
    geom = target.Geometry
    if geom is None:
        raise RuntimeError("선택된 Mesh 객체에서 Geometry를 읽을 수 없습니다")

    _trace_log(
        "[pick-mesh] meshes={} max_r={:.4f} band={:.4f} chosen_id={} chosen_xy_r={:.4f} chosen_key={}".format(
            len(meshes),
            max_r,
            band,
            target.Id,
            top_band[0][0],
            top_band[0][1],
        )
    )
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
            exploded = [
                m for m in raw_exploded if m is not None and m.Vertices.Count > 0
            ]
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
            exploded = [
                m for m in raw_exploded if m is not None and m.Vertices.Count > 0
            ]
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


def _extract_mesh_edges_with_command(
    doc: Rhino.RhinoDoc, mesh: rg.Mesh
) -> List[rg.Curve]:
    temp_mesh_id = doc.Objects.AddMesh(mesh)
    if temp_mesh_id == System.Guid.Empty:
        return []

    baseline_ids = set(obj.Id for obj in doc.Objects)
    curve_geometries: List[rg.Curve] = []
    created_ids: List[System.Guid] = []

    # Rhino 버전에 따라 ExtractMeshEdges 옵션 토큰명이 다를 수 있어 순차 시도.
    macros = [
        "! _SelNone _SelID {} _-ExtractMeshEdges _Extract=_Unwelded _Join=_Yes _Enter".format(
            temp_mesh_id
        ),
        "! _SelNone _SelID {} _-ExtractMeshEdges _EdgeType=_Unwelded _Join=_Yes _Enter".format(
            temp_mesh_id
        ),
        "! _SelNone _SelID {} _-ExtractMeshEdges _Unwelded=_Yes _Join=_Yes _Enter".format(
            temp_mesh_id
        ),
    ]

    try:
        for idx, macro in enumerate(macros):
            _trace_log(
                "[extract_edges] try[{}/{}] macro={}".format(
                    idx + 1, len(macros), macro
                )
            )
            try:
                Rhino.RhinoApp.RunScript(macro, False)
            except Exception:
                _trace_log("[extract_edges] macro exception")
                continue

            curve_geometries, created_ids = _collect_new_curve_geometries(
                doc, baseline_ids
            )
            if curve_geometries:
                _trace_log(
                    "[extract_edges] command ok curves={}".format(len(curve_geometries))
                )
                break
        if not curve_geometries:
            _trace_log("[extract_edges] command failed: no curves created")
    finally:
        if _DEBUG_KEEP_TEMP_OBJECTS:
            _trace_log(
                "[extract_edges] debug keep temp objects enabled created_curves={} temp_mesh_id={}".format(
                    len(created_ids),
                    temp_mesh_id,
                )
            )
        else:
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


def _pick_min_z_closed_curve_points(
    curves: Sequence[rg.Curve], tolerance: float
) -> Optional[List[rg.Point3d]]:
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

    selected_min_z, _, selected_points = min(
        candidates, key=lambda item: (item[0], item[1])
    )
    _trace_log(
        "[finishline] closed_curves={} selected_min_z={:.6f} selected_pts={}".format(
            len(candidates),
            selected_min_z,
            len(selected_points),
        )
    )
    return selected_points


def _pick_best_edge_loop_points(
    curves: Sequence[rg.Curve],
    tolerance: float,
    ref_pt0: Optional[rg.Point3d],
    ref_pt0_radius: Optional[float],
    mesh_band_max_radius: Optional[float] = None,
) -> Optional[List[rg.Point3d]]:
    if not curves:
        return None

    try:
        joined = rg.Curve.JoinCurves(list(curves), tolerance)
    except Exception:
        joined = None
    source = list(joined) if joined else list(curves)

    # tuple: (median_radius, z_score, length, min_z, points)
    # - median_radius: 외곽 루프 우선
    # - z_score: pt0가 있으면 |min_z-pt0_z|가 작은 루프 우선, 없으면 min_z가 높은 루프 우선
    loop_infos: List[Tuple[float, float, float, float, List[rg.Point3d]]] = []
    for cv in source:
        pts = _curve_to_closed_points(cv)
        if not pts or len(pts) < 3:
            continue

        min_z = _points_min_z(pts)
        if min_z is None:
            continue

        if min_z <= _EDGE_MIN_Z_VALID_THRESHOLD_MM:
            continue

        if ref_pt0 is not None:
            max_allowed_z = ref_pt0.Z + _EDGE_MAX_Z_ABOVE_PT0_MM
            if min_z >= max_allowed_z:
                continue
            min_allowed_z = ref_pt0.Z - _EDGE_MAX_Z_BELOW_PT0_MM
            if min_z <= min_allowed_z:
                continue

        median_r = _points_median_radius(pts)
        if (
            ref_pt0_radius is not None
            and ref_pt0_radius > _DIST_TOL
            and median_r is not None
        ):
            ratio = median_r / ref_pt0_radius
            if ratio <= _EDGE_MIN_RADIUS_TO_PT0_RATIO:
                continue

        if (
            mesh_band_max_radius is not None
            and mesh_band_max_radius > _DIST_TOL
            and median_r is not None
        ):
            mesh_ratio = median_r / mesh_band_max_radius
            if mesh_ratio <= _EDGE_MIN_RADIUS_TO_MESH_BAND_RATIO:
                continue

        try:
            length = float(cv.GetLength())
        except Exception:
            length = float(len(pts))

        if ref_pt0 is not None:
            z_score = -abs(float(min_z) - float(ref_pt0.Z))
        else:
            z_score = float(min_z)

        loop_infos.append(
            (
                float(median_r) if median_r is not None else -1.0,
                float(z_score),
                length,
                float(min_z),
                pts,
            )
        )

    if not loop_infos:
        return None

    # 외곽 반경 우선 + (pt0 기준 높이 일치도) + 길이 우선
    loop_infos.sort(key=lambda item: (item[0], item[1], item[2]), reverse=True)
    selected = loop_infos[0]
    _trace_log(
        "[finishline] edge loops={} selected median_r={:.6f} z_score={:.6f} min_z={:.6f} len={:.3f} pts={}".format(
            len(loop_infos),
            selected[0],
            selected[1],
            selected[3],
            selected[2],
            len(selected[4]),
        )
    )
    return selected[4]


def _points_min_z(points: Sequence[rg.Point3d]) -> Optional[float]:
    if not points:
        return None
    try:
        return float(min(p.Z for p in points))
    except Exception:
        return None


def _points_max_z(points: Sequence[rg.Point3d]) -> Optional[float]:
    if not points:
        return None
    try:
        return float(max(p.Z for p in points))
    except Exception:
        return None


def _points_median_radius(points: Sequence[rg.Point3d]) -> Optional[float]:
    if not points:
        return None
    radii: List[float] = []
    for p in points:
        if p is None:
            continue
        try:
            radii.append(float(math.sqrt(p.X * p.X + p.Y * p.Y)))
        except Exception:
            continue
    if not radii:
        return None
    radii.sort()
    n = len(radii)
    mid = n // 2
    if n % 2 == 1:
        return float(radii[mid])
    return float((radii[mid - 1] + radii[mid]) * 0.5)


def _median(values: Sequence[float]) -> Optional[float]:
    if not values:
        return None
    ordered = sorted(float(v) for v in values)
    n = len(ordered)
    mid = n // 2
    if n % 2 == 1:
        return float(ordered[mid])
    return float((ordered[mid - 1] + ordered[mid]) * 0.5)


def _validate_finishline_points(
    points: Sequence[rg.Point3d],
) -> Tuple[bool, str]:
    """연결 세그먼트 기반 아웃라이어 검증.

    - 한 세그먼트가 전체 대비 지나치게 길거나
    - 한 세그먼트의 |dz|가 비정상적으로 크면
      해당 전략 결과를 실패로 간주한다.
    """
    if not points or len(points) < 4:
        return False, "too_few_points"

    seg_lens: List[float] = []
    seg_dz: List[float] = []
    for i in range(1, len(points)):
        a = points[i - 1]
        b = points[i]
        if a is None or b is None:
            continue
        try:
            seg_lens.append(float(a.DistanceTo(b)))
            seg_dz.append(float(abs(b.Z - a.Z)))
        except Exception:
            continue

    if len(seg_lens) < 3:
        return False, "too_few_segments"

    med_len = _median(seg_lens)
    max_len = max(seg_lens) if seg_lens else 0.0
    if med_len is None or med_len <= _DIST_TOL:
        return False, "invalid_segment_stats"

    if max_len >= _OUTLIER_SEGMENT_ABS_MM and max_len >= (
        med_len * _OUTLIER_SEGMENT_RATIO
    ):
        return (
            False,
            "outlier_segment max_len={:.4f} med_len={:.4f} ratio={:.3f}".format(
                max_len,
                med_len,
                max_len / max(1e-9, med_len),
            ),
        )

    med_dz = _median(seg_dz)
    max_dz = max(seg_dz) if seg_dz else 0.0
    if med_dz is not None and med_dz > _DIST_TOL:
        if max_dz >= _OUTLIER_DZ_ABS_MM and max_dz >= (med_dz * _OUTLIER_DZ_RATIO):
            return (
                False,
                "outlier_dz max_dz={:.4f} med_dz={:.4f} ratio={:.3f}".format(
                    max_dz,
                    med_dz,
                    max_dz / max(1e-9, med_dz),
                ),
            )

    return True, "ok"


def _extract_lowest_boundary_loop_points(
    mesh: rg.Mesh,
    ref_pt0: Optional[rg.Point3d] = None,
    ref_pt0_radius: Optional[float] = None,
) -> Optional[List[rg.Point3d]]:
    # legacy fallback 개선: 단순 min-Z가 아니라 edge 전략과 동일한 품질 필터를 적용해
    # 내부 홀/캡 경계 오검출을 줄인다.
    loops = _extract_naked_edges_fallback(mesh)
    if not loops:
        _trace_log("[legacy] no naked edge loops")
        return None

    mesh_band_max_r = _mesh_max_radius_in_z_band(mesh)
    points = _pick_best_edge_loop_points(
        loops,
        1e-6,
        ref_pt0,
        ref_pt0_radius,
        mesh_band_max_radius=mesh_band_max_r,
    )
    if not points or len(points) < 3:
        _trace_log("[legacy] no valid loop after edge-like filtering")
        return None

    # legacy 결과도 shape/outlier 검증 적용
    ok_shape, reason = _validate_finishline_points(points)
    if not ok_shape:
        _trace_log("[legacy] rejected by outlier check: {}".format(reason))
        return None

    _trace_log(
        "[legacy] selected loop min_z={:.6f} max_z={:.6f} pts={}".format(
            _points_min_z(points)
            if _points_min_z(points) is not None
            else float("nan"),
            _points_max_z(points)
            if _points_max_z(points) is not None
            else float("nan"),
            len(points),
        )
    )
    return points


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
def _build_section_planes(
    count: int = _SECTION_COUNT, step_deg: float = _SECTION_STEP_DEG
) -> List[rg.Plane]:
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


def _filter_points_by_z(
    points: Sequence[rg.Point3d], low_z: float, high_z: float
) -> List[rg.Point3d]:
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
        if not pl:
            continue
        sample_pts = [rg.Point3d(pt) for pt in pl]
        points.extend(sample_pts)
        try:
            poly_curve = rg.PolylineCurve(pl)
        except Exception:
            poly_curve = None
        if poly_curve is not None:
            curves.append(poly_curve)

    filtered_points = _filter_points_by_z(points, low_z, high_z)
    filtered_controls = _filter_points_by_z(control_points, low_z, high_z)
    _trace_log(
        "[section] plane_idx={} raw_pts={} ctrl_pts={} filtered_ctrls={}".format(
            plane, len(points), len(control_points), len(filtered_controls)
        )
    )
    return filtered_points, curves, filtered_controls


def _collect_section_data(mesh: rg.Mesh, planes: Sequence[rg.Plane]):
    sections = []
    bbox = mesh.GetBoundingBox(True)
    z_min = bbox.Min.Z
    z_max = bbox.Max.Z
    height = max(1e-6, z_max - z_min)

    # _select_pt0와 동일한 20~70% 구간 필터
    low_z = z_min + _Z_RATIO_LOW * height
    high_z = z_min + _Z_RATIO_HIGH * height

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
        _trace_log(
            "[collect] plane_idx={} ctrl_candidates={} point_candidates={}".format(
                idx, len(ctrl_pts), len(pts)
            )
        )
    return sections


def _sample_plane_section_all_points(
    mesh: rg.Mesh,
    plane: rg.Plane,
) -> Tuple[List[rg.Point3d], List[rg.Curve]]:
    """단면 교차에서 Z 필터 없이 전체 후보를 수집한다(고속)."""
    try:
        polylines = intersect.Intersection.MeshPlane(mesh, plane)
    except Exception:
        polylines = None

    points: List[rg.Point3d] = []
    curves: List[rg.Curve] = []
    if not polylines:
        return points, curves

    for pl in polylines:
        if not pl:
            continue
        pts = [rg.Point3d(pt) for pt in pl]
        points.extend(pts)
        try:
            curves.append(rg.PolylineCurve(pl))
        except Exception:
            pass

    return points, curves


def _detect_finishline_points_max_radius_from_z_axis(
    mesh: rg.Mesh,
    planes: Sequence[rg.Plane],
) -> Tuple[List[rg.Point3d], List[Dict[str, object]]]:
    """Z축에서 가장 먼 점(=XY 반경 최대)을 각 단면에서 뽑아 연결한다.

    중요: 단면 평면은 원점(Z축)을 지나므로 반대편 점(θ+180°)도 동시에 존재할 수 있다.
    반쪽 루프를 방지하기 위해, 각 단면의 X축(+방위각) 방향(dot>=0) 후보를 우선해서 선택한다.
    """
    traced: List[rg.Point3d] = []
    sections: List[Dict[str, object]] = []

    for idx, plane in enumerate(planes):
        pts, curves = _sample_plane_section_all_points(mesh, plane)

        # max-radius 전략에서 controls/merge는 품질 이득이 작고 비용이 커서 생략
        sections.append(
            {
                "index": idx,
                "points": pts,
                "curves": curves,
                "controls": [],
                "plane": plane,
            }
        )

        if not pts:
            _trace_log("[max-r] plane_idx={} no candidates".format(idx))
            continue

        try:
            xdir = plane.XAxis
            ux = float(xdir.X)
            uy = float(xdir.Y)
        except Exception:
            ux, uy = 1.0, 0.0

        selected = None
        selected_key = None
        front_count = 0
        back_count = 0

        for p in pts:
            try:
                dot = float(p.X * ux + p.Y * uy)
                r2 = float(p.X * p.X + p.Y * p.Y)
                key = (r2, -float(p.Z))
            except Exception:
                continue

            if dot >= 0.0:
                front_count += 1
                if selected is None or selected_key is None or key > selected_key:
                    selected = p
                    selected_key = key
            else:
                back_count += 1

        if selected is None:
            # front 후보가 전혀 없을 때만 전체 후보에서 선택
            for p in pts:
                try:
                    r2 = float(p.X * p.X + p.Y * p.Y)
                    key = (r2, -float(p.Z))
                except Exception:
                    continue
                if selected is None or selected_key is None or key > selected_key:
                    selected = p
                    selected_key = key

        if selected is None:
            continue

        traced.append(rg.Point3d(selected))
        _trace_log(
            "[max-r] plane_idx={} candidates={} front={} back={} selected r={:.6f} z={:.6f}".format(
                idx,
                len(pts),
                front_count,
                back_count,
                math.sqrt(selected.X * selected.X + selected.Y * selected.Y),
                selected.Z,
            )
        )

    # 방위각 순으로 정렬 후 폐곡선화 (누락 단면이 있어도 연결 안정화)
    traced = _order_by_azimuth(traced)
    if len(traced) > 2:
        traced.append(rg.Point3d(traced[0]))

    return traced, sections


def _select_outermost_nearby(
    ref_point: rg.Point3d,
    candidates: Sequence[rg.Point3d],
    limit: int = _NEAREST_LIMIT,
    max_distance: Optional[float] = None,
    debug_label: Optional[str] = None,
    return_details: bool = False,
):
    if not candidates:
        return (None, []) if return_details else None

    within_limit: List[Tuple[float, float, rg.Point3d]] = []
    all_candidates: List[Tuple[float, float, rg.Point3d]] = []

    for pt in candidates:
        try:
            dist = pt.DistanceTo(ref_point)
            radius_sq = pt.X * pt.X + pt.Y * pt.Y
            all_candidates.append((radius_sq, dist, pt))
            if max_distance is not None and dist > (max_distance + _DIST_TOL):
                continue
            within_limit.append((radius_sq, dist, pt))
        except Exception:
            continue

    def pick_best(items: Sequence[Tuple[float, float, rg.Point3d]]):
        ordered = sorted(items, key=lambda item: (-item[0], item[1]))
        limited = ordered[: max(1, limit)]
        return limited[0][2], limited

    if within_limit:
        if debug_label and max_distance is not None:
            detail = ", ".join(
                "r={:.3f} d={:.3f}".format(math.sqrt(r_sq), dist)
                for r_sq, dist, _ in within_limit
            )
            _trace_log(
                "[filter] {} candidates (<= {:.3f}mm): {}".format(
                    debug_label,
                    max_distance,
                    detail or "(none)",
                )
            )
        best_pt, details = pick_best(within_limit)
        return (best_pt, details) if return_details else best_pt

    if all_candidates:
        _trace_log(
            "[trace] fallback: no candidates within {:.3f}mm, using outermost regardless".format(
                max_distance or 0
            )
        )
        best_pt, details = pick_best(all_candidates)
        return (best_pt, details) if return_details else best_pt

    return (None, []) if return_details else None


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
    if not pts:
        return []
    ordered = sorted(pts, key=lambda p: math.atan2(p.Y, p.X))
    return [rg.Point3d(p) for p in ordered]


def _pick_start_pt(pt0: rg.Point3d, sections: Sequence[Dict[str, Sequence]]):
    best = None
    for idx, section in enumerate(sections):
        candidates = _merge_candidates(
            section.get("controls") or [], section.get("points") or []
        )
        # 시작점은 거리 제한 없이 pt0에서 가장 가까운 영역 중 외곽 선택
        chosen = _select_outermost_nearby(
            pt0,
            candidates,
            max_distance=None,
            debug_label="start plane_idx={}".format(idx),
        )
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
        candidates = _merge_candidates(
            sections[idx].get("controls") or [],
            sections[idx].get("points") or [],
        )
        _trace_log(
            "[trace] step={} plane_idx={} ctrl_candidates={}".format(
                step, idx, len(candidates)
            )
        )

        # 3D 거리 1mm 제한 적용
        best_pt = _select_outermost_nearby(
            last,
            candidates,
            max_distance=_MAX_STEP_DISTANCE,
            debug_label="step={} plane_idx={}".format(step, idx),
        )

        if best_pt is None:
            all_sorted = (
                sorted(candidates, key=lambda p: p.DistanceTo(last))
                if candidates
                else []
            )
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
        last = new_pt

    if len(traced) > 2:
        traced.append(rg.Point3d(traced[0]))

    return traced, section_points


def _detect_finishline_points(
    mesh: rg.Mesh,
    planes: Sequence[rg.Plane],
) -> Tuple[List[rg.Point3d], List[Dict[str, object]]]:
    if not planes:
        return [], []
    pt0 = _select_pt0(mesh)
    sections = _collect_section_data(mesh, planes)

    # 간단한 섹션 요약 로깅
    try:
        counts = [
            (s.get("index"), len(s.get("controls") or []), len(s.get("points") or []))
            for s in sections
        ]
        _trace_log(
            "[detect-sections] total={} per-section=(index,controls,points) sample={}".format(
                len(sections), counts[:6]
            )
        )
    except Exception:
        _trace_log("[detect-sections] summary failed")

    start_idx, start_pt = _pick_start_pt(pt0, sections)
    _trace_log(
        "[detect] start_idx={} start_pt=({:.6f},{:.6f},{:.6f})".format(
            start_idx, start_pt.X, start_pt.Y, start_pt.Z
        )
    )

    traced_points, section_points = _trace_finishline_points(
        start_idx, start_pt, sections
    )
    _trace_log(
        "[detect] traced_points_len={} section_points_count={}".format(
            len(traced_points) if traced_points else 0, len(section_points)
        )
    )
    return traced_points, sections


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

    sphere = rg.Sphere(pt0, 0.1)
    sphere_id = _add_colored_object(
        doc, sphere.ToBrep(), drawing.Color.FromArgb(0, 200, 0)
    )
    added_ids["points"].append(str(sphere_id))

    if len(points) < 2:
        doc.Views.Redraw()
        return added_ids

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
        obj_id = _add_colored_object(
            doc, tube_curve, drawing.Color.FromArgb(220, 30, 30)
        )
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
        drawing.Color.FromArgb(255, 215, 0),  # gold
        drawing.Color.FromArgb(135, 206, 250),  # light sky blue
        drawing.Color.FromArgb(255, 105, 180),  # hot pink
        drawing.Color.FromArgb(152, 251, 152),  # pale green
        drawing.Color.FromArgb(238, 130, 238),  # violet
        drawing.Color.FromArgb(255, 165, 0),  # orange
        drawing.Color.FromArgb(176, 196, 222),  # steel blue light
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
    """피니시라인 계산 우선순위:
    1) Edge 추출 기반
    2) 단면 추적(40개 XZ 평면)

    추가 로깅: 실패 원인을 추적하기 위해 메시(bbox, vertex/face counts), pt0,
    per-strategy 요약 정보를 _trace_log로 남깁니다.
    """
    doc = _get_active_doc(doc)
    mesh_obj, mesh_geom = _pick_primary_mesh(doc, mesh_id=mesh_id)
    try:
        _trace_log(
            "[detect] target mesh id={} provided_mesh_id={}".format(
                mesh_obj.Id,
                mesh_id,
            )
        )
    except Exception:
        pass
    mesh_copy = mesh_geom.DuplicateMesh()
    if mesh_copy is None:
        raise RuntimeError("Mesh 복제에 실패했습니다")

    # 기본 메쉬 정보 로깅
    try:
        bbox = mesh_copy.GetBoundingBox(True)
        vcount = mesh_copy.Vertices.Count
        fcount = mesh_copy.Faces.Count
        zmin = float(bbox.Min.Z)
        zmax = float(bbox.Max.Z)
        height = max(1e-6, zmax - zmin)
        _trace_log(
            "[detect] mesh v={} f={} z_min={:.6f} z_max={:.6f} height={:.6f}".format(
                vcount, fcount, zmin, zmax, height
            )
        )
    except Exception as e:
        _trace_log("[detect] mesh info read failed: {}".format(str(e)))

    pt0 = _select_pt0(mesh_copy)
    try:
        pt0_radius = float(math.sqrt(pt0.X * pt0.X + pt0.Y * pt0.Y))
    except Exception:
        pt0_radius = None
    _trace_log(
        "[detect] selected pt0 x={:.6f} y={:.6f} z={:.6f} r={}".format(
            pt0.X,
            pt0.Y,
            pt0.Z,
            pt0_radius if pt0_radius is not None else float("nan"),
        )
    )

    sections: List[Dict[str, object]] = []

    # 1) Edge 기반 시도
    traced_points, strategy_used = _detect_finishline_points_edge(doc, mesh_copy)
    _trace_log(
        "[detect] edge strategy returned pts={} strategy={}".format(
            len(traced_points) if traced_points else 0, strategy_used
        )
    )
    if traced_points and len(traced_points) >= 3:
        edge_min_z = _points_min_z(traced_points)
        _trace_log(
            "[detect] edge result min_z={}".format(
                edge_min_z if edge_min_z is not None else float("nan")
            )
        )
        if edge_min_z is not None and edge_min_z <= _EDGE_MIN_Z_VALID_THRESHOLD_MM:
            _trace_log(
                "[detect] edge result rejected min_z={:.6f} <= {:.3f}; fallback=section_tracking".format(
                    edge_min_z,
                    _EDGE_MIN_Z_VALID_THRESHOLD_MM,
                )
            )
            traced_points = None
        else:
            ok_shape, reason = _validate_finishline_points(traced_points)
            if not ok_shape:
                _trace_log(
                    "[detect] edge result rejected by outlier check: {}; fallback=section_tracking".format(
                        reason
                    )
                )
                traced_points = None

    # 2) 단면 추적(fallback)
    if not traced_points or len(traced_points) < 3:
        planes = _build_section_planes(count=_SECTION_COUNT, step_deg=_SECTION_STEP_DEG)
        _trace_log(
            "[detect] starting section tracking planes={} step_deg={}".format(
                len(planes), _SECTION_STEP_DEG
            )
        )
        try:
            traced_points, sections = _detect_finishline_points(mesh_copy, planes)
        except Exception as e:
            # 내부 에러도 포함해서 진단 로그에 남김
            _trace_log("[detect] section tracking raised exception: {}".format(str(e)))
            traced_points = None
            sections = []

        _trace_log(
            "[detect] section strategy returned pts={}".format(
                len(traced_points) if traced_points else 0
            )
        )
        if not traced_points or len(traced_points) < 3:
            # 우선 간단한 legacy naked-edge 루프를 시도해본다(포스트/작은 파편이 섞인 경우 유용할 수 있음)
            legacy_pts = _extract_lowest_boundary_loop_points(
                mesh_copy,
                ref_pt0=pt0,
                ref_pt0_radius=pt0_radius,
            )
            if legacy_pts and len(legacy_pts) >= 3:
                _trace_log(
                    "[detect] legacy lowest boundary provided pts={}".format(
                        len(legacy_pts)
                    )
                )
                traced_points = legacy_pts
                strategy_used = "LEGACY_LOWEST_BOUNDARY"
            else:
                # 실패시 상세 진단 메시지 생성
                try:
                    comp_count = len(_explode_components_sorted_by_max_z(mesh_copy))
                except Exception:
                    comp_count = -1
                msg = (
                    "edge/단면추적 모두 피니시라인 점을 찾지 못했습니다 | "
                    "mesh_v={} mesh_f={} zmin={:.6f} zmax={:.6f} components={}"
                ).format(
                    mesh_copy.Vertices.Count if hasattr(mesh_copy, "Vertices") else -1,
                    mesh_copy.Faces.Count if hasattr(mesh_copy, "Faces") else -1,
                    float(bbox.Min.Z) if "bbox" in locals() else float("nan"),
                    float(bbox.Max.Z) if "bbox" in locals() else float("nan"),
                    comp_count,
                )
                _trace_log("[detect] " + msg)
                raise RuntimeError(msg)
        else:
            ok_shape, reason = _validate_finishline_points(traced_points)
            if not ok_shape:
                _trace_log(
                    "[detect] section result rejected by outlier check: {}; fallback=legacy".format(
                        reason
                    )
                )
                legacy_pts = _extract_lowest_boundary_loop_points(
                    mesh_copy,
                    ref_pt0=pt0,
                    ref_pt0_radius=pt0_radius,
                )
                if legacy_pts and len(legacy_pts) >= 3:
                    traced_points = legacy_pts
                    strategy_used = "LEGACY_LOWEST_BOUNDARY"
                else:
                    raise RuntimeError(
                        "section result rejected by outlier check and legacy fallback failed"
                    )
            else:
                strategy_used = "SECTION_TRACKING_{}x{}_FALLBACK".format(
                    _SECTION_COUNT, int(_SECTION_STEP_DEG)
                )

        # Visualization hooks
    viz_ids: Dict[str, List[str]] = {"points": [], "mesh": []}
    if _DEBUG_ADD_POLYLINE_CURVE:
        debug_curve_id = _add_debug_finishline_polyline_curve(doc, traced_points)
        if debug_curve_id:
            viz_ids["debug_curve"] = [debug_curve_id]

    if visualize:
        base_viz = _visualize(doc, pt0, traced_points)
        for key, values in base_viz.items():
            viz_ids[key] = values
        if _SHOW_ALL_SECTION_CURVES:
            section_ids = _visualize_all_sections(doc, sections)
            if section_ids:
                viz_ids["sections"] = section_ids

    # 결과 반환
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
    print(
        "[finishline] plane_count=",
        result["plane_count"],
        "pts=",
        len(result["points"]),
    )


if __name__ == "__main__":
    main()
