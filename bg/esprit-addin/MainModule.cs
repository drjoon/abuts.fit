using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Reflection;
using Esprit;
using EspritConstants;
using EspritFeatures;
using EspritGeometry;
using EspritTechnology;
using DentalAddin;

namespace Acrodent.EspritAddIns.ESPRIT2025AddinProject
{
    internal sealed class MainModule
    {
        public static bool SpindleSide { get; set; } = ProcessConfig.DefaultSpindleSide;
        public static double RoughType { get; set; } = ProcessConfig.DefaultRoughType;

        public static void Bind(Esprit.Application app, Esprit.Document doc)
        {
            // DentalPipeline 내부적으로 Connect.EspritApp/Document를 사용하므로 
            // 여기서는 추가 바인딩 로직이 필요 없음.
        }

        /// <summary>
        /// STL 파일 처리 (Connect.cs에서 호출)
        /// </summary>
        public static void ProcessStlFile(string stlFilePath)
        {
            try
            {
                if (Connect.EspritApp != null)
                {
                    Connect.EspritApp.Processing = true;
                }
                
                Trace.WriteLine($"[MainModule] Processing STL file: {stlFilePath}");
                
                // 0. 소재 템플릿 로드 (어벗 최대 직경 기준) + 임플란트 파라미터 적용
                try
                {
                    var userData = Connect.DentalHost?.CurrentData;
                    if (userData != null)
                    {
                        // RepeatProcess/백엔드에서 전달된 MaxDiameter를 필수로 사용 (5mm 미만이면 예외)
                        double maxDiameter = PatientContext.MaxDiameter;
                        if (maxDiameter <= 5)
                        {
                            throw new ArgumentException($"MaxDiameter invalid (<=5mm): {maxDiameter:F2}");
                        }

                        int materialDiameter = ChooseMaterialDiameter(maxDiameter);
                        string templateDir = @"C:\Users\user\Documents\DP Technology\ESPRIT\Data\Templates";
                        string templatePath = System.IO.Path.Combine(templateDir, $"Hanwha_D{materialDiameter}.est");
                        if (System.IO.File.Exists(templatePath))
                        {
                            Trace.WriteLine($"[MainModule] Opening template as new document: {templatePath}");
                            try
                            {
                                var doc = Connect.EspritApp?.Open(templatePath, Type.Missing);
                                if (doc != null)
                                {
                                    doc.MergeFile(stlFilePath);
                                    Trace.WriteLine($"[MainModule] Loaded template and merged STL: D{materialDiameter} (MaxDiameter~{maxDiameter:F2}mm), STL={stlFilePath}");
                                }
                                else
                                {
                                    Trace.WriteLine("[MainModule] Failed to open template (document null). STL merge skipped.");
                                }
                            }
                            catch (Exception ex)
                            {
                                Trace.WriteLine($"[MainModule] Template open failed: {ex.Message}");
                            }
                        }
                        else
                        {
                            Trace.WriteLine($"[MainModule] Template not found: {templatePath}");
                        }

                        Trace.WriteLine($"[MainModule] Implant params already in DentalHost.CurrentData (NumData len={userData.NumData?.Length}, NumCombobox len={userData.NumCombobox?.Length})");
                    }
                    else
                    {
                        Trace.WriteLine("[MainModule] DentalHost.CurrentData is null; skipping template/implant param update.");
                    }
                }
                catch (Exception ex)
                {
                    Trace.WriteLine($"[MainModule] Template/implant param step failed: {ex.Message}");
                }

                // 1. STL 처리 파이프라인
                DentalPipeline.Run(SpindleSide, RoughType, stlFilePath);

                if (Connect.EspritApp != null)
                {
                    Connect.EspritApp.Processing = false;
                }
                Trace.WriteLine("[MainModule] Process completed successfully.");
            }
            catch (Exception ex)
            {
                if (Connect.EspritApp != null)
                {
                    Connect.EspritApp.Processing = false;
                }
                Trace.WriteLine($"[MainModule] Error: {ex.Message}");
                System.Windows.Forms.MessageBox.Show("Error in Process: " + ex.Message);
            }
        }

        public static void Main()
        {
            try
            {
                if (Connect.EspritApp != null)
                {
                    Connect.EspritApp.Processing = true;
                }
                
                DentalPipeline.Run(SpindleSide, RoughType);

                if (Connect.EspritApp != null)
                {
                    Connect.EspritApp.Processing = false;
                }
                Trace.WriteLine("[MainModule] Process completed successfully.");
            }
            catch (Exception ex)
            {
                if (Connect.EspritApp != null)
                {
                    Connect.EspritApp.Processing = false;
                }
                System.Windows.Forms.MessageBox.Show("Error in Main Process: " + ex.Message);
            }
        }

        private static int ChooseMaterialDiameter(double maxDiameter)
        {
            var stockDiameters = new[] { 6, 8, 10, 12, 14 };
            double target = maxDiameter <= 0 ? 6 : maxDiameter;
            int chosen = stockDiameters.FirstOrDefault(d => d >= target);
            return chosen == 0 ? stockDiameters.Last() : chosen;
        }

        private static string FormatArray<T>(IEnumerable<T> arr)
        {
            if (arr == null) return "null";
            return "[" + string.Join(",", arr) + "]";
        }
    }
}
