using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
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
    }
}
