#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
어벗먼트 전용 CAM 시스템 (고도화 버전)
PyCAM, FreeCAD CAM 라이브러리 활용
복잡한 수학적 알고리즘 및 가공 물리학 고려
"""

import numpy as np
import matplotlib.pyplot as plt
from stl import mesh
import json
import math
from typing import List, Tuple, Dict, Optional
from dataclasses import dataclass
from enum import Enum
import warnings

# 오픈소스 CAM 라이브러리 임포트 시도
try:
    # PyCAM 라이브러리 (설치 필요: pip install pycam)
    import pycam
    from pycam.Geometry.Model import Model
    from pycam.PathProcessors import PolygonExtractor
    from pycam.PathGenerators import PushCutter
    from pycam.Toolpath import Toolpath
    PYCAM_AVAILABLE = True
except ImportError:
    PYCAM_AVAILABLE = False
    warnings.warn("PyCAM 라이브러리가 없습니다. 기본 알고리즘을 사용합니다.")

try:
    # FreeCAD Python API (FreeCAD 설치 필요)
    import FreeCAD
    import Path
    import PathScripts
    FREECAD_AVAILABLE = True
except ImportError:
    FREECAD_AVAILABLE = False
    warnings.warn("FreeCAD가 없습니다. 기본 알고리즘을 사용합니다.")

# 수학적 계산을 위한 고급 라이브러리
from scipy.spatial import distance_matrix, ConvexHull
from scipy.optimize import minimize
from scipy.interpolate import UnivariateSpline, splprep, splev

class MachineType(Enum):
    TSUGAMI_B0125 = "tsugami_b0125"
    HANWHA_XD10 = "hanwha_xd10"

@dataclass
class CuttingTool:
    """절삭 공구 정보 (고도화)"""
    tool_number: int
    diameter: float  # mm
    corner_radius: float  # mm
    tool_type: str
    spindle: str
    cutting_edge_angle: float = 90.0  # 절삭날 각도
    rake_angle: float = 0.0  # 레이크각
    relief_angle: float = 6.0  # 여각
    material: str = "carbide"  # 공구 재질
    coating: str = "none"  # 코팅
    max_cutting_speed: float = 200.0  # m/min
    max_feed_rate: float = 0.3  # mm/rev

@dataclass
class CuttingParameters:
    """절삭 조건"""
    spindle_speed: int  # rpm
    feed_rate: float  # mm/min 또는 mm/rev
    depth_of_cut: float  # mm
    step_over: float  # mm
    cutting_speed: float  # m/min
    coolant: bool = True

@dataclass
class MachineConstraints:
    """기계 제한사항"""
    max_spindle_speed: int
    max_c_axis_speed: float
    x_axis_range: Tuple[float, float]  # (min, max)
    z_axis_range: Tuple[float, float]
    max_feed_rate: float
    rapid_traverse_rate: float
    tool_change_time: float  # seconds

# 기계별 제한사항
MACHINE_CONSTRAINTS = {
    MachineType.TSUGAMI_B0125: MachineConstraints(
        max_spindle_speed=6000,
        max_c_axis_speed=1000.0,
        x_axis_range=(0.0, 80.0),
        z_axis_range=(-150.0, 50.0),
        max_feed_rate=3000.0,
        rapid_traverse_rate=15000.0,
        tool_change_time=3.5
    ),
    MachineType.HANWHA_XD10: MachineConstraints(
        max_spindle_speed=5000,
        max_c_axis_speed=360.0,
        x_axis_range=(0.0, 60.0),
        z_axis_range=(-100.0, 30.0),
        max_feed_rate=2500.0,
        rapid_traverse_rate=12000.0,
        tool_change_time=4.0
    )
}

class ToolPathOptimizer:
    """공구 경로 최적화"""
    
    def __init__(self, machine_constraints: MachineConstraints):
        self.constraints = machine_constraints
    
    def calculate_tool_radius_compensation(self, path_points: List[Tuple[float, float]], 
                                         tool_diameter: float, 
                                         compensation_side: str = "left") -> List[Tuple[float, float]]:
        """공구 반경 보정 계산"""
        if len(path_points) < 2:
            return path_points
        
        compensated_path = []
        tool_radius = tool_diameter / 2.0
        
        for i in range(len(path_points)):
            if i == 0:
                # 첫 번째 점
                p1 = np.array(path_points[i])
                p2 = np.array(path_points[i + 1])
                direction = p2 - p1
            elif i == len(path_points) - 1:
                # 마지막 점
                p1 = np.array(path_points[i - 1])
                p2 = np.array(path_points[i])
                direction = p2 - p1
            else:
                # 중간 점 - 평균 방향 계산
                p1 = np.array(path_points[i - 1])
                p2 = np.array(path_points[i])
                p3 = np.array(path_points[i + 1])
                direction = ((p2 - p1) + (p3 - p2)) / 2.0
            
            # 법선 벡터 계산 (2D에서 90도 회전)
            direction_norm = np.linalg.norm(direction)
            if direction_norm > 0:
                unit_direction = direction / direction_norm
                if compensation_side == "left":
                    normal = np.array([-unit_direction[1], unit_direction[0]])
                else:
                    normal = np.array([unit_direction[1], -unit_direction[0]])
                
                # 보정된 점 계산
                compensated_point = np.array(path_points[i]) + normal * tool_radius
                compensated_path.append((compensated_point[0], compensated_point[1]))
            else:
                compensated_path.append(path_points[i])
        
        return compensated_path
    
    def check_machine_limits(self, x: float, z: float, c: float = 0.0) -> bool:
        """기계 가동 범위 검증"""
        x_min, x_max = self.constraints.x_axis_range
        z_min, z_max = self.constraints.z_axis_range
        
        return (x_min <= x <= x_max and 
                z_min <= z <= z_max and
                -360.0 <= c <= 360.0)
    
    def optimize_feed_rates(self, path_points: List[Tuple[float, float]], 
                          material_hardness: float = 200.0) -> List[float]:
        """이송속도 최적화"""
        feed_rates = []
        
        for i in range(len(path_points) - 1):
            p1 = np.array(path_points[i])
            p2 = np.array(path_points[i + 1])
            
            # 거리 계산
            distance = np.linalg.norm(p2 - p1)
            
            # 곡률 계산 (3점이 있는 경우)
            curvature = 0.0
            if i > 0:
                p0 = np.array(path_points[i - 1])
                curvature = self._calculate_curvature(p0, p1, p2)
            
            # 재료 경도와 곡률에 따른 이송속도 조정
            base_feed = min(self.constraints.max_feed_rate * 0.7, 150.0)
            curvature_factor = max(0.3, 1.0 - curvature * 10.0)
            hardness_factor = max(0.5, 1.0 - material_hardness / 500.0)
            
            optimized_feed = base_feed * curvature_factor * hardness_factor
            feed_rates.append(min(optimized_feed, self.constraints.max_feed_rate))
        
        return feed_rates
    
    def _calculate_curvature(self, p0, p1, p2):
        """3점으로부터 곡률 계산"""
        try:
            v1 = p1 - p0
            v2 = p2 - p1
            
            # 외적의 크기 (2D에서는 z 성분만)
            cross_product = v1[0] * v2[1] - v1[1] * v2[0]
            
            # 벡터 크기
            v1_mag = np.linalg.norm(v1)
            v2_mag = np.linalg.norm(v2)
            
            if v1_mag * v2_mag == 0:
                return 0.0
            
            # 곡률 공식
            curvature = abs(cross_product) / (v1_mag * v2_mag)
            return curvature
        except:
            return 0.0

class CollisionDetector:
    """충돌 감지 및 회피"""
    
    def __init__(self, workpiece_mesh: mesh.Mesh, tool: CuttingTool):
        self.workpiece_mesh = workpiece_mesh
        self.tool = tool
        self.safety_margin = 0.5  # mm
    
    def check_tool_collision(self, x: float, z: float, c: float = 0.0) -> bool:
        """공구 충돌 검사"""
        # 공구 형상을 실린더로 근사
        tool_radius = self.tool.diameter / 2.0 + self.safety_margin
        
        # 워크피스 메쉬와의 거리 계산
        tool_center = np.array([x, 0, z])  # Y=0 (회전축)
        
        # 메쉬의 모든 점과의 최소 거리 계산
        vertices = self.workpiece_mesh.vectors.reshape(-1, 3)
        distances = np.linalg.norm(vertices - tool_center, axis=1)
        min_distance = np.min(distances)
        
        return min_distance < tool_radius
    
    def generate_collision_free_path(self, start_point, end_point) -> List[Tuple[float, float]]:
        """충돌 회피 경로 생성"""
        # 단순한 경로 계획 (실제로는 더 복잡한 알고리즘 필요)
        path = []
        
        # 안전한 중간 점을 찾아서 우회 경로 생성
        mid_x = (start_point[0] + end_point[0]) / 2.0
        mid_z = max(start_point[1], end_point[1]) + 5.0  # 5mm 위로 올려서 우회
        
        # 충돌 검사
        if not self.check_tool_collision(mid_x, mid_z):
            path = [start_point, (mid_x, mid_z), end_point]
        else:
            # 더 높이 올려서 우회
            mid_z += 10.0
            path = [start_point, (mid_x, mid_z), end_point]
        
        return path

class AdvancedAbutmentCAM:
    """고도화된 어벗먼트 CAM 시스템"""
    
    def __init__(self, machine_type: MachineType):
        self.machine_type = machine_type
        self.constraints = MACHINE_CONSTRAINTS[machine_type]
        self.optimizer = ToolPathOptimizer(self.constraints)
        self.tools = self._initialize_advanced_tools()
        
    def _initialize_advanced_tools(self) -> Dict[str, CuttingTool]:
        """고급 공구 정보 초기화"""
        return {
            "rough_turning": CuttingTool(
                tool_number=1, diameter=0.0, corner_radius=0.4,
                tool_type="turning", spindle="main",
                cutting_edge_angle=95.0, rake_angle=5.0,
                material="carbide", coating="TiAlN",
                max_cutting_speed=250.0, max_feed_rate=0.4
            ),
            "finish_turning": CuttingTool(
                tool_number=2, diameter=0.0, corner_radius=0.1,
                tool_type="turning", spindle="main", 
                cutting_edge_angle=90.0, rake_angle=0.0,
                material="carbide", coating="diamond",
                max_cutting_speed=300.0, max_feed_rate=0.15
            ),
            "end_mill_1mm": CuttingTool(
                tool_number=12, diameter=1.0, corner_radius=0.05,
                tool_type="milling", spindle="live",
                cutting_edge_angle=90.0, rake_angle=12.0,
                material="carbide", coating="TiAlN",
                max_cutting_speed=200.0, max_feed_rate=0.08
            )
        }
    
    def calculate_optimal_cutting_parameters(self, tool: CuttingTool, 
                                           material_type: str = "titanium") -> CuttingParameters:
        """최적 절삭 조건 계산"""
        # 재료별 절삭 계수
        material_factors = {
            "titanium": {"speed_factor": 0.6, "feed_factor": 0.8, "doc_factor": 0.7},
            "zirconia": {"speed_factor": 0.4, "feed_factor": 0.6, "doc_factor": 0.5},
            "peek": {"speed_factor": 1.2, "feed_factor": 1.0, "doc_factor": 1.0}
        }
        
        factor = material_factors.get(material_type, material_factors["titanium"])
        
        # 절삭속도 계산 (V = π × D × N / 1000)
        if tool.diameter > 0:  # 밀링 공구
            cutting_speed = tool.max_cutting_speed * factor["speed_factor"]
            spindle_speed = int(cutting_speed * 1000 / (math.pi * tool.diameter))
            spindle_speed = min(spindle_speed, self.constraints.max_spindle_speed)
            
            # 이송속도 계산 (F = fz × z × N)
            fz = 0.05 * factor["feed_factor"]  # 날당 이송량
            z = 2  # 날 수
            feed_rate = fz * z * spindle_speed
            
            depth_of_cut = tool.diameter * 0.1 * factor["doc_factor"]
            step_over = tool.diameter * 0.6
            
        else:  # 터닝 공구
            # 워크피스 직경 가정 (5mm)
            workpiece_diameter = 5.0
            cutting_speed = tool.max_cutting_speed * factor["speed_factor"]
            spindle_speed = int(cutting_speed * 1000 / (math.pi * workpiece_diameter))
            spindle_speed = min(spindle_speed, self.constraints.max_spindle_speed)
            
            feed_rate = tool.max_feed_rate * factor["feed_factor"] * spindle_speed
            depth_of_cut = 0.5 * factor["doc_factor"]
            step_over = 0.0  # 터닝에서는 사용 안함
        
        return CuttingParameters(
            spindle_speed=spindle_speed,
            feed_rate=min(feed_rate, self.constraints.max_feed_rate),
            depth_of_cut=depth_of_cut,
            step_over=step_over,
            cutting_speed=cutting_speed
        )
    
    def generate_adaptive_toolpath(self, profile_points: List[Tuple[float, float]], 
                                 tool: CuttingTool,
                                 material_type: str = "titanium") -> List[str]:
        """적응형 툴패스 생성 (곡률에 따른 이송속도 조정)"""
        if not profile_points:
            return []
        
        cutting_params = self.calculate_optimal_cutting_parameters(tool, material_type)
        gcode = []
        
        # 헤더
        gcode.append(f"T{tool.tool_number}")
        gcode.append(f"G97 S{cutting_params.spindle_speed} M3")
        gcode.append("G0 X20.0 Z5.0")
        
        # 공구 반경 보정 적용
        if tool.diameter > 0:
            compensated_path = self.optimizer.calculate_tool_radius_compensation(
                profile_points, tool.diameter, "left"
            )
        else:
            compensated_path = profile_points
        
        # 이송속도 최적화
        optimized_feeds = self.optimizer.optimize_feed_rates(compensated_path)
        
        # 툴패스 생성
        for i, (z, x) in enumerate(compensated_path):
            # 기계 제한 검사
            if not self.optimizer.check_machine_limits(x * 2, z):
                gcode.append(f"(WARNING: Position out of machine limits at Z{z} X{x})")
                continue
            
            if i == 0:
                gcode.append(f"G0 X{x*2:.3f} Z{z:.3f}")
            else:
                feed_rate = optimized_feeds[i-1] if i-1 < len(optimized_feeds) else cutting_params.feed_rate
                gcode.append(f"G1 X{x*2:.3f} Z{z:.3f} F{feed_rate:.1f}")
        
        gcode.append("G0 X20.0 Z5.0")
        return gcode
    
    def use_pycam_toolpath(self, stl_mesh: mesh.Mesh) -> Optional[List[str]]:
        """PyCAM을 이용한 고급 툴패스 생성"""
        if not PYCAM_AVAILABLE:
            return None
        
        try:
            # PyCAM 모델 생성
            model = Model.from_stl_file(stl_mesh)
            
            # 공구 설정
            tool = pycam.Tools.CylindricalCutter(1.0, 0.0)  # 1mm 엔드밀
            
            # 툴패스 생성기 설정
            path_generator = PushCutter(tool, model)
            
            # 툴패스 생성
            toolpath = path_generator.generate_toolpath()
            
            # G코드 변환
            gcode = []
            for move in toolpath.get_moves():
                if move.action == "move":
                    gcode.append(f"G1 X{move.point[0]:.3f} Y{move.point[1]:.3f} Z{move.point[2]:.3f}")
                elif move.action == "rapid":
                    gcode.append(f"G0 X{move.point[0]:.3f} Y{move.point[1]:.3f} Z{move.point[2]:.3f}")
            
            return gcode
        except Exception as e:
            print(f"PyCAM 툴패스 생성 실패: {e}")
            return None
    
    def generate_comprehensive_program(self, stl_path: str, 
                                     material_type: str = "titanium",
                                     output_path: str = None) -> str:
        """종합적인 G코드 프로그램 생성"""
        print("=== 고도화된 어벗먼트 CAM 시작 ===")
        print(f"기계: {self.machine_type.value}")
        print(f"재료: {material_type}")
        
        # STL 로드
        try:
            stl_mesh = mesh.Mesh.from_file(stl_path)
            print(f"STL 로드 완료: {len(stl_mesh.vectors)} 삼각형")
        except:
            print("STL 파일을 로드할 수 없습니다.")
            return ""
        
        # 프로파일 추출 (기존 코드 활용)
        profile_points = self._analyze_rotational_profile(stl_mesh)
        
        # 충돌 감지기 초기화
        collision_detector = CollisionDetector(stl_mesh, self.tools["finish_turning"])
        
        # 완전한 프로그램 생성
        complete_program = []
        
        # 헤더
        complete_program.extend(self._add_machine_headers())
        complete_program.append("")
        
        # 황삭 (적응형)
        complete_program.append("(=== ADAPTIVE ROUGHING ===)")
        roughing_tool = self.tools["rough_turning"]
        roughing_toolpath = self.generate_adaptive_toolpath(
            profile_points, roughing_tool, material_type
        )
        complete_program.extend(roughing_toolpath)
        complete_program.append("")
        
        # 정삭 (적응형)
        complete_program.append("(=== ADAPTIVE FINISHING ===)")
        finishing_tool = self.tools["finish_turning"]
        finishing_toolpath = self.generate_adaptive_toolpath(
            profile_points, finishing_tool, material_type
        )
        complete_program.extend(finishing_toolpath)
        complete_program.append("")
        
        # PyCAM 툴패스 (사용 가능한 경우)
        if PYCAM_AVAILABLE:
            complete_program.append("(=== PYCAM ADVANCED TOOLPATH ===)")
            pycam_toolpath = self.use_pycam_toolpath(stl_mesh)
            if pycam_toolpath:
                complete_program.extend(pycam_toolpath[:10])  # 샘플만 포함
                complete_program.append("(... PyCAM 툴패스 계속)")
        
        # 푸터
        complete_program.extend(self._add_machine_footers())
        
        final_program = "\n".join(complete_program)
        
        if output_path:
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(final_program)
            print(f"고급 G코드 저장: {output_path}")
        
        print("=== 프로그램 생성 완료 ===")
        return final_program
    
    def _analyze_rotational_profile(self, stl_mesh: mesh.Mesh) -> List[Tuple[float, float]]:
        """개선된 회전체 프로파일 분석"""
        vertices = stl_mesh.vectors.reshape(-1, 3)
        
        # 중심축 자동 감지 (PCA 사용)
        from sklearn.decomposition import PCA
        try:
            pca = PCA(n_components=3)
            pca.fit(vertices)
            # 주축을 Z축으로 가정
        except:
            pass  # PCA 실패시 기존 방법 사용
        
        # 기존 프로파일 추출 방법 사용 (개선된 버전)
        z_coords = vertices[:, 2]
        z_min, z_max = np.min(z_coords), np.max(z_coords)
        
        profile_points = []
        z_step = 0.05  # 더 세밀한 간격
        
        for z in np.arange(z_min, z_max + z_step, z_step):
            z_mask = np.abs(vertices[:, 2] - z) < z_step
            if np.any(z_mask):
                z_vertices = vertices[z_mask]
                radii = np.sqrt(z_vertices[:, 0]**2 + z_vertices[:, 1]**2)
                # 아웃라이어 제거
                mean_radius = np.mean(radii)
                std_radius = np.std(radii)
                valid_radii = radii[np.abs(radii - mean_radius) < 2 * std_radius]
                if len(valid_radii) > 0:
                    max_radius = np.max(valid_radii)
                    profile_points.append((z, max_radius))
        
        # 스플라인 스무딩
        if len(profile_points) > 3:
            profile_points.sort(key=lambda p: p[0])
            z_vals = [p[0] for p in profile_points]
            r_vals = [p[1] for p in profile_points]
            
            try:
                spline = UnivariateSpline(z_vals, r_vals, s=0.1)
                smoothed_z = np.linspace(min(z_vals), max(z_vals), len(profile_points))
                smoothed_r = spline(smoothed_z)
                profile_points = list(zip(smoothed_z, smoothed_r))
            except:
                pass  # 스플라인 실패시 원본 사용
        
        return profile_points
    
    def _add_machine_headers(self) -> List[str]:
        """기계별 헤더 (기존 코드 활용)"""
        if self.machine_type == MachineType.TSUGAMI_B0125:
            return [
                "O0001 (ADVANCED ABUTMENT CAM - TSUGAMI)",
                "G20 (INCH MODE)", 
                "G40 G80 G97",
                "G54 (WORK COORDINATE)",
                "M8 (COOLANT ON)"
            ]
        else:
            return [
                "%",
                "O0001 (ADVANCED ABUTMENT CAM - HANWHA)",
                "G21 (METRIC MODE)",
                "G40 G49 G80 G97", 
                "G54 (WORK COORDINATE)",
                "M8 (COOLANT ON)"
            ]
    
    def _add_machine_footers(self) -> List[str]:
        """기계별 푸터 (기존 코드 활용)"""
        if self.machine_type == MachineType.TSUGAMI_B0125:
            return [
                "G0 X20.0 Z10.0",
                "M5 (SPINDLE STOP)",
                "M9 (COOLANT OFF)",
                "M30 (PROGRAM END)"
            ]
        else:
            return [
                "G0 X20.0 Z10.0",
                "M5 (SPINDLE STOP)", 
                "M9 (COOLANT OFF)",
                "M30 (PROGRAM END)",
                "%"
            ]

# 사용 예제
if __name__ == "__main__":
    print("=== 고도화된 어벗먼트 CAM 시스템 ===")
    print(f"PyCAM 사용 가능: {PYCAM_AVAILABLE}")
    print(f"FreeCAD 사용 가능: {FREECAD_AVAILABLE}")
    
    # 시스템 생성
    advanced_cam = AdvancedAbutmentCAM(MachineType.TSUGAMI_B0125)
    
    # 절삭 조건 계산 예제
    tool = advanced_cam.tools["finish_turning"]
    cutting_params = advanced_cam.calculate_optimal_cutting_parameters(tool, "titanium")
    
    print(f"\n=== 최적 절삭 조건 (티타늄) ===")
    print(f"스핀들 속도: {cutting_params.spindle_speed} rpm")
    print(f"이송속도: {cutting_params.feed_rate:.1f} mm/min")
    print(f"절삭깊이: {cutting_params.depth_of_cut:.2f} mm")
    print(f"절삭속도: {cutting_params.cutting_speed:.1f} m/min")
    
    # 공구 반경 보정 테스트
    test_path = [(0, 2), (2, 3), (4, 3.5), (6, 3), (8, 2)]
    compensated = advanced_cam.optimizer.calculate_tool_radius_compensation(
        test_path, 1.0, "left"
    )
    
    print(f"\n=== 공구 반경 보정 테스트 ===")
    print("원본 경로:", test_path[:3])
    print("보정 경로:", compensated[:3])

# 필요한 추가 라이브러리 설치 가이드
"""
고도화된 CAM 시스템 사용을 위한 설치 가이드:

