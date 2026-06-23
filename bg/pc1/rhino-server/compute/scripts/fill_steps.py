"""
커스텀 어벗먼트 STL의 Z=0 부근 형상을 판별하고,
수직 구간이면 상/하 경계에 XY 평면(PlaneSurface) 2개를 생성.

요구 사항:
1) Z=0을 지나는 외곽이 수직 구간인지, 11도 테이퍼 구간인지 먼저 판별
2) 11도 테이퍼(=비수직)로 판단되면 아무 조치 없이 종료
3) 수직 구간이면 수직 구간의 위/아래 경계 Z를 찾아
   XY 평면에 평행한 평면 2개를 문서에 생성

가정:
- 모델은 XY 원점 기준, 축은 Z축과 평행
- 문서에 메시(STL)가 이미 로드되어 있음
"""

import math
from statistics import median
from typing import List, Optional, Sequence, Tuple

import Rhino
import Rhino.DocObjects as rdo
import Rhino.Geometry as rg

# -----------------------------
# 판별 / 탐색 파라미터
# -----------------------------
# local slope k = |n.z| / sqrt(n.x^2+n.y^2)
# - 수직 벽: k ~= 0
# - 11도 테이퍼: k ~= tan(11°)=0.194
_TAPER_11_K = math.tan(math.radians(11.0))
_NON_VERTICAL_K_THRESHOLD = 0.12
_VERTICAL_K_THRESHOLD = 0.07

# 외곽 face 선별(반경 상위 퍼센타일)
_OUTER_RADIUS_PERCENTILE = 0.75

# 각 z에서 유효 샘플 최소 개수
_MIN_FACE_SAMPLES = 10

# 경계 탐색
_Z_STEP_MM = 0.05
_ALLOWED_GAP_STEPS = 1
_MIN_VERTICAL_SPAN_MM = 0.25

# 요청사항: 수직 구간 경계를 0.05mm 벗어난 지점에 평면 생성
_BOUNDARY_OFFSET_MM = 0.05
# 추가 요청: 위/아래로 각각 0.1mm 더 바깥 평면 생성
_EXTRA_OUTWARD_OFFSET_MM = 0.10

# 시각화
_RESULT_LAYER_NAME = "ABUTS_VERTICAL_BOUNDS"
_SECTION_LAYER_NAME = "ABUTS_VERTICAL_SECTIONS"
_SOLID_MESH_LAYER_NAME = "ABUTS_VERTICAL_SOLID_MESH"
_PLANE_SCALE = 1.35

# loft/mesh 품질
_LOFT_SAMPLE_COUNT = 96
_LOFT_DEGREE = 3
_LOFT_REBUILD_POINT_COUNT = 100


# Face cache row: (min_z, max_z, radius_xy, k)
FaceCacheRow = Tuple[float, float, float, float]


def _log(msg: str) -> None:
    try:
        print(f"[vertical-band] {msg}")
    except Exception:
        pass


def _collect_mesh_objects(doc: Rhino.RhinoDoc) -> List[rdo.MeshObject]:
    out: List[rdo.MeshObject] = []
    for obj in doc.Objects:
        if obj is None or obj.ObjectType != rdo.ObjectType.Mesh:
            continue
        geo = getattr(obj, "Geometry", None)
        if geo is None:
            continue
        try:
            if geo.Vertices.Count <= 0 or geo.Faces.Count <= 0:
                continue
        except Exception:
            continue
        out.append(obj)
    return out


def _pick_primary_mesh(doc: Rhino.RhinoDoc) -> Optional[rg.Mesh]:
    meshes = _collect_mesh_objects(doc)
    if not meshes:
        return None
    picked = max(meshes, key=lambda o: o.Geometry.Vertices.Count)
    return picked.Geometry


def _percentile(values: Sequence[float], q: float) -> Optional[float]:
    if not values:
        return None
    q = max(0.0, min(1.0, float(q)))
    s = sorted(float(v) for v in values)
    if len(s) == 1:
        return s[0]
    idx = int(round((len(s) - 1) * q))
    idx = max(0, min(len(s) - 1, idx))
    return s[idx]


