"""Measure maximum horizontal distance (radius) from the Z-axis for the main mesh.

이 스크립트는 활성 Rhino 문서에서 가장 큰 Mesh를 선택한 뒤,
지정된 높이 비율 구간 안에서 XY 평면 반경(r = √(x² + y²))이
가장 큰 버텍스를 찾아줍니다. 측정 결과는 콘솔에 출력되고,
원점(Z축)에서 해당 포인트까지의 선, 텍스트 도트, 작은 구를
문서에 추가하여 시각화합니다.
"""

from __future__ import annotations

import math
from typing import List, Optional, Sequence, Tuple

import Rhino
import Rhino.Commands as rc
import Rhino.DocObjects as rdo
import Rhino.Display as rdisplay
import Rhino.Geometry as rg
import Rhino.Input as ri
import Rhino.Input.Custom as ric
import System.Drawing as drawing

_LOW_RATIO = 0.2
_HIGH_RATIO = 0.8


def _get_active_doc(doc: Optional[Rhino.RhinoDoc] = None) -> Rhino.RhinoDoc:
    doc = doc or Rhino.RhinoDoc.ActiveDoc
    if doc is None:
        raise RuntimeError("활성 Rhino 문서를 찾을 수 없습니다")
    return doc


def _collect_mesh_objects(doc: Rhino.RhinoDoc) -> List[rdo.MeshObject]:
    meshes: List[rdo.MeshObject] = []
    for obj in doc.Objects:
        if obj and obj.ObjectType == rdo.ObjectType.Mesh:
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
        raise RuntimeError("문서에 Mesh 객체가 없습니다")

    def weight(mesh_obj: rdo.MeshObject) -> float:
        geom = mesh_obj.Geometry
        if geom is None:
            return -1.0
        try:
            bbox = geom.GetBoundingBox(True)
            diag = bbox.Diagonal.Length
        except Exception:
            diag = 0.0
        return float(geom.Vertices.Count) + diag

    meshes.sort(key=weight, reverse=True)
    primary = meshes[0]
    geom = primary.Geometry
    if geom is None:
        raise RuntimeError("선택한 Mesh의 기하를 읽을 수 없습니다")
    return primary, geom


def _find_max_radius_point(mesh: rg.Mesh, low_ratio: float, high_ratio: float) -> Tuple[rg.Point3d, float]:
    bbox = mesh.GetBoundingBox(True)
    z_min = bbox.Min.Z
    z_max = bbox.Max.Z
    height = max(1e-6, z_max - z_min)
    low_z = z_min + height * max(0.0, min(1.0, low_ratio))
    high_z = z_min + height * max(0.0, min(1.0, high_ratio))
    if high_z < low_z:
        low_z, high_z = high_z, low_z

    best_pt: Optional[rg.Point3d] = None
    best_r = -1.0

    for vertex in mesh.Vertices:
        if not (low_z <= vertex.Z <= high_z):
            continue
        r = math.hypot(vertex.X, vertex.Y)
        if r > best_r:
            best_r = r
            best_pt = rg.Point3d(vertex)

    if best_pt is None:
        raise RuntimeError("선택된 Z 구간에서 버텍스를 찾을 수 없습니다")

    return best_pt, best_r


def _visualize(doc: Rhino.RhinoDoc, point: rg.Point3d, radius: float) -> List[str]:
    ids: List[str] = []
    base = rg.Point3d(0, 0, point.Z)
    line = rg.Line(base, point)
    line_id = doc.Objects.AddLine(line)
    ids.append(str(line_id))

    sphere_radius = max(0.05, min(0.5, radius * 0.05))
    sphere = rg.Sphere(point, sphere_radius)
    attrs = rdo.ObjectAttributes()
    attrs.ObjectColor = drawing.Color.FromArgb(0, 180, 255)
    attrs.ColorSource = rdo.ObjectColorSource.ColorFromObject
    sphere_id = doc.Objects.Add(sphere.ToBrep(), attrs)
    ids.append(str(sphere_id))

    dot_text = "r={:.3f}mm".format(radius)
    dot_attrs = rdo.ObjectAttributes()
    dot_attrs.ObjectColor = drawing.Color.FromArgb(255, 255, 255)
    dot_attrs.ColorSource = rdo.ObjectColorSource.ColorFromObject
    dot_id = doc.Objects.AddTextDot(dot_text, point, dot_attrs)
    ids.append(str(dot_id))

    doc.Views.Redraw()
    return ids


