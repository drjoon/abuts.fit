import os
import sys
import time

import fill_steps as fill_steps_module
import finishline_detection as finishline_detection_module

# Rhino Python 환경에서 실행된다고 가정
import Rhino
import Rhino.FileIO
from diameter_analysis import analyze_diameters

_log_initialized = False


def log(msg):
    global _log_initialized
    import datetime

    timestamp = datetime.datetime.now().strftime("%H:%M:%S.%f")[:-3]
    line = "[{}][abuts-rhino] {}".format(timestamp, str(msg))
    try:
        print(line)
    except Exception:
        pass

    # 고정 경로에 logs.txt 저장 (환경 변수 기반)
    try:
        bg_root = os.environ.get("BG_ROOT", r"C:\Users\user\abuts.fit\bg")
        rhino_root = os.environ.get("RHINO_ROOT", r"rhino-server\compute")
        fixed_log_path = os.path.join(bg_root, rhino_root, "logs.txt")

        # 첫 로그 시 파일 초기화
        mode = "w" if not _log_initialized else "a"
        if not _log_initialized:
            _log_initialized = True

        with open(fixed_log_path, mode, encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass

    # 기존 로그 경로도 유지
    log_path = os.environ.get("ABUTS_LOG_PATH")
    if log_path:
        try:
            with open(log_path, "a", encoding="utf-8") as f:
                f.write(line + "\n")
        except Exception:
            pass


def _extract_request_id_from_path(p: str):
    try:
        base = os.path.basename(p or "")
        import re

        m = re.search(r"(\d{8}-[A-Za-z0-9]{4,})", base)
        if m:
            rid = m.group(1)
            return rid if rid else None

        head = base.split(".", 1)[0]
        return head if head else None
    except Exception:
        return None


def _detect_finish_line_latest(doc, visualize=False, mesh_id=None):
    import importlib

    module = finishline_detection_module
    try:
        module = importlib.reload(finishline_detection_module)
        log(
            "[finishline] module reloaded path={}".format(
                getattr(module, "__file__", "unknown")
            )
        )
    except Exception as e:
        log("[finishline] module reload failed; using cached module: " + str(e))

    try:
        try:
            if hasattr(module, "set_external_logger"):
                module.set_external_logger(log)
        except Exception:
            pass
        return module.detect_finish_line(doc=doc, mesh_id=mesh_id, visualize=visualize)
    except Exception as e:
        log("[finishline] detect_finish_line raised: " + str(e))
        raise


def _run_fill_steps_latest(doc):
    try:
        import importlib

        module = importlib.reload(fill_steps_module)
        log(
            "[fill-steps] module reloaded path={}".format(
                getattr(module, "__file__", "unknown")
            )
        )
        return module.detect_and_draw_vertical_band_planes(doc=doc)
    except Exception as e:
        log("[fill-steps] module reload failed, fallback cached module: " + str(e))
        return fill_steps_module.detect_and_draw_vertical_band_planes(doc=doc)


def _post_finish_line(request_id: str, input_file_name: str, finish_line: dict):
    try:
        import json

        import System.Net.Http
        import System.Text

        backend = (
            os.environ.get("BACKEND_BASE", "https://abuts.fit/api").strip().rstrip("/")
        )
        url = backend + "/bg/register-finish-line"

        payload = {
            "requestId": request_id,
            "filePath": input_file_name,
            "finishLine": finish_line,
        }
        body = json.dumps(payload, ensure_ascii=False)

        client = System.Net.Http.HttpClient()
        rhino_secret = os.environ.get("RHINO_SHARED_SECRET", "").strip()
        bridge_secret = os.environ.get("BRIDGE_SHARED_SECRET", "").strip()
        secret = rhino_secret or bridge_secret
        secret_source = (
            "RHINO_SHARED_SECRET"
            if rhino_secret
            else ("BRIDGE_SHARED_SECRET" if bridge_secret else "none")
        )
        log(
            "finishline post auth secret_len={} source={}".format(
                len(str(secret or "")),
                secret_source,
            )
        )
        if secret:
            try:
                client.DefaultRequestHeaders.Remove("X-Bridge-Secret")
            except Exception:
                pass
            client.DefaultRequestHeaders.Add("X-Bridge-Secret", str(secret))

        content = System.Net.Http.StringContent(
            body,
            System.Text.Encoding.UTF8,
            "application/json",
        )
        resp = client.PostAsync(url, content).Result
        status_code = int(resp.StatusCode) if resp is not None else -1
        ok = bool(resp.IsSuccessStatusCode) if resp is not None else False
        log("finishline post status={} ok={}".format(status_code, ok))

        resp_text = ""
        try:
            if resp is not None and resp.Content is not None:
                resp_text = resp.Content.ReadAsStringAsync().Result or ""
        except Exception:
            resp_text = ""

        if resp_text:
            log("finishline post response=" + str(resp_text)[:1000])

        if ok and resp_text:
            lower = str(resp_text).lower()
            if '"found":false' in lower:
                log(
                    "finishline post warning: backend returned found=false (request match failed)"
                )
            if '"updated":true' in lower:
                log("finishline post confirmed: updated=true")
    except Exception as e:
        log("finishline post failed: " + str(e))


def _count_naked_edges(mesh):
    try:
        edges = mesh.GetNakedEdges()
        return len(edges) if edges else 0
    except Exception:
        return None


def _clear_doc_objects(doc, stage_label="startup"):
    if doc is None:
        return

    def _count_objects():
        try:
            return len(list(doc.Objects))
        except Exception:
            return -1

    before = _count_objects()
    log("[doc-clear:{}] before={}".format(stage_label, before))

    # SelAll/Delete는 hidden/locked 객체를 놓칠 수 있어
    # ID 직접 삭제를 여러 번 반복해 잔존 객체를 강제로 비운다.
    for attempt in range(3):
        try:
            doc.Objects.UnselectAll()
        except Exception:
            pass

        try:
            Rhino.RhinoApp.RunScript("!_-SelAll _Delete _Enter", False)
        except Exception:
            pass

        try:
            ids = [o.Id for o in list(doc.Objects)]
        except Exception:
            ids = []

        deleted = 0
        for oid in ids:
            try:
                if doc.Objects.Delete(oid, True):
                    deleted += 1
            except Exception:
                pass

        remain = _count_objects()
        log(
            "[doc-clear:{}] attempt={} deleted={} remain={}".format(
                stage_label,
                attempt + 1,
                deleted,
                remain,
            )
        )
        if remain == 0:
            break

    after = _count_objects()
    log("[doc-clear:{}] after={}".format(stage_label, after))


def _safe_int(value, default):
    try:
        return int(str(value).strip())
    except Exception:
        return default


_FILL_TARGET_LIMIT = max(
    1, _safe_int(os.environ.get("ABUTS_FILL_TARGET_LIMIT", "3"), 3)
)


def _get_mesh_objects(doc):
    try:
        settings = Rhino.DocObjects.ObjectEnumeratorSettings()
        settings.ObjectTypeFilter = Rhino.DocObjects.ObjectType.Mesh
        settings.IncludeLights = False
        settings.IncludeGrips = False
        return list(doc.Objects.GetObjectList(settings))
    except Exception:
        return []


def _iter_mesh_geometries(doc):
    for obj in _get_mesh_objects(doc):
        geo = getattr(obj, "Geometry", None)
        if geo is not None:
            yield obj, geo


def _calc_xy_radius_from_bbox(bbox):
    try:
        corners = bbox.GetCorners()
    except Exception:
        return 0.0

    max_r = 0.0
    if not corners:
        return 0.0
    for pt in corners:
        try:
            rr = float((pt.X * pt.X + pt.Y * pt.Y) ** 0.5)
            if rr > max_r:
                max_r = rr
        except Exception:
            pass
    return max_r


def _collect_mesh_infos(doc):
    infos = []
    for obj, geo in _iter_mesh_geometries(doc):
        info = {"id": obj.Id}
        try:
            info["vertexCount"] = geo.Vertices.Count
        except Exception:
            info["vertexCount"] = None
        try:
            info["faceCount"] = geo.Faces.Count
        except Exception:
            info["faceCount"] = None
        try:
            info["isClosed"] = geo.IsClosed
        except Exception:
            info["isClosed"] = None
        try:
            info["isManifold"] = geo.IsManifold(True)
        except Exception:
            info["isManifold"] = None
        try:
            bbox = geo.GetBoundingBox(True)
            info["bbox"] = bbox
            info["maxZ"] = float(bbox.Max.Z)
            info["r"] = _calc_xy_radius_from_bbox(bbox)
        except Exception:
            info["bbox"] = None
            info["maxZ"] = 0.0
            info["r"] = 0.0
        info["nakedEdges"] = _count_naked_edges(geo)
        infos.append(info)
    return infos


def _log_doc_mesh_stats(doc, label, detail_limit=8):
    infos = _collect_mesh_infos(doc)
    mesh_count = len(infos)

    total_v = 0
    total_f = 0
    total_open = 0
    unknown_v = 0
    unknown_f = 0

    for info in infos:
        v = info.get("vertexCount")
        f = info.get("faceCount")
        n = info.get("nakedEdges")

        if isinstance(v, int):
            total_v += v
        else:
            unknown_v += 1

        if isinstance(f, int):
            total_f += f
        else:
            unknown_f += 1

        if isinstance(n, int) and n > 0:
            total_open += 1

    log(
        "[mesh-stats:{}] meshes={} totalVertices={} totalFaces={} openMeshes={} unknownV={} unknownF={}".format(
            label,
            mesh_count,
            total_v,
            total_f,
            total_open,
            unknown_v,
            unknown_f,
        )
    )

    if mesh_count <= 0:
        return

    # face 수 기준 상위 detail_limit개만 상세 로그
    ordered = sorted(
        infos,
        key=lambda x: int(x.get("faceCount") or 0),
        reverse=True,
    )
    for i, info in enumerate(ordered[: max(0, int(detail_limit))]):
        log(
            "[mesh-stats:{}:{}] id={} v={} f={} naked={} r={:.4f} maxZ={:.4f}".format(
                label,
                i,
                info.get("id"),
                info.get("vertexCount"),
                info.get("faceCount"),
                info.get("nakedEdges"),
                float(info.get("r") or 0.0),
                float(info.get("maxZ") or 0.0),
            )
        )


def _pick_primary_piece(candidates, tol):
    open_candidates = [c for c in candidates if (c.get("naked") or 0) > 0]
    pool = open_candidates if open_candidates else candidates
    if not pool:
        return None, None, []

    max_r = max(float(c.get("r") or 0.0) for c in pool)
    band = max(tol, max_r * 0.01)
    top_band = [c for c in pool if float(c.get("r") or 0.0) >= (max_r - band)]
    chosen = None
    for c in top_band:
        key = (float(c.get("maxZ") or 0.0), float(c.get("r") or 0.0))
        if chosen is None or key > chosen[0]:
            chosen = (key, c)
    if not chosen:
        return None, None, pool
    return chosen[1].get("id"), (chosen[1].get("r"), chosen[1].get("maxZ")), pool


def _pick_finishline_mesh_id(doc, mesh_obj_refs):
    if not mesh_obj_refs:
        return None

    import_ids = set()
    for o in mesh_obj_refs:
        try:
            if o is not None:
                import_ids.add(o.Id)
        except Exception:
            pass

    infos = _collect_mesh_infos(doc)
    if not infos:
        return None

    scoped = [i for i in infos if i.get("id") in import_ids]
    if not scoped:
        scoped = infos

    tol = float(os.environ.get("ABUTS_R_TOL", "0.05"))
    candidates = []
    for i in scoped:
        candidates.append(
            {
                "id": i.get("id"),
                "r": float(i.get("r") or 0.0),
                "maxZ": float(i.get("maxZ") or 0.0),
                "naked": int(i.get("nakedEdges") or 0),
            }
        )

    best_id, best_meta, pool = _pick_primary_piece(candidates, tol)
    log(
        "[finishline-target] importMeshes={} scoped={} pool={} selected={} meta={}".format(
            len(import_ids),
            len(scoped),
            len(pool) if pool else 0,
            best_id,
            best_meta,
        )
    )
    return best_id


def _pick_fill_targets(pool):
    ordered = sorted(
        pool,
        key=lambda x: (
            1 if (x.get("naked") or 0) > 0 else 0,
            float(x.get("r") or 0.0),
            float(x.get("maxZ") or 0.0),
        ),
        reverse=True,
    )
    return ordered[:_FILL_TARGET_LIMIT]


def fail(msg):
    print("ERROR:" + msg)
    raise Exception(msg)


def _align_mesh_to_origin(mesh, target_diameter=3.33):
    """
    메시를 원점에 정렬
    1. Z_min + 2mm 위치의 가로 단면 원 중심을 XY 원점으로 이동
    2. 커넥션 외부 직경(target_diameter) 위치를 Z=0으로 이동
       - plane intersection 기반 반지름으로 테이퍼 기울기 계산 후 1-shot Z 계산
       - 이후 이진탐색으로 ±0.005mm 이내로 수렴
    """
    import math

    import Rhino.Geometry as rg

    bbox = mesh.GetBoundingBox(True)
    z_min = bbox.Min.Z
    z_max = bbox.Max.Z
    target_radius = target_diameter / 2.0

    def get_circle_at_z(z):
        """plane intersection 기반 최대 반지름 반환 (center_x, center_y, max_r)"""
        plane = rg.Plane(rg.Point3d(0, 0, z), rg.Vector3d(0, 0, 1))
        polylines = rg.Intersect.Intersection.MeshPlane(mesh, plane)
        if not polylines or len(polylines) == 0:
            return None
        longest = max(polylines, key=lambda pl: pl.Length)
        pts = [(longest[i].X, longest[i].Y) for i in range(longest.Count)]
        if len(pts) < 3:
            return None
        cx = (min(p[0] for p in pts) + max(p[0] for p in pts)) / 2.0
        cy = (min(p[1] for p in pts) + max(p[1] for p in pts)) / 2.0
        mr = max(math.sqrt((px - cx) ** 2 + (py - cy) ** 2) for px, py in pts)
        return cx, cy, mr

    def get_radius_at_z(z):
        """Node.js stl_metadata와 동일: z 평면 통과 edge intersection만 사용 (연속/monotonic)"""
        mr = 0.0
        found = False
        for fi in range(mesh.Faces.Count):
            face = mesh.Faces[fi]
            va = mesh.Vertices[face.A]
            vb = mesh.Vertices[face.B]
            vc = mesh.Vertices[face.C]
            for pa, pb in ((va, vb), (vb, vc), (vc, va)):
                za = pa.Z - z
                zb = pb.Z - z
                if (za > 0 and zb < 0) or (za < 0 and zb > 0):
                    denom = abs(za - zb)
                    if denom < 1e-12:
                        continue
                    t = abs(za) / denom
                    ix = pa.X + t * (pb.X - pa.X)
                    iy = pa.Y + t * (pb.Y - pa.Y)
                    r = math.sqrt(ix * ix + iy * iy)
                    if r > mr:
                        mr = r
                    found = True
        return mr if found and mr > 0 else None

    # 1단계: XY 원점 정렬 (Z_min + 2mm 단면 중심)
    z_reference = z_min + 2.0
    ref = get_circle_at_z(z_reference)
    if ref is None:
        log("[align] No intersection at Z={:.2f}".format(z_reference))
        return False
    center_x, center_y, _ = ref
    total_center_x = center_x
    total_center_y = center_y
    log(
        "[align] Circle center at Z={:.4f}: ({:.4f}, {:.4f})".format(
            z_reference, center_x, center_y
        )
    )
    mesh.Translate(rg.Vector3d(-center_x, -center_y, 0))

    bbox = mesh.GetBoundingBox(True)
    z_min = bbox.Min.Z
    z_max = bbox.Max.Z

    # 2단계: 테이퍼 기울기로 target Z 1-shot 계산
    z1 = z_min + 2.0
    z2 = z_min + 2.2
    r1 = get_radius_at_z(z1)
    r2 = get_radius_at_z(z2)
    if r1 is None or r2 is None:
        log("[align] Could not measure radii in connection area")
        return False

    dz = z2 - z1
    dr = r2 - r1
    if abs(dz) < 0.0001:
        log("[align] dz too small")
        return False
    measured_slope = dr / dz
    log("[align] Measured at z1={:.6f}mm: r={:.6f}mm".format(z1, r1))
    log("[align] Measured at z2={:.6f}mm: r={:.6f}mm".format(z2, r2))
    log(
        "[align] Measured slope={:.8f} angle={:.4f}°".format(
            measured_slope, math.degrees(math.atan(measured_slope))
        )
    )

    # 11도 편측 테이퍼 강제 (모델에 실제 target_radius 구간이 없을 수 있음)
    # 측정 slope이 11±도 범위면 채택, 너무 벗어나면 11도 강제
    nominal_slope = math.tan(math.radians(11.0))  # ≈ 0.19438
    angle_tol_deg = float(os.environ.get("ABUTS_ALIGN_TAPER_ANGLE_TOL_DEG", "1.5"))
    measured_angle = math.degrees(math.atan(measured_slope))
    if abs(measured_angle - 11.0) <= angle_tol_deg:
        taper_slope = measured_slope
    else:
        taper_slope = nominal_slope
        log(
            "[align] slope deviates from 11° by {:.2f}° → using nominal 11°".format(
                measured_angle - 11.0
            )
        )

    # 1-shot 계산: z1 + (target_r - r1)/slope. 모델에 실제 구간이 없으면 가상 위치가 됨
    delta_r = target_radius - r1
    delta_z = delta_r / taper_slope
    best_z = z1 + delta_z
    log(
        "[align] 1-shot Z calc: delta_r={:.8f}mm delta_z={:.8f}mm best_z={:.8f}mm".format(
            delta_r, delta_z, best_z
        )
    )
    mesh.Translate(rg.Vector3d(0, 0, -best_z))
    log("[align] Mesh translated by Z={:.8f}mm (virtual 3.35 origin)".format(-best_z))

    # 4단계: XY 중심 미세보정
    final_circle = get_circle_at_z(0)
    if final_circle is not None:
        fcx, fcy, _ = final_circle
        log("[align] Z=0 center: ({:.6f}, {:.6f})".format(fcx, fcy))
        if abs(fcx) > 0.0001 or abs(fcy) > 0.0001:
            mesh.Translate(rg.Vector3d(-fcx, -fcy, 0))
            total_center_x = round(total_center_x + fcx, 4)
            total_center_y = round(total_center_y + fcy, 4)

    conn_r = get_radius_at_z(0)
    final_diameter = (conn_r * 2.0) if conn_r is not None else 0.0
    log(
        "[align] Final translation: XY=({:.4f}, {:.4f}), Z={:.6f}".format(
            -total_center_x, -total_center_y, -best_z
        )
    )
    # 참고: 모델에 실제 target_diameter 구간이 없으면 Z=0은 가상 위치→측정값이 target과 다를 수 있음
    log(
        "[align] Measured diameter at Z=0: {:.6f}mm (target virtual: {:.4f}mm)".format(
            final_diameter, target_diameter
        )
    )

    return (total_center_x, total_center_y, best_z)


def _run_alignment_on_first_mesh(doc, target_diameter=3.33):
    alignment_transform = None
    try:
        log("[align] Starting coordinate alignment...")
        objs = list(doc.Objects)
        for obj in objs:
            if obj and obj.ObjectType == Rhino.DocObjects.ObjectType.Mesh:
                mesh = obj.Geometry
                if mesh:
                    result = _align_mesh_to_origin(
                        mesh, target_diameter=target_diameter
                    )
                    if result:
                        alignment_transform = result  # (center_x, center_y, best_z)
                        doc.Objects.Replace(obj.Id, mesh)
                        log("[align] Mesh replaced in document")
                    break  # 첫 번째 메시만 정렬
        log("[align] Alignment complete")
    except Exception as e:
        log("[align] Alignment failed: " + str(e))
    return alignment_transform


def _build_alignment_transform(alignment_transform):
    if not alignment_transform:
        return None
    try:
        cx, cy, cz = alignment_transform
        return Rhino.Geometry.Transform.Translation(-float(cx), -float(cy), -float(cz))
    except Exception:
        return None


def _apply_alignment_transform_to_doc_curves(doc, alignment_transform):
    xform = _build_alignment_transform(alignment_transform)
    if xform is None:
        return 0

    moved = 0
    try:
        objs = list(doc.Objects)
    except Exception:
        objs = []

    for obj in objs:
        if obj is None or obj.ObjectType != Rhino.DocObjects.ObjectType.Curve:
            continue
        geo = obj.Geometry
        if geo is None:
            continue
        try:
            dup = geo.Duplicate()
            if dup is None:
                continue
            if not dup.Transform(xform):
                continue
            if doc.Objects.Replace(obj.Id, dup):
                moved += 1
        except Exception:
            continue

    if moved > 0:
        log("[align] Curves transformed count={}".format(moved))
    return moved


def _transform_finishline_points(points, alignment_transform):
    xform = _build_alignment_transform(alignment_transform)
    if xform is None or not points:
        return points or []

    transformed = []
    for p in points:
        if p is None:
            continue
        try:
            pt = Rhino.Geometry.Point3d(float(p.X), float(p.Y), float(p.Z))
            pt.Transform(xform)
            transformed.append(pt)
        except Exception:
            transformed.append(p)
    return transformed


def _transform_finishline_point(pt, alignment_transform):
    xform = _build_alignment_transform(alignment_transform)
    if xform is None or pt is None:
        return pt
    try:
        p = Rhino.Geometry.Point3d(float(pt.X), float(pt.Y), float(pt.Z))
        p.Transform(xform)
        return p
    except Exception:
        pass
    return pt


def _add_finishline_curve(doc, points):
    if doc is None or not points:
        return None

    pts = []
    for p in points:
        if p is None:
            continue
        try:
            pts.append(Rhino.Geometry.Point3d(float(p.X), float(p.Y), float(p.Z)))
        except Exception:
            continue

    if len(pts) < 2:
        return None

    try:
        if pts[0].DistanceTo(pts[-1]) > 1e-6:
            pts.append(Rhino.Geometry.Point3d(pts[0]))
    except Exception:
        pass

    try:
        poly = Rhino.Geometry.Polyline(pts)
        curve = Rhino.Geometry.PolylineCurve(poly)
        cid = doc.Objects.AddCurve(curve)
        if cid:
            log("[finishline-curve] added id={} pts={}".format(cid, len(pts)))
            return cid
    except Exception as e:
        log("[finishline-curve] add failed: {}".format(str(e)))

    return None


def _import_stl_meshes(doc, input_path, skip_align=False, target_diameter=3.33):
    before_ids = set()
    try:
        before_ids = set(o.Id for o in list(doc.Objects) if o is not None)
    except Exception:
        before_ids = set()

    try:
        read_opts = Rhino.FileIO.FileStlReadOptions()
        ok = Rhino.FileIO.FileStl.Read(str(input_path), doc, read_opts)
    except Exception as e:
        fail("STL Import 예외: " + str(e))

    if not ok:
        fail("STL Import 실패")

    log("import ok")

    # STL 로드 후 자동 정렬 (skip_align=True면 건너뜀)
    alignment_transform = None
    if not skip_align:
        alignment_transform = _run_alignment_on_first_mesh(
            doc,
            target_diameter=target_diameter,
        )

    all_mesh_obj_refs = []
    new_mesh_obj_refs = []
    try:
        objs = list(doc.Objects)
    except Exception:
        objs = []

    for obj in objs:
        if obj is None:
            continue
        if obj.ObjectType != Rhino.DocObjects.ObjectType.Mesh:
            continue
        geom = obj.Geometry
        if geom is None:
            continue
        all_mesh_obj_refs.append(obj)
        if obj.Id not in before_ids:
            new_mesh_obj_refs.append(obj)

    # 정상이라면 new_mesh_obj_refs를 사용. (문서 잔존 오브젝트 혼입 방지)
    mesh_obj_refs = new_mesh_obj_refs if new_mesh_obj_refs else all_mesh_obj_refs

    if not mesh_obj_refs:
        fail("Import 후 Mesh가 없습니다")

    log(
        "mesh objects after import total={} new={} selected={}".format(
            len(all_mesh_obj_refs),
            len(new_mesh_obj_refs),
            len(mesh_obj_refs),
        )
    )
    return mesh_obj_refs, alignment_transform


def _parse_args(argv, input_path_arg=None, output_path_arg=None):
    if input_path_arg and output_path_arg:
        return input_path_arg, output_path_arg

    env_input = os.environ.get("ABUTS_INPUT_STL")
    env_output = os.environ.get("ABUTS_OUTPUT_STL")

    if env_input and env_output:
        return env_input, env_output

    if len(argv) < 3:
        fail("Usage: process_abutment_stl.py <input_stl> <output_stl>")

    return argv[1], argv[2]


def _run_fill_mesh_holes(doc, target_id):
    target = doc.Objects.FindId(target_id)
    if target is None:
        return False

    before_naked = None
    before_v = None
    before_f = None
    try:
        if target.Geometry is not None:
            before_naked = _count_naked_edges(target.Geometry)
            try:
                before_v = int(target.Geometry.Vertices.Count)
            except Exception:
                before_v = None
            try:
                before_f = int(target.Geometry.Faces.Count)
            except Exception:
                before_f = None
    except Exception:
        pass

    log(
        "FillMeshHoles pre id={} v={} f={} nakedEdges={}".format(
            target_id,
            before_v,
            before_f,
            before_naked,
        )
    )

    try:
        doc.Objects.UnselectAll()
    except Exception:
        pass

    try:
        target.Select(True)
    except Exception:
        pass

    # 1st: RhinoCommon API로 간단하고 빠르게 홀 메우기
    try:
        geom = target.Geometry
        if geom is not None:
            mesh_copy = geom.DuplicateMesh()
            if mesh_copy is not None:
                log("Starting fast hole filling...")

                # 간단한 FillHoles 호출 (1회)
                try:
                    mesh_copy.FillHoles()
                except Exception as e:
                    log("FillHoles failed: {}".format(str(e)))

                # 기본 메시 정리
                try:
                    mesh_copy.Vertices.CombineIdentical(True, True)
                    mesh_copy.Vertices.CullUnused()
                    mesh_copy.Normals.ComputeNormals()
                except Exception as e:
                    log("Mesh cleanup failed: {}".format(str(e)))

                # 메시 교체
                replaced = doc.Objects.Replace(target_id, mesh_copy)
                log("FillMeshHoles (Fast) replaced={}".format(replaced))

                if replaced:
                    after_naked = _count_naked_edges(mesh_copy)
                    try:
                        after_v = int(mesh_copy.Vertices.Count)
                    except Exception:
                        after_v = None
                    try:
                        after_f = int(mesh_copy.Faces.Count)
                    except Exception:
                        after_f = None

                    log(
                        "FillMeshHoles fast post id={} v:{}->{} f:{}->{} naked:{}->{}".format(
                            target_id,
                            before_v,
                            after_v,
                            before_f,
                            after_f,
                            before_naked,
                            after_naked,
                        )
                    )

                    if (
                        before_naked is None
                        or after_naked is None
                        or after_naked < before_naked
                    ):
                        return True
    except Exception as e:
        log("FillMeshHoles Fast 예외: " + str(e))

    # 2nd: Fallback - 커맨드 기반 실행
    try:
        Rhino.RhinoApp.RunScript("!_-SelNone _Enter", False)
        Rhino.RhinoApp.RunScript(
            "!_-SelID {} _Enter".format(str(target_id)),
            False,
        )
    except Exception:
        pass

    cmds = [
        "!_-FillMeshHoles _All _Enter",
        "!_-FillMeshHoles _Auto _Enter",
        "!_-FillMeshHoles _Enter",
    ]

    for cmd in cmds:
        try:
            log("RunScript=" + cmd)
            ok_cmd = Rhino.RhinoApp.RunScript(cmd, True)
            log("FillMeshHoles command ok=" + str(ok_cmd))
        except Exception as e:
            log("FillMeshHoles 커맨드 실행 예외: " + str(e))

        after_naked = None
        after_v = None
        after_f = None
        try:
            refreshed = doc.Objects.FindId(target_id)
            if refreshed and refreshed.Geometry is not None:
                after_naked = _count_naked_edges(refreshed.Geometry)
                try:
                    after_v = int(refreshed.Geometry.Vertices.Count)
                except Exception:
                    after_v = None
                try:
                    after_f = int(refreshed.Geometry.Faces.Count)
                except Exception:
                    after_f = None
        except Exception:
            pass

        log(
            "FillMeshHoles cmd post id={} v:{}->{} f:{}->{} naked:{}->{}".format(
                target_id,
                before_v,
                after_v,
                before_f,
                after_f,
                before_naked,
                after_naked,
            )
        )

        if before_naked is None or after_naked is None or after_naked < before_naked:
            return True

    return False


def _join_all_meshes(doc, label="final"):
    if doc is None:
        return 0

    try:
        mesh_objs = [
            o
            for o in list(doc.Objects)
            if o and o.ObjectType == Rhino.DocObjects.ObjectType.Mesh
        ]
    except Exception:
        mesh_objs = []

    if len(mesh_objs) <= 1:
        log("[join:{}] skipped mesh_count={}".format(label, len(mesh_objs)))
        return len(mesh_objs)

    mesh_ids = [o.Id for o in mesh_objs]
    meshes = []
    for o in mesh_objs:
        try:
            if o.Geometry is not None:
                meshes.append(o.Geometry.DuplicateMesh())
        except Exception:
            pass

    merged = None
    try:
        if len(meshes) == 1:
            merged = meshes[0]
        elif len(meshes) > 1 and hasattr(Rhino.Geometry.Mesh, "CreateFromMerge"):
            tol = doc.ModelAbsoluteTolerance if doc else 0.01
            merged = Rhino.Geometry.Mesh.CreateFromMerge(meshes, tol or 0.01, True)
    except Exception as e:
        log("[join:{}] RhinoCommon merge error: {}".format(label, str(e)))

    if merged is not None and merged.Faces.Count > 0:
        try:
            merged.Vertices.CombineIdentical(True, True)
        except Exception:
            pass
        try:
            if hasattr(merged.Faces, "RedundantFaces"):
                merged.Faces.RedundantFaces()
        except Exception:
            pass

        deleted = 0
        for oid in mesh_ids:
            try:
                if doc.Objects.Delete(oid, True):
                    deleted += 1
            except Exception:
                pass
        doc.Objects.AddMesh(merged)
        try:
            final_count = sum(
                1
                for o in list(doc.Objects)
                if o and o.ObjectType == Rhino.DocObjects.ObjectType.Mesh
            )
        except Exception:
            final_count = -1
        log(
            "[join:{}] RhinoCommon ok before={} deleted={} after={}".format(
                label, len(mesh_ids), deleted, final_count
            )
        )
        return final_count if final_count >= 0 else 1

    # fallback command join
    try:
        doc.Objects.UnselectAll()
    except Exception:
        pass
    selected_count = 0
    for oid in mesh_ids:
        try:
            obj = doc.Objects.FindId(oid)
            if (
                obj
                and obj.ObjectType == Rhino.DocObjects.ObjectType.Mesh
                and obj.Select(True)
            ):
                selected_count += 1
        except Exception:
            pass

    ok_cmd = False
    try:
        ok_cmd = Rhino.RhinoApp.RunScript("!_-Join _Enter", True)
    except Exception:
        ok_cmd = False

    try:
        final_count = sum(
            1
            for o in list(doc.Objects)
            if o and o.ObjectType == Rhino.DocObjects.ObjectType.Mesh
        )
    except Exception:
        final_count = -1

    log(
        "[join:{}] fallback ok={} selected={} after={}".format(
            label, ok_cmd, selected_count, final_count
        )
    )
    return final_count if final_count >= 0 else 0


def _export_doc_to_stl(doc, output_path):
    try:
        out_dir = os.path.dirname(str(output_path))
        if out_dir and not os.path.exists(out_dir):
            os.makedirs(out_dir)
    except Exception:
        pass

    try:
        doc.Objects.UnselectAll()
        for obj in list(doc.Objects):
            if obj and obj.ObjectType == Rhino.DocObjects.ObjectType.Mesh:
                try:
                    obj.Select(True)
                except Exception:
                    pass
    except Exception:
        try:
            Rhino.RhinoApp.RunScript("!_-SelAll _Enter", True)
        except Exception:
            pass

    _log_doc_mesh_stats(doc, "before-export")

    write_opts = Rhino.FileIO.FileStlWriteOptions()
    try:
        if hasattr(write_opts, "Ascii"):
            write_opts.Ascii = False
        if hasattr(write_opts, "ExportFileAsBinary"):
            write_opts.ExportFileAsBinary = True
        if hasattr(write_opts, "ExportSelectedObjectsOnly"):
            write_opts.ExportSelectedObjectsOnly = False
    except Exception:
        pass

    ok = Rhino.FileIO.FileStl.Write(str(output_path), doc, write_opts)

    if not ok:
        for _retry in range(2):
            try:
                if os.path.exists(output_path):
                    try:
                        os.unlink(output_path)
                    except Exception:
                        pass

                active_doc = Rhino.RhinoDoc.ActiveDoc
                if active_doc:
                    active_doc.Objects.UnselectAll()
                    Rhino.RhinoApp.RunScript("!_SelAll", True)

                cmd = '-_Export "{}" _Enter _Enter'.format(str(output_path))
                log("RunScript=" + cmd)
                ok_cmd = Rhino.RhinoApp.RunScript(cmd, True)
                log("Export command ok=" + str(ok_cmd))

                for _ in range(100):
                    if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
                        ok = True
                        break
                    time.sleep(0.02)

                if ok:
                    break
            except Exception as e:
                log("Export retry error: " + str(e))

    try:
        ok = os.path.exists(output_path) and os.path.getsize(output_path) > 0
    except Exception:
        ok = False

    return bool(ok)


def main(input_path_arg=None, output_path_arg=None, log_path_arg=None):
    perf_sections = {}

    def _perf_mark(name, started_at, extra=None):
        try:
            elapsed = float(time.perf_counter() - float(started_at))
        except Exception:
            elapsed = -1.0
        perf_sections[name] = elapsed
        if extra:
            log("[perf] phase={} sec={:.3f} {}".format(name, elapsed, str(extra)))
        else:
            log("[perf] phase={} sec={:.3f}".format(name, elapsed))
        return elapsed

    if log_path_arg:
        os.environ["ABUTS_LOG_PATH"] = str(log_path_arg)

    input_path, output_path = _parse_args(sys.argv, input_path_arg, output_path_arg)

    target_diameter = 3.33
    raw_target_diameter = os.environ.get("ABUTS_CONNECTION_TARGET_DIAMETER", "").strip()
    if raw_target_diameter:
        try:
            parsed_target = float(raw_target_diameter)
            if parsed_target > 0:
                target_diameter = parsed_target
        except Exception:
            pass

    input_path = str(input_path)
    output_path = str(output_path)

    if not os.path.exists(input_path):
        fail("입력 파일이 없습니다: " + input_path)
    try:
        if os.path.getsize(input_path) == 0:
            fail("입력 파일 크기가 0입니다: " + input_path)
    except Exception:
        pass

    out_dir = os.path.dirname(output_path)
    if out_dir and not os.path.exists(out_dir):
        os.makedirs(out_dir)

    doc = Rhino.RhinoDoc.ActiveDoc
    owns_doc = False
    if doc is None:
        doc = Rhino.RhinoDoc.CreateHeadless(None)
        if doc is not None:
            try:
                doc.ModelUnitSystem = Rhino.UnitSystem.Millimeters
            except Exception:
                pass
        owns_doc = True
    if doc is None:
        fail("Doc를 생성할 수 없습니다")

    try:
        total_started_at = time.perf_counter()
        log("start")
        log("input=" + input_path)
        log("output=" + output_path)
        log("[align] target connection diameter={:.4f}mm".format(target_diameter))

        # 기존 문서 정리 (ActiveDoc를 사용할 수 있으므로 안전하게 비우기)
        stage_started_at = time.perf_counter()
        _clear_doc_objects(doc, stage_label="before-import")

        # 중요: finishline은 import 직후(원본 좌표) 먼저 계산한다.
        # 이후 정렬/Explode/Fill 등 후처리를 수행하되, finishline 좌표는 필요 시 정렬 변환을 적용해 사용한다.
        mesh_obj_refs, alignment_transform = _import_stl_meshes(
            doc,
            input_path,
            skip_align=True,
            target_diameter=target_diameter,
        )
        _log_doc_mesh_stats(doc, "after-import")
        _perf_mark("import_align", stage_started_at)

        # Finish line 계산 (다른 처리보다 먼저)
        fl = None
        pts = []
        pt0 = None
        strategy_used = None
        stage_started_at = time.perf_counter()
        try:
            finishline_mesh_id = _pick_finishline_mesh_id(doc, mesh_obj_refs)
            fl = _detect_finish_line_latest(
                doc=doc,
                visualize=False,
                mesh_id=finishline_mesh_id,
            )
            pts = fl.get("points") or []
            pt0 = fl.get("pt0")
            strategy_used = fl.get("strategy_used")
        except Exception as e:
            log("Finishline failed: " + str(e))
        _perf_mark(
            "finishline_detect",
            stage_started_at,
            extra="strategy={} points={}".format(strategy_used, len(pts)),
        )

        # 정렬은 finishline 계산 후 수행한다.
        # (backend 경로에서 edge 기반이 무너지는 케이스를 피하기 위해 순서를 변경)
        stage_started_at = time.perf_counter()
        alignment_transform = _run_alignment_on_first_mesh(
            doc,
            target_diameter=target_diameter,
        )
        _log_doc_mesh_stats(doc, "after-align")

        # 디버그 가시화용 커브는 정렬 좌표계로 변환된 점으로 추가
        pts_aligned = _transform_finishline_points(pts, alignment_transform)
        pt0_aligned = _transform_finishline_point(pt0, alignment_transform)
        _add_finishline_curve(doc, pts_aligned)

        _perf_mark("align_post_finishline", stage_started_at)

        # 백엔드 등록: 정렬 좌표계를 사용하므로 finishline 점도 동일 변환 적용
        stage_started_at = time.perf_counter()
        if fl is not None:
            try:
                import base64
                import json

                finish_line_payload = {
                    "version": 1,
                    "sectionCount": int(fl.get("plane_count") or 0),
                    "maxStepDistance": float(
                        os.environ.get("ABUTS_FINISHLINE_MAX_STEP", "1") or 1
                    ),
                    "points": [
                        [float(p.X), float(p.Y), float(p.Z)] for p in pts_aligned
                    ],
                    "pt0": [
                        float(pt0_aligned.X),
                        float(pt0_aligned.Y),
                        float(pt0_aligned.Z),
                    ]
                    if pt0_aligned
                    else None,
                }

                log(
                    "finishline detected points={} planeCount={} hasPt0={} strategy={}".format(
                        len(finish_line_payload.get("points") or []),
                        finish_line_payload.get("sectionCount"),
                        bool(finish_line_payload.get("pt0")),
                        strategy_used,
                    )
                )

                try:
                    encoded_finish_line = base64.b64encode(
                        json.dumps(finish_line_payload, ensure_ascii=False).encode(
                            "utf-8"
                        )
                    ).decode("ascii")
                    log("FINISHLINE_RESULT:" + encoded_finish_line)
                except Exception as encode_err:
                    log("Finishline encode failed: " + str(encode_err))

                req_id = _extract_request_id_from_path(input_path)
                if req_id:
                    canonical_name = os.path.basename(str(input_path))
                    _post_finish_line(
                        req_id,
                        canonical_name,
                        finish_line_payload,
                    )
            except Exception as e:
                log("Finishline post failed after alignment: " + str(e))
        _perf_mark("finishline_payload_post", stage_started_at)

        # 1) Explode: RhinoCommon API를 사용하여 고속 처리 (문서 리셋 없이 바로 진행)
        stage_started_at = time.perf_counter()
        try:
            objs = list(doc.Objects)
            new_meshes = []
            for obj in objs:
                if obj.ObjectType == Rhino.DocObjects.ObjectType.Mesh:
                    g = obj.Geometry
                    # Unwelded edges에서 분리하여 개별 파트로 나눔
                    pieces = g.ExplodeAtUnweldedEdges()
                    if pieces and len(pieces) > 0:
                        new_meshes.extend(pieces)
                    else:
                        new_meshes.append(g)
                    doc.Objects.Delete(obj.Id, True)

            piece_ids = []
            for m in new_meshes:
                # 불필요한 속성 계산을 피하기 위해 AddMesh 직접 사용
                piece_ids.append(doc.Objects.AddMesh(m))

            log("Explode (RhinoCommon) ok, pieces=" + str(len(piece_ids)))
        except Exception as e:
            log("RhinoCommon Explode failed: " + str(e))
            # Fallback (RunScript) - 최후의 수단
            Rhino.RhinoApp.RunScript("!_-Explode", True)
            piece_ids = [
                o.Id
                for o in list(doc.Objects)
                if o.ObjectType == Rhino.DocObjects.ObjectType.Mesh
            ]

        _log_doc_mesh_stats(doc, "after-explode")
        _perf_mark(
            "explode", stage_started_at, extra="pieces={}".format(len(piece_ids))
        )

        # 2) 홀메우기 대상 조각 선택
        stage_started_at = time.perf_counter()
        # - 우선순위: (nakedEdges>0인 조각만 후보) -> XY 외측(r) 최대 -> r 동률 tolerance 내에서 +Z 최대
        candidates = []
        for oid in piece_ids:
            rh_obj = doc.Objects.FindId(oid)
            if rh_obj is None:
                continue
            geo = rh_obj.Geometry
            if geo is None:
                continue
            try:
                bbox = geo.GetBoundingBox(True)
            except Exception:
                continue

            # XY 외측: bbox 코너 중 원점으로부터 XY 반경이 가장 큰 값을 사용
            r = 0.0
            try:
                corners = bbox.GetCorners()
            except Exception:
                corners = None
            if corners:
                for p in corners:
                    try:
                        rr = float((p.X * p.X + p.Y * p.Y) ** 0.5)
                        if rr > r:
                            r = rr
                    except Exception:
                        pass

            max_z = float(bbox.Max.Z)
            naked = _count_naked_edges(geo)
            candidates.append({"id": oid, "r": r, "maxZ": max_z, "naked": naked})

        # 후보 로그(top)
        # nakedEdges>0 후보만 추리기
        open_candidates = [c for c in candidates if (c.get("naked") or 0) > 0]
        pool = open_candidates if open_candidates else candidates

        best_id = None
        best_key = None
        # r tolerance는 실제 데이터에서 소수점 오차/조각화에 따라 근소하게 달라질 수 있어
        # max_r 근처 "상위 밴드"로 후보를 잡고 그 안에서 +Z 최대를 선택한다.
        tol = float(os.environ.get("ABUTS_R_TOL", "0.05"))
        if pool:
            max_r = max([float(c.get("r") or 0) for c in pool])
            # 절대 tol + (상대 tol 1%) 중 큰 값 적용
            band = max(tol, max_r * 0.01)
            top_r = [c for c in pool if float(c.get("r") or 0) >= (max_r - band)]
            chosen = None
            for c in top_r:
                # 상위 밴드 내에서는 +Z 최대가 우선, 동률이면 r
                key = (float(c.get("maxZ") or 0), float(c.get("r") or 0))
                if chosen is None or key > chosen[0]:
                    chosen = (key, c)
            if chosen is not None:
                best_id = chosen[1].get("id")
                best_key = (chosen[1].get("r"), chosen[1].get("maxZ"))

        if best_id is None:
            fail("홀 메우기 대상 Mesh를 찾지 못했습니다")

        log("selected piece id=" + str(best_id))
        log("selected key(r,maxZ)=" + str(best_key))
        log(
            "total candidates={} open_candidates={} tol={}".format(
                len(candidates),
                len(open_candidates),
                tol,
            )
        )

        fill_targets = _pick_fill_targets(pool)
        fill_targets = [c for c in fill_targets if c.get("id")]
        if best_id and all(c.get("id") != best_id for c in fill_targets):
            picked = next((c for c in pool if c.get("id") == best_id), None)
            if picked is not None:
                fill_targets.insert(0, picked)
        if not fill_targets:
            fail("FillMeshHoles 대상 Mesh 목록을 만들지 못했습니다")

        log(
            "FillMeshHoles target count={} (limit={})".format(
                len(fill_targets), _FILL_TARGET_LIMIT
            )
        )

        _log_doc_mesh_stats(doc, "before-fill")

        for idx, c in enumerate(fill_targets):
            oid = c.get("id")
            log(
                "FillMeshHoles target[{}] id={} r={} maxZ={} nakedEdges={}".format(
                    idx,
                    oid,
                    c.get("r"),
                    c.get("maxZ"),
                    c.get("naked"),
                )
            )
            _log_doc_mesh_stats(
                doc, "before-fill-target-{}".format(idx), detail_limit=4
            )
            filled = _run_fill_mesh_holes(doc, oid)
            if not filled:
                log("FillMeshHoles 결과 변화 없음 (id={})".format(oid))
            else:
                log("FillMeshHoles 성공 감지 (id={})".format(oid))
            _log_doc_mesh_stats(doc, "after-fill-target-{}".format(idx), detail_limit=4)

        # 최신 Mesh 목록으로 갱신 (Fill 과정에서 Replace가 발생했으므로)
        try:
            piece_ids = [
                o.Id
                for o in doc.Objects
                if o.ObjectType == Rhino.DocObjects.ObjectType.Mesh
            ]
        except Exception:
            piece_ids = []

        _log_doc_mesh_stats(doc, "before-join")
        _perf_mark(
            "fill_selection_and_holes",
            stage_started_at,
            extra="targets={}".format(len(fill_targets)),
        )

        # 4) Join (RhinoCommon API 사용 + 미지원/실패 시 커맨드 fallback)
        stage_started_at = time.perf_counter()
        try:
            meshes = []
            for oid in piece_ids:
                o = doc.Objects.FindId(oid)
                if o and o.Geometry:
                    try:
                        meshes.append(o.Geometry.DuplicateMesh())
                    except Exception:
                        pass

            merged = None
            if len(meshes) == 1:
                merged = meshes[0]
            elif len(meshes) > 1:
                tol = doc.ModelAbsoluteTolerance if doc else 0.01
                if hasattr(Rhino.Geometry.Mesh, "CreateFromMerge"):
                    merged = Rhino.Geometry.Mesh.CreateFromMerge(
                        meshes, tol or 0.01, True
                    )
                else:
                    log("Join (RhinoCommon) skipped: CreateFromMerge unavailable")

            joined_with_rhinocommon = False
            if merged and merged.Faces.Count > 0:
                try:
                    merged.Vertices.CombineIdentical(True, True)
                except Exception:
                    pass
                try:
                    if hasattr(merged.Faces, "RedundantFaces"):
                        merged.Faces.RedundantFaces()
                except Exception:
                    pass

                # 기존 메시 제거 후 병합 메시 추가
                for oid in piece_ids:
                    try:
                        doc.Objects.Delete(oid, True)
                    except Exception:
                        pass
                doc.Objects.AddMesh(merged)
                joined_with_rhinocommon = True
                log("Join (RhinoCommon) ok")
            else:
                log("Join (RhinoCommon) skipped: merged mesh unavailable")

            # RhinoCommon Join이 성립하지 않으면 커맨드 Join fallback을 반드시 시도
            if not joined_with_rhinocommon:
                try:
                    doc.Objects.UnselectAll()
                except Exception:
                    pass

                selected_count = 0
                for oid in piece_ids:
                    try:
                        obj = doc.Objects.FindId(oid)
                        if obj and obj.ObjectType == Rhino.DocObjects.ObjectType.Mesh:
                            if obj.Select(True):
                                selected_count += 1
                    except Exception:
                        pass

                log("Join fallback select mesh count=" + str(selected_count))
                ok_join_cmd = False
                try:
                    ok_join_cmd = Rhino.RhinoApp.RunScript("!_-Join _Enter", True)
                except Exception:
                    ok_join_cmd = False
                log("Join fallback command ok=" + str(ok_join_cmd))
        except Exception as e:
            log("Join (RhinoCommon) failed: " + str(e))
            try:
                Rhino.RhinoApp.RunScript("!_-Join _Enter", True)
            except Exception:
                pass

        try:
            mesh_count_after = 0
            for o in list(doc.Objects):
                try:
                    if o.ObjectType == Rhino.DocObjects.ObjectType.Mesh:
                        mesh_count_after += 1
                except Exception:
                    pass
            log("mesh objects after Join=" + str(mesh_count_after))
        except Exception:
            pass

        _log_doc_mesh_stats(doc, "after-join")
        _perf_mark("join", stage_started_at)

        # export는 fill_steps + 최종 join 이후에 수행

        stage_started_at = time.perf_counter()
        try:
            max_d, conn_d = analyze_diameters(doc)
            log("DIAMETER_RESULT:max={} conn={}".format(max_d, conn_d))
        except Exception as e:
            log("Analysis failed: " + str(e))
        _perf_mark("diameter_analysis", stage_started_at)

        # 처리 완료 후 fill_steps 실행
        stage_started_at = time.perf_counter()
        try:
            fill_steps_result = _run_fill_steps_latest(doc)
            log("[fill-steps] result={}".format(fill_steps_result))
        except Exception as e:
            log("[fill-steps] failed: " + str(e))
        _perf_mark("fill_steps", stage_started_at)

        # 마지막에 문서 내 모든 메시를 한 번 더 Join
        stage_started_at = time.perf_counter()
        try:
            final_mesh_count = _join_all_meshes(doc, label="post-fill-steps")
            log("[join:post-fill-steps] final mesh count={}".format(final_mesh_count))
        except Exception as e:
            log("[join:post-fill-steps] failed: " + str(e))
        _perf_mark("join_post_fill_steps", stage_started_at)

        # 최종 모델(단차 메움 반영본) export
        stage_started_at = time.perf_counter()
        try:
            ok = _export_doc_to_stl(doc, output_path)
        except Exception as e:
            fail("STL Export 예외: " + str(e))

        if not ok:
            fail("STL Export 실패")
        _perf_mark("export", stage_started_at)

        total_elapsed = _perf_mark("total", total_started_at)
        try:
            ordered_keys = [
                "import_align",
                "finishline_detect",
                "finishline_payload_post",
                "explode",
                "fill_selection_and_holes",
                "join",
                "diameter_analysis",
                "fill_steps",
                "join_post_fill_steps",
                "export",
                "total",
            ]
            summary_parts = []
            for key in ordered_keys:
                if key in perf_sections:
                    summary_parts.append("{}={:.3f}".format(key, perf_sections[key]))
            log("[perf-summary] " + " ".join(summary_parts))
            log("PERF_RESULT:" + "|".join(summary_parts))
            log(
                "[perf-compare-format] sample=<same_input> before_total=<sec> after_total={:.3f} delta=<before-after>".format(
                    total_elapsed
                )
            )
        except Exception:
            pass

        log("export ok")
    finally:
        if owns_doc:
            try:
                doc.Dispose()
            except Exception:
                pass

    if not os.path.exists(output_path):
        fail("Export 후 파일이 생성되지 않았습니다: " + output_path)

    try:
        if os.path.getsize(output_path) == 0:
            fail("Export 결과 파일 크기가 0입니다: " + output_path)
    except Exception:
        pass

    log("finish")
    print("OK")


if __name__ == "__main__":
    main()