def _mesh_bbox_xy_extent(bbox: rg.BoundingBox) -> float:
    return max(
        abs(float(bbox.Min.X)),
        abs(float(bbox.Max.X)),
        abs(float(bbox.Min.Y)),
        abs(float(bbox.Max.Y)),
    )


def _face_vertex_indices(face: rg.MeshFace) -> List[int]:
    if face.IsQuad:
        return [int(face.A), int(face.B), int(face.C), int(face.D)]
    return [int(face.A), int(face.B), int(face.C)]


def _compute_face_k(mesh: rg.Mesh, fi: int) -> Optional[float]:
    try:
        n = mesh.FaceNormals[fi]
    except Exception:
        return None

    nx = float(n.X)
    ny = float(n.Y)
    nz = float(n.Z)
    h = math.sqrt(nx * nx + ny * ny)
    if h < 1e-12:
        return None
    return abs(nz) / h


def _build_face_cache(mesh: rg.Mesh) -> List[FaceCacheRow]:
    """
    성능 최적화 핵심:
    - z별 교차선 계산을 매번 하지 않고,
    - face별 (z 범위, xy 반경, k)를 1회 전처리해서 재사용한다.
    """
    out: List[FaceCacheRow] = []
    faces = mesh.Faces
    verts = mesh.Vertices
    fcount = int(faces.Count)

    for fi in range(fcount):
        face = faces[fi]
        idx = _face_vertex_indices(face)

        pts = [verts[i] for i in idx]
        z_vals = [float(p.Z) for p in pts]
        min_z = min(z_vals)
        max_z = max(z_vals)

        cx = sum(float(p.X) for p in pts) / float(len(pts))
        cy = sum(float(p.Y) for p in pts) / float(len(pts))
        rr = float(math.sqrt(cx * cx + cy * cy))

        k = _compute_face_k(mesh, fi)
        if k is None:
            continue

        out.append((min_z, max_z, rr, k))

    return out


def _local_k_at_z(
    face_cache: Sequence[FaceCacheRow], z: float
) -> Optional[Tuple[float, int]]:
    # z를 통과하는 face 후보를 빠르게 수집
    candidates: List[Tuple[float, float]] = []  # (r, k)
    for min_z, max_z, rr, k in face_cache:
        if min_z <= z <= max_z:
            candidates.append((rr, k))

    if len(candidates) < _MIN_FACE_SAMPLES:
        return None

    rs = [r for r, _ in candidates]
    cut = _percentile(rs, _OUTER_RADIUS_PERCENTILE)
    if cut is None:
        return None

    ks = [k for r, k in candidates if r >= cut]
    if len(ks) < _MIN_FACE_SAMPLES:
        return None

    return float(median(ks)), len(ks)


def _classify_at_zero(
    face_cache: Sequence[FaceCacheRow], z_min: float, z_max: float
) -> Tuple[str, float]:
    probes = [0.0, -0.05, 0.05, -0.10, 0.10]
    k_samples: List[float] = []

    for z in probes:
        if z < z_min or z > z_max:
            continue
        res = _local_k_at_z(face_cache, z)
        if res is None:
            continue
        k, n = res
        _log(f"probe z={z:.3f} -> k={k:.4f} (faces={n})")
        k_samples.append(k)

    if not k_samples:
        raise RuntimeError("Z=0 부근에서 유효한 샘플을 확보하지 못했습니다.")

    k0 = float(median(k_samples))
    if k0 >= _NON_VERTICAL_K_THRESHOLD:
        return "taper_or_non_vertical", k0
    return "vertical", k0


