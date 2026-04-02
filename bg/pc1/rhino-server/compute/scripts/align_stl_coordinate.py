#! python3
"""
STL 좌표계 자동 정렬 스크립트 (Rhino 내부 실행용)

목표:
1. 커넥션 회전체의 외부 원 중심을 XY 원점(0,0)으로 이동
2. 외부 직경이 3.33mm가 되는 Z 높이를 Z=0으로 이동
3. Face 기반 intersection 사용

실행 방법:
    Rhino에서 RunPythonScript 명령으로 실행
    또는 rhino.compute를 통해 실행
"""

import Rhino
import Rhino.Geometry as rg
import scriptcontext as sc
import math


def find_circle_at_z(mesh, z_height):
    """
    주어진 Z 높이에서 메시와 평면의 교차점을 찾아 원의 중심과 반지름 계산
    
    Args:
        mesh: Rhino Mesh 객체
        z_height: Z 평면 높이
        
    Returns:
        (center_x, center_y, radius) 또는 None
    """
    plane = rg.Plane(rg.Point3d(0, 0, z_height), rg.Vector3d(0, 0, 1))
    polylines = rg.Intersect.Intersection.MeshPlane(mesh, plane)
    
    if not polylines or len(polylines) == 0:
        return None
    
    # 가장 긴 폴리라인 선택 (외부 윤곽)
    longest_polyline = max(polylines, key=lambda pl: pl.Length)
    
    # 폴리라인의 모든 점 수집
    points = []
    for i in range(longest_polyline.Count):
        pt = longest_polyline[i]
        points.append((pt.X, pt.Y))
    
    if len(points) < 3:
        return None
    
    # 원의 중심 계산 (평균)
    center_x = sum(p[0] for p in points) / len(points)
    center_y = sum(p[1] for p in points) / len(points)
    
    # 반지름 계산 (중심에서 가장 먼 점까지의 거리)
    max_radius = 0
    for px, py in points:
        r = math.sqrt((px - center_x)**2 + (py - center_y)**2)
        if r > max_radius:
            max_radius = r
    
    return (center_x, center_y, max_radius)


def find_z_for_diameter(mesh, target_diameter, z_min, z_max, tolerance=0.01):
    """
    외부 직경이 target_diameter가 되는 Z 높이를 이진 탐색으로 찾기
    
    Args:
        mesh: Rhino Mesh 객체
        target_diameter: 목표 직경 (mm)
        z_min: 탐색 시작 Z
        z_max: 탐색 종료 Z
        tolerance: 허용 오차 (mm)
        
    Returns:
        Z 높이 또는 None
    """
    target_radius = target_diameter / 2.0
    iterations = 0
    max_iterations = 50
    
    while iterations < max_iterations and (z_max - z_min) > 0.001:
        z_mid = (z_min + z_max) / 2.0
        result = find_circle_at_z(mesh, z_mid)
        
        if result is None:
            z_max = z_mid
            iterations += 1
            continue
        
        center_x, center_y, radius = result
        diff = abs(radius - target_radius)
        
        if diff < tolerance:
            return z_mid
        
        if radius > target_radius:
            z_min = z_mid
        else:
            z_max = z_mid
        
        iterations += 1
    
    return (z_min + z_max) / 2.0


def align_mesh_to_origin(mesh, target_diameter=3.33):
    """
    메시를 원점에 정렬
    
    Args:
        mesh: Rhino Mesh 객체
        target_diameter: 커넥션 외부 직경 (mm)
        
    Returns:
        (success, message, translation_vector)
    """
    bbox = mesh.GetBoundingBox(True)
    z_min = bbox.Min.Z
    z_max = bbox.Max.Z
    
    print(f"[align] Mesh Z range: {z_min:.2f} to {z_max:.2f}")
    
    # 1단계: 외부 직경 3.33mm가 되는 Z 높이 찾기
    z_target = find_z_for_diameter(mesh, target_diameter, z_min, z_max)
    
    if z_target is None:
        return (False, "Could not find Z height for target diameter", None)
    
    print(f"[align] Found Z height: {z_target:.3f}mm")
    
    # 2단계: 해당 Z 높이에서 원의 중심 찾기
    result = find_circle_at_z(mesh, z_target)
    
    if result is None:
        return (False, "Could not find circle center at target Z height", None)
    
    center_x, center_y, radius = result
    print(f"[align] Circle center: ({center_x:.3f}, {center_y:.3f}), radius: {radius:.3f}mm")
    print(f"[align] Calculated diameter: {radius * 2:.3f}mm")
    
    # 3단계: 평행 이동 벡터 계산
    translation = rg.Vector3d(-center_x, -center_y, -z_target)
    print(f"[align] Translation: ({translation.X:.3f}, {translation.Y:.3f}, {translation.Z:.3f})")
    
    # 4단계: 메시 이동
    mesh.Translate(translation)
    
    final_bbox = mesh.GetBoundingBox(True)
    print(f"[align] Final bbox: X[{final_bbox.Min.X:.2f}, {final_bbox.Max.X:.2f}] "
          f"Y[{final_bbox.Min.Y:.2f}, {final_bbox.Max.Y:.2f}] "
          f"Z[{final_bbox.Min.Z:.2f}, {final_bbox.Max.Z:.2f}]")
    
    return (True, "Successfully aligned", translation)


# Rhino.Compute 또는 스크립트 실행 시 사용할 메인 함수
def main(input_path, output_path):
    """
    STL 파일을 로드하여 정렬하고 저장
    
    Args:
        input_path: 입력 STL 파일 경로
        output_path: 출력 STL 파일 경로
        
    Returns:
        성공 여부
    """
    mesh = rg.Mesh()
    success = mesh.Read(input_path)
    
    if not success or mesh.Vertices.Count == 0:
        print(f"ERROR: Failed to load STL: {input_path}")
        return False
    
    print(f"[align] Loaded: {mesh.Vertices.Count} vertices, {mesh.Faces.Count} faces")
    
    success, message, translation = align_mesh_to_origin(mesh)
    
    if not success:
        print(f"ERROR: {message}")
        return False
    
    success = mesh.Write(output_path)
    
    if not success:
        print(f"ERROR: Failed to write STL: {output_path}")
        return False
    
    print(f"[align] Saved to: {output_path}")
    return True


if __name__ == "__main__" and "rhinoscript" not in __name__.lower():
    import sys
    if len(sys.argv) == 3:
        input_file = sys.argv[1]
        output_file = sys.argv[2]
        success = main(input_file, output_file)
        sys.exit(0 if success else 1)
