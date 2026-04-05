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

        private static void ApplySurfaceTranslation(GraphicObject surface, string context)
        {
            if (surface == null)
            {
                DentalLogger.Log($"{context} - Surface null");
                return;
            }

            if (!MoveSTL_Module.NeedMove)
            {
                DentalLogger.Log($"{context} - Move 필요 없음 (NeedMove=False)");
                return;
            }

            SelectionSet selectionSet = EnsureSelectionSet("Smove");
            if (selectionSet == null)
            {
                DentalLogger.Log($"{context} - SelectionSet 'Smove' 생성 실패");
                return;
            }

            selectionSet.RemoveAll();
            selectionSet.Add(surface, RuntimeHelpers.GetObjectValue(Missing.Value));
            selectionSet.Translate(0.0, MoveSTL_Module.NeedMoveY, MoveSTL_Module.NeedMoveZ, 0);
            DentalLogger.Log($"{context} - Surface Translate 적용 (dY:{MoveSTL_Module.NeedMoveY:0.000}, dZ:{MoveSTL_Module.NeedMoveZ:0.000})");
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

        public static void Emerge()
        {
            string surfaceRoot = ResolveSurfaceRoot();
            string projectFile = RL == 2.0 ? "Project2.igs" : "Project1.igs";
            string extrudeFile = RL == 2.0 ? "ExtrudeL.igs" : "ExtrudeR.igs";
            string mergeFileName = Path.Combine(surfaceRoot, projectFile);
            string mergeFileName2 = Path.Combine(surfaceRoot, extrudeFile);

            if (!File.Exists(mergeFileName))
            {
                DentalLogger.Log($"Emerge - Project surface 파일을 찾지 못했습니다: {mergeFileName}");
                return;
            }

            DentalLogger.Log($"Emerge - MergeFile1: {mergeFileName}");
            Document.MergeFile(mergeFileName, RuntimeHelpers.GetObjectValue(Missing.Value));

            SelectionSet selectionSet = Document.SelectionSets["Smove"];
            if (selectionSet == null)
            {
                selectionSet = Document.SelectionSets.Add("Smove");
            }
            selectionSet.RemoveAll();
            int count = Document.GraphicsCollection.Count;
            checked
            {
                GraphicObject graphicObject = default(GraphicObject);
                for (int i = 1; i <= count; i++)
                {
                    graphicObject = (GraphicObject)Document.GraphicsCollection[i];
                    if (graphicObject.GraphicObjectType == espGraphicObjectType.espSurface)
                    {
                        graphicObject.Layer.Visible = false;
                        break;
                    }
                }
                SurfaceNumber = Conversions.ToInteger(graphicObject.Key);
                if (MoveSTL_Module.NeedMove)
                {
                    selectionSet.Add(graphicObject, RuntimeHelpers.GetObjectValue(Missing.Value));
                    selectionSet.Translate(0.0, MoveSTL_Module.NeedMoveY, MoveSTL_Module.NeedMoveZ, 0);
                }
                int finishingMethod = (NumCombobox != null && NumCombobox.Length > 1) ? NumCombobox[1] : 0;
                if (finishingMethod == 1)
                {
                    DentalLogger.Log("Emerge - FinishingMethod==1, Extrude 파일 로드 생략");
                    return;
                }
                if (!File.Exists(mergeFileName2))
                {
                    DentalLogger.Log($"Emerge - Extrude surface 파일을 찾지 못했습니다: {mergeFileName2}");
                    return;
                }
                DentalLogger.Log($"Emerge - MergeFile2: {mergeFileName2}");
                Document.MergeFile(mergeFileName2, RuntimeHelpers.GetObjectValue(Missing.Value));
                int count2 = Document.GraphicsCollection.Count;
                for (int i = 1; i <= count2; i++)
                {
                    graphicObject = (GraphicObject)Document.GraphicsCollection[i];
                    if (graphicObject.GraphicObjectType == espGraphicObjectType.espSurface && Conversions.ToDouble(graphicObject.Key) != (double)SurfaceNumber)
                    {
                        graphicObject.Layer.Visible = false;
                        Gas = graphicObject;
                        break;
                    }
                }
                SurfaceNumber2 = Conversions.ToDouble(graphicObject.Key);
            }
        }
    }
}
