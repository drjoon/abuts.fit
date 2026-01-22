import os
import sys

# Rhino Python 환경에서 실행된다고 가정
import Rhino
import Rhino.FileIO

from diameter_analysis import analyze_diameters


def log(msg):
    line = "[abuts-rhino] " + str(msg)
    try:
        print(line)
    except Exception:
        pass

    log_path = os.environ.get("ABUTS_LOG_PATH")
    if not log_path:
        return

    try:
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


def _count_naked_edges(mesh):
    try:
        edges = mesh.GetNakedEdges()
        return len(edges) if edges else 0
    except Exception:
        return None


def _safe_int(value, default):
    try:
        return int(str(value).strip())
    except Exception:
        return default


_FILL_TARGET_LIMIT = max(1, _safe_int(os.environ.get("ABUTS_FILL_TARGET_LIMIT", "3"), 3))


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
    try:
        if target.Geometry is not None:
            before_naked = _count_naked_edges(target.Geometry)
    except Exception:
        pass

    try:
        doc.Objects.UnselectAll()
    except Exception:
        pass

    try:
        target.Select(True)
    except Exception:
        pass

    # 1st: RhinoCommon API로 직접 홀 메우기 시도
    try:
        geom = target.Geometry
        if geom is not None:
            mesh_copy = geom.DuplicateMesh()
            if mesh_copy is not None:
                # 기본 FillHoles는 모든 홀을 시도하며 성공 시 True 반환
                rc_fill = mesh_copy.FillHoles()
                if rc_fill:
                    replaced = doc.Objects.Replace(target_id, mesh_copy)
                    log(
                        "FillMeshHoles (RhinoCommon) rc={} replaced={}".format(
                            rc_fill, replaced
                        )
                    )
                    if replaced:
                        after_naked = _count_naked_edges(mesh_copy)
                        log(
                            "after RC FillHoles nakedEdges(before->{})={}".format(
                                before_naked, after_naked
                            )
                        )
                        if (
                            before_naked is None
                            or after_naked is None
                            or after_naked < before_naked
                        ):
                            return True
    except Exception as e:
        log("FillMeshHoles RhinoCommon 예외: " + str(e))

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
        try:
            refreshed = doc.Objects.FindId(target_id)
            if refreshed and refreshed.Geometry is not None:
                after_naked = _count_naked_edges(refreshed.Geometry)
        except Exception:
            pass

        log(
            "after FillMeshHoles nakedEdges(before->{})={}".format(
                before_naked, after_naked
            )
        )

        if (
            before_naked is None
            or after_naked is None
            or after_naked < before_naked
        ):
            return True

    return False


