// change-log:
// - 2026-10-24: PNG 라벨을 지정 크기로 페이지 가운데 출력. A4에서도 100×150mm를 넘기지 않음.
// related files:
// - bg/lab-wbls/win/HttpServer.cs
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Printing;
using System.IO;
using System.Threading;

namespace Abuts.LabWbls
{
    internal static class LabelPrint
    {
        public static List<string> ListPrinters()
        {
            var list = new List<string>();
            foreach (string name in PrinterSettings.InstalledPrinters)
            {
                if (!string.IsNullOrWhiteSpace(name)) list.Add(name);
            }
            return list;
        }

        public static string DefaultPrinter()
        {
            try
            {
                var settings = new PrinterSettings();
                if (settings.IsValid && !string.IsNullOrWhiteSpace(settings.PrinterName))
                {
                    return settings.PrinterName;
                }
            }
            catch
            {
                // 기본 프린터 없음
            }
            foreach (string name in PrinterSettings.InstalledPrinters)
            {
                if (!string.IsNullOrWhiteSpace(name)) return name;
            }
            return "";
        }

        public static void PrintPng(byte[] png, string printer, string title, double widthMm, double heightMm)
        {
            if (png == null || png.Length < 32)
            {
                throw new InvalidOperationException("라벨 이미지가 없습니다.");
            }
            var name = string.IsNullOrWhiteSpace(printer) ? DefaultPrinter() : printer.Trim();
            if (string.IsNullOrEmpty(name))
            {
                throw new InvalidOperationException("사용할 프린터가 없습니다.");
            }

            Exception error = null;
            var thread = new Thread(() =>
            {
                try
                {
                    PrintOnSta(png, name, title, widthMm, heightMm);
                }
                catch (Exception ex)
                {
                    error = ex;
                }
            });
            thread.SetApartmentState(ApartmentState.STA);
            thread.IsBackground = true;
            thread.Start();
            thread.Join();
            if (error != null) throw error;
        }

        private static void PrintOnSta(byte[] png, string printer, string title, double widthMm, double heightMm)
        {
            using (var image = new Bitmap(new MemoryStream(png)))
            using (var doc = new PrintDocument())
            {
                doc.PrinterSettings.PrinterName = printer;
                if (!doc.PrinterSettings.IsValid)
                {
                    throw new InvalidOperationException("프린터를 찾을 수 없습니다.");
                }
                doc.DocumentName = string.IsNullOrWhiteSpace(title) ? "어벗츠 택배 라벨" : title;
                doc.PrintController = new StandardPrintController();
                doc.DefaultPageSettings.Margins = new Margins(0, 0, 0, 0);
                var wMm = widthMm > 20 ? widthMm : 100;
                var hMm = heightMm > 20 ? heightMm : 150;
                doc.PrintPage += (s, e) =>
                {
                    var g = e.Graphics;
                    g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                    g.PixelOffsetMode = PixelOffsetMode.HighQuality;
                    float wantW = (float)(wMm / 25.4 * 100.0);
                    float wantH = (float)(hMm / 25.4 * 100.0);
                    var bounds = e.PageBounds;
                    float scale = Math.Min(bounds.Width / wantW, bounds.Height / wantH);
                    if (scale > 1f) scale = 1f;
                    float dw = wantW * scale;
                    float dh = wantH * scale;
                    float x = bounds.Left + (bounds.Width - dw) / 2f;
                    float y = bounds.Top + (bounds.Height - dh) / 2f;
                    g.DrawImage(image, x, y, dw, dh);
                    e.HasMorePages = false;
                };
                doc.Print();
            }
        }
    }
}