def _march_bound(
    face_cache: Sequence[FaceCacheRow],
    z_start: float,
    z_limit: float,
    direction: int,
) -> float:
    """z_start에서 direction(+1/-1)으로 확장하며 수직 구간 경계 z를 찾는다."""
    step = abs(_Z_STEP_MM)
    if direction < 0:
        step = -step

    z = float(z_start)
    last_valid = float(z_start)
    gap = 0

    max_iter = int(abs((z_limit - z_start) / _Z_STEP_MM)) + 4

    for _ in range(max_iter):
        z_next = z + step
        if direction > 0 and z_next > z_limit:
            break
        if direction < 0 and z_next < z_limit:
            break

        res = _local_k_at_z(face_cache, z_next)
        is_vertical = bool(res is not None and res[0] <= _VERTICAL_K_THRESHOLD)

        if is_vertical:
            last_valid = z_next
            gap = 0
        else:
            gap += 1
            if gap > _ALLOWED_GAP_STEPS:
                break

        z = z_next

    return float(last_valid)


def _find_vertical_bounds(
    face_cache: Sequence[FaceCacheRow], z_min: float, z_max: float
) -> Optional[Tuple[float, float]]:
    z0 = min(max(0.0, z_min), z_max)

    at0 = _local_k_at_z(face_cache, z0)
    if at0 is None or at0[0] > _VERTICAL_K_THRESHOLD:
        return None

    z_lo = _march_bound(face_cache, z0, z_min, -1)
    z_hi = _march_bound(face_cache, z0, z_max, +1)

    if (z_hi - z_lo) < _MIN_VERTICAL_SPAN_MM:
        return None

    return float(z_lo), float(z_hi)


def _ensure_layer(doc: Rhino.RhinoDoc, layer_name: str) -> int:
    idx = doc.Layers.FindByFullPath(layer_name, -1)
    if idx >= 0:
        return idx

    layer = Rhino.DocObjects.Layer()
    layer.Name = layer_name
    return doc.Layers.Add(layer)


def _clear_layer_objects(doc: Rhino.RhinoDoc, layer_index: int) -> int:
    deleted = 0
    try:
        objs = list(doc.Objects)
    except Exception:
        objs = []

    for obj in objs:
        try:
            if obj is None or obj.Attributes.LayerIndex != layer_index:
                continue
            if doc.Objects.Delete(obj.Id, True):
                deleted += 1
        except Exception:
            pass
    return deleted


def _add_xy_plane_surface(
    doc: Rhino.RhinoDoc, z: float, half_size: float, layer_index: int
) -> None:
    plane = rg.Plane(rg.Point3d(0.0, 0.0, z), rg.Vector3d.ZAxis)
    interval = rg.Interval(-half_size, half_size)
    srf = rg.PlaneSurface(plane, interval, interval)

    attr = Rhino.DocObjects.ObjectAttributes()
    attr.LayerIndex = layer_index
    attr.Name = f"vertical-boundary-z-{z:.4f}"
    doc.Objects.AddSurface(srf, attr)


def _polyline_max_radius(poly: rg.Polyline) -> float:
    best = 0.0
    if poly is None:
        return best
    for i in range(poly.Count):
        p = poly[i]
        rr = math.sqrt(float(p.X * p.X + p.Y * p.Y))
        if rr > best:
            best = rr
    return best


def _add_mesh_plane_outer_loop(
    doc: Rhino.RhinoDoc, mesh: rg.Mesh, z: float, layer_index: int
) -> Optional[rg.Curve]:
    """해당 z에서 교차 루프 중 외곽(최대 반경) 1개만 추가/반환"""
    plane = rg.Plane(rg.Point3d(0.0, 0.0, z), rg.Vector3d.ZAxis)
    sections = rg.Intersect.Intersection.MeshPlane(mesh, plane)
    if not sections:
        return None

    best_poly = None
    best_r = -1.0
    for poly in sections:
        if poly is None or poly.Count < 3:
            continue
        rr = _polyline_max_radius(poly)
        if rr > best_r:
            best_r = rr
            best_poly = poly

    if best_poly is None:
        return None

    pl = rg.Polyline(best_poly)
    if not pl.IsClosed:
        tol = max(1e-6, float(doc.ModelAbsoluteTolerance) * 5.0)
        if pl.Count >= 2 and pl[0].DistanceTo(pl[pl.Count - 1]) <= tol:
            pl.Add(pl[0])

    crv = rg.PolylineCurve(pl)
    if not crv.IsClosed:
        try:
            crv.MakeClosed(max(1e-6, float(doc.ModelAbsoluteTolerance) * 5.0))
        except Exception:
            pass

    if not crv.IsClosed:
        return None

    attr = Rhino.DocObjects.ObjectAttributes()
    attr.LayerIndex = layer_index
    attr.Name = f"mesh-section-z-{z:.4f}-outer"
    doc.Objects.AddCurve(crv, attr)

    return crv.DuplicateCurve()


