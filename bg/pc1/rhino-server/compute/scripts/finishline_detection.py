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

# 섹션 평면 기준축(경사축) 추정 파라미터
_TILT_AXIS_BAND_LOW = 0.15
_TILT_AXIS_BAND_HIGH = 0.95
_TILT_AXIS_MIN_VERTS = 120
_PT0_Z_RATIO_LOW = 0.2
_PT0_Z_RATIO_HIGH = 0.6
_Z_RATIO_LOW = 0.2
_Z_RATIO_HIGH = 0.7

# max-radius sequential 추적용 축 투영 band (경사체에서 world-Z 반쪽 누락 방지)
_MAXR_AXIS_RATIO_LOW = 0.18
_MAXR_AXIS_RATIO_HIGH = 0.72
_TARGET_TRACE_POINT_COUNT = 120
_SHOW_POINT_TEXTDOTS = False
_DIST_TOL = 1e-8


def _env_true(name: str, default: bool = False) -> bool:
    raw = os.environ.get(str(name), "")
    if raw is None:
        return bool(default)
    s = str(raw).strip().lower()
    if s == "":
        return bool(default)
    return s in ("1", "true", "yes", "y", "on")


# 단일 DEBUG 플래그 우선(개별 플래그는 override 용도로만 유지)
# - DEBUG=1 이면 trace/임시객체/디버그커브/전체섹션 표시 활성
# - DEBUG=0 (또는 미설정) 이면 모두 비활성
_GLOBAL_DEBUG = _env_true("DEBUG", False)
_DEBUG_TRACE = _env_true("FINISHLINE_TRACE_DEBUG", _GLOBAL_DEBUG)
_DEBUG_KEEP_TEMP_OBJECTS = _env_true(
    "FINISHLINE_DEBUG_KEEP_TEMP_OBJECTS", _GLOBAL_DEBUG
)
_DEBUG_ADD_POLYLINE_CURVE = _env_true("FINISHLINE_DEBUG_CURVE_DOC", _GLOBAL_DEBUG)
# 섹션 곡선(40개 평면)은 디버그시에만 기본 표시
_SHOW_ALL_SECTION_CURVES = _env_true("FINISHLINE_SHOW_ALL_SECTIONS", _GLOBAL_DEBUG)
# ExtractMeshEdges 결과가 너무 낮은 Z로 잡히는 경우(포스트/치은 미분리 샘플) 차단 임계값
_EDGE_MIN_Z_VALID_THRESHOLD_MM = 0.5
# edge 루프가 pt0 대비 지나치게 안쪽(내부 홀)일 때 차단하는 반경 비율 임계값
_EDGE_MIN_RADIUS_TO_PT0_RATIO = 0.45
# edge 루프가 메시 외곽 반경 대비 너무 작으면(내부 스크류홀/내부 경계) 차단
_EDGE_MIN_RADIUS_TO_MESH_BAND_RATIO = 0.55
# edge 루프가 pt0 대비 과도하게 상단에 있으면 오검출로 간주
# (기존 2.5mm는 경사 심한 케이스에서 정상 finishline을 과도하게 배제해 완화)
_EDGE_MAX_Z_ABOVE_PT0_MM = 8.0
# edge 루프가 pt0 대비 과도하게 하단에 있으면 내부 루프/홀 경계 오검출로 간주
_EDGE_MAX_Z_BELOW_PT0_MM = 2.5
# edge 루프의 Z 변화폭이 지나치게 작으면(거의 수평 링) 내부 경계 오검출로 간주
_EDGE_MIN_Z_SPAN_MM = 0.08

# traced finishline 품질 검증(아웃라이어 세그먼트) 임계값
_OUTLIER_SEGMENT_RATIO = 2.8  # max(segment) / median(segment)
_OUTLIER_SEGMENT_ABS_MM = 2.0  # mm
_OUTLIER_DZ_RATIO = 4.0  # max(|dz|) / median(|dz|)
_OUTLIER_DZ_ABS_MM = 1.5  # mm

# edge 후보 탐색 성능/안정성 튜닝
# - 실제 샘플에서 수동 explode 후 정상 루프가 상위 8개 밖에 존재하는 케이스가 있어
#   후보 개수를 늘리고, 최소 버텍스 컷을 완화해 누락을 줄인다.
_EDGE_CANDIDATE_MAX_COUNT = 20
_EDGE_CANDIDATE_MIN_VERT_RATIO = 0.03
_EDGE_CANDIDATE_MIN_VERT_ABS = 40

