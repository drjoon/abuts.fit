using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using DentalAddin.My.Resources;
using Esprit;
using Microsoft.VisualBasic;
using Microsoft.VisualBasic.CompilerServices;

namespace DentalAddin
{
    [StandardModule]
    internal sealed class AddTab
    {
        [CompilerGenerated]
        [AccessedThroughProperty("_form")]
        private static DentalPanel __form;

        private static Application EspritApp
        {
            get
            {
                return Connect.EspritApp;
            }
        }

        private static int _oldWidth;

        private static PMTab _pmTab;

        private static Icon _icon;

        private static DentalPanel _form
        {
            [CompilerGenerated]
            get
            {
                return __form;
            }
            [MethodImpl(MethodImplOptions.Synchronized)]
            [CompilerGenerated]
            set
            {
                //IL_0007: Unknown result type (might be due to invalid IL or missing references)
                //IL_000d: Expected O, but got Unknown
                FormClosedEventHandler val = new FormClosedEventHandler(_form_FormClosed);
                EventHandler eventHandler = _form_Load;
                DentalPanel dentalPanel = __form;
                if (dentalPanel != null)
                {
                    ((Form)dentalPanel).FormClosed -= val;
                    ((Form)dentalPanel).Load -= eventHandler;
                }
                __form = value;
                dentalPanel = __form;
                if (dentalPanel != null)
                {
                    ((Form)dentalPanel).FormClosed += val;
                    ((Form)dentalPanel).Load += eventHandler;
                }
            }
        }

        public static void Init()
        {
            //IL_01c0: Unknown result type (might be due to invalid IL or missing references)
            _oldWidth = EspritApp.ProjectManager.Width;
            try
            {
                string text = "Dental";
                EspritApp.ProjectManager.Visible = true;
                IEnumerable<PMTab> source = from object pmTab in EspritApp.ProjectManager.PMTabs
                    select (PMTab)pmTab into pmTab
                    where Operators.CompareString(pmTab.Caption, text, false) == 0
                    select pmTab;
                if (source.Count() == 0)
                {
                    try
                    {
                        _icon = Resources.Dental;
                    }
                    catch (Exception ex)
                    {
                        ProjectData.SetProjectError(ex);
                        Exception ex2 = ex;
                        ProjectData.ClearProjectError();
                    }
                    try
                    {
                        _form = (DentalPanel)SerializableData.Load(Connect.DataFileName, typeof(DentalPanel));
                    }
                    catch (Exception ex3)
                    {
                        ProjectData.SetProjectError(ex3);
                        Exception ex4 = ex3;
                        _form = new DentalPanel();
                        ProjectData.ClearProjectError();
                    }
                    _pmTab = EspritApp.ProjectManager.PMTabs.Add(((Control)_form).Handle.ToInt32(), text, (int)_icon.Handle, RuntimeHelpers.GetObjectValue(Missing.Value));
                    ((Control)_form).Show();
                    Win32.SetParent(((Control)_form).Handle.ToInt32(), EspritApp.ProjectManager.PMTabs.HWND);
                    EspritApp.ProjectManager.PMTabs.ActiveTab = _pmTab;
                    EspritApp.ProjectManager.Width = 430;
                }
                else
                {
                    EspritApp.ProjectManager.PMTabs.ActiveTab = source.First();
                }
            }
            catch (Exception ex5)
            {
                ProjectData.SetProjectError(ex5);
                Exception ex6 = ex5;
                Interaction.MsgBox((object)ex6.Message, (MsgBoxStyle)0, (object)null);
                ProjectData.ClearProjectError();
            }
        }

        private static void _form_FormClosed(object sender, FormClosedEventArgs e)
        {
            ClosePMTab();
        }

        private static void ClosePMTab()
        {
            EspritApp.ProjectManager.PMTabs.Remove(_pmTab.HWND);
            ProjectManager projectManager = EspritApp.ProjectManager;
            projectManager.Move(projectManager.Left, projectManager.Top, _oldWidth, projectManager.Height);
            projectManager = null;
            EspritApp.ProjectManager.PMTabs.ActiveTab = EspritApp.ProjectManager.PMTabs[1];
            MainModule.Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
        }

        private static void _form_Load(object sender, EventArgs e)
        {
        }
    }
}