def _pick_anchor_point_on_curve(c: rg.Curve) -> Optional[rg.Point3d]:
    """폐곡선에서 seam 기준점(가장 +X 방향 점 근사)을 선택"""
    if c is None:
        return None

    ts = c.DivideByCount(180, True)
    if not ts:
        return c.PointAtStart if c.IsValid else None

    best_pt = None
    best_score = -1e99
    for t in ts:
        try:
            p = c.PointAt(t)
        except Exception:
            continue
        # +X 우선, 동률이면 |Y| 작은 점 우선
        score = float(p.X) - 0.05 * abs(float(p.Y))
        if score > best_score:
            best_score = score
            best_pt = p

    return best_pt if best_pt is not None else c.PointAtStart


def _align_closed_curve_seam_to_point(c: rg.Curve, target: rg.Point3d) -> rg.Curve:
    if c is None or target is None:
        return c

    dc = c.DuplicateCurve()
    if dc is None or not dc.IsClosed:
        return c

    ok, t = dc.ClosestPoint(target)
    if not ok:
        return dc

    try:
        changed = dc.ChangeClosedCurveSeam(t)
        if changed:
            return dc
    except Exception:
        pass
    return dc


def _smooth_closed_curve_for_loft(
    doc: Rhino.RhinoDoc, c: rg.Curve
) -> Optional[rg.Curve]:
    if c is None:
        return None

    dc = c.DuplicateCurve()
    if dc is None:
        return None

    # 폐곡선 보정
    tol = max(1e-6, float(doc.ModelAbsoluteTolerance) * 5.0)
    if not dc.IsClosed:
        try:
            dc.MakeClosed(tol)
        except Exception:
            pass
    if not dc.IsClosed:
        return dc

    # 폴리라인 루프를 주기적(Periodic) 보간 커브로 변환해 loft 면을 더 매끈하게 만든다.
    sample_count = max(24, int(_LOFT_SAMPLE_COUNT))
    ts = dc.DivideByCount(sample_count, True)
    if not ts:
        return dc

    pts: List[rg.Point3d] = []
    for t in ts:
        try:
            pts.append(dc.PointAt(t))
        except Exception:
            pass

    if len(pts) < 8:
        return dc

    try:
        smooth = rg.Curve.CreateInterpolatedCurve(
            pts,
            max(3, int(_LOFT_DEGREE)),
            rg.CurveKnotStyle.Periodic,
        )
    except Exception:
        smooth = None

    if smooth is None:
        return dc

    if not smooth.IsClosed:
        try:
            smooth.MakeClosed(tol)
        except Exception:
            pass

    return smooth if smooth is not None else dc


