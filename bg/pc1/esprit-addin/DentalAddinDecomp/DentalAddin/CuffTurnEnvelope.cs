// related files:
// - bg/pc1/esprit-addin/rules.md
// - bg/pc1/esprit-addin/StlFileProcessor.cs
// - bg/pc1/esprit-addin/DentalAddinDecomp/DentalAddin/MainModuleOperations.cs
using System;
using System.Collections.Generic;
using System.Globalization;

namespace DentalAddin
{
    /// <summary>
    /// 커프·피니시라인은 임플란트 축에 대한 원이 아니다.
    /// 선반 프로파일(한 단면)을 그대로 돌리면 튀어나온 마진이 잘린다.
    /// 피니시라인 팁쪽에서 헥스끝까지, 체인 반지름을 그 축 위치의 최대 반지름 아래로 내리지 않는다.
    /// 골을 직선으로 메우거나 샘플 밖으로 끝 반지름을 밀지 않는다. 원소재 어깨가 남으면 Back_Finish D1.0이 부러진다.
    /// 축 구간은 유지한다. 황삭이 깎지 않은 원소재 벽을 물지 않게 하기 위해서다.
    /// </summary>
    internal static class CuffTurnEnvelope
    {
        public const string EnvName = "ABUTS_CUFF_TURN_ENVELOPE";

        public const double BinMm = 0.1;

        /// <summary>피니시라인 최고점보다 팁쪽으로 포락선을 적용하는 길이. Splitline_2 와 같다.</summary>
        public const double TipBufferMm = 0.5;

        /// <summary>직선이 포락선 아래로 이 값보다 더 들어가면 꼭짓점을 남긴다.</summary>
        public const double StraightToleranceMm = 0.05;

        /// <summary>
        /// 직선이 그 축의 최대 반지름보다 이 값보다 더 바깥이면 골 꼭짓점을 남긴다.
        /// 골을 메우면 Back_Rough가 못 지우는 어깨가 남고 Back_Finish D1.0이 물어서 부러진다.
        /// </summary>
        public const double ValleyFillMaxMm = 0.10;

        public const double MinRadiusMm = 0.2;

        public static void Add(Dictionary<int, double> bins, double z, double x, double y, double zCeiling)
        {
            if (bins == null) return;
            if (double.IsNaN(z) || double.IsInfinity(z) || z > zCeiling) return;
            if (double.IsNaN(x) || double.IsInfinity(x) || double.IsNaN(y) || double.IsInfinity(y)) return;
            double r = Math.Sqrt(x * x + y * y);
            if (double.IsNaN(r) || r < MinRadiusMm) return;
            int key = (int)Math.Round(z / BinMm);
            if (!bins.TryGetValue(key, out double current) || r > current)
            {
                bins[key] = r;
            }
        }

        public static string Format(Dictionary<int, double> bins)
        {
            if (bins == null || bins.Count == 0) return null;
            var keys = new List<int>(bins.Keys);
            keys.Sort();
            var parts = new string[keys.Count];
            for (int i = 0; i < keys.Count; i++)
            {
                int key = keys[i];
                double z = key * BinMm;
                parts[i] = string.Format(CultureInfo.InvariantCulture, "{0:0.###}:{1:0.###}", z, bins[key]);
            }
            return string.Join(",", parts);
        }

        public static bool TryParse(string raw, out double[] z, out double[] r)
        {
            z = null;
            r = null;
            if (string.IsNullOrWhiteSpace(raw)) return false;
            string[] parts = raw.Split(',');
            var zs = new List<double>(parts.Length);
            var rs = new List<double>(parts.Length);
            for (int i = 0; i < parts.Length; i++)
            {
                string part = parts[i];
                if (string.IsNullOrWhiteSpace(part)) continue;
                int colon = part.IndexOf(':');
                if (colon <= 0 || colon >= part.Length - 1) continue;
                if (!double.TryParse(part.Substring(0, colon), NumberStyles.Float, CultureInfo.InvariantCulture, out double zz)) continue;
                if (!double.TryParse(part.Substring(colon + 1), NumberStyles.Float, CultureInfo.InvariantCulture, out double rr)) continue;
                if (double.IsNaN(zz) || double.IsInfinity(zz) || double.IsNaN(rr) || double.IsInfinity(rr)) continue;
                if (rr < MinRadiusMm) continue;
                zs.Add(zz);
                rs.Add(rr);
            }
            if (zs.Count == 0) return false;
            z = zs.ToArray();
            r = rs.ToArray();
            Array.Sort(z, r);
            return true;
        }