# 거의 닫힌 커브를 폐곡선으로 간주하는 허용치(mm)
_EDGE_CLOSE_GAP_TOL_MM = 0.2

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

    # 성능/안정성: 너무 작은 파편 후보는 제외하고, 상위 후보만 평가
    raw_candidate_count = len(candidates)
    try:
        max_verts = max(
            (int(m.Vertices.Count) for m in candidates if m is not None), default=0
        )
    except Exception:
        max_verts = 0
    min_keep_verts = max(
        _EDGE_CANDIDATE_MIN_VERT_ABS,
        int(float(max_verts) * _EDGE_CANDIDATE_MIN_VERT_RATIO),
    )
    filtered_candidates = [
        m
        for m in candidates
        if m is not None and int(m.Vertices.Count) >= int(min_keep_verts)
    ]
    if not filtered_candidates:
        _trace_log(
            "[detect-edge] candidate_filter produced 0; fallback to unfiltered candidates"
        )
        filtered_candidates = candidates[:]
    candidates = filtered_candidates[:_EDGE_CANDIDATE_MAX_COUNT]
    _trace_log(
        "[detect-edge] candidate_filter total={} filtered={} kept={} min_keep_verts={} max_count={}".format(
            raw_candidate_count,
            len(filtered_candidates),
            len(candidates),
            int(min_keep_verts),
            int(_EDGE_CANDIDATE_MAX_COUNT),
        )
    )
    for ci, cm in enumerate(candidates):
        try:
            _trace_log(
                "[detect-edge] candidate_summary[{}] key={} verts={} faces={}".format(
                    ci,
                    _mesh_z_key(cm),
                    int(cm.Vertices.Count),
                    int(cm.Faces.Count),
                )
            )
        except Exception:
            continue

    ref_pt0 = None
    ref_pt0_radius = None
    try:
        ref_pt0 = _select_pt0(mesh)
        ref_pt0_radius = float(math.sqrt(ref_pt0.X * ref_pt0.X + ref_pt0.Y * ref_pt0.Y))
    except Exception:
        ref_pt0 = None
        ref_pt0_radius = None

    def _reason_from_counters(counters: Dict[str, int]) -> str:
        if counters.get("rejected_low_z", 0) > 0:
            return "C_EDGE_REJECTED_LOW_Z"
        if counters.get("rejected_flat_z", 0) > 0:
            return "C_EDGE_REJECTED_FLAT_Z"
        if counters.get("rejected_high_z", 0) > 0:
            return "C_EDGE_REJECTED_HIGH_Z"
        if counters.get("rejected_low_vs_pt0", 0) > 0:
            return "C_EDGE_REJECTED_LOW_VS_PT0"
        if counters.get("rejected_small_radius", 0) > 0:
            return "C_EDGE_REJECTED_SMALL_RADIUS"
        if counters.get("rejected_below_band", 0) > 0:
            return "C_EDGE_REJECTED_BELOW_BAND"
        return "C_EDGE_FAILED"

    def _run_edge_pass(
        pass_name: str,
        z_ref_pt0,
        z_ref_pt0_radius,
    ):
        counters = {
            "rejected_low_z": 0,
            "rejected_high_z": 0,
            "rejected_low_vs_pt0": 0,
            "rejected_small_radius": 0,
            "rejected_below_band": 0,
            "rejected_flat_z": 0,
        }

        best_score = None
        best_points = None
        best_strategy = None

        for idx, target_mesh in enumerate(candidates):
            _trace_log(
                "[detect-edge:{}] candidate[{}] vertices={} faces={} key={}".format(
                    pass_name,
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
                "[detect-edge:{}] candidate[{}] edge_curves_count={}".format(
                    pass_name,
                    idx,
                    len(edge_curves) if edge_curves else 0,
                )
            )
            mesh_band_max_r = _mesh_max_radius_in_z_band(target_mesh)
            traced_points = _pick_best_edge_loop_points(
                edge_curves,
                doc.ModelAbsoluteTolerance,
                z_ref_pt0,
                z_ref_pt0_radius,
                mesh_band_max_radius=mesh_band_max_r,
                strict_filters=True,
                debug_tag="{}#candidate{}#strict".format(pass_name, idx),
            )
            if not traced_points or len(traced_points) < 3:
                # strict 내부필터에서 모두 걸러진 경우, 루프 선정만 완화해 재시도
                traced_points = _pick_best_edge_loop_points(
                    edge_curves,
                    doc.ModelAbsoluteTolerance,
                    z_ref_pt0,
                    z_ref_pt0_radius,
                    mesh_band_max_radius=mesh_band_max_r,
                    strict_filters=False,
                    debug_tag="{}#candidate{}#relaxed_select".format(pass_name, idx),
                )
                if traced_points and len(traced_points) >= 3:
                    _trace_log(
                        "[detect-edge:{}] candidate[{}] strict_select_failed -> relaxed_select recovered pts={}".format(
                            pass_name,
                            idx,
                            len(traced_points),
                        )
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
                    "[detect-edge:{}] candidate[{}] traced_pts={} min_z={} max_z={} z_span={}".format(
                        pass_name,
                        idx,
                        len(traced_points),
                        edge_min_z if edge_min_z is not None else float("nan"),
                        edge_max_z if edge_max_z is not None else float("nan"),
                        edge_z_span if edge_z_span is not None else float("nan"),
                    )
                )
                if (
                    edge_min_z is not None
                    and edge_min_z <= _EDGE_MIN_Z_VALID_THRESHOLD_MM
                ):
                    counters["rejected_low_z"] += 1
                    _trace_log(
                        "[detect-edge:{}] candidate[{}] rejected min_z={:.6f} <= {:.3f}".format(
                            pass_name,
                            idx,
                            edge_min_z,
                            _EDGE_MIN_Z_VALID_THRESHOLD_MM,
                        )
                    )
                    continue

                if edge_z_span is not None and edge_z_span <= _EDGE_MIN_Z_SPAN_MM:
                    counters["rejected_flat_z"] += 1
                    _trace_log(
                        "[detect-edge:{}] candidate[{}] rejected flat_z z_span={:.6f} <= {:.3f}".format(
                            pass_name,
                            idx,
                            edge_z_span,
                            _EDGE_MIN_Z_SPAN_MM,
                        )
                    )
                    continue

                if edge_min_z is not None:
                    try:
                        cbbox = target_mesh.GetBoundingBox(True)
                        if cbbox.IsValid:
                            cheight = max(1e-6, float(cbbox.Max.Z - cbbox.Min.Z))
                            band_low = float(cbbox.Min.Z + _Z_RATIO_LOW * cheight)
                            if edge_min_z < band_low:
                                counters["rejected_below_band"] += 1
                                _trace_log(
                                    "[detect-edge:{}] candidate[{}] rejected below_band min_z={:.6f} < band_low={:.6f}".format(
                                        pass_name,
                                        idx,
                                        edge_min_z,
                                        band_low,
                                    )
                                )
                                continue
                    except Exception:
                        pass

                if z_ref_pt0 is not None and edge_min_z is not None:
                    max_allowed_z = z_ref_pt0.Z + _EDGE_MAX_Z_ABOVE_PT0_MM
                    if edge_min_z >= max_allowed_z:
                        counters["rejected_high_z"] += 1
                        _trace_log(
                            "[detect-edge:{}] candidate[{}] rejected high_z min_z={:.6f} >= pt0_z+{:.3f} ({:.6f})".format(
                                pass_name,
                                idx,
                                edge_min_z,
                                _EDGE_MAX_Z_ABOVE_PT0_MM,
                                max_allowed_z,
                            )
                        )
                        continue

                    min_allowed_z = z_ref_pt0.Z - _EDGE_MAX_Z_BELOW_PT0_MM
                    if edge_min_z <= min_allowed_z:
                        counters["rejected_low_vs_pt0"] += 1
                        _trace_log(
                            "[detect-edge:{}] candidate[{}] rejected low_vs_pt0 min_z={:.6f} <= pt0_z-{:.3f} ({:.6f})".format(
                                pass_name,
                                idx,
                                edge_min_z,
                                _EDGE_MAX_Z_BELOW_PT0_MM,
                                min_allowed_z,
                            )
                        )
                        continue

                edge_median_radius = _points_median_radius(traced_points)
                if (
                    z_ref_pt0_radius is not None
                    and z_ref_pt0_radius > _DIST_TOL
                    and edge_median_radius is not None
                ):
                    radius_ratio = edge_median_radius / z_ref_pt0_radius
                    if radius_ratio <= _EDGE_MIN_RADIUS_TO_PT0_RATIO:
                        counters["rejected_small_radius"] += 1
                        _trace_log(
                            "[detect-edge:{}] candidate[{}] rejected radius_ratio={:.4f} edge_median_r={:.4f} pt0_r={:.4f} <= {:.3f}".format(
                                pass_name,
                                idx,
                                radius_ratio,
                                edge_median_radius,
                                z_ref_pt0_radius,
                                _EDGE_MIN_RADIUS_TO_PT0_RATIO,
                            )
                        )
                        continue

                if edge_median_radius is not None and mesh_band_max_r > _DIST_TOL:
                    mesh_ratio = edge_median_radius / mesh_band_max_r
                    if mesh_ratio <= _EDGE_MIN_RADIUS_TO_MESH_BAND_RATIO:
                        counters["rejected_small_radius"] += 1
                        _trace_log(
                            "[detect-edge:{}] candidate[{}] rejected mesh_ratio={:.4f} edge_median_r={:.4f} mesh_band_max_r={:.4f} <= {:.3f}".format(
                                pass_name,
                                idx,
                                mesh_ratio,
                                edge_median_radius,
                                mesh_band_max_r,
                                _EDGE_MIN_RADIUS_TO_MESH_BAND_RATIO,
                            )
                        )
                        continue

                z_score = (
                    -abs(float(edge_min_z) - float(z_ref_pt0.Z))
                    if (z_ref_pt0 is not None and edge_min_z is not None)
                    else float(edge_min_z)
                    if edge_min_z is not None
                    else -float("inf")
                )
                score = (
                    float(edge_median_radius)
                    if edge_median_radius is not None
                    else -1.0,
                    float(z_score),
                    float(len(traced_points)),
                )
                _trace_log(
                    "[detect-edge:{}] candidate[{}] accepted score=(r={:.6f},z={:.6f},n={:.0f})".format(
                        pass_name,
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
                    "[detect-edge:{}] candidate[{}] no valid closed traced points (found={})".format(
                        pass_name,
                        idx,
                        len(traced_points) if traced_points else 0,
                    )
                )

        _trace_log(
            "[detect-edge:{}] pass_summary best_found={} best_strategy={} counters={}".format(
                pass_name,
                bool(best_points and len(best_points) >= 3),
                best_strategy,
                counters,
            )
        )
        return best_points, best_strategy, best_score, counters

    best_points, best_strategy, best_score, counters = _run_edge_pass(
        "strict_pt0",
        ref_pt0,
        ref_pt0_radius,
    )

    if best_points and len(best_points) >= 3:
        _trace_log(
            "[detect-edge] selected best strategy={} score={}".format(
                best_strategy,
                best_score,
            )
        )
        return best_points, str(best_strategy or "C_EXTRACT_MESH_EDGES_UNWELDED")

    # strict pass 실패 시 pt0 제약을 해제한 2차 패스로 1회 재시도
    if ref_pt0 is not None:
        _trace_log(
            "[detect-edge] strict pass failed -> retry without pt0 constraints counters={}".format(
                counters
            )
        )
        best_points2, best_strategy2, best_score2, counters2 = _run_edge_pass(
            "relaxed_no_pt0",
            None,
            None,
        )
        if best_points2 and len(best_points2) >= 3:
            _trace_log(
                "[detect-edge] relaxed retry selected strategy={} score={}".format(
                    best_strategy2,
                    best_score2,
                )
            )
            return best_points2, str(
                (best_strategy2 or "C_EXTRACT_MESH_EDGES_UNWELDED") + "#relaxed"
            )

        reason2 = _reason_from_counters(counters2)
        return None, "{}+RELAXED_FAIL:{}".format(
            _reason_from_counters(counters),
            reason2,
        )

    return None, _reason_from_counters(counters)


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

    if joined is None:
        return None

    is_closed = bool(getattr(joined, "IsClosed", False))

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

    gap = points[0].DistanceTo(points[-1])
    if not is_closed:
        # ExtractMeshEdges 결과가 미세 gap으로 열린 경우가 있어, 작은 gap은 폐곡선으로 보정
        if gap > _EDGE_CLOSE_GAP_TOL_MM:
            return None

    if gap > 1e-6:
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
    strict_filters: bool = True,
    debug_tag: str = "edge",
) -> Optional[List[rg.Point3d]]:
    if not curves:
        return None

    try:
        joined = rg.Curve.JoinCurves(list(curves), tolerance)
    except Exception:
        joined = None
    source = list(joined) if joined else list(curves)

    _trace_log(
        "[edge-loop:{}] input_curves={} joined_curves={} tol={:.6f} strict_filters={}".format(
            debug_tag,
            len(curves),
            len(source),
            float(tolerance),
            bool(strict_filters),
        )
    )

    # tuple: (median_radius, z_score, length, min_z, points)
    # - median_radius: 외곽 루프 우선
    # - z_score: pt0가 있으면 |min_z-pt0_z|가 작은 루프 우선, 없으면 min_z가 높은 루프 우선
    loop_infos: List[Tuple[float, float, float, float, List[rg.Point3d]]] = []
    inspected = 0
    accepted = 0
    reject_counts = {
        "open_or_invalid": 0,
        "low_z": 0,
        "high_vs_pt0": 0,
        "low_vs_pt0": 0,
        "small_vs_pt0": 0,
        "small_vs_mesh": 0,
    }

    for cv_idx, cv in enumerate(source):
        inspected += 1
        pts = _curve_to_closed_points(cv)
        if not pts or len(pts) < 3:
            reject_counts["open_or_invalid"] += 1
            _trace_log(
                "[edge-loop:{}] curve[{}] rejected reason=open_or_invalid".format(
                    debug_tag, cv_idx
                )
            )
            continue

        min_z = _points_min_z(pts)
        max_z = _points_max_z(pts)
        z_span = (
            float(max_z - min_z)
            if (min_z is not None and max_z is not None)
            else float("nan")
        )
        median_r = _points_median_radius(pts)

        try:
            length = float(cv.GetLength())
        except Exception:
            length = float(len(pts))

        if strict_filters:
            if min_z is not None and min_z <= _EDGE_MIN_Z_VALID_THRESHOLD_MM:
                reject_counts["low_z"] += 1
                _trace_log(
                    "[edge-loop:{}] curve[{}] rejected reason=low_z min_z={:.6f} <= {:.3f} len={:.4f} med_r={:.4f} z_span={:.4f}".format(
                        debug_tag,
                        cv_idx,
                        float(min_z),
                        _EDGE_MIN_Z_VALID_THRESHOLD_MM,
                        float(length),
                        float(median_r) if median_r is not None else float("nan"),
                        float(z_span),
                    )
                )
                continue

            if ref_pt0 is not None and min_z is not None:
                max_allowed_z = ref_pt0.Z + _EDGE_MAX_Z_ABOVE_PT0_MM
                if min_z >= max_allowed_z:
                    reject_counts["high_vs_pt0"] += 1
                    _trace_log(
                        "[edge-loop:{}] curve[{}] rejected reason=high_vs_pt0 min_z={:.6f} >= {:.6f}".format(
                            debug_tag, cv_idx, float(min_z), float(max_allowed_z)
                        )
                    )
                    continue
                min_allowed_z = ref_pt0.Z - _EDGE_MAX_Z_BELOW_PT0_MM
                if min_z <= min_allowed_z:
                    reject_counts["low_vs_pt0"] += 1
                    _trace_log(
                        "[edge-loop:{}] curve[{}] rejected reason=low_vs_pt0 min_z={:.6f} <= {:.6f}".format(
                            debug_tag, cv_idx, float(min_z), float(min_allowed_z)
                        )
                    )
                    continue

            if (
                ref_pt0_radius is not None
                and ref_pt0_radius > _DIST_TOL
                and median_r is not None
            ):
                ratio = median_r / ref_pt0_radius
                if ratio <= _EDGE_MIN_RADIUS_TO_PT0_RATIO:
                    reject_counts["small_vs_pt0"] += 1
                    _trace_log(
                        "[edge-loop:{}] curve[{}] rejected reason=small_vs_pt0 ratio={:.4f} <= {:.3f}".format(
                            debug_tag,
                            cv_idx,
                            float(ratio),
                            _EDGE_MIN_RADIUS_TO_PT0_RATIO,
                        )
                    )
                    continue

            if (
                mesh_band_max_radius is not None
                and mesh_band_max_radius > _DIST_TOL
                and median_r is not None
            ):
                mesh_ratio = median_r / mesh_band_max_radius
                if mesh_ratio <= _EDGE_MIN_RADIUS_TO_MESH_BAND_RATIO:
                    reject_counts["small_vs_mesh"] += 1
                    _trace_log(
                        "[edge-loop:{}] curve[{}] rejected reason=small_vs_mesh ratio={:.4f} <= {:.3f}".format(
                            debug_tag,
                            cv_idx,
                            float(mesh_ratio),
                            _EDGE_MIN_RADIUS_TO_MESH_BAND_RATIO,
                        )
                    )
                    continue

        if ref_pt0 is not None and min_z is not None:
            z_score = -abs(float(min_z) - float(ref_pt0.Z))
        else:
            z_score = float(min_z) if min_z is not None else -float("inf")

        accepted += 1
        _trace_log(
            "[edge-loop:{}] curve[{}] accepted min_z={:.6f} max_z={:.6f} z_span={:.6f} len={:.4f} med_r={:.4f} z_score={:.6f}".format(
                debug_tag,
                cv_idx,
                float(min_z) if min_z is not None else float("nan"),
                float(max_z) if max_z is not None else float("nan"),
                float(z_span),
                float(length),
                float(median_r) if median_r is not None else float("nan"),
                float(z_score),
            )
        )

        loop_infos.append(
            (
                float(median_r) if median_r is not None else -1.0,
                float(z_score),
                length,
                float(min_z) if min_z is not None else -float("inf"),
                pts,
            )
        )

    _trace_log(
        "[edge-loop:{}] summary inspected={} accepted={} rejected={} reject_counts={}".format(
            debug_tag,
            inspected,
            accepted,
            max(0, inspected - accepted),
            reject_counts,
        )
    )

    if not loop_infos:
        return None

    # 외곽 반경 우선 + (pt0 기준 높이 일치도) + 길이 우선
    loop_infos.sort(key=lambda item: (item[0], item[1], item[2]), reverse=True)
    selected = loop_infos[0]
    _trace_log(
        "[finishline] edge loops={} selected median_r={:.6f} z_score={:.6f} min_z={:.6f} len={:.3f} pts={} tag={}".format(
            len(loop_infos),
            selected[0],
            selected[1],
            selected[3],
            selected[2],
            len(selected[4]),
            debug_tag,
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

    예외: 단 하나의 seam 점프(주로 루프 닫힘 구간)가 존재하고,
    그 한 세그먼트를 제외하면 정상 통계인 경우는 허용한다.
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

    def _metric_outlier(values: Sequence[float], ratio_th: float, abs_th: float):
        if not values:
            return False, None
        med = _median(values)
        if med is None or med <= _DIST_TOL:
            return False, None
        max_v = max(values)
        limit = max(float(abs_th), float(med) * float(ratio_th))
        if max_v < limit:
            return False, {
                "max": float(max_v),
                "med": float(med),
                "ratio": float(max_v / max(1e-9, med)),
                "idx": -1,
                "count": 0,
            }

        try:
            idx = max(range(len(values)), key=lambda i: values[i])
        except Exception:
            idx = -1
        count = sum(1 for v in values if v >= limit)

        # 단일 outlier는 seam 점프일 수 있으므로 해당 세그먼트 제외 후 재검증
        if count == 1 and 0 <= idx < len(values) and len(values) >= 4:
            trimmed = [v for i, v in enumerate(values) if i != idx]
            med2 = _median(trimmed)
            if med2 is not None and med2 > _DIST_TOL:
                max2 = max(trimmed)
                limit2 = max(float(abs_th), float(med2) * float(ratio_th))
                if max2 < limit2:
                    return False, {
                        "max": float(max_v),
                        "med": float(med),
                        "ratio": float(max_v / max(1e-9, med)),
                        "idx": int(idx),
                        "count": int(count),
                        "accepted_single_outlier": True,
                    }

        return True, {
            "max": float(max_v),
            "med": float(med),
            "ratio": float(max_v / max(1e-9, med)),
            "idx": int(idx),
            "count": int(count),
        }

    seg_bad, seg_info = _metric_outlier(
        seg_lens,
        _OUTLIER_SEGMENT_RATIO,
        _OUTLIER_SEGMENT_ABS_MM,
    )
    if seg_bad:
        info = seg_info or {}
        return (
            False,
            "outlier_segment max_len={:.4f} med_len={:.4f} ratio={:.3f}".format(
                info.get("max", 0.0),
                info.get("med", 0.0),
                info.get("ratio", 0.0),
            ),
        )

    dz_bad, dz_info = _metric_outlier(
        seg_dz,
        _OUTLIER_DZ_RATIO,
        _OUTLIER_DZ_ABS_MM,
    )
    if dz_bad:
        info = dz_info or {}
        return (
            False,
            "outlier_dz max_dz={:.4f} med_dz={:.4f} ratio={:.3f}".format(
                info.get("max", 0.0),
                info.get("med", 0.0),
                info.get("ratio", 0.0),
            ),
        )

    if seg_info and seg_info.get("accepted_single_outlier"):
        return True, "ok_with_single_segment_outlier"
    if dz_info and dz_info.get("accepted_single_outlier"):
        return True, "ok_with_single_dz_outlier"

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
    """pt0를 경사축 기준으로 선택한다.

    기존(world-Z + XY 반경) 방식은 경사 샘플에서 포스트 중간으로 끌리는 경우가 있어,
    - 축 방향 투영값(axial) band 내에서
    - 축까지의 거리(radius-to-axis)가 최대인 점
    을 선택한다.
    """

    axis = _estimate_tilt_axis(mesh)
    if not axis.IsValid or axis.IsZero:
        axis = rg.Vector3d(0, 0, 1)
    try:
        axis.Unitize()
    except Exception:
        axis = rg.Vector3d(0, 0, 1)
    if float(axis.Z) < 0.0:
        axis = rg.Vector3d(-axis.X, -axis.Y, -axis.Z)

    def _axial(pt: rg.Point3d) -> float:
        return float(pt.X * axis.X + pt.Y * axis.Y + pt.Z * axis.Z)

    def _radius_to_axis(pt: rg.Point3d) -> float:
        try:
            pv = rg.Vector3d(float(pt.X), float(pt.Y), float(pt.Z))
            cp = rg.Vector3d.CrossProduct(pv, axis)
            return float(cp.Length)
        except Exception:
            return 0.0

    try:
        vcount = int(mesh.Vertices.Count)
    except Exception:
        vcount = 0
    if vcount <= 0:
        raise RuntimeError("pt0 후보를 찾을 수 없습니다 (Mesh에 버텍스가 없습니다)")

    a_min = float("inf")
    a_max = -float("inf")
    for i in range(vcount):
        try:
            v = mesh.Vertices[i]
            a = _axial(v)
            if a < a_min:
                a_min = a
            if a > a_max:
                a_max = a
        except Exception:
            continue

    if not math.isfinite(a_min) or not math.isfinite(a_max):
        raise RuntimeError("pt0 후보 축 범위를 계산할 수 없습니다")

    a_span = max(1e-6, a_max - a_min)
    low = a_min + _PT0_Z_RATIO_LOW * a_span
    high = a_min + _PT0_Z_RATIO_HIGH * a_span

    best_pt: Optional[rg.Point3d] = None
    best_r = -1.0

    for i in range(vcount):
        try:
            v = mesh.Vertices[i]
            a = _axial(v)
            if a < low or a > high:
                continue
            r = _radius_to_axis(v)
            if r > best_r:
                best_r = r
                best_pt = rg.Point3d(v)
        except Exception:
            continue

    if best_pt is None:
        for i in range(vcount):
            try:
                v = mesh.Vertices[i]
                r = _radius_to_axis(v)
                if r > best_r:
                    best_r = r
                    best_pt = rg.Point3d(v)
            except Exception:
                continue

    if best_pt is None:
        raise RuntimeError("pt0 후보를 찾을 수 없습니다 (Mesh에 버텍스가 없습니다)")

    _trace_log(
        "[pt0] axis_based selected x={:.6f} y={:.6f} z={:.6f} r_axis={:.6f} axial_band=({:.6f},{:.6f})".format(
            float(best_pt.X),
            float(best_pt.Y),
            float(best_pt.Z),
            float(best_r),
            float(low),
            float(high),
        )
    )
    return best_pt


# ---------------------------------------------------------------------------
# Section sampling
# ---------------------------------------------------------------------------
def _estimate_tilt_axis(mesh: rg.Mesh) -> rg.Vector3d:
    """메시 분포에서 경사축(주축)을 추정한다.

    중요: 축 추정은 원점 기준 모멘트가 아니라 "평균 중심 공분산"(PCA) 기반으로 계산한다.
    원점 기준 모멘트는 모델 위치 오프셋에 의해 world-Z로 끌리는 문제가 있어,
    경사 샘플에서 축이 잘못 Z축으로 고정될 수 있다.
    """
    try:
        bbox = mesh.GetBoundingBox(True)
    except Exception:
        bbox = None

    if bbox is None or not bbox.IsValid:
        return rg.Vector3d(0, 0, 1)

    z_min = float(bbox.Min.Z)
    z_max = float(bbox.Max.Z)
    height = max(1e-6, z_max - z_min)
    low = z_min + _TILT_AXIS_BAND_LOW * height
    high = z_min + _TILT_AXIS_BAND_HIGH * height

    try:
        vcount = int(mesh.Vertices.Count)
    except Exception:
        vcount = 0

    if vcount <= 0:
        return rg.Vector3d(0, 0, 1)

    def _accumulate(use_band: bool):
        sw = 0.0
        sx = sy = sz = 0.0
        s_xx = s_xy = s_xz = 0.0
        s_yy = s_yz = s_zz = 0.0
        n_local = 0

        for i in range(vcount):
            try:
                v = mesh.Vertices[i]
                x = float(v.X)
                y = float(v.Y)
                z = float(v.Z)

                if use_band and (z < low or z > high):
                    continue

                t = max(0.0, min(1.0, (z - z_min) / height))
                # 상부를 다소 강조하되, 저부 샘플도 완전히 버리지 않음
                w = 0.2 + 0.8 * (t * t)

                sw += w
                sx += w * x
                sy += w * y
                sz += w * z

                s_xx += w * x * x
                s_xy += w * x * y
                s_xz += w * x * z
                s_yy += w * y * y
                s_yz += w * y * z
                s_zz += w * z * z
                n_local += 1
            except Exception:
                continue

        return (n_local, sw, sx, sy, sz, s_xx, s_xy, s_xz, s_yy, s_yz, s_zz)

    def _axis_from_moments(stats):
        (
            _n,
            sw,
            sx,
            sy,
            sz,
            s_xx,
            s_xy,
            s_xz,
            s_yy,
            s_yz,
            s_zz,
        ) = stats

        if sw <= _DIST_TOL:
            return None

        mx = sx / sw
        my = sy / sw
        mz = sz / sw

        # 평균 중심 공분산
        c_xx = max(0.0, s_xx / sw - mx * mx)
        c_xy = s_xy / sw - mx * my
        c_xz = s_xz / sw - mx * mz
        c_yy = max(0.0, s_yy / sw - my * my)
        c_yz = s_yz / sw - my * mz
        c_zz = max(0.0, s_zz / sw - mz * mz)

        # power iteration (3x3 symmetric) for principal eigenvector
        vx, vy, vz = 0.0, 0.0, 1.0
        for _ in range(16):
            nx = c_xx * vx + c_xy * vy + c_xz * vz
            ny = c_xy * vx + c_yy * vy + c_yz * vz
            nz = c_xz * vx + c_yz * vy + c_zz * vz
            norm = math.sqrt(nx * nx + ny * ny + nz * nz)
            if norm <= _DIST_TOL:
                break
            vx, vy, vz = nx / norm, ny / norm, nz / norm

        axis_local = rg.Vector3d(vx, vy, vz)
        if not axis_local.IsValid or axis_local.IsZero:
            return None
        try:
            axis_local.Unitize()
        except Exception:
            return None
        if float(axis_local.Z) < 0.0:
            axis_local = rg.Vector3d(-axis_local.X, -axis_local.Y, -axis_local.Z)
        return axis_local

    # 1차: 중상부 band 기반 추정
    band_stats = _accumulate(use_band=True)
    n_band = int(band_stats[0])

    axis = None
    source = "band"
    if n_band >= _TILT_AXIS_MIN_VERTS:
        axis = _axis_from_moments(band_stats)

    # 2차: band 샘플 부족 또는 band 추정 실패 시 전체 버텍스로 재시도
    if axis is None:
        full_stats = _accumulate(use_band=False)
        n_full = int(full_stats[0])
        source = "full"
        if n_band < _TILT_AXIS_MIN_VERTS:
            _trace_log(
                "[axis] band_samples_low n_band={} (<{}), retry_full_vertices n_full={}".format(
                    n_band,
                    _TILT_AXIS_MIN_VERTS,
                    n_full,
                )
            )
        axis = _axis_from_moments(full_stats)
        n_used = n_full
    else:
        n_used = n_band

    if axis is None:
        _trace_log("[axis] fallback=Z reason=axis_estimation_failed")
        return rg.Vector3d(0, 0, 1)

    # 수평에 너무 가까우면 비정상으로 보고 Z축 fallback
    if abs(float(axis.Z)) < 0.2:
        _trace_log(
            "[axis] fallback=Z reason=low_z_component axis=({:.6f},{:.6f},{:.6f}) source={}".format(
                axis.X,
                axis.Y,
                axis.Z,
                source,
            )
        )
        return rg.Vector3d(0, 0, 1)

    try:
        dot = max(-1.0, min(1.0, float(axis.Z)))
        tilt_deg = math.degrees(math.acos(dot))
    except Exception:
        tilt_deg = float("nan")

    _trace_log(
        "[axis] estimated tilt_axis=({:.6f},{:.6f},{:.6f}) tilt_deg={:.3f} samples={} source={}".format(
            axis.X,
            axis.Y,
            axis.Z,
            tilt_deg,
            n_used,
            source,
        )
    )

    return axis


def _build_section_planes(
    count: int = _SECTION_COUNT,
    step_deg: float = _SECTION_STEP_DEG,
    axis_dir: Optional[rg.Vector3d] = None,
) -> List[rg.Plane]:
    planes: List[rg.Plane] = []

    axis = rg.Vector3d(axis_dir) if axis_dir is not None else rg.Vector3d(0, 0, 1)
    if not axis.IsValid or axis.IsZero:
        axis = rg.Vector3d(0, 0, 1)
    try:
        axis.Unitize()
    except Exception:
        axis = rg.Vector3d(0, 0, 1)

    helper = rg.Vector3d(0, 0, 1)
    try:
        if abs(float(axis * helper)) > 0.95:
            helper = rg.Vector3d(1, 0, 0)
    except Exception:
        helper = rg.Vector3d(1, 0, 0)

    u_dir = rg.Vector3d.CrossProduct(axis, helper)
    if not u_dir.IsValid or u_dir.IsZero:
        helper = rg.Vector3d(0, 1, 0)
        u_dir = rg.Vector3d.CrossProduct(axis, helper)
    if not u_dir.IsValid or u_dir.IsZero:
        u_dir = rg.Vector3d(1, 0, 0)
    try:
        u_dir.Unitize()
    except Exception:
        pass

    v_dir = rg.Vector3d.CrossProduct(axis, u_dir)
    if not v_dir.IsValid or v_dir.IsZero:
        v_dir = rg.Vector3d(0, 1, 0)
    try:
        v_dir.Unitize()
    except Exception:
        pass

    for idx in range(count):
        angle = math.radians(step_deg * idx)
        radial = rg.Vector3d(
            u_dir.X * math.cos(angle) + v_dir.X * math.sin(angle),
            u_dir.Y * math.cos(angle) + v_dir.Y * math.sin(angle),
            u_dir.Z * math.cos(angle) + v_dir.Z * math.sin(angle),
        )
        if not radial.IsValid or radial.IsZero:
            continue
        planes.append(rg.Plane(rg.Point3d.Origin, radial, axis))
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
    axis_dir: rg.Vector3d,
    ref_pt0: Optional[rg.Point3d] = None,
) -> Tuple[List[rg.Point3d], List[Dict[str, object]]]:
    """원점을 지나는 경사축 기반 단면에서 "최대 반경" 후보를 순차 추적한다.

    주의:
    - 반경은 Z축(XY) 기준이 아니라 경사축(axis)까지의 거리로 계산
    - 경사체 반쪽 누락을 막기 위해 world-Z band 대신 축 투영(axial) band를 사용
    """

    axis = rg.Vector3d(axis_dir)
    if not axis.IsValid or axis.IsZero:
        axis = rg.Vector3d(0, 0, 1)
    try:
        axis.Unitize()
    except Exception:
        axis = rg.Vector3d(0, 0, 1)
    if float(axis.Z) < 0.0:
        axis = rg.Vector3d(-axis.X, -axis.Y, -axis.Z)

    def _axial(pt: rg.Point3d) -> float:
        return float(pt.X * axis.X + pt.Y * axis.Y + pt.Z * axis.Z)

    try:
        vcount = int(mesh.Vertices.Count)
    except Exception:
        vcount = 0

    a_min = float("inf")
    a_max = -float("inf")
    for i in range(vcount):
        try:
            v = mesh.Vertices[i]
            a = _axial(v)
            if a < a_min:
                a_min = a
            if a > a_max:
                a_max = a
        except Exception:
            continue

    if not math.isfinite(a_min) or not math.isfinite(a_max):
        a_low = -1e9
        a_high = 1e9
    else:
        a_span = max(1e-6, a_max - a_min)
        a_low = a_min + _MAXR_AXIS_RATIO_LOW * a_span
        a_high = a_min + _MAXR_AXIS_RATIO_HIGH * a_span

    def _radius(pt: rg.Point3d) -> float:
        # 원점을 지나는 경사축(axis)까지의 거리: |p x axis|
        try:
            pv = rg.Vector3d(float(pt.X), float(pt.Y), float(pt.Z))
            cp = rg.Vector3d.CrossProduct(pv, axis)
            return float(cp.Length)
        except Exception:
            return 0.0

    def _max_radius_band(points: Sequence[rg.Point3d]) -> List[rg.Point3d]:
        if not points:
            return []
        valid: List[Tuple[float, rg.Point3d]] = []
        for p in points:
            try:
                valid.append((_radius(p), p))
            except Exception:
                continue
        if not valid:
            return []
        max_r = max(r for r, _ in valid)
        cutoff = float(max_r) * 0.985
        band = [rg.Point3d(p) for r, p in valid if r >= cutoff]
        if band:
            return band
        best = max(valid, key=lambda item: item[0])[1]
        return [rg.Point3d(best)]

    traced: List[rg.Point3d] = []
    sections: List[Dict[str, object]] = []
    section_band_candidates: List[List[rg.Point3d]] = []
    section_reps: List[Tuple[int, rg.Point3d, float, float]] = []

    for idx, plane in enumerate(planes):
        pts_all, curves = _sample_plane_section_all_points(mesh, plane)
        pts = [
            p
            for p in pts_all
            if (p is not None and a_low <= float(_axial(p)) <= a_high)
        ]
        band = _max_radius_band(pts)

        sections.append(
            {
                "index": idx,
                "points": pts,
                "curves": curves,
                "controls": band,
                "plane": plane,
            }
        )
        section_band_candidates.append(band)

        if band:
            try:
                rep = max(band, key=lambda p: _radius(p))
                rep_r = _radius(rep)
                rep_a = _axial(rep)
                section_reps.append((idx, rg.Point3d(rep), float(rep_r), float(rep_a)))
            except Exception:
                pass

        _trace_log(
            "[max-r] collect plane_idx={} candidates={} filtered={} max_band={} axial_band=({:.3f},{:.3f})".format(
                idx,
                len(pts_all),
                len(pts),
                len(band),
                a_low,
                a_high,
            )
        )

    if not section_band_candidates or not section_reps:
        return traced, sections

    z_hint = _median([float(rep[1].Z) for rep in section_reps])
    if z_hint is None:
        z_hint = float(section_reps[0][1].Z)

    a_hint = _median([float(rep[3]) for rep in section_reps])
    if a_hint is None:
        a_hint = float(section_reps[0][3])

    # 시작점: 전역 최대 반경 단일점이 아닌,
    # "상위 반경 군" 안에서 axial 중앙값에 가까운 안정점 선택(점프 완화)
    reps_sorted = sorted(section_reps, key=lambda item: float(item[2]), reverse=True)
    top_n = max(1, int(round(len(reps_sorted) * 0.25)))
    top_reps = reps_sorted[:top_n]

    start_idx = -1
    start_pt = None
    start_r = -1.0
    best_key = None
    for idx, p, r, a in top_reps:
        try:
            key = (
                -abs(float(a) - float(a_hint)),
                float(r),
            )
        except Exception:
            key = (-1e9, float(r))
        if best_key is None or key > best_key:
            best_key = key
            start_idx = int(idx)
            start_pt = rg.Point3d(p)
            start_r = float(r)

    if start_idx < 0 or start_pt is None:
        return traced, sections

    _trace_log(
        "[max-r] start plane_idx={} pt=({:.6f},{:.6f},{:.6f}) r={:.6f} z_hint={:.6f} a_hint={:.6f}".format(
            start_idx,
            start_pt.X,
            start_pt.Y,
            start_pt.Z,
            _radius(start_pt),
            float(z_hint),
            float(a_hint),
        )
    )

    last = rg.Point3d(start_pt)
    traced.append(rg.Point3d(start_pt))

    total = len(section_band_candidates)
    for step in range(1, total):
        idx = (start_idx + step) % total
        band = section_band_candidates[idx]
        if not band:
            _trace_log(
                "[max-r] step={} plane_idx={} skipped(no max-band)".format(step, idx)
            )
            continue

        # 다음 섹션: 반경 우선(near-max), 이후 연속성으로 branch 선택
        try:
            best_r = max(float(_radius(p)) for p in band)
            near = [p for p in band if float(_radius(p)) >= (best_r * 0.985)]
            pool = near if near else band
            best = min(
                pool,
                key=lambda p: (
                    float(p.DistanceTo(last)),
                    abs(float(p.Z) - float(last.Z)),
                    abs(float(p.Z) - float(z_hint)),
                    abs(float(_axial(p)) - float(a_hint)),
                    -_radius(p),
                ),
            )
        except Exception:
            best = band[0]

        new_pt = rg.Point3d(best)
        traced.append(new_pt)
        _trace_log(
            "[max-r] step={} plane_idx={} selected r={:.6f} z={:.6f} move={:.6f}".format(
                step,
                idx,
                _radius(new_pt),
                new_pt.Z,
                float(new_pt.DistanceTo(last)),
            )
        )
        last = new_pt

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


def _normalize_loop_points(points: Sequence[rg.Point3d]) -> List[rg.Point3d]:
    if not points or len(points) < 4:
        return []

    core = [rg.Point3d(p) for p in points if p is not None]
    if len(core) < 4:
        return []

    try:
        is_closed = core[0].DistanceTo(core[-1]) <= 1e-4
    except Exception:
        is_closed = False

    if is_closed:
        core = core[:-1]
    if len(core) < 3:
        return []

    ordered = _order_by_azimuth(core)
    if len(ordered) < 3:
        return []
    ordered.append(rg.Point3d(ordered[0]))
    return ordered


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
    # 섹션 커브는 한 계열 색(하늘색)로 통일
    color = drawing.Color.FromArgb(100, 180, 255)

    ids: List[str] = []
    for section in sections:
        curves = section.get("curves") or []
        if not curves:
            continue
        for curve in curves:
            if curve is None:
                continue
            cid = _add_colored_object(doc, curve, color)
            ids.append(str(cid))
    return ids


def _visualize_tracking_debug_objects(
    doc: Rhino.RhinoDoc,
    section_axis: Optional[rg.Vector3d],
    sections: Sequence[Dict[str, object]],
    traced_points: Sequence[rg.Point3d],
    mesh_for_axis: Optional[rg.Mesh] = None,
) -> Dict[str, List[str]]:
    ids: Dict[str, List[str]] = {
        "axis": [],
        "start": [],
        "trace_points": [],
        "trace_curve": [],
        "max_band": [],
    }

    # 1) 경사축 표시: "포스트 탑 ~ 마진(피니시라인)" 구간만 제한해서 그림
    try:
        axis = (
            rg.Vector3d(section_axis)
            if section_axis is not None
            else rg.Vector3d(0, 0, 1)
        )
        if not axis.IsValid or axis.IsZero:
            axis = rg.Vector3d(0, 0, 1)
        axis.Unitize()
        if float(axis.Z) < 0.0:
            axis = rg.Vector3d(-axis.X, -axis.Y, -axis.Z)

        def _axial(pt: rg.Point3d) -> float:
            return float(pt.X * axis.X + pt.Y * axis.Y + pt.Z * axis.Z)

        margin_axial = None
        if traced_points:
            vals = []
            for p in traced_points:
                if p is None:
                    continue
                try:
                    vals.append(_axial(rg.Point3d(p)))
                except Exception:
                    continue
            if vals:
                vals.sort()
                margin_axial = float(vals[len(vals) // 2])

        top_axial = None
        if mesh_for_axis is not None:
            try:
                vcount = int(mesh_for_axis.Vertices.Count)
            except Exception:
                vcount = 0
            for i in range(vcount):
                try:
                    v = mesh_for_axis.Vertices[i]
                    a = _axial(v)
                    if top_axial is None or a > top_axial:
                        top_axial = a
                except Exception:
                    continue

        # 기본 fallback: 과도하게 긴 선을 피하기 위해 짧은 길이 사용
        if margin_axial is None:
            margin_axial = 0.0
        if top_axial is None:
            top_axial = margin_axial + 8.0

        # 포스트 탑 + 소량 margin까지만 (너무 길게 뻗는 문제 방지)
        top_axial = float(top_axial) + 0.8
        if top_axial < margin_axial:
            top_axial, margin_axial = margin_axial, top_axial

        # 표시 길이 hard clamp
        seg_len = max(0.5, float(top_axial - margin_axial))
        if seg_len > 14.0:
            top_axial = margin_axial + 14.0

        p0 = rg.Point3d(
            axis.X * margin_axial,
            axis.Y * margin_axial,
            axis.Z * margin_axial,
        )
        p1 = rg.Point3d(
            axis.X * top_axial,
            axis.Y * top_axial,
            axis.Z * top_axial,
        )
        axis_curve = rg.LineCurve(p0, p1)

        pipe = rg.Brep.CreatePipe(
            axis_curve,
            System.Array[System.Double]([0.10]),
            System.Array[System.Double]([axis_curve.Domain.T0]),
            False,
            rg.PipeCapMode.Round,
            True,
            doc.ModelAbsoluteTolerance,
            doc.ModelAngleToleranceRadians,
        )
        if pipe:
            for brep in pipe:
                aid = _add_colored_object(
                    doc, brep, drawing.Color.FromArgb(20, 230, 90)
                )
                ids["axis"].append(str(aid))
        else:
            a1 = _add_colored_object(
                doc, axis_curve, drawing.Color.FromArgb(20, 230, 90)
            )
            ids["axis"].append(str(a1))

        tip = rg.Sphere(p1, 0.16)
        tid = _add_colored_object(
            doc, tip.ToBrep(), drawing.Color.FromArgb(20, 230, 90)
        )
        ids["axis"].append(str(tid))
    except Exception:
        pass

    # 2) 섹션별 max-radius band 후보 (연보라 점)
    for section in sections:
        band = section.get("controls") or []
        for p in band:
            if p is None:
                continue
            try:
                sph = rg.Sphere(rg.Point3d(p), 0.04)
                oid = _add_colored_object(
                    doc, sph.ToBrep(), drawing.Color.FromArgb(190, 140, 255)
                )
                ids["max_band"].append(str(oid))
            except Exception:
                continue

    # 3) 시작점 (노랑)
    if traced_points and len(traced_points) >= 1 and traced_points[0] is not None:
        try:
            start_sphere = rg.Sphere(rg.Point3d(traced_points[0]), 0.12)
            sid = _add_colored_object(
                doc, start_sphere.ToBrep(), drawing.Color.FromArgb(255, 220, 0)
            )
            ids["start"].append(str(sid))
        except Exception:
            pass

    # 4) 피니시라인 점들 (자홍)
    for p in traced_points or []:
        if p is None:
            continue
        try:
            sph = rg.Sphere(rg.Point3d(p), 0.05)
            oid = _add_colored_object(
                doc, sph.ToBrep(), drawing.Color.FromArgb(255, 40, 170)
            )
            ids["trace_points"].append(str(oid))
        except Exception:
            continue

    # 5) 피니시라인 폴리라인 (주황)
    try:
        if traced_points and len(traced_points) >= 2:
            pl = rg.Polyline([rg.Point3d(p) for p in traced_points if p is not None])
            curve = rg.PolylineCurve(pl)
            cid = _add_colored_object(doc, curve, drawing.Color.FromArgb(255, 140, 0))
            ids["trace_curve"].append(str(cid))
    except Exception:
        pass

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
    section_axis = rg.Vector3d(0, 0, 1)

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
                normalized = _normalize_loop_points(traced_points)
                if normalized and len(normalized) >= 4:
                    ok2, reason2 = _validate_finishline_points(normalized)
                    if ok2:
                        _trace_log(
                            "[detect] edge result normalized by azimuth and accepted (prev_reason={})".format(
                                reason
                            )
                        )
                        traced_points = normalized
                        ok_shape = True
                        reason = "normalized_from:{}".format(reason)
                if not ok_shape:
                    _trace_log(
                        "[detect] edge result rejected by outlier check: {}; fallback=section_tracking".format(
                            reason
                        )
                    )
                    traced_points = None

    # 2) 단면 추적(fallback)
    if not traced_points or len(traced_points) < 3:
        section_axis = _estimate_tilt_axis(mesh_copy)
        planes = _build_section_planes(
            count=_SECTION_COUNT,
            step_deg=_SECTION_STEP_DEG,
            axis_dir=section_axis,
        )
        _trace_log(
            "[detect] starting section tracking planes={} step_deg={} axis=({:.6f},{:.6f},{:.6f}) mode=max_radius_sequential".format(
                len(planes),
                _SECTION_STEP_DEG,
                float(section_axis.X),
                float(section_axis.Y),
                float(section_axis.Z),
            )
        )
        try:
            traced_points, sections = _detect_finishline_points_max_radius_from_z_axis(
                mesh_copy,
                planes,
                axis_dir=section_axis,
                ref_pt0=pt0,
            )
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
                normalized = _normalize_loop_points(traced_points)
                if normalized and len(normalized) >= 4:
                    ok2, reason2 = _validate_finishline_points(normalized)
                    if ok2:
                        _trace_log(
                            "[detect] section result normalized by azimuth and accepted (prev_reason={})".format(
                                reason
                            )
                        )
                        traced_points = normalized
                        ok_shape = True
                        reason = "normalized_from:{}".format(reason)
                if not ok_shape:
                    # max-radius sequential 추적은 디버깅/시각화 우선: outlier여도 결과를 반환한다.
                    _trace_log(
                        "[detect] section result outlier warning (kept): {}".format(
                            reason
                        )
                    )
                    strategy_used = "SECTION_MAX_RADIUS_TRACK_{}x{}_RAW_OUTLIER".format(
                        _SECTION_COUNT, int(_SECTION_STEP_DEG)
                    )
                    ok_shape = True

            if ok_shape and not str(strategy_used or "").startswith(
                "SECTION_MAX_RADIUS_TRACK_"
            ):
                strategy_used = "SECTION_MAX_RADIUS_TRACK_{}x{}_FALLBACK".format(
                    _SECTION_COUNT, int(_SECTION_STEP_DEG)
                )

        # Visualization hooks
    viz_ids: Dict[str, List[str]] = {"points": [], "mesh": []}
    if _DEBUG_ADD_POLYLINE_CURVE:
        debug_curve_id = _add_debug_finishline_polyline_curve(doc, traced_points)
        if debug_curve_id:
            viz_ids["debug_curve"] = [debug_curve_id]

    if visualize:
        base_viz = _visualize(doc, pt0, traced_points or [])
        for key, values in base_viz.items():
            viz_ids[key] = values

        debug_viz = _visualize_tracking_debug_objects(
            doc=doc,
            section_axis=section_axis,
            sections=sections,
            traced_points=traced_points or [],
            mesh_for_axis=mesh_copy,
        )
        for key, values in debug_viz.items():
            if values:
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