def _build_solid_mesh_from_loops(
    doc: Rhino.RhinoDoc,
    loop_items: Sequence[Tuple[float, rg.Curve]],
    layer_index: int,
) -> Optional[rg.Mesh]:
    if len(loop_items) < 2:
        return None

    sorted_items = sorted(loop_items, key=lambda t: t[0])
    loft_curves: List[rg.Curve] = []
    ref_curve = None
    anchor_pt = None

    for _, c in sorted_items:
        if c is None:
            continue
        sc = _smooth_closed_curve_for_loft(doc, c)
        if sc is None:
            continue

        if ref_curve is None:
            # 첫 커브를 기준으로 seam anchor 고정
            anchor_pt = _pick_anchor_point_on_curve(sc)
            if anchor_pt is not None:
                sc = _align_closed_curve_seam_to_point(sc, anchor_pt)
            ref_curve = sc
        else:
            # 방향 먼저 맞추고
            try:
                if not rg.Curve.DoDirectionsMatch(ref_curve, sc):
                    sc.Reverse()
            except Exception:
                pass
            # seam도 동일 anchor로 정렬해서 twist 방지
            if anchor_pt is not None:
                sc = _align_closed_curve_seam_to_point(sc, anchor_pt)

        loft_curves.append(sc)

    if len(loft_curves) < 2:
        return None

    # natural: 시작/끝 접선 제약 없이 Unset 사용
    # tight + rebuild(100 control points)
    lofts = rg.Brep.CreateFromLoftRebuild(
        loft_curves,
        rg.Point3d.Unset,
        rg.Point3d.Unset,
        rg.LoftType.Tight,
        False,
        max(10, int(_LOFT_REBUILD_POINT_COUNT)),
    )
    if not lofts or len(lofts) == 0:
        return None

    brep = lofts[0]
    if brep is None:
        return None

    tol = max(1e-6, float(doc.ModelAbsoluteTolerance))
    solid = brep.CapPlanarHoles(tol)
    if solid is None:
        solid = brep

    # 좀 더 매끈한 결과 메쉬
    mps = rg.MeshingParameters.Smooth
    parts = rg.Mesh.CreateFromBrep(solid, mps)
    if not parts:
        return None

    out = rg.Mesh()
    for part in parts:
        if part is None:
            continue
        out.Append(part)

    if out.Faces.Count <= 0:
        return None

    try:
        out.Weld(math.radians(35.0))
    except Exception:
        pass
    out.Normals.ComputeNormals()
    out.Compact()

    attr = Rhino.DocObjects.ObjectAttributes()
    attr.LayerIndex = layer_index
    attr.Name = "vertical-loop-loft-solid-mesh"
    doc.Objects.AddMesh(out, attr)

    return out


