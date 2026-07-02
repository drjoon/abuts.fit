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
# 일반 경로(예: max-radius 전략)에서 허용하는 기본 인접 이동 거리
_MAX_STEP_DISTANCE = 1.5
# 사용자 요청: 단면 추적(40개 평면) 결과의 인접 점 간 거리는 1.0mm를 넘지 않게 제한
# "1mm 이상" 점프를 막기 위해 단면 추적 경로(DP/greedy)에는 이 값을 하드 제약으로 사용한다.
_SECTION_MAX_ADJACENT_DISTANCE_MM = 1.0
_PT0_Z_RATIO_LOW = 0.2
_PT0_Z_RATIO_HIGH = 0.6
_Z_RATIO_LOW = 0.2
_Z_RATIO_HIGH = 0.7

_TRACE_DP_CANDIDATES_PER_SECTION = 14
# max-radius / section 결과가 너무 적은 점수로 조기 성공되는 것을 방지
_MIN_ACCEPTED_TRACE_POINTS = 12
_SHOW_POINT_TEXTDOTS = False
_DIST_TOL = 1e-8
_DEBUG_TRACE = os.environ.get("FINISHLINE_TRACE_DEBUG", "0") in ("1", "true", "TRUE")
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
# ExtractMeshEdges 결과가 메시 바닥 대비 너무 낮은 Z로 잡히는 경우 차단 임계값.
# 주의: 절대 월드 Z가 아니라 "해당 메시 bbox.Min.Z 기준 상대 높이(mm)"를 사용한다.
_EDGE_MIN_Z_VALID_THRESHOLD_MM = 0.5
# edge 루프가 pt0 대비 지나치게 안쪽(내부 홀)일 때 차단하는 반경 비율 임계값
_EDGE_MIN_RADIUS_TO_PT0_RATIO = 0.45
# edge 루프가 메시 외곽 반경 대비 지나치게 안쪽이면 내부 루프 오검출로 간주
_EDGE_MIN_RADIUS_TO_MESH_MAX_RATIO = 0.72
# edge 루프가 pt0 대비 과도하게 상단에 있으면 오검출로 간주
_EDGE_MAX_Z_ABOVE_PT0_MM = 2.5
# edge 루프가 pt0 대비 과도하게 하단에 있으면 내부 루프/홀 경계 오검출로 간주.
# 실데이터에서 pt0가 상대적으로 높게 잡히는 케이스가 있어 고정값 2.5mm만 쓰면
# 정상 finishline까지 탈락할 수 있다. 따라서 base값 + 메시 높이 비율 기반 적응 임계값을 사용한다.
_EDGE_MAX_Z_BELOW_PT0_MM = 2.5
_EDGE_MAX_Z_BELOW_PT0_HEIGHT_RATIO = 0.33
# edge 루프의 Z 변화폭이 지나치게 작으면(거의 수평 링) 내부 경계 오검출로 간주
_EDGE_MIN_Z_SPAN_MM = 0.08
# Explode 분해 후 너무 작은 조각(상단 파편/노이즈)이 edge 후보로 채택되는 것을 방지.
# - XY 반경 비율: 원본 메쉬 최대 XY 반경 대비 최소 비율
# - 버텍스 비율: 원본 메쉬 버텍스 수 대비 최소 비율
# 둘 중 하나라도 충족하면 살리고, 둘 다 너무 작으면 조각 후보에서 제외한다.
_EDGE_COMPONENT_MIN_RADIUS_RATIO = 0.35
_EDGE_COMPONENT_MIN_VERTEX_RATIO = 0.03
# Edge 추출 커맨드는 비싸므로, 분해 컴포넌트 중 상위 후보만 검사한다.
# (명령창 "명령" 스팸/지연 완화)
_EDGE_MAX_COMPONENT_CANDIDATES = 8

# traced finishline 품질 검증(아웃라이어 세그먼트) 임계값
# 절대 임계값은 메시 높이 대비 비율(%) 기반으로 계산한다.
_OUTLIER_SEGMENT_RATIO = 2.8  # max(segment) / median(segment)
_OUTLIER_SEGMENT_HARD_RATIO = 8.0  # absolute 임계 무관 강제 reject
_OUTLIER_SEGMENT_ABS_HEIGHT_RATIO = 0.30  # 30% of mesh height
_OUTLIER_DZ_RATIO = 4.0  # max(|dz|) / median(|dz|)
_OUTLIER_DZ_HARD_RATIO = 10.0  # absolute 임계 무관 강제 reject
_OUTLIER_DZ_ABS_HEIGHT_RATIO = 0.30  # 30% of mesh height
# mesh height를 알 수 없는 예외 상황에서만 fallback으로 사용
_OUTLIER_SEGMENT_ABS_MM_FALLBACK = 2.0
_OUTLIER_DZ_ABS_MM_FALLBACK = 1.5


_EXTERNAL_LOGGER = None


def set_external_logger(logger_fn) -> None:
    """Optional logger injector from host script (expects callable(msg:str))."""
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


def _diag_log(msg: str) -> None:
    """Always-on diagnostic log for failure root-cause analysis."""
    line = "[finishline-diag] " + str(msg)
    try:
        if callable(_EXTERNAL_LOGGER):
            _EXTERNAL_LOGGER(line)
            return
    except Exception:
        pass

    try:
        print(line)
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


def _edge_min_z_cutoff(mesh: rg.Mesh) -> float:
    """edge min-z 유효 하한을 반환한다 (메시 바닥 기준 상대 0.5mm)."""
    try:
        bbox = mesh.GetBoundingBox(True)
        if bbox.IsValid:
            return float(bbox.Min.Z + _EDGE_MIN_Z_VALID_THRESHOLD_MM)
    except Exception:
        pass
    return float(_EDGE_MIN_Z_VALID_THRESHOLD_MM)


def _edge_max_z_below_pt0_limit(mesh: rg.Mesh) -> float:
    """pt0 대비 허용 하향 밴드(mm)를 계산한다.

    base(2.5mm)만 사용하면 backend 정렬 좌표계에서 정상 finishline도 탈락할 수 있어,
    메시 높이 비율 기반 하한(예: height*0.33)과 max를 취한다.
    """
    try:
        bbox = mesh.GetBoundingBox(True)
        if bbox.IsValid:
            h = max(1e-6, float(bbox.Max.Z - bbox.Min.Z))
            return max(
                float(_EDGE_MAX_Z_BELOW_PT0_MM),
                float(h * _EDGE_MAX_Z_BELOW_PT0_HEIGHT_RATIO),
            )
    except Exception:
        pass
    return float(_EDGE_MAX_Z_BELOW_PT0_MM)


