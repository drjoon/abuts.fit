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
_SECTION_COUNT = 40  # section plane count
_SECTION_STEP_DEG = 4.5  # 180/40 = 4.5 degrees (unique section planes)
_TILT_AXIS_BAND_LOW = 0.15
_TILT_AXIS_BAND_HIGH = 0.95
_TILT_AXIS_MIN_VERTS = 120
_PT0_Z_RATIO_LOW = 0.2
_PT0_Z_RATIO_HIGH = 0.6
_Z_RATIO_LOW = 0.2
_Z_RATIO_HIGH = 0.7
_MAXR_AXIS_RATIO_LOW = 0.18
_MAXR_AXIS_RATIO_HIGH = 0.72
_MAXR_PT0_Z_WINDOW_LOW = 2.8
_MAXR_PT0_Z_WINDOW_HIGH = 3.0
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
_GLOBAL_DEBUG = _env_true("DEBUG", False)
_DEBUG_TRACE = _env_true("FINISHLINE_TRACE_DEBUG", _GLOBAL_DEBUG)
_DEBUG_KEEP_TEMP_OBJECTS = _env_true(
    "FINISHLINE_DEBUG_KEEP_TEMP_OBJECTS", _GLOBAL_DEBUG
)
_DEBUG_ADD_POLYLINE_CURVE = _env_true("FINISHLINE_DEBUG_CURVE_DOC", _GLOBAL_DEBUG)
_SHOW_ALL_SECTION_CURVES = _env_true("FINISHLINE_SHOW_ALL_SECTIONS", _GLOBAL_DEBUG)
_EDGE_MIN_Z_VALID_THRESHOLD_MM = 0.2
_EDGE_MIN_RADIUS_TO_PT0_RATIO = 0.45
_EDGE_MIN_RADIUS_TO_MESH_BAND_RATIO = 0.55
_EDGE_MAX_Z_ABOVE_PT0_MM = 8.0
_EDGE_MAX_Z_BELOW_PT0_MM = 2.5
_EDGE_MIN_Z_SPAN_MM = 0.08
_EDGE_MIN_AZIMUTH_COVERAGE_RAD = 4.5
_OUTLIER_SEGMENT_RATIO = 2.8  # max(segment) / median(segment)
_OUTLIER_SEGMENT_ABS_MM = 2.0  # mm
_OUTLIER_DZ_RATIO = 4.0  # max(|dz|) / median(|dz|)
_OUTLIER_DZ_ABS_MM = 1.5  # mm
_EDGE_CANDIDATE_MAX_COUNT = 20
_EDGE_CANDIDATE_MIN_VERT_RATIO = 0.03
_EDGE_CANDIDATE_MIN_VERT_ABS = 40
_EDGE_CLOSE_GAP_TOL_MM = 0.2
_EXTERNAL_LOGGER = None
def set_external_logger(logger_fn) -> None:
    global _EXTERNAL_LOGGER
    _EXTERNAL_LOGGER = logger_fn
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
def _dedup_points_quantized(
    points: Sequence[rg.Point3d],
    scale: float = 1e6,
) -> List[rg.Point3d]:
    out: List[rg.Point3d] = []
    seen = set()
    if not points:
        return out
    for p in points:
        if p is None:
            continue
        try:
            key = (
                int(round(float(p.X) * float(scale))),
                int(round(float(p.Y) * float(scale))),
                int(round(float(p.Z) * float(scale))),
            )
        except Exception:
            continue
        if key in seen:
            continue
        seen.add(key)
        out.append(rg.Point3d(p))
    return out
