// related files:
// - bg/pc1/esprit-addin/StlFileProcessor.cs
// - bg/pc1/esprit-addin/Logging/AppLogger.cs
// - bg/pc1/esprit-addin/rules.md
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Text;
using Abuts.EspritAddIns.ESPRIT2025AddinProject.Logging;

namespace Abuts.EspritAddIns.ESPRIT2025AddinProject.Helpers
{
    /// <summary>
    /// Esprit MergeFile 전용 메시 축소. 뷰어/S3 filled STL은 건드리지 않고
    /// 로컬 임시 .cam-decimate.stl 만 만든다. 정점 격자 클러스터링.
    /// 기본 OFF — 메시 품질(커프·헥스) 깨짐. 켜려면 ABUTS_CAM_DECIMATE=1.
    /// </summary>
    internal static class CamStlDecimator
    {
        public const string EnableEnv = "ABUTS_CAM_DECIMATE";
        public const int TargetMaxTriangles = 28000;
        public const double StartCellMm = 0.15;
        public const double MaxCellMm = 0.50;
        public const double CellGrow = 1.25;

        private static bool IsEnabled()
        {
            try
            {
                string raw = Environment.GetEnvironmentVariable(EnableEnv);
                return string.Equals(raw, "1", StringComparison.OrdinalIgnoreCase)
                    || string.Equals(raw, "true", StringComparison.OrdinalIgnoreCase);
            }
            catch
            {
                return false;
            }
        }

        public sealed class Result
        {
            public string MergePath { get; set; }
            public bool Decimated { get; set; }
            public long SrcBytes { get; set; }
            public int SrcTris { get; set; }
            public long OutBytes { get; set; }
            public int OutTris { get; set; }
            public double CellMm { get; set; }
            public long ElapsedMs { get; set; }
            public string Reason { get; set; }
        }

        public static Result PrepareForMerge(string stlPath, string requestId)
        {
            var sw = Stopwatch.StartNew();
            var result = new Result
            {
                MergePath = stlPath,
                Decimated = false,
                CellMm = 0,
                Reason = "init",
            };

            try
            {
                if (string.IsNullOrWhiteSpace(stlPath) || !File.Exists(stlPath))
                {
                    result.Reason = "missing-src";
                    result.ElapsedMs = sw.ElapsedMilliseconds;
                    LogResult(requestId, result, stlPath);
                    return result;
                }

                if (!IsEnabled())
                {
                    result.Reason = "disabled";
                    result.ElapsedMs = sw.ElapsedMilliseconds;
                    LogResult(requestId, result, stlPath);
                    return result;
                }

                byte[] data = File.ReadAllBytes(stlPath);
                result.SrcBytes = data.Length;
                if (!TryParseBinary(data, out float[] verts, out int triCount))
                {
                    result.Reason = "non-binary-or-parse-fail";
                    result.SrcTris = 0;
                    result.OutBytes = result.SrcBytes;
                    result.OutTris = 0;
                    result.ElapsedMs = sw.ElapsedMilliseconds;
                    LogResult(requestId, result, stlPath);
                    return result;
                }

                result.SrcTris = triCount;
                if (triCount <= TargetMaxTriangles)
                {
                    result.Reason = "under-target";
                    result.OutBytes = result.SrcBytes;
                    result.OutTris = triCount;
                    result.ElapsedMs = sw.ElapsedMilliseconds;
                    LogResult(requestId, result, stlPath);
                    return result;
                }

                double cell = StartCellMm;
                int outTris = triCount;
                byte[] outBytes = null;
                double usedCell = cell;
                while (true)
                {
                    outBytes = ClusterWrite(verts, triCount, cell, out outTris);
                    usedCell = cell;
                    if (outTris <= TargetMaxTriangles || cell >= MaxCellMm - 1e-9)
                    {
                        break;
                    }
                    cell = Math.Min(MaxCellMm, cell * CellGrow);
                }

                string dir = Path.GetDirectoryName(stlPath) ?? Path.GetTempPath();
                string baseName = Path.GetFileNameWithoutExtension(stlPath);
                string outPath = Path.Combine(dir, baseName + ".cam-decimate.stl");
                File.WriteAllBytes(outPath, outBytes);

                result.MergePath = outPath;
                result.Decimated = true;
                result.OutBytes = outBytes.Length;
                result.OutTris = outTris;
                result.CellMm = usedCell;
                result.Reason = outTris <= TargetMaxTriangles ? "ok" : "best-effort-over-target";
                result.ElapsedMs = sw.ElapsedMilliseconds;
                LogResult(requestId, result, stlPath);
                AppLogger.Log(
                    $"[PERF] CamStlDecimator END elapsedMs={result.ElapsedMs} srcTris={result.SrcTris} outTris={result.OutTris} cellMm={result.CellMm.ToString("F3", CultureInfo.InvariantCulture)} reason={result.Reason}");
                return result;
            }
            catch (Exception ex)
            {
                result.Reason = "error:" + ex.GetType().Name;
                result.ElapsedMs = sw.ElapsedMilliseconds;
                AppLogger.Log($"CamStlDecimator: 실패, 원본 사용 - {ex.GetType().Name}:{ex.Message}");
                LogResult(requestId, result, stlPath);
                return result;
            }
        }

