import Rhino


def analyze_diameters(doc):
    max_r = 0.0
    conn_r = 0.0

    for o in doc.Objects:
        if o.ObjectType == Rhino.DocObjects.ObjectType.Mesh:
            g = o.Geometry
            if g and g.Vertices:
                for v in g.Vertices:
                    r = (v.X * v.X + v.Y * v.Y) ** 0.5
                    if r > max_r:
                        max_r = r

    for o in doc.Objects:
        if o.ObjectType == Rhino.DocObjects.ObjectType.Mesh:
            g = o.Geometry
            if not g:
                continue
            for face in g.Faces:
                v1 = g.Vertices[face.A]
                v2 = g.Vertices[face.B]
                v3 = g.Vertices[face.C]

                for pa, pb in ((v1, v2), (v2, v3), (v3, v1)):
                    if (pa.Z > 0 and pb.Z < 0) or (pa.Z < 0 and pb.Z > 0):
                        denom = abs(pa.Z - pb.Z)
                        if denom == 0:
                            continue
                        t = abs(pa.Z) / denom
                        ix = pa.X + t * (pb.X - pa.X)
                        iy = pa.Y + t * (pb.Y - pa.Y)
                        ir = (ix * ix + iy * iy) ** 0.5
                        if ir > conn_r:
                            conn_r = ir

    if conn_r == 0.0:
        conn_r = max_r

    return round(max_r * 2, 2), round(conn_r * 2, 2)