def detect_and_draw_vertical_band_planes(doc: Optional[Rhino.RhinoDoc] = None) -> dict:
    doc = doc or Rhino.RhinoDoc.ActiveDoc
    if doc is None:
        raise RuntimeError("활성 Rhino 문서가 없습니다.")

    mesh = _pick_primary_mesh(doc)
    if mesh is None:
        raise RuntimeError("문서에서 메시(STL)를 찾지 못했습니다.")

    # face normal 계산 보장
    try:
        mesh.FaceNormals.ComputeFaceNormals()
        mesh.Normals.ComputeNormals()
    except Exception:
        pass

    bbox = mesh.GetBoundingBox(True)
    if not bbox.IsValid:
        raise RuntimeError("메시 BoundingBox가 유효하지 않습니다.")

    z_min = float(bbox.Min.Z)
    z_max = float(bbox.Max.Z)

    # 전처리 캐시 구성 (성능)
    face_cache = _build_face_cache(mesh)
    if len(face_cache) < _MIN_FACE_SAMPLES:
        raise RuntimeError("face 캐시 샘플이 부족합니다.")
    _log(f"face cache prepared: {len(face_cache)} faces")

    # 1) Z=0 교차부 수직/테이퍼 판별
    cls, k0 = _classify_at_zero(face_cache, z_min, z_max)
    if cls != "vertical":
        _log(
            f"비수직(테이퍼)로 판단: k={k0:.4f}, "
            f"11도기준={_TAPER_11_K:.4f}. 조치 없이 종료"
        )
        return {
            "type": "taper_or_non_vertical",
            "action": "none",
            "k": k0,
            "z_bounds": None,
        }

    # 2) 수직이면 경계 찾기
    bounds = _find_vertical_bounds(face_cache, z_min, z_max)
    if bounds is None:
        _log("수직 판별은 되었으나 경계 탐색 실패. 조치 없이 종료")
        return {
            "type": "vertical",
            "action": "none",
            "k": k0,
            "z_bounds": None,
        }

    z_lo_raw, z_hi_raw = bounds

    # 요청 1: 수직 구간 경계에서 각각 0.05mm 바깥쪽으로 이동
    z_lo = z_lo_raw - _BOUNDARY_OFFSET_MM
    z_hi = z_hi_raw + _BOUNDARY_OFFSET_MM

    # 요청 2: 위/아래로 각각 0.1mm 더 바깥쪽 평면 추가
    z_lo_far = z_lo - _EXTRA_OUTWARD_OFFSET_MM
    z_hi_far = z_hi + _EXTRA_OUTWARD_OFFSET_MM

    # 3) 평면 4개 생성
    plane_layer_index = _ensure_layer(doc, _RESULT_LAYER_NAME)
    section_layer_index = _ensure_layer(doc, _SECTION_LAYER_NAME)
    solid_mesh_layer_index = _ensure_layer(doc, _SOLID_MESH_LAYER_NAME)

    # 재실행 시 이전 결과 정리(레이어 단위)
    _clear_layer_objects(doc, plane_layer_index)
    _clear_layer_objects(doc, section_layer_index)
    _clear_layer_objects(doc, solid_mesh_layer_index)

    half_size = max(3.0, _PLANE_SCALE * _mesh_bbox_xy_extent(bbox))

    plane_zs = [z_lo_far, z_lo, z_hi, z_hi_far]
    for z in plane_zs:
        _add_xy_plane_surface(doc, z, half_size, plane_layer_index)

    # 4) 4개 평면과 메시의 교차 루프(외곽 1개씩) 생성
    loop_items: List[Tuple[float, rg.Curve]] = []
    for z in plane_zs:
        c = _add_mesh_plane_outer_loop(doc, mesh, z, section_layer_index)
        if c is not None:
            loop_items.append((z, c))

    # 5) loft(natural+tight+rebuild100) -> cap solid -> mesh
    if len(loop_items) != 4:
        _log(f"경고: 외곽 루프가 4개가 아니라 {len(loop_items)}개입니다.")

    solid_mesh = _build_solid_mesh_from_loops(doc, loop_items, solid_mesh_layer_index)
    mesh_created = bool(solid_mesh is not None)

    # 중간 부산물 정리(평면/교차커브 삭제, 최종 솔리드 메시만 유지)
    deleted_planes = _clear_layer_objects(doc, plane_layer_index)
    deleted_sections = _clear_layer_objects(doc, section_layer_index)

    doc.Views.Redraw()

    _log(
        f"수직 구간 판별 완료: raw=({z_lo_raw:.4f}, {z_hi_raw:.4f}), "
        f"offset=({z_lo:.4f}, {z_hi:.4f}), far=({z_lo_far:.4f}, {z_hi_far:.4f}), "
        f"k={k0:.4f}, loops={len(loop_items)}, mesh_created={mesh_created}, "
        f"loft=tight,rebuild={_LOFT_REBUILD_POINT_COUNT},natural=true, "
        f"deleted_intermediate={deleted_planes + deleted_sections}"
    )

    return {
        "type": "vertical",
        "action": "draw_planes_loops_and_solid_mesh",
        "k": k0,
        "z_bounds": [z_lo, z_hi],
        "z_bounds_raw": [z_lo_raw, z_hi_raw],
        "z_bounds_far": [z_lo_far, z_hi_far],
        "plane_zs": plane_zs,
        "boundary_offset_mm": _BOUNDARY_OFFSET_MM,
        "extra_outward_offset_mm": _EXTRA_OUTWARD_OFFSET_MM,
        "solid_mesh_layer": _SOLID_MESH_LAYER_NAME,
        "outer_loop_count": len(loop_items),
        "solid_mesh_created": mesh_created,
        "loft_style": "tight",
        "loft_rebuild_point_count": _LOFT_REBUILD_POINT_COUNT,
        "loft_natural": True,
        "deleted_intermediate_count": deleted_planes + deleted_sections,
    }


def main() -> int:
    try:
        result = detect_and_draw_vertical_band_planes()
        _log(f"result={result}")
        return 0
    except Exception as exc:
        _log(f"ERROR: {exc}")
        return 1


if __name__ == "__main__":
    # Rhino RunPythonScript 환경에서는 SystemExit를 올리면
    # exit code가 0이어도 traceback이 출력될 수 있으므로
    # 예외를 던지지 않고 조용히 실행한다.
    main()
