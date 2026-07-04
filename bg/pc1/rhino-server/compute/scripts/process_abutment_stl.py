import os
import sys
import time

import fill_screwholes as fill_screwholes_module
import fill_steps as fill_steps_module
import finishline_detection as finishline_detection_module

# Rhino Python 환경에서 실행된다고 가정
import Rhino
import Rhino.FileIO
from diameter_analysis import analyze_diameters

_log_initialized = False


def _is_env_true(name, default=False):
    raw = os.environ.get(str(name), "")
    if raw is None:
        return bool(default)
    s = str(raw).strip().lower()
    if s == "":
        return bool(default)
    return s in ("1", "true", "yes", "y", "on")


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

    keep_debug_objects = _is_env_true(
        "ABUTS_FINISHLINE_KEEP_DEBUG_OBJECTS", _DEBUG_KEEP_INTERMEDIATE_OBJECTS
    )
    enable_trace = _DEBUG_ENABLE_FINISHLINE_TRACE
    prev_show_sections = os.environ.get("FINISHLINE_SHOW_ALL_SECTIONS")
    prev_keep_temp = os.environ.get("FINISHLINE_DEBUG_KEEP_TEMP_OBJECTS")
    prev_trace = os.environ.get("FINISHLINE_TRACE_DEBUG")
    prev_curve_doc = os.environ.get("FINISHLINE_DEBUG_CURVE_DOC")

    try:
        os.environ["FINISHLINE_SHOW_ALL_SECTIONS"] = "1" if keep_debug_objects else "0"
        os.environ["FINISHLINE_DEBUG_KEEP_TEMP_OBJECTS"] = (
            "1" if keep_debug_objects else "0"
        )
        os.environ["FINISHLINE_DEBUG_CURVE_DOC"] = "1" if keep_debug_objects else "0"
        os.environ["FINISHLINE_TRACE_DEBUG"] = "1" if enable_trace else "0"

        try:
            if hasattr(module, "set_external_logger"):
                module.set_external_logger(log)
        except Exception:
            pass

        return module.detect_finish_line(
            doc=doc,
            mesh_id=mesh_id,
            visualize=bool(visualize or keep_debug_objects),
        )
    except Exception as e:
        log("[finishline] detect_finish_line raised: " + str(e))
        raise
    finally:
        try:
            if prev_show_sections is None:
                os.environ.pop("FINISHLINE_SHOW_ALL_SECTIONS", None)
            else:
                os.environ["FINISHLINE_SHOW_ALL_SECTIONS"] = str(prev_show_sections)
        except Exception:
            pass
        try:
            if prev_keep_temp is None:
                os.environ.pop("FINISHLINE_DEBUG_KEEP_TEMP_OBJECTS", None)
            else:
                os.environ["FINISHLINE_DEBUG_KEEP_TEMP_OBJECTS"] = str(prev_keep_temp)
        except Exception:
            pass
        try:
            if prev_trace is None:
                os.environ.pop("FINISHLINE_TRACE_DEBUG", None)
            else:
                os.environ["FINISHLINE_TRACE_DEBUG"] = str(prev_trace)
        except Exception:
            pass
        try:
            if prev_curve_doc is None:
                os.environ.pop("FINISHLINE_DEBUG_CURVE_DOC", None)
            else:
                os.environ["FINISHLINE_DEBUG_CURVE_DOC"] = str(prev_curve_doc)
        except Exception:
            pass


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


def _debug_clone_before_delete(doc, obj, stage_label="unknown"):
    if not _DEBUG_KEEP_INTERMEDIATE_OBJECTS or doc is None or obj is None:
        return None

    try:
        geo = getattr(obj, "Geometry", None)
        if geo is None:
            return None
        dup = geo.Duplicate()
        if dup is None:
            return None

        attrs = Rhino.DocObjects.ObjectAttributes()
        try:
            attrs = obj.Attributes.Duplicate()
        except Exception:
            attrs = Rhino.DocObjects.ObjectAttributes()

        try:
            old_name = attrs.Name or ""
        except Exception:
            old_name = ""
        attrs.Name = "DBG_KEEP:{}:{}".format(stage_label, old_name)

        new_id = doc.Objects.Add(dup, attrs)
        if new_id:
            log(
                "[debug-keep] cloned before delete stage={} src={} clone={}".format(
                    stage_label,
                    getattr(obj, "Id", "unknown"),
                    new_id,
                )
            )
        return new_id
    except Exception as e:
        log("[debug-keep] clone failed stage={} err={}".format(stage_label, str(e)))
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