        private static void LogResult(string requestId, Result result, string srcPath)
        {
            var sb = new StringBuilder(320);
            sb.Append("{\"ts\":\"").Append(DateTime.Now.ToString("o")).Append("\",");
            sb.Append("\"kind\":\"cam-decimate\",");
            sb.Append("\"requestId\":\"").Append(Escape(requestId)).Append("\",");
            sb.Append("\"srcPath\":\"").Append(Escape(srcPath)).Append("\",");
            sb.Append("\"mergePath\":\"").Append(Escape(result.MergePath)).Append("\",");
            sb.Append("\"decimated\":").Append(result.Decimated ? "true" : "false").Append(",");
            sb.Append("\"srcBytes\":").Append(result.SrcBytes).Append(",");
            sb.Append("\"srcTris\":").Append(result.SrcTris).Append(",");
            sb.Append("\"outBytes\":").Append(result.OutBytes).Append(",");
            sb.Append("\"outTris\":").Append(result.OutTris).Append(",");
            sb.Append("\"cellMm\":").Append(result.CellMm.ToString("0.###", CultureInfo.InvariantCulture)).Append(",");
            sb.Append("\"targetMaxTris\":").Append(TargetMaxTriangles).Append(",");
            sb.Append("\"elapsedMs\":").Append(result.ElapsedMs).Append(",");
            sb.Append("\"reason\":\"").Append(Escape(result.Reason)).Append("\"}");
            AppLogger.LogAnalysisJson(sb.ToString());
            AppLogger.Log(
                $"[CAM-DECIMATE] requestId={requestId ?? ""} decimated={result.Decimated} srcTris={result.SrcTris} outTris={result.OutTris} srcBytes={result.SrcBytes} outBytes={result.OutBytes} cellMm={result.CellMm.ToString("F3", CultureInfo.InvariantCulture)} elapsedMs={result.ElapsedMs} reason={result.Reason}");
        }

        private static string Escape(string value)
        {
            if (string.IsNullOrEmpty(value)) return "";
            return value.Replace("\\", "\\\\").Replace("\"", "\\\"");
        }

        private static bool TryParseBinary(byte[] data, out float[] verts, out int triCount)
        {
            verts = null;
            triCount = 0;
            if (data == null || data.Length < 84) return false;
            triCount = BitConverter.ToInt32(data, 80);
            if (triCount <= 0) return false;
            long expect = 84L + (long)triCount * 50L;
            if (expect != data.Length) return false;
            verts = new float[triCount * 9];
            int vi = 0;
            for (int t = 0; t < triCount; t++)
            {
                int off = 84 + t * 50 + 12;
                for (int k = 0; k < 9; k++)
                {
                    verts[vi++] = BitConverter.ToSingle(data, off + k * 4);
                }
            }
            return true;
        }