def main(input_path_arg=None, output_path_arg=None, log_path_arg=None):
    if log_path_arg:
        os.environ["ABUTS_LOG_PATH"] = str(log_path_arg)

    input_path, output_path = _parse_args(sys.argv, input_path_arg, output_path_arg)

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
        owns_doc = True
    if doc is None:
        fail("Doc를 생성할 수 없습니다")

    try:
        log("start")
        log("input=" + input_path)
        log("output=" + output_path)

        # 기존 문서 정리 (ActiveDoc를 사용할 수 있으므로 안전하게 비우기)
        try:
            ids = [o.Id for o in list(doc.Objects)]
            for oid in ids:
                try:
                    doc.Objects.Delete(oid, True)
                except Exception:
                    pass
        except Exception:
            pass

        # STL Import (RhinoCommon)
        try:
            read_opts = Rhino.FileIO.FileStlReadOptions()
            # 메시 생성을 위한 최적의 옵션 설정 (필요한 경우)
            ok = Rhino.FileIO.FileStl.Read(str(input_path), doc, read_opts)
        except Exception as e:
            fail("STL Import 예외: " + str(e))

        if not ok:
            fail("STL Import 실패")

        log("import ok")

        # 문서 내 Mesh 수집
        mesh_obj_refs = []
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
            mesh_obj_refs.append(obj)

        if not mesh_obj_refs:
            fail("Import 후 Mesh가 없습니다")

        log("mesh objects after import=" + str(len(mesh_obj_refs)))

        # 1) Explode: RhinoCommon API를 사용하여 고속 처리
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
            piece_ids = [o.Id for o in list(doc.Objects) if o.ObjectType == Rhino.DocObjects.ObjectType.Mesh]

        # 2) 홀메우기 대상 조각 선택
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
        log("total candidates={} open_candidates={} tol={}".format(
            len(candidates),
            len(open_candidates),
            tol,
        ))

        fill_targets = open_candidates if open_candidates else candidates
        fill_targets = [c for c in fill_targets if c.get("id")]
        if not fill_targets:
            fail("FillMeshHoles 대상 Mesh 목록을 만들지 못했습니다")

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
            filled = _run_fill_mesh_holes(doc, oid)
            if not filled:
                log("FillMeshHoles 결과 변화 없음 (id={})".format(oid))
            else:
                log("FillMeshHoles 성공 감지 (id={})".format(oid))

        # 최신 Mesh 목록으로 갱신 (Fill 과정에서 Replace가 발생했으므로)
        try:
            piece_ids = [
                o.Id
                for o in doc.Objects
                if o.ObjectType == Rhino.DocObjects.ObjectType.Mesh
            ]
        except Exception:
            piece_ids = []

        # 4) Join (RhinoCommon API 사용)
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
                merged = Rhino.Geometry.Mesh.CreateFromMerge(meshes, tol or 0.01, True)

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
                log("Join (RhinoCommon) ok")
            else:
                log("Join (RhinoCommon) skipped: merged mesh unavailable")
        except Exception as e:
            log("Join (RhinoCommon) failed: " + str(e))
            Rhino.RhinoApp.RunScript("!_-Join _Enter", True)

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

        try:
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

            # STL Export 최적화: RhinoCommon Write 직접 시도
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

            # Rhino 8/Net 7 환경에서 FileStl.Write(String, list, opts) 호출 시
            # TypeError: 'list' value cannot be converted to Rhino.RhinoDoc 에러가 발생하는 경우가 있음.
            # 가장 확실한 호환 오버로드인 FileStl.Write(String, RhinoDoc, opts) 사용을 위해 doc을 직접 전달.
            ok = Rhino.FileIO.FileStl.Write(str(output_path), doc, write_opts)
            
            if not ok:
                # Fallback: RunScript (오버헤드가 크지만 최후의 수단)
                for retry in range(2):
                    try:
                        if os.path.exists(output_path):
                            try: os.unlink(output_path)
                            except: pass

                        # Rhino.FileIO.FileStl.Write가 실패할 경우에만 RunScript 사용
                        # RunScript 이전에 ActiveDoc을 확실히 가져오고 선택 해제
                        doc = Rhino.RhinoDoc.ActiveDoc
                        if doc:
                            doc.Objects.UnselectAll()
                            # 전체 선택 후 Export 시도
                            Rhino.RhinoApp.RunScript("!_SelAll", True)
                        
                        cmd = '-_Export "{}" _Enter _Enter'.format(str(output_path))
                        log("RunScript=" + cmd)
                        ok_cmd = Rhino.RhinoApp.RunScript(cmd, True)
                        log("Export command ok=" + str(ok_cmd))
                        
                        # 파일 생성 즉시 감지 (폴링 간격 단축)
                        for _ in range(100):
                            if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
                                ok = True
                                break
                            import time
                            time.sleep(0.02)
                        
                        if ok: break
                    except Exception as e:
                        log("Export retry error: " + str(e))
                        pass

            try:
                ok = os.path.exists(output_path) and os.path.getsize(output_path) > 0
            except Exception:
                ok = False
        except Exception as e:
            fail("STL Export 예외: " + str(e))

        if not ok:
            fail("STL Export 실패")

        try:
            max_d, conn_d = analyze_diameters(doc)
            log("DIAMETER_RESULT:max={} conn={}".format(max_d, conn_d))
        except Exception as e:
            log("Analysis failed: " + str(e))

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