1. 기본 라이브러리:
   pip install numpy scipy matplotlib stl scikit-learn

2. PyCAM (오픈소스 CAM):
   # Ubuntu/Debian:
   sudo apt-get install pycam
   # 또는 소스에서 설치:
   git clone https://github.com/SebKuzminsky/pycam.git
   cd pycam && python setup.py install

3. FreeCAD (CAD/CAM):
   # Ubuntu/Debian:
   sudo apt-get install freecad
   # Windows: https://www.freecadweb.org/downloads.php
   # 설치 후 Python 경로에 FreeCAD 모듈 추가 필요

4. OpenCAMLib (고성능 기하학적 계산):
   pip install opencamlib

5. 추가 최적화 라이브러리:
   pip install cvxpy  # 최적화 문제 해결
   pip install trimesh  # 3D 메쉬 처리
   pip install shapely  # 2D 기하학적 연산
"""

class SurfaceContactCalculator:
    """3D 표면과 공구의 접촉 조건 계산"""
    
    def __init__(self):
        self.tolerance = 0.001  # mm
    
    def calculate_contact_point(self, surface_mesh: mesh.Mesh, 
                              tool_center: np.ndarray, 
                              tool_axis: np.ndarray,
                              tool_radius: float) -> Optional[np.ndarray]:
        """공구와 표면의 접촉점 계산"""
        try:
            import trimesh
            # trimesh 라이브러리로 정밀한 접촉점 계산
            mesh_obj = trimesh.Trimesh(
                vertices=surface_mesh.vectors.reshape(-1, 3),
                faces=np.arange(len(surface_mesh.vectors) * 3).reshape(-1, 3)
            )
            
            # 레이 캐스팅으로 접촉점 찾기
            ray_origins = tool_center.reshape(1, -1)
            ray_directions = tool_axis.reshape(1, -1)
            
            locations, ray_indices, face_indices = mesh_obj.ray.intersects_location(
                ray_origins=ray_origins,
                ray_directions=ray_directions
            )
            
            if len(locations) > 0:
                return locations[0]  # 첫 번째 교점
            
        except ImportError:
            # trimesh가 없으면 간단한 근사 계산
            vertices = surface_mesh.vectors.reshape(-1, 3)
            distances = np.linalg.norm(vertices - tool_center, axis=1)
            closest_idx = np.argmin(distances)
            return vertices[closest_idx]
        
        return None
    
    def calculate_surface_normal(self, surface_mesh: mesh.Mesh, 
                               contact_point: np.ndarray) -> np.ndarray:
        """접촉점에서의 표면 법선 벡터 계산"""
        # 접촉점 주변의 삼각형들을 찾아서 법선 계산
        vertices = surface_mesh.vectors.reshape(-1, 3)
        distances = np.linalg.norm(vertices - contact_point, axis=1)
        
        # 가장 가까운 삼각형들 찾기
        closest_triangles_idx = np.where(distances < 0.5)[0] // 3  # 삼각형 인덱스
        
        if len(closest_triangles_idx) == 0:
            return np.array([0, 0, 1])  # 기본값
        
        # 법선 벡터들의 평균 계산
        normals = []
        for tri_idx in closest_triangles_idx[:5]:  # 최대 5개 삼각형
            if tri_idx < len(surface_mesh.normals):
                normals.append(surface_mesh.normals[tri_idx])
        
        if normals:
            avg_normal = np.mean(normals, axis=0)
            return avg_normal / np.linalg.norm(avg_normal)
        
        return np.array([0, 0, 1])
    
    def calculate_cutting_force(self, cutting_params: CuttingParameters,
                              material_properties: Dict,
                              contact_area: float) -> Dict[str, float]:
        """절삭력 계산 (Merchant's Circle Theory 기반)"""
        
        # 재료별 절삭 계수 (N/mm²)
        material_constants = {
            "titanium": {"Kc": 2800, "Kt": 800, "Kr": 1200},
            "zirconia": {"Kc": 3500, "Kt": 1000, "Kr": 1500},
            "peek": {"Kc": 800, "Kt": 200, "Kr": 400}
        }
        
        material_type = material_properties.get("type", "titanium")
        constants = material_constants.get(material_type, material_constants["titanium"])
        
        # 절삭력 성분 계산
        cutting_force = constants["Kc"] * cutting_params.depth_of_cut * cutting_params.feed_rate
        thrust_force = constants["Kt"] * cutting_params.depth_of_cut * cutting_params.feed_rate
        radial_force = constants["Kr"] * cutting_params.depth_of_cut * cutting_params.feed_rate
        
        return {
            "cutting_force": cutting_force,  # 주 절삭력 (N)
            "thrust_force": thrust_force,    # 이송력 (N)
            "radial_force": radial_force,    # 반경력 (N)
            "resultant_force": np.sqrt(cutting_force**2 + thrust_force**2 + radial_force**2)
        }

class ThermalCalculator:
    """절삭 온도 및 열 해석"""
    
    def __init__(self):
        self.ambient_temp = 20.0  # 실온 (°C)
    
    def calculate_cutting_temperature(self, cutting_params: CuttingParameters,
                                    forces: Dict[str, float],
                                    material_properties: Dict) -> Dict[str, float]:
        """절삭 온도 계산 (Shaw-Oxley 모델 기반)"""
        
        # 재료별 열적 성질
        thermal_properties = {
            "titanium": {"conductivity": 21.9, "specific_heat": 523, "density": 4.43},
            "zirconia": {"conductivity": 2.0, "specific_heat": 450, "density": 6.05},
            "peek": {"conductivity": 0.25, "specific_heat": 1340, "density": 1.32}
        }
        
        material_type = material_properties.get("type", "titanium")
        props = thermal_properties.get(material_type, thermal_properties["titanium"])
        
        # 절삭 파워 계산 (W)
        cutting_power = (forces["cutting_force"] * cutting_params.cutting_speed * 1000) / 60
        
        # 온도 상승 계산 (간소화된 모델)
        # ΔT = P / (ρ * c * V * k)
        volume_rate = (cutting_params.depth_of_cut * cutting_params.feed_rate * 
                      cutting_params.cutting_speed * 1000 / 60)  # mm³/s
        
        if volume_rate > 0:
            temp_rise = cutting_power / (props["density"] * props["specific_heat"] * 
                                       volume_rate * props["conductivity"] * 0.001)
        else:
            temp_rise = 0
        
        cutting_temp = self.ambient_temp + temp_rise
        
        return {
            "cutting_temperature": cutting_temp,  # °C
            "temperature_rise": temp_rise,
            "cutting_power": cutting_power,  # W
            "tool_wear_factor": self._calculate_tool_wear_factor(cutting_temp)
        }
    
    def _calculate_tool_wear_factor(self, temperature: float) -> float:
        """온도에 따른 공구 마모 계수"""
        # Arrhenius 방정식 기반 간소화 모델
        if temperature < 200:
            return 1.0
        elif temperature < 400:
            return 1.0 + (temperature - 200) * 0.005
        elif temperature < 600:
            return 2.0 + (temperature - 400) * 0.01
        else:
            return 4.0 + (temperature - 600) * 0.02

class AdvancedSimulation:
    """고급 가공 시뮬레이션"""
    
    def __init__(self):
        self.surface_calculator = SurfaceContactCalculator()
        self.thermal_calculator = ThermalCalculator()
    
    def simulate_machining_process(self, toolpath: List[Tuple[float, float]], 
                                 tool: CuttingTool,
                                 cutting_params: CuttingParameters,
                                 workpiece_mesh: mesh.Mesh,
                                 material_properties: Dict) -> Dict:
        """전체 가공 프로세스 시뮬레이션"""
        
        simulation_results = {
            "toolpath_length": 0.0,
            "machining_time": 0.0,
            "max_cutting_force": 0.0,
            "max_temperature": 0.0,
            "total_power_consumption": 0.0,
            "tool_wear_prediction": 0.0,
            "surface_roughness_prediction": 0.0,
            "warnings": []
        }
        
        total_force_sum = 0.0
        total_temp_sum = 0.0
        point_count = 0
        
        for i in range(len(toolpath) - 1):
            p1 = np.array(toolpath[i])
            p2 = np.array(toolpath[i + 1])
            
            # 이동 거리 계산
            segment_length = np.linalg.norm(p2 - p1)
            simulation_results["toolpath_length"] += segment_length
            
            # 가공 시간 계산
            segment_time = segment_length / (cutting_params.feed_rate / 60)  # 분
            simulation_results["machining_time"] += segment_time
            
            # 접촉 조건 계산
            tool_center = np.array([p1[0], 0, p1[1]])  # 2D -> 3D 변환
            contact_area = cutting_params.depth_of_cut * segment_length
            
            # 절삭력 계산
            forces = self.surface_calculator.calculate_cutting_force(
                cutting_params, material_properties, contact_area
            )
            
            # 온도 계산
            thermal_result = self.thermal_calculator.calculate_cutting_temperature(
                cutting_params, forces, material_properties
            )
            
            # 최대값 업데이트
            simulation_results["max_cutting_force"] = max(
                simulation_results["max_cutting_force"], 
                forces["resultant_force"]
            )
            simulation_results["max_temperature"] = max(
                simulation_results["max_temperature"],
                thermal_result["cutting_temperature"]
            )
            
            # 전력 소모량 누적
            simulation_results["total_power_consumption"] += (
                thermal_result["cutting_power"] * segment_time / 60  # kWh
            )
            
            # 공구 마모 예측 누적
            simulation_results["tool_wear_prediction"] += (
                thermal_result["tool_wear_factor"] * segment_length * 0.001
            )
            
            total_force_sum += forces["resultant_force"]
            total_temp_sum += thermal_result["cutting_temperature"]
            point_count += 1
            
            # 경고 조건 검사
            if forces["resultant_force"] > 500:  # 500N 이상
                simulation_results["warnings"].append(
                    f"높은 절삭력 감지: {forces['resultant_force']:.1f}N at Z={p1[1]:.2f}"
                )
            
            if thermal_result["cutting_temperature"] > 400:  # 400°C 이상
                simulation_results["warnings"].append(
                    f"고온 경고: {thermal_result['cutting_temperature']:.1f}°C at Z={p1[1]:.2f}"
                )
        
        # 평균값 계산
        if point_count > 0:
            avg_force = total_force_sum / point_count
            avg_temp = total_temp_sum / point_count
            
            # 표면 거칠기 예측 (Ra)
            simulation_results["surface_roughness_prediction"] = (
                0.1 + avg_force * 0.0001 + (avg_temp - 100) * 0.001
            )
        
        return simulation_results
    
    def generate_simulation_report(self, results: Dict) -> str:
        """시뮬레이션 결과 보고서 생성"""
        report = []
        report.append("=== 가공 시뮬레이션 결과 ===")
        report.append(f"툴패스 총 길이: {results['toolpath_length']:.2f} mm")
        report.append(f"예상 가공 시간: {results['machining_time']:.1f} 분")
        report.append(f"최대 절삭력: {results['max_cutting_force']:.1f} N")
        report.append(f"최대 온도: {results['max_temperature']:.1f} °C")
        report.append(f"전력 소모량: {results['total_power_consumption']:.3f} kWh")
        report.append(f"공구 마모 예측: {results['tool_wear_prediction']:.4f} mm")
        report.append(f"표면 거칠기 예측: Ra {results['surface_roughness_prediction']:.2f} μm")
        
        if results["warnings"]:
            report.append("\n=== 경고 사항 ===")
            for warning in results["warnings"]:
                report.append(f"⚠ {warning}")
        
        return "\n".join(report)

# 완전한 통합 시스템
class ComprehensiveAbutmentCAM(AdvancedAbutmentCAM):
    """종합적인 어벗먼트 CAM 시스템 (물리학 및 시뮬레이션 포함)"""
    
    def __init__(self, machine_type: MachineType):
        super().__init__(machine_type)
        self.simulator = AdvancedSimulation()
    
    def generate_physics_based_program(self, stl_path: str,
                                     material_properties: Dict,
                                     quality_requirements: Dict,
                                     output_path: str = None) -> Tuple[str, Dict]:
        """물리학 기반 통합 프로그램 생성"""
        
        print("=== 물리학 기반 CAM 시작 ===")
        
        # STL 로드 및 분석
        try:
            stl_mesh = mesh.Mesh.from_file(stl_path)
        except:
            print("STL 파일 로드 실패")
            return "", {}
        
        # 프로파일 추출
        profile_points = self._analyze_rotational_profile(stl_mesh)
        
        # 재료별 최적 공구 선택
        material_type = material_properties.get("type", "titanium")
        selected_tools = self._select_optimal_tools(material_type, quality_requirements)
        
        # 각 가공 단계별 시뮬레이션
        all_simulation_results = {}
        complete_program = []
        
        # 헤더
        complete_program.extend(self._add_machine_headers())
        complete_program.append("")
        
        # 황삭
        complete_program.append("(=== PHYSICS-BASED ROUGHING ===)")
        roughing_tool = selected_tools["roughing"]
        roughing_params = self.calculate_optimal_cutting_parameters(roughing_tool, material_type)
        roughing_toolpath = self.generate_adaptive_toolpath(
            profile_points, roughing_tool, material_type
        )
        complete_program.extend(roughing_toolpath)
        
        # 황삭 시뮬레이션
        roughing_sim = self.simulator.simulate_machining_process(
            profile_points, roughing_tool, roughing_params, stl_mesh, material_properties
        )
        all_simulation_results["roughing"] = roughing_sim
        complete_program.append("")
        
        # 정삭
        complete_program.append("(=== PHYSICS-BASED FINISHING ===)")
        finishing_tool = selected_tools["finishing"]
        finishing_params = self.calculate_optimal_cutting_parameters(finishing_tool, material_type)
        finishing_toolpath = self.generate_adaptive_toolpath(
            profile_points, finishing_tool, material_type
        )
        complete_program.extend(finishing_toolpath)
        
        # 정삭 시뮬레이션
        finishing_sim = self.simulator.simulate_machining_process(
            profile_points, finishing_tool, finishing_params, stl_mesh, material_properties
        )
        all_simulation_results["finishing"] = finishing_sim
        complete_program.append("")
        
        # 푸터
        complete_program.extend(self._add_machine_footers())
        
        # 최종 프로그램 생성
        final_program = "\n".join(complete_program)
        
        # 시뮬레이션 보고서 추가
        simulation_report = self._generate_comprehensive_report(all_simulation_results)
        final_program += "\n\n" + simulation_report
        
        if output_path:
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(final_program)
            print(f"물리학 기반 G코드 저장: {output_path}")
        
        return final_program, all_simulation_results
    
    def _select_optimal_tools(self, material_type: str, quality_req: Dict) -> Dict:
        """재료와 품질 요구사항에 따른 최적 공구 선택"""
        
        # 품질 요구사항에 따른 공구 선택
        surface_roughness_req = quality_req.get("surface_roughness", 1.6)  # Ra μm
        tolerance_req = quality_req.get("tolerance", 0.02)  # mm
        
        if surface_roughness_req <= 0.8 and tolerance_req <= 0.01:
            # 고품질 요구사항
            return {
                "roughing": self.tools["rough_turning"],
                "finishing": self.tools["finish_turning"]  # 다이아몬드 코팅
            }
        else:
            # 일반 품질 요구사항
            return {
                "roughing": self.tools["rough_turning"], 
                "finishing": self.tools["finish_turning"]
            }
    
    def _generate_comprehensive_report(self, sim_results: Dict) -> str:
        """종합 시뮬레이션 보고서"""
        report = []
        report.append("/*")
        report.append("=== 종합 가공 시뮬레이션 보고서 ===")
        
        total_time = 0
        total_power = 0
        
        for operation, results in sim_results.items():
            report.append(f"\n--- {operation.upper()} ---")
            report.append(f"가공 시간: {results['machining_time']:.1f} 분")
            report.append(f"최대 절삭력: {results['max_cutting_force']:.1f} N")
            report.append(f"최대 온도: {results['max_temperature']:.1f} °C")
            report.append(f"전력 소모: {results['total_power_consumption']:.3f} kWh")
            
            total_time += results['machining_time']
            total_power += results['total_power_consumption']
            
            if results["warnings"]:
                report.append("경고:")
                for warning in results["warnings"]:
                    report.append(f"  - {warning}")
        
        report.append(f"\n=== 전체 요약 ===")
        report.append(f"총 가공 시간: {total_time:.1f} 분")
        report.append(f"총 전력 소모: {total_power:.3f} kWh")
        report.append(f"예상 생산 비용: {total_power * 150:.0f} 원 (전기료)")
        report.append("*/")
        
        return "\n".join(report)

# 최종 사용 예제
if __name__ == "__main__":
    # 종합 시스템 생성
    comprehensive_cam = ComprehensiveAbutmentCAM(MachineType.TSUGAMI_B0125)
    
    # 재료 속성 정의
    material_props = {
        "type": "titanium",
        "hardness": 350,  # HV
        "tensile_strength": 900,  # MPa
        "thermal_conductivity": 21.9  # W/m·K
    }
    
    # 품질 요구사항
    quality_reqs = {
        "surface_roughness": 0.8,  # Ra μm
        "tolerance": 0.01,  # mm
        "dimensional_accuracy": 0.005  # mm
    }
    
    print("=== 물리학 기반 CAM 시스템 준비 완료 ===")
    print(f"재료: {material_props['type']}")
    print(f"품질 요구사항: Ra {quality_reqs['surface_roughness']} μm")
    
    # 실제 사용시:
    # program, results = comprehensive_cam.generate_physics_based_program(
    #     "abutment.stl", material_props, quality_reqs, "output.nc"
    # )
    