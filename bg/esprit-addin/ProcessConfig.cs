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
        public const double Point1Y = -0.68;

        /// <summary>
        /// Boundry 생성 시 Point2의 Y 좌표 (mm)
        /// </summary>
        public const double Point2Y = -11.3;

        // ==================== 가공 파라미터 ====================
        /// <summary>
        /// 챔퍼 깊이 (mm) - DentalPanel TextBox11
        /// </summary>
        public const double DefaultChamfer = 0.3;

        /// <summary>
        /// Z축 하강 깊이 (mm) - DentalPanel TextBox12
        /// </summary>
        public const double DefaultDownZ = 0.0;

        /// <summary>
        /// 터닝 연장 길이 (mm) - DentalPanel TextBox15
        /// </summary>
        public const double DefaultTurningExtend = 1.0;

        /// <summary>
        /// 터닝 깊이 (mm) - DentalPanel TextBox13
        /// </summary>
        public const double DefaultTurningDepth = 0.5;

        /// <summary>
        /// 밀링 깊이 (mm) - DentalPanel TextBox16
        /// </summary>
        public const double DefaultMillingDepth = 0.3;

        /// <summary>
        /// 밀링 연장 길이 (mm) - DentalPanel TextBox23
        /// </summary>
        public const double DefaultExtendMill = 0.5;

        // ==================== 회전 설정 ====================
        /// <summary>
        /// STL 파일 병합 직후 Y축 기준 회전 각도 (도)
        /// </summary>
        // 후면 선택 시 +X가 왼쪽을 향하도록 Y축 기준 -90도 회전
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
        public const string TurningName = "Turning";
        public const string RoughMillPrefix = "RoughMill_";
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

        // ==================== 공정 파일 (기본값: 원본 Dental Addin UI 기준) ====================
        // 절대 경로 우선: prc 루트
        public static readonly string TechRootDirectory = @"C:\abuts.fit\bg\esprit-addin\AcroDent";
        public const string FaceHoleSubfolder = "1_Face Hole";
        public const string ConnectionSubfolder = "2_Connection";
        public const string TurningSubfolder = "3_Turning prc";
        public const string ReverseTurningSubfolder = "4_ReverseTurning prc";
        public const string RoughSubfolder = "5_Rough prc";
        public const string SemiRoughSubfolder = "6_Semi_Rough prc";
        public const string FaceSubfolder = "7_Face prc";
        public const string O180Subfolder = "8-0-180 prc";
        public const string O90_270Subfolder = "9-90-270 prc";
        public const string CompositeSubfolder = "12_MarginComposite prc";

        // PrcFilePath[1] = Turning (TurningOp)
        public const string TurningProcessFile = "Turning.prc";
        // PrcFilePath[2] = Reverse Turning (TurningOp - ReverseOn)
        public const string ReverseTurningProcessFile = "Reverse Turning Process.prc";
        // PrcFilePath[3] = RoughMill (RoughMill)
        public const string RoughMillingProcessFile = "MillRough_3D.prc";
        // PrcFilePath[4] = CustomCycle (FaceDrill)
        public const string FaceHoleProcessFile = "네오_R_Connection_H.prc";
        // PrcFilePath[5] = 0-180 BallMilling
        public const string O180BallMillingProcessFile = "3D.prc";
        // PrcFilePath[6] = 90-270 BallMilling
        public const string O90_270BallMillingProcessFile = "3D_2.prc";
        // PrcFilePath[7] = (추가 파일)
        public const string AdditionalProcessFile = "";
        // PrcFilePath[8] = CustomCycle2 (EndTurning)
        public const string ConnectionProcessFile = "네오_R_Connection.prc";
        // PrcFilePath[9] = OP36 (SemiRough)
        public const string SemiRoughMillingProcessFile = "SemiRough_2D.prc";
        // PrcFilePath[10] = 5axis Composite
        public const string CompositeProcessFile = "5axisComposite.prc";
        // PrcFilePath[11] = FreeFormMill (Mark)
        public const string MarkProcessFile = "";
        // PrcFilePath[12] = MarkText
        public const string MarkTextProcessFile = "";
        // 기존 호환성 유지
        public const string FaceMachiningProcessFile = "FACE.prc";
        public const string O180ProcessFile = "3D.prc";
        public const string O90_270ProcessFile = "3D_2.prc";
        public const double DefaultEndPosition = -11.0;

        // ==================== 프로세스 플래그 ====================
        /// <summary>
        /// 스핀들 방향 (true: 오른쪽, false: 왼쪽)
        /// </summary>
        public const bool DefaultSpindleSide = true;

        /// <summary>
        /// 정면 가공 후 후면 가공 여부 (Reverse Turning)
        /// </summary>
        public const bool DefaultReverseOn = true;

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
            string baseName = GetNCBaseName(stlFilePath);
            return Path.Combine(NCCodeOutputDirectory, baseName + ".nc");
        }

        /// <summary>
        /// STL 파일명에서 확장자 및 ".filled" 접미어를 제거한 베이스명
        /// </summary>
        public static string GetNCBaseName(string stlFilePath)
        {
            string baseName = Path.GetFileNameWithoutExtension(stlFilePath);
            const string filledSuffix = ".filled";
            if (baseName != null && baseName.EndsWith(filledSuffix, StringComparison.OrdinalIgnoreCase))
            {
                baseName = baseName.Substring(0, baseName.Length - filledSuffix.Length);
            }
            return baseName ?? "output";
        }
    }
}