        private static byte[] ClusterWrite(float[] verts, int triCount, double cell, out int outTris)
        {
            var map = new Dictionary<long, int>(Math.Min(triCount, 200000));
            var clusterPos = new List<float>(Math.Min(triCount * 3, 600000));
            var faces = new List<int>(Math.Min(triCount * 3, 600000));
            var seenFace = new HashSet<long>();

            int MapVert(float x, float y, float z)
            {
                int ix = (int)Math.Floor(x / cell);
                int iy = (int)Math.Floor(y / cell);
                int iz = (int)Math.Floor(z / cell);
                long key = PackKey(ix, iy, iz);
                int id;
                if (map.TryGetValue(key, out id)) return id;
                id = clusterPos.Count / 3;
                map[key] = id;
                clusterPos.Add(x);
                clusterPos.Add(y);
                clusterPos.Add(z);
                return id;
            }

            for (int t = 0; t < triCount; t++)
            {
                int b = t * 9;
                int a0 = MapVert(verts[b], verts[b + 1], verts[b + 2]);
                int a1 = MapVert(verts[b + 3], verts[b + 4], verts[b + 5]);
                int a2 = MapVert(verts[b + 6], verts[b + 7], verts[b + 8]);
                if (a0 == a1 || a1 == a2 || a2 == a0) continue;
                long fkey = FaceKey(a0, a1, a2);
                if (!seenFace.Add(fkey)) continue;
                faces.Add(a0);
                faces.Add(a1);
                faces.Add(a2);
            }

            outTris = faces.Count / 3;
            var buf = new byte[84 + outTris * 50];
            byte[] header = Encoding.ASCII.GetBytes("abuts.fit cam-decimate");
            Buffer.BlockCopy(header, 0, buf, 0, Math.Min(header.Length, 80));
            BitConverter.GetBytes(outTris).CopyTo(buf, 80);

            for (int t = 0; t < outTris; t++)
            {
                int fa = faces[t * 3];
                int fb = faces[t * 3 + 1];
                int fc = faces[t * 3 + 2];
                float ax = clusterPos[fa * 3], ay = clusterPos[fa * 3 + 1], az = clusterPos[fa * 3 + 2];
                float bx = clusterPos[fb * 3], by = clusterPos[fb * 3 + 1], bz = clusterPos[fb * 3 + 2];
                float cx = clusterPos[fc * 3], cy = clusterPos[fc * 3 + 1], cz = clusterPos[fc * 3 + 2];
                float ux = bx - ax, uy = by - ay, uz = bz - az;
                float vx = cx - ax, vy = cy - ay, vz = cz - az;
                float nx = uy * vz - uz * vy;
                float ny = uz * vx - ux * vz;
                float nz = ux * vy - uy * vx;
                float len = (float)Math.Sqrt(nx * nx + ny * ny + nz * nz);
                if (len > 1e-12f)
                {
                    nx /= len;
                    ny /= len;
                    nz /= len;
                }
                else
                {
                    nx = 0;
                    ny = 0;
                    nz = 1;
                }

                int off = 84 + t * 50;
                WriteFloat(buf, off + 0, nx);
                WriteFloat(buf, off + 4, ny);
                WriteFloat(buf, off + 8, nz);
                WriteFloat(buf, off + 12, ax);
                WriteFloat(buf, off + 16, ay);
                WriteFloat(buf, off + 20, az);
                WriteFloat(buf, off + 24, bx);
                WriteFloat(buf, off + 28, by);
                WriteFloat(buf, off + 32, bz);
                WriteFloat(buf, off + 36, cx);
                WriteFloat(buf, off + 40, cy);
                WriteFloat(buf, off + 44, cz);
                buf[off + 48] = 0;
                buf[off + 49] = 0;
            }

            return buf;
        }

        private static void WriteFloat(byte[] buf, int offset, float value)
        {
            BitConverter.GetBytes(value).CopyTo(buf, offset);
        }

        private static long PackKey(int ix, int iy, int iz)
        {
            // 21 bit each, biased to keep negatives
            const int bias = 1 << 20;
            long x = (ix + bias) & 0x1FFFFF;
            long y = (iy + bias) & 0x1FFFFF;
            long z = (iz + bias) & 0x1FFFFF;
            return (x << 42) | (y << 21) | z;
        }

        private static long FaceKey(int a, int b, int c)
        {
            // order-independent key
            int x = a, y = b, z = c;
            if (x > y) { int t = x; x = y; y = t; }
            if (y > z) { int t = y; y = z; z = t; }
            if (x > y) { int t = x; x = y; y = t; }
            return ((long)x << 42) ^ ((long)y << 21) ^ (uint)z;
        }
    }
}