def _detect_finishline_points_edge(
    doc: Rhino.RhinoDoc,
    mesh: rg.Mesh,
) -> Tuple[Optional[List[rg.Point3d]], str]:
    candidates = _explode_components_sorted_by_max_z(mesh)
    if not candidates:
        candidates = [mesh]
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
                                _trace_log(
                                    "[detect-edge:{}] candidate[{}] note below_band min_z={:.6f} < band_low={:.6f} (kept; low-z priority)".format(
                                        pass_name,
                                        idx,
                                        edge_min_z,
                                        band_low,
                                    )
                                )
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
                        _trace_log(
                            "[detect-edge:{}] candidate[{}] note low_vs_pt0 min_z={:.6f} <= pt0_z-{:.3f} ({:.6f}) (kept; lowest-loop priority)".format(
                                pass_name,
                                idx,
                                edge_min_z,
                                _EDGE_MAX_Z_BELOW_PT0_MM,
                                min_allowed_z,
                            )
                        )
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
                lowest_z_score = (
                    -float(edge_min_z) if edge_min_z is not None else -float("inf")
                )
                pt0_align_score = (
                    -abs(float(edge_min_z) - float(z_ref_pt0.Z))
                    if (z_ref_pt0 is not None and edge_min_z is not None)
                    else 0.0
                )
                score = (
                    float(lowest_z_score),
                    float(edge_median_radius)
                    if edge_median_radius is not None
                    else -1.0,
                    float(pt0_align_score),
                    float(len(traced_points)),
                )
                _trace_log(
                    "[detect-edge:{}] candidate[{}] accepted score=(low_z={:.6f},r={:.6f},pt0_align={:.6f},n={:.0f})".format(
                        pass_name,
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

    infos = []
    for mo in meshes:
        geom = mo.Geometry
        if geom is None:
            continue
        z_key = _mesh_z_key(geom)
        if z_key is None:
            continue
        xy_r = _mesh_xy_radius_from_bbox(geom)
        try:
            bbox = geom.GetBoundingBox(True)
        except Exception:
            bbox = None
        if bbox is None or not bbox.IsValid:
            continue
        infos.append(
            {
                "mesh_obj": mo,
                "geom": geom,
                "xy_r": float(xy_r),
                "z_key": z_key,
                "zmin": float(bbox.Min.Z),
                "zmax": float(bbox.Max.Z),
                "verts": int(geom.Vertices.Count),
            }
        )

    if not infos:
        target = meshes[0]
        geom = target.Geometry
        if geom is None:
            raise RuntimeError("선택된 Mesh 객체에서 Geometry를 읽을 수 없습니다")
        return target, geom

    # 우선순위: 치은(하방) 메시 우선
    # - global min_z에 0.1mm 이내로 닿는 메시만 1차 후보
    # - 그 중에서 외곽 반경/버텍스 수가 큰 메시를 선택
    global_min_z = min(item["zmin"] for item in infos)
    near_min_tol = 0.10
    gingiva_candidates = [
        item for item in infos if float(item["zmin"]) <= (float(global_min_z) + near_min_tol)
    ]

    chosen = None
    if gingiva_candidates:
        gingiva_candidates.sort(
            key=lambda item: (
                float(item["xy_r"]),
                int(item["verts"]),
                float(item["zmax"]),
            ),
            reverse=True,
        )
        chosen = gingiva_candidates[0]
        _trace_log(
            "[pick-mesh] mode=gingiva_min_z global_min_z={:.4f} tol={:.3f} candidates={} chosen_id={} chosen_z=({:.4f},{:.4f}) xy_r={:.4f} verts={}".format(
                float(global_min_z),
                float(near_min_tol),
                len(gingiva_candidates),
                chosen["mesh_obj"].Id,
                float(chosen["zmin"]),
                float(chosen["zmax"]),
                float(chosen["xy_r"]),
                int(chosen["verts"]),
            )
        )
    else:
        max_r = max(float(item["xy_r"]) for item in infos)
        band = max(0.05, max_r * 0.01)
        top_band = [item for item in infos if float(item["xy_r"]) >= (max_r - band)]
        if not top_band:
            top_band = infos
        top_band.sort(
            key=lambda item: (item["z_key"], float(item["xy_r"])),
            reverse=True,
        )
        chosen = top_band[0]
        _trace_log(
            "[pick-mesh] mode=fallback_upper max_r={:.4f} band={:.4f} chosen_id={} chosen_key={} xy_r={:.4f}".format(
                float(max_r),
                float(band),
                chosen["mesh_obj"].Id,
                chosen["z_key"],
                float(chosen["xy_r"]),
            )
        )

    target = chosen["mesh_obj"]
    geom = target.Geometry
    if geom is None:
        raise RuntimeError("선택된 Mesh 객체에서 Geometry를 읽을 수 없습니다")
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
        if gap > _EDGE_CLOSE_GAP_TOL_MM:
            return None
    if gap > 1e-6:
        points.append(rg.Point3d(points[0]))
    return points
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
        "low_azimuth_coverage": 0,
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
        az_coverage = _loop_azimuth_coverage(pts)
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
                    _trace_log(
                        "[edge-loop:{}] curve[{}] note low_vs_pt0 min_z={:.6f} <= {:.6f} (kept; lowest-loop priority)".format(
                            debug_tag, cv_idx, float(min_z), float(min_allowed_z)
                        )
                    )
            if az_coverage < float(_EDGE_MIN_AZIMUTH_COVERAGE_RAD):
                reject_counts["low_azimuth_coverage"] += 1
                _trace_log(
                    "[edge-loop:{}] curve[{}] rejected reason=low_azimuth_coverage cov={:.4f} < {:.4f}".format(
                        debug_tag,
                        cv_idx,
                        float(az_coverage),
                        float(_EDGE_MIN_AZIMUTH_COVERAGE_RAD),
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
            "[edge-loop:{}] curve[{}] accepted min_z={:.6f} max_z={:.6f} z_span={:.6f} len={:.4f} med_r={:.4f} az_cov={:.4f} z_score={:.6f}".format(
                debug_tag,
                cv_idx,
                float(min_z) if min_z is not None else float("nan"),
                float(max_z) if max_z is not None else float("nan"),
                float(z_span),
                float(length),
                float(median_r) if median_r is not None else float("nan"),
                float(az_coverage),
                float(z_score),
            )
        )
        loop_infos.append(
            (
                float(median_r) if median_r is not None else -1.0,
                float(z_score),
                length,
                float(min_z) if min_z is not None else float("inf"),
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
    loop_infos.sort(key=lambda item: (item[3], -item[0], -item[1], -item[2]))
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
def _points_z_extrema(
    points: Sequence[rg.Point3d],
) -> Tuple[Optional[rg.Point3d], Optional[float], Optional[rg.Point3d], Optional[float]]:
    if not points:
        return None, None, None, None
    min_pt: Optional[rg.Point3d] = None
    max_pt: Optional[rg.Point3d] = None
    min_z = float("inf")
    max_z = -float("inf")
    for pt in points:
        if pt is None:
            continue
        try:
            z = float(pt.Z)
        except Exception:
            continue
        if z < min_z:
            min_z = z
            min_pt = rg.Point3d(pt)
        if z > max_z:
            max_z = z
            max_pt = rg.Point3d(pt)
    if min_pt is None or max_pt is None:
        return None, None, None, None
    return min_pt, float(min_z), max_pt, float(max_z)

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
def _loop_azimuth_coverage(points: Sequence[rg.Point3d]) -> float:
    if not points:
        return 0.0
    angles: List[float] = []
    for p in points:
        if p is None:
            continue
        try:
            angles.append(float(math.atan2(float(p.Y), float(p.X))))
        except Exception:
            continue
    if len(angles) < 3:
        return 0.0
    angles.sort()
    max_gap = 0.0
    for i in range(1, len(angles)):
        gap = float(angles[i] - angles[i - 1])
        if gap > max_gap:
            max_gap = gap
    wrap_gap = float((angles[0] + 2.0 * math.pi) - angles[-1])
    if wrap_gap > max_gap:
        max_gap = wrap_gap
    coverage = max(0.0, min(2.0 * math.pi, 2.0 * math.pi - max_gap))
    return float(coverage)
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
def _select_pt0(mesh: rg.Mesh) -> rg.Point3d:
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
def _estimate_tilt_axis(mesh: rg.Mesh) -> rg.Vector3d:
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
        c_xx = max(0.0, s_xx / sw - mx * mx)
        c_xy = s_xy / sw - mx * my
        c_xz = s_xz / sw - mx * mz
        c_yy = max(0.0, s_yy / sw - my * my)
        c_yz = s_yz / sw - my * mz
        c_zz = max(0.0, s_zz / sw - mz * mz)
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
    band_stats = _accumulate(use_band=True)
    n_band = int(band_stats[0])
    axis = None
    source = "band"
    if n_band >= _TILT_AXIS_MIN_VERTS:
        axis = _axis_from_moments(band_stats)
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
    if count <= 0:
        return planes
    effective_step_deg = float(step_deg)
    min_unique_step = 180.0 / float(count)
    if effective_step_deg > min_unique_step + 1e-9:
        _trace_log(
            "[section-plane] step_deg {:.4f} causes duplicate planes for axis-through sections; auto-adjust -> {:.4f}".format(
                effective_step_deg,
                min_unique_step,
            )
        )
        effective_step_deg = min_unique_step
    seen_normals = set()
    def _normal_key(plane_obj: rg.Plane):
        n = rg.Vector3d(plane_obj.Normal)
        if not n.IsValid or n.IsZero:
            return None
        try:
            n.Unitize()
        except Exception:
            return None
        x, y, z = float(n.X), float(n.Y), float(n.Z)
        if (
            x < 0.0
            or (abs(x) <= 1e-12 and y < 0.0)
            or (abs(x) <= 1e-12 and abs(y) <= 1e-12 and z < 0.0)
        ):
            x, y, z = -x, -y, -z
        return (
            int(round(x * 1e6)),
            int(round(y * 1e6)),
            int(round(z * 1e6)),
        )
    for idx in range(count):
        angle = math.radians(effective_step_deg * idx)
        radial = rg.Vector3d(
            u_dir.X * math.cos(angle) + v_dir.X * math.sin(angle),
            u_dir.Y * math.cos(angle) + v_dir.Y * math.sin(angle),
            u_dir.Z * math.cos(angle) + v_dir.Z * math.sin(angle),
        )
        if not radial.IsValid or radial.IsZero:
            continue
        pl = rg.Plane(rg.Point3d.Origin, radial, axis)
        key = _normal_key(pl)
        if key is not None and key in seen_normals:
            continue
        if key is not None:
            seen_normals.add(key)
        planes.append(pl)
    _trace_log(
        "[section-plane] built planes={} requested={} step_deg={:.4f} axis=({:.4f},{:.4f},{:.4f})".format(
            len(planes),
            count,
            effective_step_deg,
            float(axis.X),
            float(axis.Y),
            float(axis.Z),
        )
    )
    return planes
def _sample_plane_section_all_points(
    mesh: rg.Mesh,
    plane: rg.Plane,
) -> Tuple[List[rg.Point3d], List[rg.Curve]]:
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
    section_dual_candidates: List[List[rg.Point3d]] = []
    section_reps: List[Tuple[int, rg.Point3d, float, float]] = []
    def _axis_basis(ax: rg.Vector3d):
        helper = rg.Vector3d(0, 0, 1)
        try:
            if abs(float(ax * helper)) > 0.95:
                helper = rg.Vector3d(1, 0, 0)
        except Exception:
            helper = rg.Vector3d(1, 0, 0)
        u = rg.Vector3d.CrossProduct(ax, helper)
        if not u.IsValid or u.IsZero:
            helper = rg.Vector3d(0, 1, 0)
            u = rg.Vector3d.CrossProduct(ax, helper)
        if not u.IsValid or u.IsZero:
            u = rg.Vector3d(1, 0, 0)
        try:
            u.Unitize()
        except Exception:
            pass
        v = rg.Vector3d.CrossProduct(ax, u)
        if not v.IsValid or v.IsZero:
            v = rg.Vector3d(0, 1, 0)
        try:
            v.Unitize()
        except Exception:
            pass
        return u, v
    axis_u, axis_v = _axis_basis(axis)
    def _axis_azimuth(pt: rg.Point3d) -> float:
        try:
            uu = float(pt.X * axis_u.X + pt.Y * axis_u.Y + pt.Z * axis_u.Z)
            vv = float(pt.X * axis_v.X + pt.Y * axis_v.Y + pt.Z * axis_v.Z)
            return float(math.atan2(vv, uu))
        except Exception:
            return 0.0
    def _wrap_pi(v: float) -> float:
        return float((v + math.pi) % (2.0 * math.pi) - math.pi)
    def _coverage_by_axis_azimuth(points: Sequence[rg.Point3d]) -> float:
        if not points:
            return 0.0
        angs: List[float] = []
        for p in points:
            if p is None:
                continue
            try:
                angs.append(_axis_azimuth(p))
            except Exception:
                continue
        if len(angs) < 3:
            return 0.0
        angs.sort()
        max_gap = 0.0
        for i in range(1, len(angs)):
            gap = float(angs[i] - angs[i - 1])
            if gap > max_gap:
                max_gap = gap
        wrap_gap = float((angs[0] + 2.0 * math.pi) - angs[-1])
        if wrap_gap > max_gap:
            max_gap = wrap_gap
        return float(max(0.0, min(2.0 * math.pi, 2.0 * math.pi - max_gap)))
    def _order_by_axis_azimuth(points: Sequence[rg.Point3d]) -> List[rg.Point3d]:
        core = [rg.Point3d(p) for p in points if p is not None]
        if len(core) < 3:
            return []
        core.sort(key=lambda p: _axis_azimuth(p))
        core.append(rg.Point3d(core[0]))
        return core
    def _pick_dual_from_candidates(
        primary_band: Sequence[rg.Point3d],
        fallback_points: Sequence[rg.Point3d],
    ) -> List[rg.Point3d]:
        pool_raw = list(primary_band or []) + list(fallback_points or [])
        if not pool_raw:
            return []
        valid: List[Tuple[float, float, rg.Point3d]] = []
        seen = set()
        for p in pool_raw:
            if p is None:
                continue
            try:
                key = (
                    int(round(float(p.X) * 1e6)),
                    int(round(float(p.Y) * 1e6)),
                    int(round(float(p.Z) * 1e6)),
                )
                if key in seen:
                    continue
                seen.add(key)
                valid.append(
                    (float(_radius(p)), float(_axis_azimuth(p)), rg.Point3d(p))
                )
            except Exception:
                continue
        if not valid:
            return []
        valid.sort(key=lambda t: t[0], reverse=True)
        p0 = valid[0][2]
        a0 = valid[0][1]
        best2 = None
        best2_key = None
        for r, ang, pt in valid:
            try:
                sep = abs(_wrap_pi(float(ang) - float(a0)))
                key = (
                    -abs(sep - math.pi),
                    float(r),
                )
            except Exception:
                continue
            if best2_key is None or key > best2_key:
                best2_key = key
                best2 = pt
        out = [rg.Point3d(p0)]
        if best2 is not None:
            try:
                sep2 = abs(_wrap_pi(float(_axis_azimuth(best2)) - float(a0)))
            except Exception:
                sep2 = 0.0
            if sep2 >= math.radians(120.0):
                out.append(rg.Point3d(best2))
        return out
    pt0_z = None
    if ref_pt0 is not None:
        try:
            pt0_z = float(ref_pt0.Z)
        except Exception:
            pt0_z = None
    for idx, plane in enumerate(planes):
        pts_all, curves = _sample_plane_section_all_points(mesh, plane)
        pts_axis = [
            p
            for p in pts_all
            if (p is not None and a_low <= float(_axial(p)) <= a_high)
        ]
        if pt0_z is not None:
            z_low = float(pt0_z - float(_MAXR_PT0_Z_WINDOW_LOW))
            z_high = float(pt0_z + float(_MAXR_PT0_Z_WINDOW_HIGH))
            pts_z = [
                p for p in pts_all if (p is not None and z_low <= float(p.Z) <= z_high)
            ]
        else:
            z_low = None
            z_high = None
            pts_z = []
        if len(pts_axis) >= 8:
            pts = pts_axis
            filter_used = "axis"
        elif len(pts_z) >= 8:
            pts = pts_z
            filter_used = "z_window"
        else:
            pts = [p for p in pts_all if p is not None]
            filter_used = "all"
        band = _max_radius_band(pts)
        dual = _pick_dual_from_candidates(band, pts)
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
        section_dual_candidates.append(dual)
        if band:
            try:
                rep = max(band, key=lambda p: _radius(p))
                rep_r = _radius(rep)
                rep_a = _axial(rep)
                section_reps.append((idx, rg.Point3d(rep), float(rep_r), float(rep_a)))
            except Exception:
                pass
        _trace_log(
            "[max-r] collect plane_idx={} candidates={} axis_filtered={} z_filtered={} selected={} filter={} max_band={} dual={} axial_band=({:.3f},{:.3f}) z_window=({},{})".format(
                idx,
                len(pts_all),
                len(pts_axis),
                len(pts_z),
                len(pts),
                filter_used,
                len(band),
                len(dual),
                a_low,
                a_high,
                "{:.3f}".format(z_low) if z_low is not None else "None",
                "{:.3f}".format(z_high) if z_high is not None else "None",
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
    reps_sorted = sorted(section_reps, key=lambda item: float(item[2]), reverse=True)
    top_n = max(1, int(round(len(reps_sorted) * 0.25)))
    top_reps = reps_sorted[:top_n]
    start_idx = -1
    start_pt = None
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
    traced_single: List[rg.Point3d] = [rg.Point3d(start_pt)]
    last = rg.Point3d(start_pt)
    total = len(section_band_candidates)
    for step in range(1, total):
        idx = (start_idx + step) % total
        band = section_band_candidates[idx]
        if not band:
            _trace_log(
                "[max-r] step={} plane_idx={} skipped(no max-band)".format(step, idx)
            )
            continue
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
        traced_single.append(new_pt)
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
    if len(traced_single) > 2:
        traced_single.append(rg.Point3d(traced_single[0]))
    merged_dual = _dedup_points_quantized(
        [p for dual in section_dual_candidates for p in dual if p is not None]
    )
    traced_dual = _order_by_axis_azimuth(merged_dual)
    merged_band = _dedup_points_quantized(
        [p for band in section_band_candidates for p in band if p is not None]
    )
    traced_band = _order_by_axis_azimuth(merged_band)
    cov_single = _coverage_by_axis_azimuth(
        traced_single[:-1] if len(traced_single) > 1 else traced_single
    )
    cov_dual = _coverage_by_axis_azimuth(
        traced_dual[:-1] if len(traced_dual) > 1 else traced_dual
    )
    cov_band = _coverage_by_axis_azimuth(
        traced_band[:-1] if len(traced_band) > 1 else traced_band
    )
    _trace_log(
        "[max-r] coverage single={:.4f}rad pts_single={} dual={:.4f}rad pts_dual={} band={:.4f}rad pts_band={}".format(
            float(cov_single),
            len(traced_single),
            float(cov_dual),
            len(traced_dual),
            float(cov_band),
            len(traced_band),
        )
    )
    single_sparse = len(traced_single) < max(10, len(planes) // 3)
    single_low_cov = cov_single < 4.8  # 약 275도 미만 커버
    candidates = [
        ("single_trace", traced_single, float(cov_single)),
        ("dual_reconstructed", traced_dual, float(cov_dual)),
        ("band_reconstructed", traced_band, float(cov_band)),
    ]
    def _candidate_key(item):
        name, pts, cov = item
        usable = 1 if (pts and len(pts) >= 8) else 0
        return (usable, float(cov), len(pts) if pts else 0)
    if single_sparse or single_low_cov:
        recon_only = [c for c in candidates if c[0] != "single_trace"]
        recon_best = max(recon_only, key=_candidate_key) if recon_only else None
        if recon_best is not None and _candidate_key(recon_best)[0] == 1:
            traced = recon_best[1]
            _trace_log(
                "[max-r] selected={} reason=single_sparse_or_low_cov single_pts={} single_cov={:.4f}".format(
                    recon_best[0],
                    len(traced_single),
                    float(cov_single),
                )
            )
            return traced, sections
    best = max(candidates, key=_candidate_key)
    traced = best[1] if best[1] else traced_single
    _trace_log("[max-r] selected={}".format(best[0]))
    return traced, sections
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
        if margin_axial is None:
            margin_axial = 0.0
        if top_axial is None:
            top_axial = margin_axial + 8.0
        top_axial = float(top_axial) + 0.8
        if top_axial < margin_axial:
            top_axial, margin_axial = margin_axial, top_axial
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
    if traced_points and len(traced_points) >= 1 and traced_points[0] is not None:
        try:
            start_sphere = rg.Sphere(rg.Point3d(traced_points[0]), 0.12)
            sid = _add_colored_object(
                doc, start_sphere.ToBrep(), drawing.Color.FromArgb(255, 220, 0)
            )
            ids["start"].append(str(sid))
        except Exception:
            pass
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
    try:
        if traced_points and len(traced_points) >= 2:
            pl = rg.Polyline([rg.Point3d(p) for p in traced_points if p is not None])
            curve = rg.PolylineCurve(pl)
            cid = _add_colored_object(doc, curve, drawing.Color.FromArgb(255, 140, 0))
            ids["trace_curve"].append(str(cid))
    except Exception:
        pass
    return ids
def _accept_or_normalize_points(
    points: Optional[List[rg.Point3d]],
    label: str,
    allow_raw_outlier: bool,
) -> Tuple[Optional[List[rg.Point3d]], bool]:
    if not points or len(points) < 3:
        return None, False
    ok_shape, reason = _validate_finishline_points(points)
    if ok_shape:
        return points, True
    normalized = _normalize_loop_points(points)
    if normalized and len(normalized) >= 4:
        ok2, _ = _validate_finishline_points(normalized)
        if ok2:
            _trace_log(
                "[detect] {} normalized by azimuth and accepted (prev_reason={})".format(
                    label,
                    reason,
                )
            )
            return normalized, True
    if allow_raw_outlier:
        _trace_log("[detect] {} outlier warning (kept): {}".format(label, reason))
        return points, True
    _trace_log("[detect] {} rejected by outlier check: {}".format(label, reason))
    return None, False
def _run_edge_strategy(
    doc: Rhino.RhinoDoc,
    mesh: rg.Mesh,
) -> Tuple[Optional[List[rg.Point3d]], str]:
    traced_points, strategy_used = _detect_finishline_points_edge(doc, mesh)
    _trace_log(
        "[detect] edge strategy returned pts={} strategy={}".format(
            len(traced_points) if traced_points else 0,
            strategy_used,
        )
    )
    if not traced_points or len(traced_points) < 3:
        return None, strategy_used
    edge_min_z = _points_min_z(traced_points)
    if edge_min_z is not None and edge_min_z <= _EDGE_MIN_Z_VALID_THRESHOLD_MM:
        _trace_log(
            "[detect] edge result rejected min_z={:.6f} <= {:.3f}; fallback=section_tracking".format(
                edge_min_z,
                _EDGE_MIN_Z_VALID_THRESHOLD_MM,
            )
        )
        return None, strategy_used
    accepted, ok = _accept_or_normalize_points(
        traced_points,
        label="edge result",
        allow_raw_outlier=False,
    )
    return accepted if ok else None, strategy_used
def _run_section_strategy(
    mesh: rg.Mesh,
    pt0: rg.Point3d,
    pt0_radius: Optional[float],
) -> Tuple[Optional[List[rg.Point3d]], List[Dict[str, object]], rg.Vector3d, str]:
    sections: List[Dict[str, object]] = []
    section_axis = _estimate_tilt_axis(mesh)
    planes = _build_section_planes(
        count=_SECTION_COUNT,
        step_deg=_SECTION_STEP_DEG,
        axis_dir=section_axis,
    )
    try:
        traced_points, sections = _detect_finishline_points_max_radius_from_z_axis(
            mesh,
            planes,
            axis_dir=section_axis,
            ref_pt0=pt0,
        )
    except Exception as e:
        _trace_log("[detect] section tracking raised exception: {}".format(str(e)))
        traced_points = None
        sections = []
    if not traced_points or len(traced_points) < 3:
        legacy_pts = _extract_lowest_boundary_loop_points(
            mesh,
            ref_pt0=pt0,
            ref_pt0_radius=pt0_radius,
        )
        if legacy_pts and len(legacy_pts) >= 3:
            return legacy_pts, sections, section_axis, "LEGACY_LOWEST_BOUNDARY"
        return None, sections, section_axis, "SECTION_FAILED"
    accepted, ok = _accept_or_normalize_points(
        traced_points,
        label="section result",
        allow_raw_outlier=True,
    )
    if not ok:
        return None, sections, section_axis, "SECTION_FAILED"
    return accepted, sections, section_axis, "SECTION_MAX_RADIUS_TRACK_{}x{:.1f}_FALLBACK".format(
        _SECTION_COUNT,
        float(_SECTION_STEP_DEG),
    )
def _build_detect_failure_message(mesh: rg.Mesh, bbox) -> str:
    try:
        comp_count = len(_explode_components_sorted_by_max_z(mesh))
    except Exception:
        comp_count = -1
    return (
        "edge/단면추적 모두 피니시라인 점을 찾지 못했습니다 | "
        "mesh_v={} mesh_f={} zmin={:.6f} zmax={:.6f} components={}"
    ).format(
        mesh.Vertices.Count if hasattr(mesh, "Vertices") else -1,
        mesh.Faces.Count if hasattr(mesh, "Faces") else -1,
        float(bbox.Min.Z) if bbox is not None else float("nan"),
        float(bbox.Max.Z) if bbox is not None else float("nan"),
        comp_count,
    )
def detect_finish_line(
    doc: Optional[Rhino.RhinoDoc] = None,
    mesh_id=None,
    visualize: bool = True,
    strategy: str = "A",
) -> Dict[str, object]:
    doc = _get_active_doc(doc)
    mesh_obj, mesh_geom = _pick_primary_mesh(doc, mesh_id=mesh_id)
    mesh_copy = mesh_geom.DuplicateMesh()
    if mesh_copy is None:
        raise RuntimeError("Mesh 복제에 실패했습니다")
    try:
        bbox = mesh_copy.GetBoundingBox(True)
    except Exception:
        bbox = None
    pt0 = _select_pt0(mesh_copy)
    try:
        pt0_radius = float(math.sqrt(pt0.X * pt0.X + pt0.Y * pt0.Y))
    except Exception:
        pt0_radius = None
    traced_points, strategy_used = _run_edge_strategy(doc, mesh_copy)
    sections: List[Dict[str, object]] = []
    section_axis = rg.Vector3d(0, 0, 1)
    if not traced_points:
        traced_points, sections, section_axis, strategy_used = _run_section_strategy(
            mesh_copy,
            pt0,
            pt0_radius,
        )
    if not traced_points or len(traced_points) < 3:
        msg = _build_detect_failure_message(mesh_copy, bbox)
        _trace_log("[detect] " + msg)
        raise RuntimeError(msg)
    min_z_point, min_z, max_z_point, max_z = _points_z_extrema(traced_points)
    viz_ids: Dict[str, List[str]] = {"points": [], "mesh": []}
    if _DEBUG_ADD_POLYLINE_CURVE:
        debug_curve_id = _add_debug_finishline_polyline_curve(doc, traced_points)
        if debug_curve_id:
            viz_ids["debug_curve"] = [debug_curve_id]
    if visualize:
        for key, values in _visualize(doc, pt0, traced_points).items():
            viz_ids[key] = values
        debug_viz = _visualize_tracking_debug_objects(
            doc=doc,
            section_axis=section_axis,
            sections=sections,
            traced_points=traced_points,
            mesh_for_axis=mesh_copy,
        )
        for key, values in debug_viz.items():
            if values:
                viz_ids[key] = values
        if _SHOW_ALL_SECTION_CURVES:
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
        "max_z": max_z,
        "min_z": min_z,
        "max_z_point": [float(max_z_point.X), float(max_z_point.Y), float(max_z_point.Z)] if max_z_point is not None else None,
        "min_z_point": [float(min_z_point.X), float(min_z_point.Y), float(min_z_point.Z)] if min_z_point is not None else None,
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