def _detect_finishline_points_edge(
    doc: Rhino.RhinoDoc,
    mesh: rg.Mesh,
) -> Tuple[Optional[List[rg.Point3d]], str]:
    candidates = _explode_components_sorted_by_max_z(mesh)
    if not candidates:
        candidates = [mesh]

    # 성능 최적화: 분해 조각이 매우 많을 때는 상위 몇 개만 edge 추출 대상으로 제한.
    # 점수: XY 외곽 반경 우선, 그다음 vertex 수, 그다음 maxZ.
    if len(candidates) > _EDGE_MAX_COMPONENT_CANDIDATES:
        ranked: List[Tuple[Tuple[float, float, float], rg.Mesh]] = []
        for c in candidates:
            if c is None:
                continue
            r = _mesh_xy_radius_from_bbox(c)
            v = float(c.Vertices.Count)
            kz = _mesh_z_key(c)
            mz = float(kz[0]) if kz is not None else -float("inf")
            ranked.append(((float(r), float(v), float(mz)), c))
        ranked.sort(key=lambda it: it[0], reverse=True)
        candidates = [it[1] for it in ranked[:_EDGE_MAX_COMPONENT_CANDIDATES]]
        _diag_log(
            "edge candidate cap applied: total={} capped={}".format(
                len(ranked),
                len(candidates),
            )
        )

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
    rejected_small_vs_mesh = 0
    rejected_below_band = 0
    rejected_flat_z = 0
    rejected_tiny_component = 0

    source_mesh_max_radius = _mesh_xy_radius_from_bbox(mesh)
    source_mesh_vcount = float(mesh.Vertices.Count) if mesh is not None else 0.0

    best_score = None
    best_points: Optional[List[rg.Point3d]] = None
    best_strategy: Optional[str] = None

    for idx, target_mesh in enumerate(candidates):
        target_mesh_max_radius = _mesh_xy_radius_from_bbox(target_mesh)
        target_vcount = float(target_mesh.Vertices.Count)

        comp_radius_ratio = (
            (target_mesh_max_radius / source_mesh_max_radius)
            if source_mesh_max_radius > _DIST_TOL
            else 1.0
        )
        comp_vertex_ratio = (
            (target_vcount / source_mesh_vcount)
            if source_mesh_vcount > _DIST_TOL
            else 1.0
        )

        _trace_log(
            "[detect-edge] candidate[{}] vertices={} faces={} key={} mesh_max_r={:.6f} comp_r_ratio={:.4f} comp_v_ratio={:.4f}".format(
                idx,
                target_mesh.Vertices.Count,
                target_mesh.Faces.Count,
                _mesh_z_key(target_mesh),
                target_mesh_max_radius,
                comp_radius_ratio,
                comp_vertex_ratio,
            )
        )

        # Explode 분해 결과에서 매우 작은 조각(상단 찌꺼기/노이즈)을 먼저 걸러낸다.
        # 실무 샘플에서 이런 조각은 finishline과 무관한 edge loop를 만들 가능성이 높다.
        if (
            comp_radius_ratio < _EDGE_COMPONENT_MIN_RADIUS_RATIO
            and comp_vertex_ratio < _EDGE_COMPONENT_MIN_VERTEX_RATIO
        ):
            rejected_tiny_component += 1
            _trace_log(
                "[detect-edge] candidate[{}] rejected tiny_component r_ratio={:.4f} v_ratio={:.4f}".format(
                    idx,
                    comp_radius_ratio,
                    comp_vertex_ratio,
                )
            )
            continue

        edge_curves = _extract_mesh_edges_with_command(doc, target_mesh)
        strategy_used = "C_EXTRACT_MESH_EDGES_UNWELDED"
        if not edge_curves:
            # Rhino command 기반 추출이 실패하면, 수동 Explode와 동일 경로를 코드로 수행
            # (사용자 환경에서 Explode 시 분리되는 seam 경계 회수)
            edge_curves = _extract_edges_via_command_explode(doc, target_mesh)
            strategy_used = "C_EXPLODE_CMD_NAKED_EDGES"
        if not edge_curves:
            edge_curves = _extract_naked_edges_fallback(target_mesh)
            strategy_used = "C_FALLBACK_NAKED_EDGES"

        _trace_log(
            "[detect-edge] candidate[{}] edge_curves_count={}".format(
                idx, len(edge_curves) if edge_curves else 0
            )
        )
        min_z_cutoff = _edge_min_z_cutoff(target_mesh)
        below_pt0_limit = _edge_max_z_below_pt0_limit(target_mesh)
        _trace_log(
            "[detect-edge] candidate[{}] min_z_cutoff(minZ+0.5)={:.6f} below_pt0_limit={:.6f}".format(
                idx,
                min_z_cutoff,
                below_pt0_limit,
            )
        )
        traced_points = _pick_best_edge_loop_points(
            edge_curves,
            doc.ModelAbsoluteTolerance,
            ref_pt0,
            ref_pt0_radius,
            min_z_cutoff,
            below_pt0_limit,
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
            # 요구 사항(edge min-Z <= 0.5mm)은 메시 바닥(bbox.Min.Z) 기준 상대값으로 해석.
            # 절대좌표 Z를 쓰면 음수 Z 데이터에서 정상 edge가 모두 탈락할 수 있다.
            if edge_min_z is not None and edge_min_z <= min_z_cutoff:
                rejected_low_z += 1
                _trace_log(
                    "[detect-edge] candidate[{}] rejected min_z={:.6f} <= cutoff(minZ+0.5)={:.6f}".format(
                        idx,
                        edge_min_z,
                        min_z_cutoff,
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

                min_allowed_z = ref_pt0.Z - below_pt0_limit
                if edge_min_z <= min_allowed_z:
                    rejected_low_vs_pt0 += 1
                    _trace_log(
                        "[detect-edge] candidate[{}] rejected low_vs_pt0 min_z={:.6f} <= pt0_z-{:.3f} ({:.6f})".format(
                            idx,
                            edge_min_z,
                            below_pt0_limit,
                            min_allowed_z,
                        )
                    )
                    continue

            edge_median_radius = _points_median_radius(traced_points)
            if edge_median_radius is not None and target_mesh_max_radius > _DIST_TOL:
                mesh_ratio = edge_median_radius / target_mesh_max_radius
                if mesh_ratio <= _EDGE_MIN_RADIUS_TO_MESH_MAX_RATIO:
                    rejected_small_vs_mesh += 1
                    _trace_log(
                        "[detect-edge] candidate[{}] rejected mesh_radius_ratio={:.4f} edge_median_r={:.4f} mesh_max_r={:.4f} <= {:.3f}".format(
                            idx,
                            mesh_ratio,
                            edge_median_radius,
                            target_mesh_max_radius,
                            _EDGE_MIN_RADIUS_TO_MESH_MAX_RATIO,
                        )
                    )
                    continue

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

            # 첫 valid 즉시 반환하지 않고, 전체 후보 중 최적 루프를 선택한다.
            z_score = (
                -abs(float(edge_min_z) - float(ref_pt0.Z))
                if (ref_pt0 is not None and edge_min_z is not None)
                else float(edge_min_z)
                if edge_min_z is not None
                else -float("inf")
            )
            # 점수 구성:
            # 1) edge_median_radius: 바깥쪽 루프 우선
            # 2) z_score: pt0 높이와의 일치도 우선
            # 3) 점 개수: 더 안정적인 루프 우선
            # 4) comp_radius_ratio: 동점일 때 원본 대비 큰 컴포넌트 우선
            score = (
                float(edge_median_radius) if edge_median_radius is not None else -1.0,
                float(z_score),
                float(len(traced_points)),
                float(comp_radius_ratio),
            )
            _trace_log(
                "[detect-edge] candidate[{}] accepted score=(r={:.6f},z={:.6f},n={:.0f},comp_r={:.4f})".format(
                    idx,
                    score[0],
                    score[1],
                    score[2],
                    score[3],
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
    if rejected_small_vs_mesh > 0:
        return None, "C_EDGE_REJECTED_SMALL_VS_MESH"
    if rejected_small_radius > 0:
        return None, "C_EDGE_REJECTED_SMALL_RADIUS"
    if rejected_below_band > 0:
        return None, "C_EDGE_REJECTED_BELOW_BAND"
    if rejected_tiny_component > 0:
        return None, "C_EDGE_REJECTED_TINY_COMPONENT"
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


def _extract_edges_via_command_explode(
    doc: Rhino.RhinoDoc,
    mesh: rg.Mesh,
) -> List[rg.Curve]:
    """수동 Explode와 동일한 커맨드 경로로 seam 경계를 추출한다.

    절차:
      1) 임시 mesh 추가
      2) `_Explode` 실행
      3) 생성된 mesh 조각들의 naked-edge 루프 수집
      4) 생성 오브젝트 정리
    """
    temp_mesh_id = doc.Objects.AddMesh(mesh)
    if temp_mesh_id == System.Guid.Empty:
        _diag_log("explode-cmd fallback: temp mesh add failed")
        return []

    baseline_ids = set(obj.Id for obj in doc.Objects)
    created_ids: List[System.Guid] = []
    curves: List[rg.Curve] = []
    created_mesh_count = 0
    naked_loop_count = 0

    try:
        macro = "! _SelNone _SelID {} _-Explode _Enter".format(temp_mesh_id)
        try:
            Rhino.RhinoApp.RunScript(macro, False)
        except Exception as e:
            _diag_log("explode-cmd fallback: RunScript exception={}".format(str(e)))

        for obj in doc.Objects:
            if obj is None or obj.Id in baseline_ids:
                continue
            created_ids.append(obj.Id)

            if obj.ObjectType != rdo.ObjectType.Mesh or obj.Geometry is None:
                continue

            created_mesh_count += 1
            part = obj.Geometry
            try:
                loops = part.GetNakedEdges()
            except Exception:
                loops = None

            if not loops:
                continue

            naked_loop_count += len(loops)
            for loop in loops:
                if not loop or len(loop) < 3:
                    continue
                try:
                    curves.append(rg.PolylineCurve(loop))
                except Exception:
                    continue
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

    _diag_log(
        "explode-cmd fallback: created_meshes={} naked_loops={} curves={}".format(
            created_mesh_count,
            naked_loop_count,
            len(curves),
        )
    )

    return curves


def _extract_naked_edges_fallback(mesh: rg.Mesh) -> List[rg.Curve]:
    curves: List[rg.Curve] = []
    try:
        loops = mesh.GetNakedEdges()
    except Exception:
        loops = None

    if not loops:
        _diag_log("legacy-naked-edges: loops=0 (mesh is likely closed)")
        return curves

    _diag_log("legacy-naked-edges: loops={} (raw)".format(len(loops)))

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
    mesh_min_z_cutoff: float,
    max_z_below_pt0_limit: float,
) -> Optional[List[rg.Point3d]]:
    if not curves:
        return None

    try:
        joined = rg.Curve.JoinCurves(list(curves), tolerance)
    except Exception:
        joined = None
    source = list(joined) if joined else list(curves)

    # tuple: (area_xy, median_radius, z_score, length, min_z, points)
    # 우선순위 1: area_xy (가장 넓은 폐곡선)
    # 우선순위 2: median_radius (외곽 루프)
    # 우선순위 3: z_score (pt0 높이 일치도)
    strict_infos: List[Tuple[float, float, float, float, float, List[rg.Point3d]]] = []
    loose_infos: List[Tuple[float, float, float, float, float, List[rg.Point3d]]] = []

    for cv in source:
        pts = _curve_to_closed_points(cv)
        if not pts or len(pts) < 3:
            continue

        min_z = _points_min_z(pts)
        max_z = _points_max_z(pts)
        if min_z is None:
            continue

        area_xy = _points_area_xy(pts)
        median_r = _points_median_radius(pts)
        try:
            length = float(cv.GetLength())
        except Exception:
            length = float(len(pts))

        if ref_pt0 is not None:
            z_score = -abs(float(min_z) - float(ref_pt0.Z))
        else:
            z_score = float(min_z)

        info = (
            float(area_xy) if area_xy is not None else -1.0,
            float(median_r) if median_r is not None else -1.0,
            float(z_score),
            length,
            float(min_z),
            pts,
        )
        loose_infos.append(info)

        # strict 필터를 통과한 루프가 있으면 그 안에서 "면적 최대"를 선택한다.
        if min_z <= mesh_min_z_cutoff:
            continue
        if max_z is not None and (float(max_z - min_z) <= _EDGE_MIN_Z_SPAN_MM):
            continue

        if ref_pt0 is not None:
            max_allowed_z = ref_pt0.Z + _EDGE_MAX_Z_ABOVE_PT0_MM
            # strict 루프 필터에서도 메시 높이 기반 하향 밴드를 동일 적용
            # (backend 정렬 경로와 스크립트 수동 실행 간 편차 완화)
            min_allowed_z = ref_pt0.Z - max_z_below_pt0_limit
            if min_z >= max_allowed_z or min_z <= min_allowed_z:
                continue

        if (
            ref_pt0_radius is not None
            and ref_pt0_radius > _DIST_TOL
            and median_r is not None
        ):
            ratio = median_r / ref_pt0_radius
            if ratio <= _EDGE_MIN_RADIUS_TO_PT0_RATIO:
                continue

        strict_infos.append(info)

    # 1) strict 우선
    # 2) strict가 비면 loose에서도 "가장 넓은 폐곡선"을 선택
    #    (후단의 edge 품질 검증에서 재차 걸러지므로 여기선 선택 기회 확대)
    target_infos = strict_infos if strict_infos else loose_infos
    if not target_infos:
        return None

    target_infos.sort(
        key=lambda item: (item[0], item[1], item[2], item[3]), reverse=True
    )
    selected = target_infos[0]

    _trace_log(
        "[finishline] edge loops strict={} loose={} selected area_xy={:.6f} median_r={:.6f} z_score={:.6f} min_z={:.6f} len={:.3f} pts={}".format(
            len(strict_infos),
            len(loose_infos),
            selected[0],
            selected[1],
            selected[2],
            selected[4],
            selected[3],
            len(selected[5]),
        )
    )
    return selected[5]


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


def _points_area_xy(points: Sequence[rg.Point3d]) -> Optional[float]:
    """XY 투영 폐곡선 면적(절대값, mm^2)을 계산한다.

    ExtractMeshEdges에서 다중 폐곡선이 나오면 "가장 넓은 루프"를 우선 선택하기 위해 사용.
    비평면/기울어진 루프라도 외곽 판단용으로는 XY 투영 면적이 충분히 안정적이다.
    """
    if not points or len(points) < 3:
        return None

    clean = [p for p in points if p is not None]
    if len(clean) < 3:
        return None

    if clean[0].DistanceTo(clean[-1]) > 1e-6:
        clean = list(clean) + [rg.Point3d(clean[0])]

    area2 = 0.0
    for i in range(1, len(clean)):
        a = clean[i - 1]
        b = clean[i]
        try:
            area2 += (float(a.X) * float(b.Y)) - (float(b.X) * float(a.Y))
        except Exception:
            continue

    return abs(area2) * 0.5


def _median(values: Sequence[float]) -> Optional[float]:
    if not values:
        return None
    ordered = sorted(float(v) for v in values)
    n = len(ordered)
    mid = n // 2
    if n % 2 == 1:
        return float(ordered[mid])
    return float((ordered[mid - 1] + ordered[mid]) * 0.5)


def _orientation2d(
    ax: float, ay: float, bx: float, by: float, cx: float, cy: float
) -> float:
    return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)


def _segments_intersect_xy(
    a1: rg.Point3d, a2: rg.Point3d, b1: rg.Point3d, b2: rg.Point3d
) -> bool:
    o1 = _orientation2d(a1.X, a1.Y, a2.X, a2.Y, b1.X, b1.Y)
    o2 = _orientation2d(a1.X, a1.Y, a2.X, a2.Y, b2.X, b2.Y)
    o3 = _orientation2d(b1.X, b1.Y, b2.X, b2.Y, a1.X, a1.Y)
    o4 = _orientation2d(b1.X, b1.Y, b2.X, b2.Y, a2.X, a2.Y)
    return (o1 * o2 < 0.0) and (o3 * o4 < 0.0)


def _has_self_intersection_xy(points: Sequence[rg.Point3d]) -> bool:
    if not points or len(points) < 6:
        return False

    clean = [rg.Point3d(p) for p in points if p is not None]
    if len(clean) < 6:
        return False

    if clean[0].DistanceTo(clean[-1]) > 1e-6:
        clean.append(rg.Point3d(clean[0]))

    seg_count = len(clean) - 1
    for i in range(seg_count):
        a1 = clean[i]
        a2 = clean[i + 1]
        for j in range(i + 1, seg_count):
            if abs(i - j) <= 1:
                continue
            if i == 0 and j == seg_count - 1:
                continue
            b1 = clean[j]
            b2 = clean[j + 1]
            try:
                if _segments_intersect_xy(a1, a2, b1, b2):
                    return True
            except Exception:
                continue
    return False


def _summarize_points(points: Sequence[rg.Point3d]) -> str:
    if not points:
        return "pts=0"

    clean: List[rg.Point3d] = [p for p in points if p is not None]
    if not clean:
        return "pts=0(valid=0)"

    zs: List[float] = []
    rs: List[float] = []
    seg_lens: List[float] = []
    seg_dz: List[float] = []

    for p in clean:
        try:
            zs.append(float(p.Z))
            rs.append(float(math.sqrt(p.X * p.X + p.Y * p.Y)))
        except Exception:
            continue

    for i in range(1, len(clean)):
        a = clean[i - 1]
        b = clean[i]
        try:
            seg_lens.append(float(a.DistanceTo(b)))
            seg_dz.append(float(abs(b.Z - a.Z)))
        except Exception:
            continue

    min_z = min(zs) if zs else float("nan")
    max_z = max(zs) if zs else float("nan")
    med_r = _median(rs)
    max_len = max(seg_lens) if seg_lens else float("nan")
    med_len = _median(seg_lens)
    max_dz = max(seg_dz) if seg_dz else float("nan")
    med_dz = _median(seg_dz)

    return (
        "pts={} z=[{:.4f},{:.4f}] med_r={} seg(max/med)={}/{} dz(max/med)={}/{}"
    ).format(
        len(clean),
        min_z,
        max_z,
        "{:.4f}".format(med_r) if med_r is not None else "n/a",
        "{:.4f}".format(max_len) if not math.isnan(max_len) else "n/a",
        "{:.4f}".format(med_len) if med_len is not None else "n/a",
        "{:.4f}".format(max_dz) if not math.isnan(max_dz) else "n/a",
        "{:.4f}".format(med_dz) if med_dz is not None else "n/a",
    )


def _resolve_outlier_abs_thresholds(
    mesh_height_mm: Optional[float],
) -> Tuple[float, float, str]:
    try:
        h = float(mesh_height_mm) if mesh_height_mm is not None else float("nan")
    except Exception:
        h = float("nan")

    if not math.isnan(h) and h > _DIST_TOL:
        seg_abs = max(_DIST_TOL, h * _OUTLIER_SEGMENT_ABS_HEIGHT_RATIO)
        dz_abs = max(_DIST_TOL, h * _OUTLIER_DZ_ABS_HEIGHT_RATIO)
        return seg_abs, dz_abs, "height_ratio"

    return _OUTLIER_SEGMENT_ABS_MM_FALLBACK, _OUTLIER_DZ_ABS_MM_FALLBACK, "mm_fallback"


def _validate_finishline_points(
    points: Sequence[rg.Point3d],
    mesh_height_mm: Optional[float] = None,
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

    if _has_self_intersection_xy(points):
        return False, "self_intersection_xy"

    med_len = _median(seg_lens)
    max_len = max(seg_lens) if seg_lens else 0.0
    if med_len is None or med_len <= _DIST_TOL:
        return False, "invalid_segment_stats"

    seg_abs_th, dz_abs_th, th_mode = _resolve_outlier_abs_thresholds(mesh_height_mm)

    seg_ratio = max_len / max(1e-9, med_len)
    if seg_ratio >= _OUTLIER_SEGMENT_HARD_RATIO:
        return (
            False,
            "outlier_segment_hard max_len={:.4f} med_len={:.4f} ratio={:.3f} hard_ratio={:.3f}".format(
                max_len,
                med_len,
                seg_ratio,
                _OUTLIER_SEGMENT_HARD_RATIO,
            ),
        )

    if max_len >= seg_abs_th and max_len >= (med_len * _OUTLIER_SEGMENT_RATIO):
        return (
            False,
            "outlier_segment max_len={:.4f} med_len={:.4f} ratio={:.3f} th_abs={:.4f} mode={}".format(
                max_len,
                med_len,
                seg_ratio,
                seg_abs_th,
                th_mode,
            ),
        )

    med_dz = _median(seg_dz)
    max_dz = max(seg_dz) if seg_dz else 0.0
    if med_dz is not None and med_dz > _DIST_TOL:
        dz_ratio = max_dz / max(1e-9, med_dz)
        # hard ratio라도 절대 dz가 충분히 큰 경우에만 reject한다.
        # (med_dz가 매우 작은 데이터에서 ratio만으로 과잉 탈락 방지)
        if dz_ratio >= _OUTLIER_DZ_HARD_RATIO and max_dz >= dz_abs_th:
            return (
                False,
                "outlier_dz_hard max_dz={:.4f} med_dz={:.4f} ratio={:.3f} hard_ratio={:.3f} th_abs={:.4f}".format(
                    max_dz,
                    med_dz,
                    dz_ratio,
                    _OUTLIER_DZ_HARD_RATIO,
                    dz_abs_th,
                ),
            )
        if max_dz >= dz_abs_th and max_dz >= (med_dz * _OUTLIER_DZ_RATIO):
            return (
                False,
                "outlier_dz max_dz={:.4f} med_dz={:.4f} ratio={:.3f} th_abs={:.4f} mode={}".format(
                    max_dz,
                    med_dz,
                    dz_ratio,
                    dz_abs_th,
                    th_mode,
                ),
            )

    return True, "ok"


def _is_plausible_degraded_finishline(
    points: Sequence[rg.Point3d],
) -> Tuple[bool, str]:
    if not points:
        return False, "empty"

    clean: List[rg.Point3d] = [rg.Point3d(p) for p in points if p is not None]
    if len(clean) < 8:
        return False, "too_few_points"

    zmin = _points_min_z(clean)
    zmax = _points_max_z(clean)
    if zmin is None or zmax is None:
        return False, "invalid_z"

    z_span = float(zmax - zmin)
    if z_span <= 0.001:
        return False, "too_flat"
    if z_span >= 30.0:
        return False, "too_large_z_span"

    if _has_self_intersection_xy(clean):
        return False, "self_intersection_xy"

    med_r = _points_median_radius(clean)
    if med_r is None or med_r <= 0.2:
        return False, "too_small_radius"

    return True, "ok"


def _pick_degraded_candidate(
    candidates: Sequence[Tuple[str, Sequence[rg.Point3d], str]],
    mesh_height_mm: Optional[float] = None,
) -> Tuple[Optional[List[rg.Point3d]], Optional[str], Optional[str]]:
    best_pts: Optional[List[rg.Point3d]] = None
    best_name: Optional[str] = None
    best_reason: Optional[str] = None
    best_score = None

    for name, pts, reject_reason in candidates:
        if not pts:
            continue
        ok, plausibility = _is_plausible_degraded_finishline(pts)
        if not ok:
            _diag_log(
                "degraded candidate rejected name={} plausibility={} summary={}".format(
                    name,
                    plausibility,
                    _summarize_points(pts),
                )
            )
            continue

        ok2, reason2 = _validate_finishline_points(pts, mesh_height_mm=mesh_height_mm)
        if not ok2:
            _diag_log(
                "degraded candidate rejected by quality name={} reason={} summary={}".format(
                    name,
                    reason2,
                    _summarize_points(pts),
                )
            )
            continue

        med_r = _points_median_radius(pts) or 0.0
        score = (len(pts), float(med_r))
        if best_score is None or score > best_score:
            best_score = score
            best_pts = [rg.Point3d(p) for p in pts if p is not None]
            best_name = name
            best_reason = reject_reason

    return best_pts, best_name, best_reason


def _extract_lowest_boundary_loop_points(mesh: rg.Mesh) -> Optional[List[rg.Point3d]]:
    # 기존 방식: naked edge 폐곡선 중 min-Z 루프 사용
    loops = _extract_naked_edges_fallback(mesh)
    if not loops:
        _trace_log("[legacy] no naked edge loops")
        _diag_log("legacy fallback failed: no naked-edge loops")
        return None
    points = _pick_min_z_closed_curve_points(loops, 1e-6)
    if not points or len(points) < 3:
        _trace_log("[legacy] lowest boundary loop not found")
        _diag_log(
            "legacy fallback failed: lowest closed loop not found from loops={}".format(
                len(loops)
            )
        )
        return None
    _trace_log(
        "[legacy] lowest boundary loop selected min_z={:.6f} pts={}".format(
            _points_min_z(points)
            if _points_min_z(points) is not None
            else float("nan"),
            len(points),
        )
    )
    _diag_log("legacy fallback selected: {}".format(_summarize_points(points)))
    return points


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


def _estimate_tilt_axis(mesh: rg.Mesh) -> Tuple[rg.Point3d, rg.Vector3d]:
    """메시의 경사축(주축)을 z-회귀 기반으로 근사한다.

    x(z), y(z) 선형회귀로 기울기를 구해 dir=(dx/dz, dy/dz, 1)로 만든다.
    """
    try:
        bbox = mesh.GetBoundingBox(True)
        if not bbox.IsValid:
            raise RuntimeError("invalid bbox")
        z_min = float(bbox.Min.Z)
        z_max = float(bbox.Max.Z)
        height = max(1e-6, z_max - z_min)
    except Exception:
        return rg.Point3d.Origin, rg.Vector3d(0, 0, 1)

    lo = z_min + 0.15 * height
    hi = z_min + 0.95 * height

    samples: List[Tuple[float, float, float]] = []
    for v in mesh.Vertices:
        try:
            z = float(v.Z)
            if z < lo or z > hi:
                continue
            samples.append((float(v.X), float(v.Y), z))
        except Exception:
            continue

    if len(samples) < 32:
        return rg.Point3d(0, 0, z_min), rg.Vector3d(0, 0, 1)

    n = float(len(samples))
    mean_x = sum(s[0] for s in samples) / n
    mean_y = sum(s[1] for s in samples) / n
    mean_z = sum(s[2] for s in samples) / n

    var_z = sum((s[2] - mean_z) * (s[2] - mean_z) for s in samples)
    if var_z <= 1e-12:
        return rg.Point3d(mean_x, mean_y, mean_z), rg.Vector3d(0, 0, 1)

    cov_zx = sum((s[2] - mean_z) * (s[0] - mean_x) for s in samples)
    cov_zy = sum((s[2] - mean_z) * (s[1] - mean_y) for s in samples)

    slope_x = cov_zx / var_z
    slope_y = cov_zy / var_z

    direction = rg.Vector3d(float(slope_x), float(slope_y), 1.0)
    if not direction.IsValid or direction.IsZero:
        direction = rg.Vector3d(0, 0, 1)
    else:
        direction.Unitize()
        if direction.Z < 0:
            direction.Reverse()

    origin = rg.Point3d(mean_x, mean_y, mean_z)
    return origin, direction


def _axis_t_and_radial(
    pt: rg.Point3d, axis_origin: rg.Point3d, axis_dir: rg.Vector3d
) -> Tuple[float, float]:
    vx = float(pt.X - axis_origin.X)
    vy = float(pt.Y - axis_origin.Y)
    vz = float(pt.Z - axis_origin.Z)
    t = vx * float(axis_dir.X) + vy * float(axis_dir.Y) + vz * float(axis_dir.Z)

    cx = float(axis_origin.X) + float(axis_dir.X) * t
    cy = float(axis_origin.Y) + float(axis_dir.Y) * t
    cz = float(axis_origin.Z) + float(axis_dir.Z) * t

    dx = float(pt.X) - cx
    dy = float(pt.Y) - cy
    dz = float(pt.Z) - cz
    r = math.sqrt(dx * dx + dy * dy + dz * dz)
    return t, r


def _compute_axis_t_bounds(
    mesh: rg.Mesh, axis_origin: rg.Point3d, axis_dir: rg.Vector3d
) -> Tuple[float, float]:
    t_min = float("inf")
    t_max = -float("inf")
    for v in mesh.Vertices:
        try:
            t, _ = _axis_t_and_radial(rg.Point3d(v), axis_origin, axis_dir)
        except Exception:
            continue
        if t < t_min:
            t_min = t
        if t > t_max:
            t_max = t

    if not math.isfinite(t_min) or not math.isfinite(t_max) or t_max <= t_min:
        return -1.0, 1.0
    return float(t_min), float(t_max)


def _filter_points_by_axis_t(
    points: Sequence[rg.Point3d],
    axis_origin: rg.Point3d,
    axis_dir: rg.Vector3d,
    low_t: float,
    high_t: float,
) -> List[rg.Point3d]:
    filtered: List[rg.Point3d] = []
    for pt in points:
        try:
            t, _ = _axis_t_and_radial(pt, axis_origin, axis_dir)
            if low_t <= t <= high_t:
                filtered.append(pt)
        except Exception:
            continue
    return filtered


def _sample_plane_section(
    mesh: rg.Mesh,
    plane: rg.Plane,
    axis_origin: rg.Point3d,
    axis_dir: rg.Vector3d,
    low_t: float,
    high_t: float,
) -> Tuple[List[rg.Point3d], List[rg.Curve], List[rg.Point3d]]:
    try:
        polylines = intersect.Intersection.MeshPlane(mesh, plane)
    except Exception:
        polylines = None

    points: List[rg.Point3d] = []
    curves: List[rg.Curve] = []
    if not polylines:
        return points, curves, []

    for pl in polylines:
        if not pl:
            continue
        points.extend(rg.Point3d(pt) for pt in pl)
        try:
            curves.append(rg.PolylineCurve(pl))
        except Exception:
            pass

    filtered_points = _filter_points_by_axis_t(
        points, axis_origin, axis_dir, low_t, high_t
    )
    _trace_log(
        "[section] plane={} raw_pts={} filtered_pts={}".format(
            plane,
            len(points),
            len(filtered_points),
        )
    )
    return filtered_points, curves, []


def _collect_section_data(mesh: rg.Mesh, planes: Sequence[rg.Plane]):
    sections = []

    axis_origin, axis_dir = _estimate_tilt_axis(mesh)
    t_min, t_max = _compute_axis_t_bounds(mesh, axis_origin, axis_dir)
    t_span = max(1e-6, t_max - t_min)

    # _select_pt0와 동일한 20~70% 구간 필터를 경사축 t-좌표로 적용
    low_t = t_min + _Z_RATIO_LOW * t_span
    high_t = t_min + _Z_RATIO_HIGH * t_span

    _diag_log(
        "tilt-axis origin=({:.4f},{:.4f},{:.4f}) dir=({:.5f},{:.5f},{:.5f}) t=[{:.4f},{:.4f}] band=[{:.4f},{:.4f}]".format(
            axis_origin.X,
            axis_origin.Y,
            axis_origin.Z,
            axis_dir.X,
            axis_dir.Y,
            axis_dir.Z,
            t_min,
            t_max,
            low_t,
            high_t,
        )
    )

    for idx, plane in enumerate(planes):
        pts, curves, ctrl_pts = _sample_plane_section(
            mesh,
            plane,
            axis_origin,
            axis_dir,
            low_t,
            high_t,
        )
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
    """경사축에서 가장 먼 점(반경 최대)을 각 단면에서 뽑아 연결한다.

    기존 Z축 기반 반경은 기울어진 샘플에서 포스트 중간 오검출이 발생할 수 있어,
    메시 경사축(titled axis)을 추정해 axis-반경으로 점을 선택한다.
    """
    traced: List[rg.Point3d] = []
    sections: List[Dict[str, object]] = []

    axis_origin, axis_dir = _estimate_tilt_axis(mesh)
    t_min, t_max = _compute_axis_t_bounds(mesh, axis_origin, axis_dir)
    t_span = max(1e-6, t_max - t_min)
    low_t = t_min + _Z_RATIO_LOW * t_span
    high_t = t_min + _Z_RATIO_HIGH * t_span

    _diag_log(
        "max-radius axis mode origin=({:.4f},{:.4f},{:.4f}) dir=({:.5f},{:.5f},{:.5f}) band_t=[{:.4f},{:.4f}]".format(
            axis_origin.X,
            axis_origin.Y,
            axis_origin.Z,
            axis_dir.X,
            axis_dir.Y,
            axis_dir.Z,
            low_t,
            high_t,
        )
    )

    last_selected: Optional[rg.Point3d] = None

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

        selected = None
        in_band_count = 0
        scored: List[Tuple[float, float, rg.Point3d]] = []  # (radial, t, pt)

        for p in pts:
            try:
                t, radial = _axis_t_and_radial(p, axis_origin, axis_dir)
                if t < low_t or t > high_t:
                    continue
                in_band_count += 1
                scored.append((float(radial), float(t), p))
            except Exception:
                continue

        if not scored:
            # band 후보가 없으면 전체 후보 중 axis-반경 최대 선택
            for p in pts:
                try:
                    t, radial = _axis_t_and_radial(p, axis_origin, axis_dir)
                    scored.append((float(radial), float(t), p))
                except Exception:
                    continue

        if scored:
            scored.sort(key=lambda it: (it[0], -it[1]), reverse=True)
            if last_selected is None:
                selected = scored[0][2]
            else:
                top_n = scored[: min(8, len(scored))]
                selected = min(top_n, key=lambda it: it[2].DistanceTo(last_selected))[2]

        if selected is None:
            continue

        traced.append(rg.Point3d(selected))
        last_selected = rg.Point3d(selected)
        try:
            _, selected_radial = _axis_t_and_radial(selected, axis_origin, axis_dir)
        except Exception:
            selected_radial = math.sqrt(
                selected.X * selected.X + selected.Y * selected.Y
            )
        _trace_log(
            "[max-r] plane_idx={} candidates={} in_band={} selected axis_r={:.6f} z={:.6f}".format(
                idx,
                len(pts),
                in_band_count,
                selected_radial,
                selected.Z,
            )
        )

    # 단면 순서(plane index) 그대로 유지해 연결 안정화
    if len(traced) > 2:
        end_gap = traced[-1].DistanceTo(traced[0])
        if end_gap <= (_MAX_STEP_DISTANCE * 2.5):
            traced.append(rg.Point3d(traced[0]))
        else:
            _diag_log(
                "max-radius open polyline kept: end_gap={:.4f} (skip closure chord)".format(
                    end_gap
                )
            )

    return traced, sections


def _select_outermost_nearby(
    ref_point: rg.Point3d,
    candidates: Sequence[rg.Point3d],
    max_distance: Optional[float] = None,
    debug_label: Optional[str] = None,
) -> Optional[rg.Point3d]:
    """후보 중 외곽(반경 큼) 우선으로 한 점을 고른다.

    성능 최적화:
      기존 구현은 후보를 정렬해 O(n log n) + 디버그 문자열 전체 생성 비용이 있었다.
      여기서는 단일 패스로 최적값만 유지해 O(n)으로 선택한다.
    """
    if not candidates:
        return None

    # tie-break: radius_sq 내림차순, dist 오름차순
    best_within: Optional[Tuple[float, float, rg.Point3d]] = None
    best_all: Optional[Tuple[float, float, rg.Point3d]] = None
    within_count = 0

    for pt in candidates:
        if pt is None:
            continue
        try:
            dist = float(pt.DistanceTo(ref_point))
            radius_sq = float(pt.X * pt.X + pt.Y * pt.Y)
        except Exception:
            continue

        cand = (radius_sq, dist, pt)
        if (
            best_all is None
            or (cand[0] > best_all[0])
            or (cand[0] == best_all[0] and cand[1] < best_all[1])
        ):
            best_all = cand

        if max_distance is not None and dist > (max_distance + _DIST_TOL):
            continue

        within_count += 1
        if (
            best_within is None
            or (cand[0] > best_within[0])
            or (cand[0] == best_within[0] and cand[1] < best_within[1])
        ):
            best_within = cand

    if best_within is not None:
        if debug_label and max_distance is not None and _DEBUG_TRACE:
            _trace_log(
                "[filter] {} candidates<= {:.3f}mm: n={} selected(r={:.3f},d={:.3f})".format(
                    debug_label,
                    max_distance,
                    within_count,
                    math.sqrt(best_within[0]),
                    best_within[1],
                )
            )
        return best_within[2]

    if best_all is not None:
        _trace_log(
            "[trace] fallback: no candidates within {:.3f}mm, using outermost regardless".format(
                max_distance or 0
            )
        )
        return best_all[2]

    return None


# ---------------------------------------------------------------------------
# 피니시라인 점 추출 (핵심 알고리즘)
# ---------------------------------------------------------------------------


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


def _is_step_within_limit(a: rg.Point3d, b: rg.Point3d, limit_mm: float) -> bool:
    """두 점 사이 이동이 허용 거리 이내인지 검사한다.

    NOTE:
      사용자 요구("인접 점 1mm 이상 이격 금지")를 만족시키기 위해
      단면 추적 경로에서는 이 체크를 하드 제약으로 사용한다.
    """
    try:
        return float(a.DistanceTo(b)) <= (float(limit_mm) + _DIST_TOL)
    except Exception:
        return False


def _max_adjacent_step_distance(points: Sequence[rg.Point3d]) -> float:
    """연속 점들 사이 최대 3D 거리(mm)를 반환한다.

    points가 닫힌 폴리라인(마지막=첫점)인지 여부와 무관하게
    입력 순서대로 인접한 쌍만 검사한다.
    """
    if not points or len(points) < 2:
        return 0.0
    max_step = 0.0
    for i in range(1, len(points)):
        a = points[i - 1]
        b = points[i]
        if a is None or b is None:
            continue
        try:
            d = float(a.DistanceTo(b))
        except Exception:
            continue
        if d > max_step:
            max_step = d
    return max_step


def _step_cost(
    a: rg.Point3d, b: rg.Point3d, soft_limit_mm: float = _MAX_STEP_DISTANCE
) -> float:
    """DP 연결 비용.

    soft_limit_mm는 "선호" 제약으로, 이를 넘는 이동에는 추가 패널티를 준다.
    실제 하드 제약(절대 불가)은 호출측에서 _is_step_within_limit으로 적용한다.
    """
    d = float(a.DistanceTo(b))
    dz = float(abs(b.Z - a.Z))
    base = d + (0.9 * dz)
    if d > soft_limit_mm:
        base += (d - soft_limit_mm) * (d - soft_limit_mm) * 6.0
    return base


def _close_polyline_if_near(
    points: List[rg.Point3d],
    max_gap_mm: float,
    diag_label: str,
) -> List[rg.Point3d]:
    """마지막-첫점 간격이 충분히 가까울 때만 닫는다.

    단면 추적 fallback에서 마지막 chord가 길어지면,
    시각화 상 "윗쪽으로 튀는" 아웃라이어 세그먼트처럼 보일 수 있다.
    따라서 폐합도 인접 거리 제한으로 제어한다.
    """
    if not points or len(points) < 3:
        return points

    closed = [rg.Point3d(p) for p in points if p is not None]
    if len(closed) < 3:
        return closed

    end_gap = float(closed[-1].DistanceTo(closed[0]))
    if end_gap <= (max_gap_mm + _DIST_TOL):
        closed.append(rg.Point3d(closed[0]))
        return closed

    _diag_log(
        "{} open polyline kept: end_gap={:.4f} > {:.4f}".format(
            diag_label,
            end_gap,
            max_gap_mm,
        )
    )
    return closed


def _prune_section_candidates(
    pts: Sequence[rg.Point3d],
    axis_origin: rg.Point3d,
    axis_dir: rg.Vector3d,
    limit: int = _TRACE_DP_CANDIDATES_PER_SECTION,
) -> List[rg.Point3d]:
    if not pts:
        return []

    scored: List[Tuple[float, rg.Point3d]] = []
    for p in pts:
        if p is None:
            continue
        try:
            _, radial = _axis_t_and_radial(p, axis_origin, axis_dir)
            scored.append((float(radial), rg.Point3d(p)))
        except Exception:
            continue

    scored.sort(key=lambda it: it[0], reverse=True)
    selected: List[rg.Point3d] = []
    for _, p in scored:
        if len(selected) >= limit:
            break
        if any(p.DistanceTo(q) < 0.12 for q in selected):
            continue
        selected.append(p)

    if not selected:
        selected = [rg.Point3d(p) for _, p in scored[:limit]]

    return selected


def _trace_finishline_points_dp(
    sections: Sequence[Dict[str, Sequence]],
    axis_origin: rg.Point3d,
    axis_dir: rg.Vector3d,
) -> Optional[List[rg.Point3d]]:
    if not sections:
        return None

    cands: List[List[rg.Point3d]] = []
    for sec in sections:
        merged = _merge_candidates(sec.get("controls") or [], sec.get("points") or [])
        picked = _prune_section_candidates(merged, axis_origin, axis_dir)
        if not picked:
            return None
        cands.append(picked)

    m = len(cands)
    if m < 3:
        return None

    best_total = None
    best_indices = None

    for s0 in range(len(cands[0])):
        cost_prev = [float("inf")] * len(cands[0])
        cost_prev[s0] = 0.0
        parents: List[List[int]] = []

        for sec in range(1, m):
            cur = [float("inf")] * len(cands[sec])
            par = [-1] * len(cands[sec])
            for j, pj in enumerate(cands[sec]):
                for i, pi in enumerate(cands[sec - 1]):
                    if not math.isfinite(cost_prev[i]):
                        continue
                    # 단면 추적 하드 제약: 인접 섹션 간 1.0mm 초과 이동 금지
                    if not _is_step_within_limit(
                        pi,
                        pj,
                        _SECTION_MAX_ADJACENT_DISTANCE_MM,
                    ):
                        continue
                    cc = cost_prev[i] + _step_cost(
                        pi,
                        pj,
                        soft_limit_mm=_SECTION_MAX_ADJACENT_DISTANCE_MM,
                    )
                    if cc < cur[j]:
                        cur[j] = cc
                        par[j] = i
            cost_prev = cur
            parents.append(par)

        for end_idx, end_cost in enumerate(cost_prev):
            if not math.isfinite(end_cost):
                continue
            # 폐합 세그먼트도 동일한 1.0mm 하드 제약을 적용한다.
            if not _is_step_within_limit(
                cands[m - 1][end_idx],
                cands[0][s0],
                _SECTION_MAX_ADJACENT_DISTANCE_MM,
            ):
                continue
            close_cost = (
                _step_cost(
                    cands[m - 1][end_idx],
                    cands[0][s0],
                    soft_limit_mm=_SECTION_MAX_ADJACENT_DISTANCE_MM,
                )
                * 1.2
            )
            total = end_cost + close_cost
            if best_total is None or total < best_total:
                indices = [end_idx]
                ok = True
                for sec_rev in range(m - 2, -1, -1):
                    par = (
                        parents[sec_rev][indices[-1]] if sec_rev < len(parents) else -1
                    )
                    if par < 0:
                        ok = False
                        break
                    indices.append(par)
                if not ok:
                    continue
                indices.reverse()
                if indices[0] != s0:
                    continue
                best_total = total
                best_indices = indices

    if best_indices is None:
        return None

    traced = [rg.Point3d(cands[idx][best_indices[idx]]) for idx in range(m)]
    traced = _close_polyline_if_near(
        traced,
        _SECTION_MAX_ADJACENT_DISTANCE_MM,
        "section-dp",
    )

    if _has_self_intersection_xy(traced):
        return None

    # 안전망: DP 경로 전체에서 최대 인접 간격이 제약을 넘으면 실패 처리.
    max_step = _max_adjacent_step_distance(traced)
    if max_step > (_SECTION_MAX_ADJACENT_DISTANCE_MM + _DIST_TOL):
        _diag_log(
            "section-dp rejected by step_limit max_step={:.4f} > {:.4f}".format(
                max_step,
                _SECTION_MAX_ADJACENT_DISTANCE_MM,
            )
        )
        return None

    return traced


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

        # 사용자 요구 사항: 단면 추적 경로는 인접 점 간 1.0mm 하드 제한
        best_pt = _select_outermost_nearby(
            last,
            candidates,
            max_distance=_SECTION_MAX_ADJACENT_DISTANCE_MM,
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
                    _SECTION_MAX_ADJACENT_DISTANCE_MM, step, min_dist
                )
            )
            break

        new_pt = rg.Point3d(best_pt)
        move_len = new_pt.DistanceTo(last)
        _trace_log(
            "[trace] step={} plane_idx={} move_len={:.4f}mm".format(step, idx, move_len)
        )

        if move_len > (_SECTION_MAX_ADJACENT_DISTANCE_MM + _DIST_TOL):
            _trace_log(
                "[trace] ERROR: jump {:.3f}mm at step {}, terminating trace".format(
                    move_len, step
                )
            )
            break

        section_points[idx] = new_pt
        traced.append(new_pt)
        last = new_pt

    traced = _close_polyline_if_near(
        traced,
        _SECTION_MAX_ADJACENT_DISTANCE_MM,
        "section-greedy",
    )

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

    axis_origin, axis_dir = _estimate_tilt_axis(mesh)
    traced_points = _trace_finishline_points_dp(sections, axis_origin, axis_dir)
    if traced_points and len(traced_points) >= 3:
        section_points = {
            i: traced_points[i] for i in range(min(len(sections), len(traced_points)))
        }
        _diag_log(
            "section tracing via DP accepted summary={}".format(
                _summarize_points(traced_points)
            )
        )
    else:
        traced_points, section_points = _trace_finishline_points(
            start_idx, start_pt, sections
        )
        _diag_log(
            "section tracing fallback greedy summary={}".format(
                _summarize_points(traced_points)
            )
        )

    # 최종 안전망: 단면 추적 결과의 인접 이동이 1.0mm를 넘으면 실패 처리.
    # (상위 detect_finish_line에서 legacy/degraded fallback으로 자연스럽게 이어짐)
    max_step = _max_adjacent_step_distance(traced_points)
    if max_step > (_SECTION_MAX_ADJACENT_DISTANCE_MM + _DIST_TOL):
        _diag_log(
            "section tracing rejected by hard step limit max_step={:.4f} > {:.4f}".format(
                max_step,
                _SECTION_MAX_ADJACENT_DISTANCE_MM,
            )
        )
        return [], sections
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
    2) XY 반경 최대(Z축에서 가장 먼 점 연결)
    3) 단면 추적

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
    mesh_height_mm: Optional[float] = None
    try:
        bbox = mesh_copy.GetBoundingBox(True)
        vcount = mesh_copy.Vertices.Count
        fcount = mesh_copy.Faces.Count
        zmin = float(bbox.Min.Z)
        zmax = float(bbox.Max.Z)
        height = max(1e-6, zmax - zmin)
        mesh_height_mm = float(height)
        _trace_log(
            "[detect] mesh v={} f={} z_min={:.6f} z_max={:.6f} height={:.6f}".format(
                vcount, fcount, zmin, zmax, height
            )
        )
        _diag_log(
            "mesh v={} f={} z=[{:.6f},{:.6f}] height={:.6f}".format(
                vcount, fcount, zmin, zmax, height
            )
        )
    except Exception as e:
        _trace_log("[detect] mesh info read failed: {}".format(str(e)))
        _diag_log("mesh info read failed: {}".format(str(e)))

    seg_abs_th, dz_abs_th, th_mode = _resolve_outlier_abs_thresholds(mesh_height_mm)
    _diag_log(
        "outlier thresholds mode={} seg_abs={:.4f} dz_abs={:.4f} ratio(seg={},dz={})".format(
            th_mode,
            seg_abs_th,
            dz_abs_th,
            _OUTLIER_SEGMENT_RATIO,
            _OUTLIER_DZ_RATIO,
        )
    )

    pt0 = _select_pt0(mesh_copy)
    _trace_log(
        "[detect] selected pt0 x={:.6f} y={:.6f} z={:.6f}".format(pt0.X, pt0.Y, pt0.Z)
    )
    _diag_log("pt0=({:.6f},{:.6f},{:.6f})".format(pt0.X, pt0.Y, pt0.Z))

    sections: List[Dict[str, object]] = []
    edge_reject_reason: Optional[str] = None
    edge_reject_points: Optional[List[rg.Point3d]] = None
    max_reject_reason: Optional[str] = None
    max_reject_points: Optional[List[rg.Point3d]] = None
    section_reject_reason: Optional[str] = None
    section_reject_points: Optional[List[rg.Point3d]] = None

    # 1) Edge 기반 시도
    traced_points, strategy_used = _detect_finishline_points_edge(doc, mesh_copy)
    edge_pts = len(traced_points) if traced_points else 0
    _trace_log(
        "[detect] edge strategy returned pts={} strategy={}".format(
            edge_pts, strategy_used
        )
    )
    _diag_log(
        "edge strategy={} pts={} summary={}".format(
            strategy_used,
            edge_pts,
            _summarize_points(traced_points or []),
        )
    )
    if traced_points and len(traced_points) >= 3:
        edge_min_z = _points_min_z(traced_points)
        mesh_min_cutoff = _edge_min_z_cutoff(mesh_copy)
        _trace_log(
            "[detect] edge result min_z={} cutoff(minZ+0.5)={}".format(
                edge_min_z if edge_min_z is not None else float("nan"),
                mesh_min_cutoff,
            )
        )
        if edge_min_z is not None and edge_min_z <= mesh_min_cutoff:
            _trace_log(
                "[detect] edge result rejected min_z={:.6f} <= cutoff(minZ+0.5)={:.6f}; fallback=max_radius_from_z_axis".format(
                    edge_min_z,
                    mesh_min_cutoff,
                )
            )
            _diag_log(
                "edge rejected: min_z={:.6f} <= cutoff(minZ+0.5)={:.6f}".format(
                    edge_min_z,
                    mesh_min_cutoff,
                )
            )
            edge_reject_reason = "min_z_below_threshold"
            edge_reject_points = [rg.Point3d(p) for p in traced_points if p is not None]
            traced_points = None
        else:
            ok_shape, reason = _validate_finishline_points(
                traced_points, mesh_height_mm=mesh_height_mm
            )
            if not ok_shape:
                _trace_log(
                    "[detect] edge result rejected by outlier check: {}; fallback=max_radius_from_z_axis".format(
                        reason
                    )
                )
                _diag_log(
                    "edge rejected by outlier: reason={} summary={}".format(
                        reason,
                        _summarize_points(traced_points),
                    )
                )
                edge_reject_reason = str(reason)
                edge_reject_points = [
                    rg.Point3d(p) for p in traced_points if p is not None
                ]
                traced_points = None
            else:
                _diag_log(
                    "edge accepted summary={}".format(_summarize_points(traced_points))
                )

    # 2) Z축 최대 반경 기반(요청 로직)
    if not traced_points or len(traced_points) < 3:
        planes = _build_section_planes(count=_SECTION_COUNT, step_deg=_SECTION_STEP_DEG)
        _trace_log(
            "[detect] starting max-radius-from-z-axis planes={} step_deg={}".format(
                len(planes), _SECTION_STEP_DEG
            )
        )
        _diag_log(
            "max-radius start planes={} step_deg={}".format(
                len(planes), _SECTION_STEP_DEG
            )
        )
        try:
            traced_points, sections = _detect_finishline_points_max_radius_from_z_axis(
                mesh_copy, planes
            )
        except Exception as e:
            _trace_log(
                "[detect] max-radius strategy raised exception: {}".format(str(e))
            )
            _diag_log("max-radius exception: {}".format(str(e)))
            traced_points = None
            sections = []

        max_pts = len(traced_points) if traced_points else 0
        _trace_log("[detect] max-radius strategy returned pts={}".format(max_pts))
        _diag_log(
            "max-radius result pts={} summary={}".format(
                max_pts,
                _summarize_points(traced_points or []),
            )
        )
        if traced_points and len(traced_points) >= _MIN_ACCEPTED_TRACE_POINTS:
            ok_shape, reason = _validate_finishline_points(
                traced_points, mesh_height_mm=mesh_height_mm
            )
            if not ok_shape:
                _trace_log(
                    "[detect] max-radius result rejected by outlier check: {}; fallback=section_tracking".format(
                        reason
                    )
                )
                _diag_log(
                    "max-radius rejected by outlier: reason={} summary={}".format(
                        reason,
                        _summarize_points(traced_points),
                    )
                )
                max_reject_reason = str(reason)
                max_reject_points = [
                    rg.Point3d(p) for p in traced_points if p is not None
                ]
                traced_points = None
                sections = []
            else:
                strategy_used = "MAX_RADIUS_FROM_Z_AXIS_{}x{}".format(
                    _SECTION_COUNT, int(_SECTION_STEP_DEG)
                )
                _diag_log(
                    "max-radius accepted summary={}".format(
                        _summarize_points(traced_points)
                    )
                )
        elif traced_points and len(traced_points) >= 3:
            _diag_log(
                "max-radius rejected: too_few_points pts={} < min_required={}".format(
                    len(traced_points),
                    _MIN_ACCEPTED_TRACE_POINTS,
                )
            )
            max_reject_reason = "too_few_points"
            max_reject_points = [rg.Point3d(p) for p in traced_points if p is not None]
            traced_points = None
            sections = []

    # 3) 단면 추적(fallback)
    if not traced_points or len(traced_points) < 3:
        planes = _build_section_planes(count=_SECTION_COUNT, step_deg=_SECTION_STEP_DEG)
        _trace_log(
            "[detect] starting section tracking planes={} step_deg={}".format(
                len(planes), _SECTION_STEP_DEG
            )
        )
        _diag_log(
            "section-tracking start planes={} step_deg={}".format(
                len(planes), _SECTION_STEP_DEG
            )
        )
        try:
            traced_points, sections = _detect_finishline_points(mesh_copy, planes)
        except Exception as e:
            # 내부 에러도 포함해서 진단 로그에 남김
            _trace_log("[detect] section tracking raised exception: {}".format(str(e)))
            _diag_log("section-tracking exception: {}".format(str(e)))
            traced_points = None
            sections = []

        section_pts = len(traced_points) if traced_points else 0
        _trace_log("[detect] section strategy returned pts={}".format(section_pts))
        _diag_log(
            "section-tracking result pts={} summary={}".format(
                section_pts,
                _summarize_points(traced_points or []),
            )
        )
        if not traced_points or len(traced_points) < 3:
            # 우선 간단한 legacy naked-edge 루프를 시도해본다(포스트/작은 파편이 섞인 경우 유용할 수 있음)
            _diag_log("section-tracking insufficient points; trying legacy fallback")
            legacy_pts = _extract_lowest_boundary_loop_points(mesh_copy)
            if legacy_pts and len(legacy_pts) >= 3:
                _trace_log(
                    "[detect] legacy lowest boundary provided pts={}".format(
                        len(legacy_pts)
                    )
                )
                _diag_log(
                    "legacy fallback accepted summary={}".format(
                        _summarize_points(legacy_pts)
                    )
                )
                traced_points = legacy_pts
                strategy_used = "LEGACY_LOWEST_BOUNDARY"
            else:
                degraded_pts, degraded_name, degraded_reason = _pick_degraded_candidate(
                    [
                        (
                            "MAX_RADIUS_FROM_Z_AXIS",
                            max_reject_points or [],
                            max_reject_reason or "",
                        ),
                        (
                            "EDGE",
                            edge_reject_points or [],
                            edge_reject_reason or "",
                        ),
                    ],
                    mesh_height_mm=mesh_height_mm,
                )
                if degraded_pts and len(degraded_pts) >= 8:
                    traced_points = degraded_pts
                    strategy_used = "DEGRADED_{}".format(degraded_name)
                    _diag_log(
                        "degraded fallback accepted (insufficient section points) strategy={} reject_reason={} summary={}".format(
                            strategy_used,
                            degraded_reason,
                            _summarize_points(traced_points),
                        )
                    )
                else:
                    # 실패시 상세 진단 메시지 생성
                    try:
                        comp_count = len(_explode_components_sorted_by_max_z(mesh_copy))
                    except Exception:
                        comp_count = -1
                    msg = (
                        "edge/Z축최대반경/단면추적 모두 피니시라인 점을 찾지 못했습니다 | "
                        "mesh_v={} mesh_f={} zmin={:.6f} zmax={:.6f} components={}"
                    ).format(
                        mesh_copy.Vertices.Count
                        if hasattr(mesh_copy, "Vertices")
                        else -1,
                        mesh_copy.Faces.Count if hasattr(mesh_copy, "Faces") else -1,
                        float(bbox.Min.Z) if "bbox" in locals() else float("nan"),
                        float(bbox.Max.Z) if "bbox" in locals() else float("nan"),
                        comp_count,
                    )
                    _trace_log("[detect] " + msg)
                    _diag_log("detect failed: " + msg)
                    raise RuntimeError(msg)
        else:
            ok_shape, reason = _validate_finishline_points(
                traced_points, mesh_height_mm=mesh_height_mm
            )
            if not ok_shape:
                _trace_log(
                    "[detect] section result rejected by outlier check: {}; fallback=legacy".format(
                        reason
                    )
                )
                _diag_log(
                    "section rejected by outlier: reason={} summary={}".format(
                        reason,
                        _summarize_points(traced_points),
                    )
                )
                section_reject_reason = str(reason)
                section_reject_points = [
                    rg.Point3d(p) for p in traced_points if p is not None
                ]
                legacy_pts = _extract_lowest_boundary_loop_points(mesh_copy)
                if legacy_pts and len(legacy_pts) >= 3:
                    _diag_log(
                        "legacy fallback accepted summary={}".format(
                            _summarize_points(legacy_pts)
                        )
                    )
                    traced_points = legacy_pts
                    strategy_used = "LEGACY_LOWEST_BOUNDARY"
                else:
                    degraded_pts, degraded_name, degraded_reason = (
                        _pick_degraded_candidate(
                            [
                                (
                                    "SECTION_TRACKING",
                                    section_reject_points or [],
                                    section_reject_reason or "",
                                ),
                                (
                                    "MAX_RADIUS_FROM_Z_AXIS",
                                    max_reject_points or [],
                                    max_reject_reason or "",
                                ),
                                (
                                    "EDGE",
                                    edge_reject_points or [],
                                    edge_reject_reason or "",
                                ),
                            ],
                            mesh_height_mm=mesh_height_mm,
                        )
                    )
                    if degraded_pts and len(degraded_pts) >= 8:
                        traced_points = degraded_pts
                        strategy_used = "DEGRADED_{}".format(degraded_name)
                        _diag_log(
                            "degraded fallback accepted strategy={} reject_reason={} summary={}".format(
                                strategy_used,
                                degraded_reason,
                                _summarize_points(traced_points),
                            )
                        )
                    elif section_reject_points and len(section_reject_points) >= 8:
                        traced_points = [
                            rg.Point3d(p)
                            for p in section_reject_points
                            if p is not None
                        ]
                        strategy_used = "DEGRADED_SECTION_TRACKING_RAW"
                        _diag_log(
                            "degraded raw section accepted reason={} summary={}".format(
                                section_reject_reason,
                                _summarize_points(traced_points),
                            )
                        )
                    else:
                        failure_msg = "section result rejected by outlier check and legacy fallback failed"
                        _diag_log(
                            "detect failed: {} | reason={}".format(failure_msg, reason)
                        )
                        raise RuntimeError(failure_msg)
            else:
                strategy_used = "SECTION_TRACKING_{}x{}_FALLBACK".format(
                    _SECTION_COUNT, int(_SECTION_STEP_DEG)
                )
                _diag_log(
                    "section-tracking accepted summary={}".format(
                        _summarize_points(traced_points)
                    )
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

    _diag_log(
        "success strategy={} {}".format(
            strategy_used,
            _summarize_points(traced_points or []),
        )
    )

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
