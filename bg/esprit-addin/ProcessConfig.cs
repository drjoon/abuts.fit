using System;
using System.IO;

namespace Acrodent.EspritAddIns.ESPRIT2025AddinProject
{
    /// <summary>
    /// 프로세스 실행에 필요한 모든 상수 설정
    /// </summary>
    public static class ProcessConfig
    {
        // ==================== 경계 포인트 설정 ====================
        /// <summary>
        /// Boundry 생성 시 Point1의 Y 좌표 (mm)
        /// </summary>
        public const double Point1Y = 7.0;

        /// <summary>
        /// Boundry 생성 시 Point2의 Y 좌표 (mm)
        /// </summary>
        public const double Point2Y = 0.0;

        // ==================== 회전 설정 ====================
        /// <summary>
        /// STL 파일 병합 직후 Y축 기준 회전 각도 (도)
        /// </summary>
        public const double InitialRotationAngleY = -90.0;

        // ==================== 밀링 설정 ====================
        /// <summary>
        /// 밀링 프로파일 추출 시작 각도 (도)
        /// </summary>
        public const double MillingStartAngle = 0.0;

        /// <summary>
        /// 밀링 프로파일 추출 종료 각도 (도)
        /// </summary>
        public const double MillingEndAngle = 170.0;

        /// <summary>
        /// 밀링 프로파일 추출 각도 간격 (도)
        /// </summary>
        public const double MillingAngleStep = 10.0;

        // ==================== 레이어 이름 ====================
        public const string RoughMillingLayerName = "Rough Milling";
        public const string TurningLayerName = "Turning";
        public const string BoundryLayerName = "Boundry";

        // ==================== 피처 체인 이름 ====================
        public const string Boundry1Name = "Boundry1";
        public const string Boundry2Name = "Boundry2";
        public const string TurningProfilePrefix = "TurningProfile";

        // ==================== NC 코드 생성 설정 ====================
        /// <summary>
        /// 포스트프로세서 파일명
        /// </summary>
        public const string PostProcessorFileName = "Acro_dent_XE.asc";

        /// <summary>
        /// NC 코드 저장 디렉토리 (상대 경로)
        /// </summary>
        public static readonly string NCCodeOutputDirectory = Path.Combine(
            Directory.GetParent(AppDomain.CurrentDomain.BaseDirectory).Parent.Parent.Parent.FullName,
            "bg", "storage", "3-nc"
        );

        // ==================== STL 감시 폴더 ====================
        /// <summary>
        /// STL 파일 감시 폴더 경로
        /// </summary>
        public static readonly string StlWatchFolder = Path.Combine(
            Directory.GetParent(AppDomain.CurrentDomain.BaseDirectory).Parent.Parent.Parent.FullName,
            "bg", "storage", "2-filled"
        );

        // ==================== 프로세스 플래그 ====================
        /// <summary>
        /// 스핀들 방향 (true: 오른쪽, false: 왼쪽)
        /// </summary>
        public const bool DefaultSpindleSide = true;

        /// <summary>
        /// Rough 타입 (1.0: 밀링 포함, 0.0: 터닝만)
        /// </summary>
        public const double DefaultRoughType = 1.0;

        // ==================== 헬퍼 메서드 ====================
        /// <summary>
        /// NC 코드 출력 디렉토리가 없으면 생성
        /// </summary>
        public static void EnsureNCCodeDirectoryExists()
        {
            if (!Directory.Exists(NCCodeOutputDirectory))
            {
                Directory.CreateDirectory(NCCodeOutputDirectory);
            }
        }

        /// <summary>
        /// STL 파일 경로에서 NC 파일 경로 생성
        /// </summary>
        public static string GetNCCodeFilePath(string stlFilePath)
        {
            string baseName = Path.GetFileNameWithoutExtension(stlFilePath);
            return Path.Combine(NCCodeOutputDirectory, baseName + ".nc");
        }
    }
}
