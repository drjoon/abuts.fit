import os
import sys

# Rhino Python 환경에서 실행된다고 가정
import Rhino
import Rhino.FileIO


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

        try:
            for i, obj in enumerate(mesh_obj_refs):
                g = obj.Geometry
                if g is None:
                    continue
                vcount = None
                fcount = None
                is_closed = None
                is_manifold = None
                naked = None
                try:
                    vcount = g.Vertices.Count
                except Exception:
                    pass
                try:
                    fcount = g.Faces.Count
                except Exception:
                    pass
                try:
                    is_closed = g.IsClosed
                except Exception:
                    pass
                try:
                    is_manifold = g.IsManifold(True)
                except Exception:
                    pass
                try:
                    naked = _count_naked_edges(g)
                except Exception:
                    pass
                log(
                    "mesh[{}] v={} f={} closed={} manifold={} nakedEdges={}".format(
                        i,
                        vcount,
                        fcount,
                        is_closed,
                        is_manifold,
                        naked,
                    )
                )
        except Exception as e:
            log("mesh summary log failed: " + str(e))

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
        try:
            cand_sorted = sorted(
                candidates,
                key=lambda x: (
                    1 if (x.get("naked") or 0) > 0 else 0,
                    float(x.get("r") or 0),
                    float(x.get("maxZ") or 0),
                ),
                reverse=True,
            )
            for i, c in enumerate(cand_sorted[:12]):
                log(
                    "candidate[{}] id={} r={} maxZ={} nakedEdges={}".format(
                        i,
                        c.get("id"),
                        c.get("r"),
                        c.get("maxZ"),
                        c.get("naked"),
                    )
                )
        except Exception:
            pass

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

        # 선택 초기화
        try:
            for o in doc.Objects:
                try:
                    o.Select(False)
                except Exception:
                    pass
        except Exception:
            pass

        # 3) FillMeshHoles 실행 (라이노 커맨드 사용)
        target = doc.Objects.FindId(best_id)
        if target is None:
            fail("대상 Mesh를 찾지 못했습니다")

        try:
            target.Select(True)
            cmd = "!_-FillMeshHoles _Enter"
            log("RunScript=" + cmd)
            ok_cmd = Rhino.RhinoApp.RunScript(cmd, True)
            log("FillMeshHoles command ok=" + str(ok_cmd))
        except Exception as e:
            log("FillMeshHoles 커맨드 실행 예외: " + str(e))

        try:
            after_obj = doc.Objects.FindId(best_id)
        except Exception:
            after_obj = None
        after_naked = None
        try:
            if after_obj is not None and after_obj.Geometry is not None:
                after_naked = _count_naked_edges(after_obj.Geometry)
        except Exception:
            pass
        log("after FillMeshHoles nakedEdges=" + str(after_naked))

        # 4) Join (RhinoCommon API 사용)
        if piece_ids and len(piece_ids) > 1:
            try:
                # 개별 메쉬들을 하나로 합침
                joined_mesh = Rhino.Geometry.Mesh()
                for oid in piece_ids:
                    o = doc.Objects.FindId(oid)
                    if o and o.Geometry:
                        joined_mesh.Append(o.Geometry)
                        doc.Objects.Delete(oid, True)
                
                # 중복된 정점들을 합쳐서 메모리 및 성능 최적화
                joined_mesh.Vertices.CombineIdentical(True, True)
                joined_mesh.Faces.RedundantFaces()
                
                doc.Objects.AddMesh(joined_mesh)
                log("Join (RhinoCommon) ok")
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
                Rhino.RhinoApp.RunScript("!_-SelAll _Enter", True)
            except Exception:
                pass

            # STL Export 최적화: RhinoCommon Write 직접 시도
            write_opts = Rhino.FileIO.FileStlWriteOptions()
            write_opts.FileType = Rhino.FileIO.FileStlType.Binary
            try:
                if hasattr(write_opts, "ExportSelectedObjectsOnly"):
                    write_opts.ExportSelectedObjectsOnly = False
            except Exception:
                pass

            # 전체 객체를 리스트로 전달하여 Write (가장 빠름)
            all_meshes = []
            for o in doc.Objects:
                if o.ObjectType == Rhino.DocObjects.ObjectType.Mesh:
                    all_meshes.append(o.Geometry)
            
            if all_meshes:
                ok = Rhino.FileIO.FileStl.Write(str(output_path), all_meshes, write_opts)
            else:
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

        # 5) 분석 (직경 추출)
        max_r = 0.0
        conn_r = 0.0
        try:
            # 1. 최대 직경 (전체 Mesh 기준)
            for o in doc.Objects:
                if o.ObjectType == Rhino.DocObjects.ObjectType.Mesh:
                    g = o.Geometry
                    if g and g.Vertices:
                        for v in g.Vertices:
                            r = (v.X**2 + v.Y**2)**0.5
                            if r > max_r: max_r = r
            
            # 2. 커넥션 직경 (Z=0 평면 교차점 기준)
            # STL이 원점에 정렬되어 있다고 가정 (Z=0이 커넥션 위치)
            for o in doc.Objects:
                if o.ObjectType == Rhino.DocObjects.ObjectType.Mesh:
                    g = o.Geometry
                    if not g: continue
                    for face in g.Faces:
                        v1 = g.Vertices[face.A]
                        v2 = g.Vertices[face.B]
                        v3 = g.Vertices[face.C]
                        
                        # 각 변에 대해 Z=0 교차점 체크
                        for pa, pb in [(v1, v2), (v2, v3), (v3, v1)]:
                            if (pa.Z > 0 and pb.Z < 0) or (pa.Z < 0 and pb.Z > 0):
                                t = abs(pa.Z) / abs(pa.Z - pb.Z)
                                ix = pa.X + t * (pb.X - pa.X)
                                iy = pa.Y + t * (pb.Y - pa.Y)
                                ir = (ix**2 + iy**2)**0.5
                                if ir > conn_r: conn_r = ir
            
            if conn_r == 0: conn_r = max_r
            log("DIAMETER_RESULT:max={} conn={}".format(round(max_r*2, 2), round(conn_r*2, 2)))
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

    print("OK")


if __name__ == "__main__":
    main()
