#region 어셈블리 DentalAddin, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null
// C:\Program Files (x86)\D.P.Technology\ESPRIT\AddIns\DentalAddin\DentalAddin.dll
// Decompiled with ICSharpCode.Decompiler 9.1.0.7988
#endregion

using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.Runtime.CompilerServices;
using System.Threading;
using System.Windows.Forms;
using Microsoft.VisualBasic.CompilerServices;

namespace DentalAddin;

[DesignerGenerated]
public class Dialog1 : Form
{
    private IContainer components;

    [CompilerGenerated]
    [AccessedThroughProperty("ContextMenuStrip1")]
    private ContextMenuStrip _ContextMenuStrip1;

    public bool esc;

    internal virtual ContextMenuStrip ContextMenuStrip1
    {
        [CompilerGenerated]
        get
        {
            return _ContextMenuStrip1;
        }
        [MethodImpl(MethodImplOptions.Synchronized)]
        [CompilerGenerated]
        set
        {
            CancelEventHandler value2 = ContextMenuStrip1_Opening;
            ContextMenuStrip contextMenuStrip = _ContextMenuStrip1;
            if (contextMenuStrip != null)
            {
                contextMenuStrip.Opening -= value2;
            }

            _ContextMenuStrip1 = value;
            contextMenuStrip = _ContextMenuStrip1;
            if (contextMenuStrip != null)
            {
                contextMenuStrip.Opening += value2;
            }
        }
    }

    public Dialog1()
    {
        base.Click += Dialog1_Click;
        InitializeComponent();
    }

    [DebuggerNonUserCode]
    protected override void Dispose(bool disposing)
    {
        try
        {
            if (disposing && components != null)
            {
                components.Dispose();
            }
        }
        finally
        {
            base.Dispose(disposing);
        }
    }

    [System.Diagnostics.DebuggerStepThrough]
    private void InitializeComponent()
    {
        this.components = new System.ComponentModel.Container();
        System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(DentalAddin.Dialog1));
        this.ContextMenuStrip1 = new System.Windows.Forms.ContextMenuStrip(this.components);
        base.SuspendLayout();
        this.ContextMenuStrip1.ImageScalingSize = new System.Drawing.Size(20, 20);
        this.ContextMenuStrip1.Name = "ContextMenuStrip1";
        this.ContextMenuStrip1.Size = new System.Drawing.Size(61, 4);
        base.AutoScaleDimensions = new System.Drawing.SizeF(6f, 12f);
        base.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
        this.BackgroundImage = (System.Drawing.Image)resources.GetObject("$this.BackgroundImage");
        this.BackgroundImageLayout = System.Windows.Forms.ImageLayout.Zoom;
        base.ClientSize = new System.Drawing.Size(796, 510);
        this.ContextMenuStrip = this.ContextMenuStrip1;
        this.DoubleBuffered = true;
        base.FormBorderStyle = System.Windows.Forms.FormBorderStyle.None;
        base.MaximizeBox = false;
        base.MinimizeBox = false;
        base.Name = "Dialog1";
        base.ShowInTaskbar = false;
        base.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
        this.Text = "Dialog1";
        base.TopMost = true;
        base.ResumeLayout(false);
    }

    private void Dialog1_Click(object sender, EventArgs e)
    {
        Thread.Sleep(100);
        if (!esc)
        {
            base.DialogResult = DialogResult.OK;
        }

        Close();
    }

    private void ContextMenuStrip1_Opening(object sender, CancelEventArgs e)
    {
        esc = true;
        base.DialogResult = DialogResult.Cancel;
        Close();
    }
}
#if false // 디컴파일 로그
캐시의 '12'개 항목
------------------
확인: 'Microsoft.VisualBasic, Version=10.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a'
'Microsoft.VisualBasic, Version=10.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a' 이름으로 찾을 수 없습니다.
------------------
확인: 'mscorlib, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089'
단일 어셈블리를 찾았습니다. 'mscorlib, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089'
로드 위치: 'C:\Program Files (x86)\Reference Assemblies\Microsoft\Framework\.NETFramework\v4.8\mscorlib.dll'
------------------
확인: 'System.Drawing, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a'
단일 어셈블리를 찾았습니다. 'System.Drawing, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a'
로드 위치: 'C:\Program Files (x86)\Reference Assemblies\Microsoft\Framework\.NETFramework\v4.8\System.Drawing.dll'
------------------
확인: 'System, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089'
단일 어셈블리를 찾았습니다. 'System, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089'
로드 위치: 'C:\Program Files (x86)\Reference Assemblies\Microsoft\Framework\.NETFramework\v4.8\System.dll'
------------------
확인: 'System.Windows.Forms, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089'
단일 어셈블리를 찾았습니다. 'System.Windows.Forms, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089'
로드 위치: 'C:\Program Files (x86)\Reference Assemblies\Microsoft\Framework\.NETFramework\v4.8\System.Windows.Forms.dll'
------------------
확인: 'Interop.EspritGeometry, Version=2.0.0.0, Culture=neutral, PublicKeyToken=null'
'Interop.EspritGeometry, Version=2.0.0.0, Culture=neutral, PublicKeyToken=null' 이름으로 찾을 수 없습니다.
------------------
확인: 'Interop.EspritFeatures, Version=2.0.0.0, Culture=neutral, PublicKeyToken=null'
'Interop.EspritFeatures, Version=2.0.0.0, Culture=neutral, PublicKeyToken=null' 이름으로 찾을 수 없습니다.
------------------
확인: 'System.Core, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089'
단일 어셈블리를 찾았습니다. 'System.Core, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089'
로드 위치: 'C:\Program Files (x86)\Reference Assemblies\Microsoft\Framework\.NETFramework\v4.8\System.Core.dll'
------------------
확인: 'BouncyCastle.Crypto, Version=1.9.0.0, Culture=neutral, PublicKeyToken=0e99375e54769942'
'BouncyCastle.Crypto, Version=1.9.0.0, Culture=neutral, PublicKeyToken=0e99375e54769942' 이름으로 찾을 수 없습니다.
------------------
확인: 'System.Xml, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089'
'System.Xml, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089' 이름으로 찾을 수 없습니다.
#endif
