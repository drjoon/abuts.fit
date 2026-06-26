using Abuts.EspritAddIns.ESPRIT2025AddinProject;
using Esprit;
using EspritConstants;
using Microsoft.VisualBasic.CompilerServices;
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Runtime.CompilerServices;

namespace DentalAddin
{
    internal sealed partial class MainModule
    {
        private static GraphicObject MergeSurfaceWithLogging(string filePath, string context)
        {
            HashSet<string> beforeKeys = SnapshotSurfaceKeys();

            DentalLogger.Log($"{context} - MergeFile: {filePath}");
            Document.MergeFile(filePath, RuntimeHelpers.GetObjectValue(Missing.Value));

            GraphicObject surface = FindNewMergedSurface(beforeKeys, context);
            if (surface == null)
            {
                // 보수 fallback: 새 surface 탐지 실패 시 최신 surface를 사용하되 경고 로그를 남긴다.
                surface = GetLatestSurface(context);
                if (surface != null)
                {
                    string fallbackKey = Convert.ToString(surface.Key, CultureInfo.InvariantCulture) ?? string.Empty;
                    DentalLogger.Log($"{context} - 신규 Surface 탐지 실패, 최신 Surface fallback 사용(key:{fallbackKey})");
                }
            }

            if (surface == null)
            {
                DentalLogger.Log($"{context} - MergeFile 후 Surface 미생성");
                return null;
            }

            if (surface.Layer != null)
            {
                surface.Layer.Visible = false;
            }

            return surface;
        }

        private static HashSet<string> SnapshotSurfaceKeys()
        {
            HashSet<string> keys = new HashSet<string>(StringComparer.Ordinal);
            if (Document?.GraphicsCollection == null)
            {
                return keys;
            }

            int count = Document.GraphicsCollection.Count;
            for (int i = 1; i <= count; i++)
            {
                GraphicObject item = null;
                try { item = (GraphicObject)Document.GraphicsCollection[i]; } catch { }
                if (item?.GraphicObjectType != espGraphicObjectType.espSurface)
                {
                    continue;
                }

                string key = null;
                try { key = Convert.ToString(item.Key, CultureInfo.InvariantCulture); } catch { }
                if (!string.IsNullOrWhiteSpace(key))
                {
                    keys.Add(key);
                }
            }

            return keys;
        }

        private static GraphicObject FindNewMergedSurface(HashSet<string> beforeKeys, string context)
        {
            if (Document?.GraphicsCollection == null)
            {
                return null;
            }

            int count = Document.GraphicsCollection.Count;
            for (int i = 1; i <= count; i++)
            {
                GraphicObject item = null;
                try { item = (GraphicObject)Document.GraphicsCollection[i]; } catch { }
                if (item?.GraphicObjectType != espGraphicObjectType.espSurface)
                {
                    continue;
                }

                string key = null;
                try { key = Convert.ToString(item.Key, CultureInfo.InvariantCulture); } catch { }
                if (string.IsNullOrWhiteSpace(key))
                {
                    continue;
                }

                if (beforeKeys == null || !beforeKeys.Contains(key))
                {
                    return item;
                }
            }

            DentalLogger.Log($"{context} - Merge 후 신규 Surface key 탐지 실패");
            return null;
        }

        private static int _auxDriveSurfaceKey;
        private static string _auxDriveTransformSignature;

        private static bool EnsureAuxDriveSurfaceForFinishA(string projectSurfacePath, string context)
        {
            // FINISH_A용 보조 드라이브 곡면은 TurningProfile 계산 후(NeedMove=True) 생성한다.
            // 초기 Emerge(NeedMove=False)에서 만들면 XT/ZT가 0일 수 있어 잘못된 스케일이 적용된다.
            if (!MoveSTL_Module.NeedMove)
            {
                DentalLogger.Log($"{context} - AuxDrive 생성 생략(NeedMove=False)");
                return false;
            }

            double scale = Math.Abs(XT);
            double shiftX = ZT;
            if (scale <= 1e-6)
            {
                DentalLogger.Log($"{context} - AuxDrive 생성 생략(XT≈0, XT={XT:0.######}, ZT={ZT:0.######})");
                return false;
            }

            GraphicObject aux = null;
            int auxKey = 0;
            try { auxKey = Convert.ToInt32(Math.Round(SurfaceNumber2)); } catch { auxKey = 0; }
            if (auxKey > 0)
            {
                aux = FindSurfaceByKey(auxKey);
            }

            if (aux == null)
            {
                aux = MergeSurfaceWithLogging(projectSurfacePath, $"{context}:AuxDrive");
                if (aux == null)
                {
                    return false;
                }
                try
                {
                    SurfaceNumber2 = Conversions.ToDouble(aux.Key);
                    _auxDriveSurfaceKey = Conversions.ToInteger(aux.Key);
                }
                catch
                {
                    SurfaceNumber2 = 0.0;
                    _auxDriveSurfaceKey = 0;
                }
                _auxDriveTransformSignature = null;
                DentalLogger.Log($"{context} - AuxDrive 생성 완료 key={SurfaceNumber2:0}");
            }

            if (aux?.Layer != null)
            {
                try { aux.Layer.Visible = false; } catch { }
            }

            int currentAuxKey = 0;
            try { currentAuxKey = Conversions.ToInteger(aux.Key); } catch { }

            // 안전장치:
            // 일부 케이스에서 Merge 후 "최신 Surface" 탐지 결과가 기본 DriveSurface와 동일 키로
            // 반환될 수 있다. 이 상태에서 Aux 변환을 적용하면 기본 DriveSurface까지 함께 변형되어
            // FINISH_A/FINISH_B 경로 Z가 틀어질 수 있으므로 즉시 중단한다.
            int baseDriveKey = 0;
            try { baseDriveKey = Conversions.ToInteger(SurfaceNumber); } catch { baseDriveKey = 0; }
            if (currentAuxKey > 0 && baseDriveKey > 0 && currentAuxKey == baseDriveKey)
            {
                SurfaceNumber2 = 0.0;
                _auxDriveSurfaceKey = 0;
                _auxDriveTransformSignature = null;
                DentalLogger.Log($"{context} - AuxDrive와 기본 DriveSurface 키 충돌 감지(key:{currentAuxKey}), Aux 변환 건너뜀");
                return false;
            }

            string signature = $"{scale:0.######},{shiftX:0.######}";
            if (currentAuxKey > 0 && _auxDriveSurfaceKey == currentAuxKey && string.Equals(_auxDriveTransformSignature, signature, StringComparison.Ordinal))
            {
                DentalLogger.Log($"{context} - AuxDrive 변환 재적용 방지 (key:{currentAuxKey}, sig:{signature})");
                return true;
            }

            SelectionSet selectionSet = EnsureSelectionSet("SauxDrive");
            if (selectionSet == null)
            {
                DentalLogger.Log($"{context} - AuxDrive 변환 실패: SelectionSet 생성 실패");
                return false;
            }

            Point origin = Document.GetPoint(0, 0, 0);
            selectionSet.RemoveAll();
            selectionSet.Add(aux, RuntimeHelpers.GetObjectValue(Missing.Value));
            selectionSet.ScaleUniform(origin, scale, 0);
            selectionSet.Translate(shiftX, 0.0, 0.0, 0);
            selectionSet.RemoveAll();

            _auxDriveSurfaceKey = currentAuxKey;
            _auxDriveTransformSignature = signature;
            DentalLogger.Log($"{context} - AuxDrive 변환 적용 (key:{currentAuxKey}, scale|XT:{scale:0.######}, shiftX|ZT:{shiftX:0.######})");
            return true;
        }

