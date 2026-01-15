using System;
using Esprit;

namespace DentalAddin
{
    /// <summary>
    /// 덴탈 프로세싱 컨텍스트
    /// </summary>
    public class DentalContext
    {
        public Application EspritApp { get; set; }
        public Document Document { get; set; }
        public DentalConfig Config { get; set; }

        // 프로세싱 파라미터
        public double EndXValue { get; set; }
        public double Chamfer { get; set; }
        public double DownZ { get; set; }
        public double MillingDepth { get; set; }
        public double TurningExtend { get; set; }
        public double TurningDepth { get; set; }
        public double BackTurn { get; set; }
        public bool SpindleSide { get; set; }
        public double RoughType { get; set; }

        // 내부 상태
        public double LowerY { get; set; }
        public double HighY { get; set; }
        public double EndX { get; set; }
        public double EndY { get; set; }
        public int TurningTimes { get; set; }
        public int ErrorFlag { get; set; }

        public DentalContext(Application app, Document doc)
        {
            EspritApp = app;
            Document = doc;
            Config = ConfigManager.LoadConfig();
            Initialize();
        }

        private void Initialize()
        {
            // 기본값 설정
            SpindleSide = false;
            RoughType = 1.0;
            TurningDepth = 0.5;
            TurningExtend = 0.5;
            MillingDepth = 1.0;
            Chamfer = 0.1;
            DownZ = 0.0;
            BackTurn = 0.0;
        }

        public void Reset()
        {
            LowerY = 0.0;
            HighY = 0.0;
            EndX = 0.0;
            EndY = 0.0;
            TurningTimes = 0;
            ErrorFlag = 0;
        }
    }
}