        /// <summary>
        /// 포락선 위를 직선으로 잇는다.
        /// 직선이 중간 최대 반지름보다 0.05mm 넘게 안쪽이면 꼭짓점을 남긴다.
        /// 직선이 중간 최대 반지름보다 0.10mm 넘게 바깥이면 그 골도 남긴다.
        /// 15도로 골을 메우면 황삭이 원소재에 가깝게 남고, 창 최대값 평탄은 계단이 된다.
        /// </summary>
        public static void SimplifyToUpperLines(double[] z, double[] r, out double[] outZ, out double[] outR)
        {
            outZ = z;
            outR = r;
            if (z == null || r == null || z.Length == 0 || z.Length != r.Length) return;
            if (z.Length <= 2) return;
            var keep = new List<int> { 0 };
            int i = 0;
            while (i < z.Length - 1)
            {
                int j = i + 1;
                for (int k = i + 2; k < z.Length; k++)
                {
                    if (!ChordClears(z, r, i, k)) break;
                    j = k;
                }
                keep.Add(j);
                i = j;
            }
            outZ = new double[keep.Count];
            outR = new double[keep.Count];
            for (int n = 0; n < keep.Count; n++)
            {
                outZ[n] = z[keep[n]];
                outR[n] = r[keep[n]];
            }
        }

        /// <summary>
        /// points[i] = { axialX, radiusY, z }.
        /// machineX = backPointX - sourceZ.
        /// X가 [xLo, xHi] 이고 source Z가 포락선 샘플 안이면, 그 축의 최대 반지름 아래로 두지 않는다.
        /// 샘플 밖(헥스쪽 메시가 없는 구간)은 끝 반지름을 연장하지 않는다.
        /// </summary>
        public static int Raise(List<double[]> points, double[] z, double[] r, double backPointX, double xLo, double xHi)
        {
            if (points == null || z == null || r == null || z.Length == 0 || z.Length != r.Length) return 0;
            if (double.IsNaN(backPointX) || double.IsInfinity(backPointX)) return 0;
            if (double.IsNaN(xLo) || double.IsNaN(xHi)) return 0;
            double lo = Math.Min(xLo, xHi);
            double hi = Math.Max(xLo, xHi);
            SimplifyToUpperLines(z, r, out double[] lineZ, out double[] lineR);
            int raised = 0;
            for (int i = 0; i < points.Count; i++)
            {
                double[] p = points[i];
                if (p == null || p.Length < 2) continue;
                if (p[1] < 0.0) continue;
                if (p[0] < lo - 1e-6 || p[0] > hi + 1e-6) continue;
                if (!TryInterpolateFloor(lineZ, lineR, backPointX - p[0], out double floor)) continue;
                if (floor < MinRadiusMm) continue;
                if (p[1] + 1e-6 < floor)
                {
                    p[1] = floor;
                    raised++;
                }
            }
            return raised;
        }

        private static bool ChordClears(double[] z, double[] r, int i, int j)
        {
            double dz = z[j] - z[i];
            for (int k = i + 1; k < j; k++)
            {
                double t = dz < 1e-9 ? 1.0 : (z[k] - z[i]) / dz;
                double line = r[i] + t * (r[j] - r[i]);
                if (line + StraightToleranceMm < r[k]) return false;
                if (line > r[k] + ValleyFillMaxMm) return false;
            }
            return true;
        }

        private static bool TryInterpolateFloor(double[] z, double[] r, double sourceZ, out double floor)
        {
            floor = 0.0;
            int last = z.Length - 1;
            // 끝 반지름을 샘플 밖으로 밀면 헥스쪽이 넓은 반지름으로 남고, 원소재 어깨가 된다.
            if (sourceZ < z[0] - 1e-6 || sourceZ > z[last] + 1e-6) return false;
            if (sourceZ <= z[0])
            {
                floor = r[0];
                return true;
            }
            if (sourceZ >= z[last])
            {
                floor = r[last];
                return true;
            }
            int i = Array.BinarySearch(z, sourceZ);
            if (i >= 0)
            {
                floor = r[i];
                return true;
            }
            i = ~i;
            if (i <= 0 || i > last) return false;
            double dz = z[i] - z[i - 1];
            if (dz < 1e-9)
            {
                floor = Math.Max(r[i - 1], r[i]);
                return true;
            }
            double t = (sourceZ - z[i - 1]) / dz;
            floor = r[i - 1] + t * (r[i] - r[i - 1]);
            return true;
        }
    }
}