        private static bool HasPoints(params int[] indices)
        {
            if (ptp == null)
            {
                return false;
            }
            foreach (var idx in indices)
            {
                if (idx <= 0 || idx >= ptp.Length || ptp[idx] == null)
                {
                    return false;
                }
            }
            return true;
        }

        private static GraphicObject FindSurfaceByKey(int key)
        {
            if (key <= 0 || Document?.GraphicsCollection == null)
            {
                return null;
            }

            int count = Document.GraphicsCollection.Count;
            for (int i = 1; i <= count; i++)
            {
                GraphicObject item = null;
                try { item = (GraphicObject)Document.GraphicsCollection[i]; } catch { }
                if (item?.GraphicObjectType != espGraphicObjectType.espSurface)
                {
                    continue;
                }

                int itemKey = 0;
                try { itemKey = Conversions.ToInteger(item.Key); } catch { }
                if (itemKey == key)
                {
                    return item;
                }
            }

            return null;
        }

        private static void SetDriveSurfaceState(GraphicObject surface, string context)
        {
            if (surface == null)
            {
                return;
            }

            try
            {
                if (surface.Layer != null)
                {
                    surface.Layer.Visible = false;
                }
            }
            catch { }

            try { SurfaceNumber = Conversions.ToInteger(surface.Key); } catch { SurfaceNumber = 0; }
            // 정책: Project 기본 드라이브는 변형 금지.
            // FINISH_A는 보조 드라이브(SurfaceNumber2), FINISH_B는 기본 드라이브(SurfaceNumber)를 사용한다.
            Gas = null;

            DentalLogger.Log($"{context} - DriveSurface 설정: SurfaceNumber={SurfaceNumber}, SurfaceNumber2={SurfaceNumber2:0}, GasKey=<null>");
        }

        public static void Emerge()
        {
            string surfaceRoot = ResolveSurfaceRoot();
            string projectFile = RL == 2.0 ? "Project2.igs" : "Project1.igs";
            string mergeFileName = Path.Combine(surfaceRoot, projectFile);

            if (!File.Exists(mergeFileName))
            {
                DentalLogger.Log($"Emerge - Project surface 파일을 찾지 못했습니다: {mergeFileName}");
                return;
            }

            GraphicObject driveSurface = FindSurfaceByKey(SurfaceNumber);
            if (driveSurface != null)
            {
                DentalLogger.Log($"Emerge - 기존 DriveSurface 재사용: key={SurfaceNumber}");
                SetDriveSurfaceState(driveSurface, "Emerge(reuse)");
                EnsureAuxDriveSurfaceForFinishA(mergeFileName, "Emerge(reuse)");
                DentalLogger.Log("Emerge(reuse) - 기본 DriveSurface 변형 금지, FINISH_A용 AuxDrive 별도 사용");
                return;
            }

            // 기존 key가 유효하지 않으면 1회만 신규 merge하여 기본 DriveSurface를 만든다.
            driveSurface = MergeSurfaceWithLogging(mergeFileName, "Emerge(Project)");
            if (driveSurface == null)
            {
                return;
            }

            // 신규 케이스 시작 시 FINISH_A 보조 드라이브 상태 초기화
            SurfaceNumber2 = 0.0;
            _auxDriveSurfaceKey = 0;
            _auxDriveTransformSignature = null;

            SetDriveSurfaceState(driveSurface, "Emerge(Project)");
            EnsureAuxDriveSurfaceForFinishA(mergeFileName, "Emerge(Project)");
            DentalLogger.Log("Emerge - 정책 적용: 기본(Project) + FINISH_A AuxDrive 분리 사용 (Extrude 미사용)");
        }
    }
}
