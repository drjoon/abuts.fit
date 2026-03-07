using System.Windows.Forms;
using Abuts.EspritAddIns.ESPRIT2025AddinProject.Logging;

namespace DentalAddin
{
    // 최소 UI 폼: Project Manager 탭에 붙일 수 있도록 Form 상속
    internal class DentalPanel : Form
    {
        private double fPoint;
        private double bPoint;

        internal DentalPanel()
        {
            Text = "DentalPanel";
            FormBorderStyle = FormBorderStyle.None;
            ShowInTaskbar = false;
            AppLogger.Log("DentalPanel: initialized (stub form)");
        }

        internal void InputFPointVal(double value)
        {
            fPoint = value;
            AppLogger.Log($"DentalPanel: InputFPointVal set to {value}");
        }

        internal void InputBPointVal(double value)
        {
            bPoint = value;
            AppLogger.Log($"DentalPanel: InputBPointVal set to {value}");
        }
    }
}
