"""
STL 모델 자동 정렬 스크립트

목표:
1. 커넥션 회전체의 외부 원 중심을 XY 원점(0,0)으로 이동
2. 외부 직경이 3.33mm가 되는 Z 높이로 모델 이동
3. Face 기반 intersection 사용

사용법:
    python align_stl_to_origin.py <input.stl> <output.stl>
"""

import Rhino
import Rhino.Geometry as rg
import scriptcontext as sc
import sys
import math


def find_connection_circle_center(mesh, z_height):
    """
    주어진 Z 높이에서 메시와 평면의 교차점을 찾아 원의 중심을 계산
    
    Args:
        mesh: Rhino Mesh 객체
        z_height: Z 평면 높이
        
    Returns:
        (center_x, center_y, radius) 또는 None
    """
    # Z 평면 생성
    plane = rg.Plane(rg.Point3d(0, 0, z_height), rg.Vector3d(0, 0, 1))
    
    # 메시와 평면의 교차선 계산
    polylines = rg.Intersect.Intersection.MeshPlane(mesh, plane)
    
    if not polylines or len(polylines) == 0:
        return None
    
    # 가장 긴 폴리라인 선택 (외부 윤곽)
    longest_polyline = max(polylines, key=lambda pl: pl.Length)
    
    # 폴리라인의 모든 점을 수집
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
    
    # 이진 탐색
    iterations = 0
    max_iterations = 50
    
    while iterations < max_iterations and (z_max - z_min) > 0.001:
        z_mid = (z_min + z_max) / 2.0
        result = find_connection_circle_center(mesh, z_mid)
        
        if result is None:
            # 교차점이 없으면 더 아래로
            z_max = z_mid
            iterations += 1
            continue
        
        center_x, center_y, radius = result
        
        # 반지름 차이 확인
        diff = abs(radius - target_radius)
        
        if diff < tolerance:
            return z_mid
        
        # 반지름이 목표보다 크면 위로, 작으면 아래로
        if radius > target_radius:
            z_min = z_mid
        else:
            z_max = z_mid
        
        iterations += 1
    
    # 최종 중간값 반환
    return (z_min + z_max) / 2.0


def align_stl_to_origin(input_path, output_path):
    """
    STL 파일을 로드하여 원점에 정렬하고 저장
    
    Args:
        input_path: 입력 STL 파일 경로
        output_path: 출력 STL 파일 경로
        
    Returns:
        성공 여부
    """
    # STL 로드
    mesh = rg.Mesh()
    success = mesh.Read(input_path)
    
    if not success or mesh.Vertices.Count == 0:
        print(f"ERROR: Failed to load STL file: {input_path}")
        return False
    
    print(f"Loaded mesh: {mesh.Vertices.Count} vertices, {mesh.Faces.Count} faces")
    
    # 메시 bbox 확인
    bbox = mesh.GetBoundingBox(True)
    z_min = bbox.Min.Z
    z_max = bbox.Max.Z
    
    print(f"Mesh Z range: {z_min:.2f} to {z_max:.2f}")
    
    # 1단계: 외부 직경 3.33mm가 되는 Z 높이 찾기
    target_diameter = 3.33
    print(f"Finding Z height for diameter {target_diameter}mm...")
    
    z_target = find_z_for_diameter(mesh, target_diameter, z_min, z_max)
    
    if z_target is None:
        print("ERROR: Could not find Z height for target diameter")
        return False
    
    print(f"Found Z height: {z_target:.3f}mm")
    
    # 2단계: 해당 Z 높이에서 원의 중심 찾기
    result = find_connection_circle_center(mesh, z_target)
    
    if result is None:
        print("ERROR: Could not find circle center at target Z height")
        return False
    
    center_x, center_y, radius = result
    print(f"Circle center: ({center_x:.3f}, {center_y:.3f}), radius: {radius:.3f}mm")
    print(f"Calculated diameter: {radius * 2:.3f}mm")
    
    # 3단계: 평행 이동 벡터 계산
    # - XY 평면: 원의 중심을 (0, 0)으로
    # - Z축: z_target을 0으로
    translation = rg.Vector3d(-center_x, -center_y, -z_target)
    
    print(f"Translation vector: ({translation.X:.3f}, {translation.Y:.3f}, {translation.Z:.3f})")
    
    # 4단계: 메시 이동
    mesh.Translate(translation)
    
    # 5단계: 결과 저장
    success = mesh.Write(output_path)
    
    if not success:
        print(f"ERROR: Failed to write STL file: {output_path}")
        return False
    
    print(f"Successfully aligned and saved to: {output_path}")
    
    # 최종 bbox 확인
    final_bbox = mesh.GetBoundingBox(True)
    print(f"Final bbox: X[{final_bbox.Min.X:.2f}, {final_bbox.Max.X:.2f}] "
          f"Y[{final_bbox.Min.Y:.2f}, {final_bbox.Max.Y:.2f}] "
          f"Z[{final_bbox.Min.Z:.2f}, {final_bbox.Max.Z:.2f}]")
    
    return True


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python align_stl_to_origin.py <input.stl> <output.stl>")
        sys.exit(1)
    
    input_file = sys.argv[1]
    output_file = sys.argv[2]
    
    success = align_stl_to_origin(input_file, output_file)
    
    sys.exit(0 if success else 1)
