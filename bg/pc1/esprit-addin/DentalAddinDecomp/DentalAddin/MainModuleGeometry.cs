using Abuts.EspritAddIns.ESPRIT2025AddinProject;
using Esprit;
using EspritConstants;
using Microsoft.VisualBasic.CompilerServices;
using System;
using System.IO;
using System.Reflection;
using System.Runtime.CompilerServices;

namespace DentalAddin
{
    internal sealed partial class MainModule
    {
        private static GraphicObject MergeSurfaceWithLogging(string filePath, string context)
        {
            DentalLogger.Log($"{context} - MergeFile: {filePath}");
            Document.MergeFile(filePath, RuntimeHelpers.GetObjectValue(Missing.Value));
            GraphicObject surface = GetLatestSurface(context);
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
