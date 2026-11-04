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
    /// 축 구간은 유지한다. 황삭이 깎지 않은 원소재 벽을 물지 않게 하기 위해서다.
    /// </summary>
    internal static class CuffTurnEnvelope
    {
        public const string EnvName = "ABUTS_CUFF_TURN_ENVELOPE";

        public const double BinMm = 0.1;

        /// <summary>피니시라인 최고점보다 팁쪽으로 포락선을 적용하는 길이. Splitline_2 와 같다.</summary>
        public const double TipBufferMm = 0.5;

        /// <summary>최대 반지름 밖으로 더 띄우는 양. 피크에 바짝 붙지 않게 한다.</summary>
        public const double RadialClearanceMm = 0.3;

        /// <summary>축 방향 대비 반지름이 내려가는 최대 기울기. 계단 대신 이 경사로 잇는다.</summary>
        public const double RampAngleDeg = 15.0;

        /// <summary>구간 경계에서 경사를 바깥으로 이어 급격한 단차가 나지 않게 하는 길이.</summary>
        public const double BoundaryFeatherMm = 3.0;

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
        /// 포락선에 여유를 더하고, 피크 사이를 최대 기울기 경사로 채운다.
        /// 창 최대값으로 평탄을 만들면 툴패스가 계단이 된다.
        /// </summary>
        public static void ApplySmoothClearance(double[] z, double[] r)
        {
            if (z == null || r == null || z.Length == 0 || z.Length != r.Length) return;
            double slope = Math.Tan(RampAngleDeg * Math.PI / 180.0);
            for (int i = 0; i < r.Length; i++) r[i] += RadialClearanceMm;
            for (int i = 1; i < r.Length; i++)
            {
                double dz = z[i] - z[i - 1];
                if (dz < 1e-9)
                {
                    if (r[i - 1] > r[i]) r[i] = r[i - 1];
                    continue;
                }
                double allow = r[i - 1] - slope * dz;
                if (allow > r[i]) r[i] = allow;
            }
            for (int i = r.Length - 2; i >= 0; i--)
            {
                double dz = z[i + 1] - z[i];
                if (dz < 1e-9)
                {
                    if (r[i + 1] > r[i]) r[i] = r[i + 1];
                    continue;
                }
                double allow = r[i + 1] - slope * dz;
                if (allow > r[i]) r[i] = allow;
            }
        }

        /// <summary>
        /// points[i] = { axialX, radiusY, z }.
        /// machineX = backPointX - sourceZ.
        /// X가 [xLo, xHi] 이면 완만한 포락선 아래로 두지 않는다.
        /// 경계 밖 3mm는 같은 경사로 이어 단차를 없앤다.
        /// </summary>
        public static int Raise(List<double[]> points, double[] z, double[] r, double backPointX, double xLo, double xHi)
        {
            if (points == null || z == null || r == null || z.Length == 0 || z.Length != r.Length) return 0;
            if (double.IsNaN(backPointX) || double.IsInfinity(backPointX)) return 0;
            if (double.IsNaN(xLo) || double.IsNaN(xHi)) return 0;
            double lo = Math.Min(xLo, xHi);
            double hi = Math.Max(xLo, xHi);
            double[] smooth = (double[])r.Clone();
            ApplySmoothClearance(z, smooth);
            double slope = Math.Tan(RampAngleDeg * Math.PI / 180.0);
            double edgeLo = InterpolateFloor(z, smooth, backPointX - lo);
            double edgeHi = InterpolateFloor(z, smooth, backPointX - hi);
            int raised = 0;
            for (int i = 0; i < points.Count; i++)
            {
                double[] p = points[i];
                if (p == null || p.Length < 2) continue;
                if (p[1] < 0.0) continue;
                double floor;
                if (p[0] >= lo - 1e-6 && p[0] <= hi + 1e-6)
                {
                    floor = InterpolateFloor(z, smooth, backPointX - p[0]);
                }
                else if (p[0] < lo && lo - p[0] <= BoundaryFeatherMm)
                {
                    floor = edgeLo - slope * (lo - p[0]);
                }
                else if (p[0] > hi && p[0] - hi <= BoundaryFeatherMm)
                {
                    floor = edgeHi - slope * (p[0] - hi);
                }
                else
                {
                    continue;
                }
                if (floor < MinRadiusMm) continue;
                if (p[1] + 1e-6 < floor)
                {
                    p[1] = floor;
                    raised++;
                }
            }
            return raised;
        }

        private static double InterpolateFloor(double[] z, double[] r, double sourceZ)
        {
            if (sourceZ <= z[0]) return r[0];
            int last = z.Length - 1;
            if (sourceZ >= z[last]) return r[last];
            int i = Array.BinarySearch(z, sourceZ);
            if (i >= 0) return r[i];
            i = ~i;
            if (i <= 0) return r[0];
            if (i > last) return r[last];
            double dz = z[i] - z[i - 1];
            if (dz < 1e-9) return Math.Max(r[i - 1], r[i]);
            double t = (sourceZ - z[i - 1]) / dz;
            return r[i - 1] + t * (r[i] - r[i - 1]);
        }
    }
}