class _RadiusLabelConduit(rdisplay.DisplayConduit):
    def __init__(self, labels: Sequence[Tuple[rg.Point3d, str]]):
        super(_RadiusLabelConduit, self).__init__()
        self._labels = list(labels)

    def DrawForeground(self, e):
        for point, text in self._labels:
            e.Display.DrawDot(
                point,
                text,
                drawing.Color.FromArgb(40, 40, 40),
                drawing.Color.FromArgb(255, 255, 255),
            )


def _get_selected_control_point_locations(doc: Rhino.RhinoDoc) -> List[rg.Point3d]:
    selected: List[rg.Point3d] = []
    enum = doc.Objects.GetSelectedObjects(False, False)
    if enum is None:
        return selected
    for obj in enum:
        if isinstance(obj, rdo.GripObject):
            selected.append(obj.CurrentLocation)
    return selected


def _select_control_point_locations() -> List[rg.Point3d]:
    go = ric.GetObject()
    go.SetCommandPrompt("라벨링할 컨트롤 포인트를 선택하세요")
    go.GeometryFilter = rdo.ObjectType.Grip
    go.SubObjectSelect = True
    go.GroupSelect = False
    go.EnableHighlight(True)
    go.DeselectAllBeforePostSelect = False
    go.AcceptNothing(True)

    res = go.GetMultiple(1, 0)
    if res == rc.Result.Cancel or go.CommandResult() != rc.Result.Success:
        return []

    points: List[rg.Point3d] = []
    for idx in range(go.ObjectCount):
        obj_ref = go.Object(idx)
        rh_obj = obj_ref.Object()
        if isinstance(rh_obj, rdo.GripObject):
            points.append(rh_obj.CurrentLocation)
    return points


def label_selected_control_points(doc: Optional[Rhino.RhinoDoc] = None) -> List[Tuple[rg.Point3d, float]]:
    doc = _get_active_doc(doc)
    points = _get_selected_control_point_locations(doc)
    if not points:
        points = _select_control_point_locations()
    if not points:
        Rhino.RhinoApp.WriteLine("[max_r] 선택된 컨트롤 포인트가 없습니다.")
        return []

    labels: List[Tuple[rg.Point3d, str, float]] = []
    for idx, pt in enumerate(points, start=1):
        radius = math.hypot(pt.X, pt.Y)
        text = f"{idx}: {radius:.3f}mm"
        labels.append((pt, text, radius))

    conduit = _RadiusLabelConduit([(pt, text) for pt, text, _ in labels])
    conduit.Enabled = True
    doc.Views.Redraw()

    try:
        for idx, (pt, _, radius) in enumerate(labels, start=1):
            Rhino.RhinoApp.WriteLine(
                "[max_r] #{:02d} r={:.3f}mm (x={:.3f}, y={:.3f}, z={:.3f})".format(
                    idx, radius, pt.X, pt.Y, pt.Z
                )
            )
        ri.RhinoGet.GetString("프리뷰를 종료하려면 Enter", True, "")
    finally:
        conduit.Enabled = False
        doc.Views.Redraw()

    doc.Objects.UnselectAll()
    doc.Views.Redraw()

    return [(pt, radius) for pt, _, radius in labels]


def measure_max_radius(
    doc: Optional[Rhino.RhinoDoc] = None,
    mesh_id=None,
    low_ratio: float = _LOW_RATIO,
    high_ratio: float = _HIGH_RATIO,
    visualize: bool = True,
) -> dict:
    doc = _get_active_doc(doc)
    mesh_obj, mesh_geom = _pick_primary_mesh(doc, mesh_id)
    mesh_copy = mesh_geom.DuplicateMesh()
    if mesh_copy is None:
        raise RuntimeError("Mesh를 복제할 수 없습니다")

    point, radius = _find_max_radius_point(mesh_copy, low_ratio, high_ratio)

    viz_ids: List[str] = []
    if visualize:
        viz_ids = _visualize(doc, point, radius)

    return {
        "mesh_object_id": mesh_obj.Id,
        "point": point,
        "radius": radius,
        "z_ratio_range": (low_ratio, high_ratio),
        "visualization": viz_ids,
    }


def main():
    doc = _get_active_doc()
    labeled = label_selected_control_points(doc)
    if labeled:
        return

    result = measure_max_radius(doc=doc)
    print(
        "[max_r] mesh={} radius={:.3f}mm point=({}, {}, {}) z_ratio={}".format(
            result["mesh_object_id"],
            result["radius"],
            round(result["point"].X, 3),
            round(result["point"].Y, 3),
            round(result["point"].Z, 3),
            result["z_ratio_range"],
        )
    )


if __name__ == "__main__":
    main()