# 단일 DEBUG 플래그(권장): DEBUG=1/0
# - 기존 ABUTS_DEBUG* 환경변수는 하위호환으로만 유지
_GLOBAL_DEBUG = _is_env_true(
    "DEBUG",
    default=(
        _is_env_true("ABUTS_DEBUG_MODE", False) or _is_env_true("ABUTS_DEBUG", False)
    ),
)

# 디버그 모드: 중간 오브젝트 보존/finishline 상세로그 활성화
_DEBUG_KEEP_INTERMEDIATE_OBJECTS = _is_env_true(
    "ABUTS_DEBUG_KEEP_INTERMEDIATE_OBJECTS",
    default=_GLOBAL_DEBUG,
)
_DEBUG_ENABLE_FINISHLINE_TRACE = _is_env_true(
    "ABUTS_DEBUG_FINISHLINE_TRACE",
    default=_GLOBAL_DEBUG,
)
# finishline 실패 시 강제 재시도는 비용이 크므로 기본 OFF,
# 디버그 모드거나 명시 env에서만 수행
_FINISHLINE_RETRY_ON_FAIL = _is_env_true(
    "ABUTS_FINISHLINE_RETRY_ON_FAIL",
    default=_GLOBAL_DEBUG,
)

# 스크류홀 추정 루프 필터: 이 길이(mm)보다 짧은 loop은 노이즈로 제외
_SCREWHOLE_MIN_LOOP_LENGTH = float(
    os.environ.get("ABUTS_SCREWHOLE_MIN_LOOP_LENGTH", "3.0") or 3.0
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


def _pick_largest_mesh_id(doc):
    best = None
    for obj, geo in _iter_mesh_geometries(doc):
        try:
            f = int(geo.Faces.Count)
        except Exception:
            f = -1
        try:
            v = int(geo.Vertices.Count)
        except Exception:
            v = -1
        key = (f, v)
        if best is None or key > best[0]:
            best = (key, obj.Id)
    return best[1] if best else None


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


def _pick_primary_piece(candidates, tol, prefer_open=True):
    open_candidates = [c for c in candidates if (c.get("naked") or 0) > 0]
    pool = open_candidates if (prefer_open and open_candidates) else candidates
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


def _pick_finishline_mesh_id(doc, mesh_obj_refs, prefer_open=False):
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

    best_id, best_meta, pool = _pick_primary_piece(
        candidates, tol, prefer_open=prefer_open
    )
    log(
        "[finishline-target] prefer_open={} importMeshes={} scoped={} pool={} selected={} meta={}".format(
            bool(prefer_open),
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
            float(x.get("topR") or 0.0),
            float(x.get("maxZ") or 0.0),
            float(x.get("r") or 0.0),
        ),
        reverse=True,
    )
    return ordered[:_FILL_TARGET_LIMIT]


def _calc_top_xy_radius(mesh, top_band_height=0.3):
    """
    +Z 상단 영역(top band)에서의 XY 최대 반경을 계산.
    explode 후 '위쪽으로 넓은' 조각 선택에 사용.
    """
    if mesh is None:
        return 0.0

    try:
        bbox = mesh.GetBoundingBox(True)
        max_z = float(bbox.Max.Z)
    except Exception:
        return 0.0

    band_h = max(0.05, float(top_band_height))
    z_min_in_band = max_z - band_h

    max_r = 0.0
    try:
        vcount = int(mesh.Vertices.Count)
    except Exception:
        vcount = 0

    for i in range(vcount):
        try:
            v = mesh.Vertices[i]
            if float(v.Z) < z_min_in_band:
                continue
            rr = float((v.X * v.X + v.Y * v.Y) ** 0.5)
            if rr > max_r:
                max_r = rr
        except Exception:
            continue

    # 상단 band에 버텍스가 거의 없으면 전체 bbox 기반 반경으로 fallback
    if max_r <= 0.0:
        try:
            max_r = _calc_xy_radius_from_bbox(bbox)
        except Exception:
            max_r = 0.0

    return max_r


def _explode_mesh_piece_candidates(mesh, doc=None):
    """
    메시가 weld 상태로 붙어 있는 경우를 대비해,
    Unweld(각도 기반) -> ExplodeAtUnweldedEdges 를 단계적으로 시도한다.
    """
    if mesh is None:
        return []

    try:
        base = mesh.DuplicateMesh()
    except Exception:
        base = mesh

    # 0) 원본 상태 explode 먼저
    try:
        pieces = base.ExplodeAtUnweldedEdges()
        if pieces and len(pieces) > 1:
            log("[explode] base explode pieces={}".format(len(pieces)))
            return list(pieces)
    except Exception as e:
        log("[explode] base explode failed: {}".format(str(e)))

    raw = os.environ.get("ABUTS_UNWELD_ANGLES_DEG", "25,40,55,70")
    angles = []
    for tok in str(raw).split(","):
        tok = tok.strip()
        if not tok:
            continue
        try:
            v = float(tok)
            if v > 0:
                angles.append(v)
        except Exception:
            pass
    if not angles:
        angles = [25.0, 40.0, 55.0, 70.0]

    # 1) 각도별 unweld 후 explode 재시도
    for deg in angles:
        try:
            trial = base.DuplicateMesh()
        except Exception:
            trial = None
        if trial is None:
            continue

        ok_unweld = False
        try:
            # RhinoCommon: angle(rad), modifyNormals(bool)
            trial.Unweld(Rhino.RhinoMath.ToRadians(float(deg)), True)
            ok_unweld = True
        except Exception as e:
            log("[explode] Unweld({}deg) failed: {}".format(deg, str(e)))

        if not ok_unweld:
            continue

        try:
            pieces = trial.ExplodeAtUnweldedEdges()
        except Exception as e:
            log("[explode] explode after Unweld({}deg) failed: {}".format(deg, str(e)))
            pieces = None

        cnt = len(pieces) if pieces else 0
        log("[explode] Unweld({}deg) -> pieces={}".format(deg, cnt))
        if pieces and len(pieces) > 1:
            return list(pieces)

    # 2) 끝까지 분리 안 되면 원본 유지
    return [base]


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


def _sanitize_finishline_points(points):
    if not points:
        return []

    pts = []
    for p in points:
        if p is None:
            continue
        try:
            pts.append(Rhino.Geometry.Point3d(float(p.X), float(p.Y), float(p.Z)))
        except Exception:
            continue

    if len(pts) < 3:
        return pts

    # 끝점 중복 제거(closed ring duplicate)
    try:
        if pts[0].DistanceTo(pts[-1]) <= 1e-4:
            pts = pts[:-1]
    except Exception:
        pass

    if len(pts) < 3:
        return pts

    # seam 점프가 크면 해당 edge를 seam으로 재배치(rotate)하여 open polyline으로 전달
    seg_lens = []
    n = len(pts)
    for i in range(n):
        a = pts[i]
        b = pts[(i + 1) % n]
        try:
            seg_lens.append(float(a.DistanceTo(b)))
        except Exception:
            seg_lens.append(0.0)

    ordered = sorted(seg_lens)
    med = ordered[len(ordered) // 2] if ordered else 0.0
    max_len = max(seg_lens) if seg_lens else 0.0
    max_idx = seg_lens.index(max_len) if seg_lens else -1

    if (
        max_idx >= 0
        and max_len >= 2.0
        and max_len >= (med * 2.8 if med > 1e-9 else 2.0)
    ):
        start = (max_idx + 1) % n
        pts = pts[start:] + pts[:start]
        log(
            "[finishline-clean] rotated seam at edge={} max_len={:.4f} med_len={:.4f} n={}".format(
                max_idx,
                max_len,
                med,
                n,
            )
        )
    else:
        log(
            "[finishline-clean] keep order max_len={:.4f} med_len={:.4f} n={}".format(
                max_len,
                med,
                n,
            )
        )

    return pts


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
        poly = Rhino.Geometry.Polyline(pts)
        curve = Rhino.Geometry.PolylineCurve(poly)
        cid = doc.Objects.AddCurve(curve)
        if cid:
            log("[finishline-curve] added id={} pts={}".format(cid, len(pts)))
            return cid
    except Exception as e:
        log("[finishline-curve] add failed: {}".format(str(e)))

    return None


def _cleanup_doc_objects_for_non_debug(doc, finishline_curve_id=None):
    """DEBUG=0일 때 문서에 모델 mesh + finishline curve만 남긴다."""
    if doc is None:
        return

    keep_curve = None
    try:
        keep_curve = finishline_curve_id
    except Exception:
        keep_curve = None

    removed = 0
    mesh_kept = 0
    curve_kept = 0

    try:
        objs = list(doc.Objects)
    except Exception:
        objs = []

    for obj in objs:
        if obj is None:
            continue

        try:
            oid = obj.Id
            otype = obj.ObjectType
        except Exception:
            continue

        keep = False
        try:
            if otype == Rhino.DocObjects.ObjectType.Mesh:
                keep = True
                mesh_kept += 1
            elif (
                keep_curve is not None
                and otype == Rhino.DocObjects.ObjectType.Curve
                and oid == keep_curve
            ):
                keep = True
                curve_kept += 1
        except Exception:
            keep = False

        if keep:
            continue

        try:
            if doc.Objects.Delete(oid, True):
                removed += 1
        except Exception:
            pass

    log(
        "[doc-cleanup:non-debug] removed={} mesh_kept={} finishline_curve_kept={}".format(
            removed,
            mesh_kept,
            curve_kept,
        )
    )


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


def _run_fill_screwholes_latest(doc, target_id):
    try:
        import importlib

        module = importlib.reload(fill_screwholes_module)
        log(
            "[screwhole-fill] module reloaded path={}".format(
                getattr(module, "__file__", "unknown")
            )
        )
    except Exception as e:
        module = fill_screwholes_module
        log(
            "[screwhole-fill] module reload failed; using cached module: {}".format(
                str(e)
            )
        )

    if not hasattr(module, "fill_mesh_object"):
        log("[screwhole-fill] fill_mesh_object API not found")
        return None

    try:
        return module.fill_mesh_object(
            doc=doc,
            obj_id=target_id,
            obj_index=0,
            mode="auto",
            min_loop_length=_SCREWHOLE_MIN_LOOP_LENGTH,
            loop_indices_to_fill=None,
            visualize=False,
            logger=log,
            redraw=False,
        )
    except Exception as e:
        log("[screwhole-fill] API call failed: {}".format(str(e)))
        return None


def _run_fill_mesh_holes(doc, target_id):
    target = doc.Objects.FindId(target_id)
    if target is None or target.Geometry is None:
        return False

    before_naked = _count_naked_edges(target.Geometry)
    try:
        before_v = int(target.Geometry.Vertices.Count)
    except Exception:
        before_v = None
    try:
        before_f = int(target.Geometry.Faces.Count)
    except Exception:
        before_f = None

    log(
        "[screwhole-fill] pre id={} v={} f={} nakedEdges={} minLoopLen={}".format(
            target_id,
            before_v,
            before_f,
            before_naked,
            _SCREWHOLE_MIN_LOOP_LENGTH,
        )
    )

    ret = _run_fill_screwholes_latest(doc, target_id) or {}

    refreshed = doc.Objects.FindId(target_id)
    geom = refreshed.Geometry if refreshed and refreshed.Geometry is not None else None
    after_naked = _count_naked_edges(geom) if geom is not None else None
    try:
        after_v = int(geom.Vertices.Count) if geom is not None else None
    except Exception:
        after_v = None
    try:
        after_f = int(geom.Faces.Count) if geom is not None else None
    except Exception:
        after_f = None

    log(
        "[screwhole-fill] post id={} v:{}->{} f:{}->{} naked:{}->{} filled_count={} selected_loop={} reason={}".format(
            target_id,
            before_v,
            after_v,
            before_f,
            after_f,
            before_naked,
            after_naked,
            ret.get("filled_count"),
            ret.get("selected_loop_index"),
            ret.get("reason"),
        )
    )

    if int(ret.get("filled_count") or 0) > 0:
        return True

    return (
        before_naked is None
        or after_naked is None
        or int(after_naked) < int(before_naked)
        or after_f != before_f
    )


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
                src_obj = doc.Objects.FindId(oid)
                _debug_clone_before_delete(doc, src_obj, stage_label="join-all-source")
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


def _export_doc_to_stl(doc, output_path, mesh_ids_to_export=None):
    try:
        out_dir = os.path.dirname(str(output_path))
        if out_dir and not os.path.exists(out_dir):
            os.makedirs(out_dir)
    except Exception:
        pass

    try:
        doc.Objects.UnselectAll()

        selected = 0
        if mesh_ids_to_export:
            for oid in mesh_ids_to_export:
                try:
                    obj = doc.Objects.FindId(oid)
                    if obj and obj.ObjectType == Rhino.DocObjects.ObjectType.Mesh:
                        if obj.Select(True):
                            selected += 1
                except Exception:
                    pass
        else:
            for obj in list(doc.Objects):
                if obj and obj.ObjectType == Rhino.DocObjects.ObjectType.Mesh:
                    try:
                        if obj.Select(True):
                            selected += 1
                    except Exception:
                        pass

        log(
            "[export] selected mesh count={} explicit_ids={}".format(
                selected,
                len(mesh_ids_to_export) if mesh_ids_to_export else 0,
            )
        )
    except Exception:
        # selection 단계 예외 시에도 "mesh만" 선택하도록 재시도 (SelAll 금지)
        try:
            doc.Objects.UnselectAll()
            for obj in list(doc.Objects):
                if obj and obj.ObjectType == Rhino.DocObjects.ObjectType.Mesh:
                    try:
                        obj.Select(True)
                    except Exception:
                        pass
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
            # 선택된 최종 메시만 export (디버그 커브/브렙/점 객체 제외)
            write_opts.ExportSelectedObjectsOnly = True
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
                    if mesh_ids_to_export:
                        for oid in mesh_ids_to_export:
                            try:
                                obj = active_doc.Objects.FindId(oid)
                                if (
                                    obj
                                    and obj.ObjectType
                                    == Rhino.DocObjects.ObjectType.Mesh
                                ):
                                    obj.Select(True)
                            except Exception:
                                pass
                    else:
                        for obj in list(active_doc.Objects):
                            try:
                                if (
                                    obj
                                    and obj.ObjectType
                                    == Rhino.DocObjects.ObjectType.Mesh
                                ):
                                    obj.Select(True)
                            except Exception:
                                pass

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
        log(
            "[debug] DEBUG(global)={} keep_intermediate_objects={} finishline_trace={}".format(
                bool(_GLOBAL_DEBUG),
                bool(_DEBUG_KEEP_INTERMEDIATE_OBJECTS),
                bool(_DEBUG_ENABLE_FINISHLINE_TRACE),
            )
        )
        if not _GLOBAL_DEBUG:
            log(
                "[debug] hint: set DEBUG=1 for full pipeline debug (finishline/process)"
            )

        # 실행 중 일관성 유지: FINISHLINE 개별 env를 명시적으로 동기화
        os.environ["FINISHLINE_TRACE_DEBUG"] = (
            "1" if _DEBUG_ENABLE_FINISHLINE_TRACE else "0"
        )
        os.environ["FINISHLINE_DEBUG_KEEP_TEMP_OBJECTS"] = (
            "1" if _DEBUG_KEEP_INTERMEDIATE_OBJECTS else "0"
        )
        os.environ["FINISHLINE_DEBUG_CURVE_DOC"] = (
            "1" if _DEBUG_KEEP_INTERMEDIATE_OBJECTS else "0"
        )
        os.environ["FINISHLINE_SHOW_ALL_SECTIONS"] = (
            "1" if _DEBUG_KEEP_INTERMEDIATE_OBJECTS else "0"
        )

        # 기존 문서 정리 (ActiveDoc를 사용할 수 있으므로 안전하게 비우기)
        stage_started_at = time.perf_counter()
        _clear_doc_objects(doc, stage_label="before-import")

        # 순서: import -> align -> (pre-explode) screwhole fill -> finishline -> explode
        mesh_obj_refs, alignment_transform = _import_stl_meshes(
            doc,
            input_path,
            skip_align=True,
            target_diameter=target_diameter,
        )
        _log_doc_mesh_stats(doc, "after-import")
        _perf_mark("import_align", stage_started_at)

        # 1) 원점 정렬
        stage_started_at = time.perf_counter()
        alignment_transform = _run_alignment_on_first_mesh(
            doc,
            target_diameter=target_diameter,
        )
        _log_doc_mesh_stats(doc, "after-align")
        _perf_mark("align_post_finishline", stage_started_at)

        # 2) finishline 검출 (정렬 반영본, 홀메움 이전 기준)
        #    - 홀메움 후 생성되는 open edge/내부 경계 영향으로
        #      피니시라인이 스크류홀로 잡히는 케이스를 줄이기 위해 순서를 앞당긴다.
        fl = None
        pts = []
        pt0 = None
        strategy_used = None
        finishline_mesh_id = None
        finishline_curve_id = None
        stage_started_at = time.perf_counter()
        try:
            finishline_mesh_refs = _get_mesh_objects(doc)
            finishline_mesh_id = _pick_finishline_mesh_id(
                doc, finishline_mesh_refs, prefer_open=False
            )
            fl = _detect_finish_line_latest(
                doc=doc,
                visualize=bool(_DEBUG_KEEP_INTERMEDIATE_OBJECTS),
                mesh_id=finishline_mesh_id,
            )
            pts = fl.get("points") or []
            pt0 = fl.get("pt0")
            strategy_used = fl.get("strategy_used")
        except Exception as e:
            log("Finishline failed: " + str(e))
            if _FINISHLINE_RETRY_ON_FAIL:
                # 선택적 1회 재시도: trace ON + visualize(디버그 시에만)
                prev_trace = os.environ.get("FINISHLINE_TRACE_DEBUG")
                prev_keep_temp = os.environ.get("FINISHLINE_DEBUG_KEEP_TEMP_OBJECTS")
                try:
                    os.environ["FINISHLINE_TRACE_DEBUG"] = "1"
                    # retry에서 임시 객체를 무조건 남기지 않음(문서 오염 방지)
                    if _DEBUG_KEEP_INTERMEDIATE_OBJECTS:
                        os.environ["FINISHLINE_DEBUG_KEEP_TEMP_OBJECTS"] = "1"
                    else:
                        os.environ["FINISHLINE_DEBUG_KEEP_TEMP_OBJECTS"] = "0"
                    log("[finishline] retry once with forced trace")
                    fl = _detect_finish_line_latest(
                        doc=doc,
                        visualize=bool(_DEBUG_KEEP_INTERMEDIATE_OBJECTS),
                        mesh_id=finishline_mesh_id,
                    )
                    pts = fl.get("points") or []
                    pt0 = fl.get("pt0")
                    strategy_used = fl.get("strategy_used")
                    log(
                        "[finishline] retry success strategy={} points={}".format(
                            strategy_used,
                            len(pts),
                        )
                    )
                except Exception as retry_err:
                    log("[finishline] retry failed: " + str(retry_err))
                finally:
                    try:
                        if prev_trace is None:
                            os.environ.pop("FINISHLINE_TRACE_DEBUG", None)
                        else:
                            os.environ["FINISHLINE_TRACE_DEBUG"] = str(prev_trace)
                    except Exception:
                        pass
                    try:
                        if prev_keep_temp is None:
                            os.environ.pop("FINISHLINE_DEBUG_KEEP_TEMP_OBJECTS", None)
                        else:
                            os.environ["FINISHLINE_DEBUG_KEEP_TEMP_OBJECTS"] = str(
                                prev_keep_temp
                            )
                    except Exception:
                        pass
        _perf_mark(
            "finishline_detect",
            stage_started_at,
            extra="strategy={} points={}".format(strategy_used, len(pts)),
        )

        # 이미 정렬 좌표계에서 검출했으므로 그대로 사용
        pts_aligned = _sanitize_finishline_points(pts or [])
        pt0_aligned = pt0
        finishline_curve_id = _add_finishline_curve(doc, pts_aligned)

        # 3) 백엔드 등록
        stage_started_at = time.perf_counter()
        if fl is not None:
            try:
                import base64
                import json

                finish_line_payload = {
                    "version": 1,
                    "sectionCount": int(len(pts_aligned) or 0),
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
                    "strategyUsed": strategy_used,
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

        # 4) explode 전 스크류홀 메움 (원본 단일/대표 mesh 기준)
        stage_started_at = time.perf_counter()
        fill_mesh_refs = _get_mesh_objects(doc)
        fill_mesh_id = _pick_finishline_mesh_id(doc, fill_mesh_refs, prefer_open=True)
        if fill_mesh_id:
            filled = _run_fill_mesh_holes(doc, fill_mesh_id)
            log(
                "[pre-explode-fill] mesh_id={} changed={}".format(
                    fill_mesh_id, bool(filled)
                )
            )
        else:
            log("[pre-explode-fill] target mesh not found")
        _log_doc_mesh_stats(doc, "after-pre-explode-fill")
        _perf_mark("fill_selection_and_holes", stage_started_at, extra="targets=1")

        # 1) Explode: RhinoCommon API를 사용하여 고속 처리 (문서 리셋 없이 바로 진행)
        #    - 분리가 안 되는 weld 메시 대응: Unweld(각도) -> Explode 단계적 시도
        stage_started_at = time.perf_counter()
        try:
            objs = list(doc.Objects)
            new_meshes = []
            for obj in objs:
                if obj.ObjectType == Rhino.DocObjects.ObjectType.Mesh:
                    g = obj.Geometry
                    pieces = _explode_mesh_piece_candidates(g, doc=doc)
                    if pieces and len(pieces) > 0:
                        new_meshes.extend(pieces)
                    else:
                        new_meshes.append(g)
                    _debug_clone_before_delete(doc, obj, stage_label="explode-source")
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

        # pre-explode 단계에서 홀메움을 완료했으므로 여기서는 join만 수행
        try:
            piece_ids = [
                o.Id
                for o in doc.Objects
                if o.ObjectType == Rhino.DocObjects.ObjectType.Mesh
            ]
        except Exception:
            piece_ids = []

        _log_doc_mesh_stats(doc, "before-join")

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
                        src_obj = doc.Objects.FindId(oid)
                        _debug_clone_before_delete(
                            doc, src_obj, stage_label="join-source"
                        )
                        doc.Objects.Delete(oid, True)
                    except Exception:
                        pass
                merged_id = doc.Objects.AddMesh(merged)
                joined_with_rhinocommon = True
                log("Join (RhinoCommon) ok merged_id={}".format(merged_id))
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
        # export는 항상 최종 메시 1개만 대상으로 수행
        export_mesh_ids = None
        preferred_mesh_id = _pick_largest_mesh_id(doc)
        if preferred_mesh_id:
            export_mesh_ids = [preferred_mesh_id]
        log(
            "[export] mesh filter ids={}".format(
                export_mesh_ids if export_mesh_ids else []
            )
        )
        try:
            ok = _export_doc_to_stl(
                doc,
                output_path,
                mesh_ids_to_export=export_mesh_ids,
            )
        except Exception as e:
            fail("STL Export 예외: " + str(e))

        if not ok:
            fail("STL Export 실패")
        _perf_mark("export", stage_started_at)

        # DEBUG=0: 문서 오브젝트를 모델 mesh + finishline curve만 남기도록 정리
        if not _GLOBAL_DEBUG:
            try:
                _cleanup_doc_objects_for_non_debug(doc, finishline_curve_id)
            except Exception as e:
                log("[doc-cleanup:non-debug] failed: {}".format(str(e)))
        else:
            log("[doc-cleanup] skipped (DEBUG=1, keep all Rhino objects)")

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
