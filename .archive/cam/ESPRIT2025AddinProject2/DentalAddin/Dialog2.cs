#region 어셈블리 DentalAddin, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null
// C:\Program Files (x86)\D.P.Technology\ESPRIT\AddIns\DentalAddin\DentalAddin.dll
// Decompiled with ICSharpCode.Decompiler 9.1.0.7988
#endregion

using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.Runtime.CompilerServices;
using System.Windows.Forms;
using Microsoft.VisualBasic.CompilerServices;

namespace DentalAddin;

[DesignerGenerated]
public class Dialog2 : Form
{
    private IContainer components;

    [CompilerGenerated]
    [AccessedThroughProperty("TextBox1")]
    private TextBox _TextBox1;

    internal virtual TextBox TextBox1
    {
        [CompilerGenerated]
        get
        {
            return _TextBox1;
        }
        [MethodImpl(MethodImplOptions.Synchronized)]
        [CompilerGenerated]
        set
        {
            EventHandler value2 = TextBox1_TextChanged;
            TextBox textBox = _TextBox1;
            if (textBox != null)
            {
                textBox.TextChanged -= value2;
            }

            _TextBox1 = value;
            textBox = _TextBox1;
            if (textBox != null)
            {
                textBox.TextChanged += value2;
            }
        }
    }

    [field: AccessedThroughProperty("Label1")]
    internal virtual Label Label1
    {
        get; [MethodImpl(MethodImplOptions.Synchronized)]
        set;
    }

    public Dialog2()
    {
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
        System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(DentalAddin.Dialog2));
        this.TextBox1 = new System.Windows.Forms.TextBox();
        this.Label1 = new System.Windows.Forms.Label();
        base.SuspendLayout();
        this.TextBox1.Font = new System.Drawing.Font("微软雅黑", 14.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 134);
        this.TextBox1.Location = new System.Drawing.Point(66, 20);
        this.TextBox1.Name = "TextBox1";
        this.TextBox1.PasswordChar = '*';
        this.TextBox1.Size = new System.Drawing.Size(142, 33);
        this.TextBox1.TabIndex = 1;
        this.TextBox1.UseSystemPasswordChar = true;
        this.Label1.AutoSize = true;
        this.Label1.Font = new System.Drawing.Font("微软雅黑", 14.25f, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, 134);
        this.Label1.Location = new System.Drawing.Point(11, 22);
        this.Label1.Name = "Label1";
        this.Label1.Size = new System.Drawing.Size(50, 25);
        this.Label1.TabIndex = 2;
        this.Label1.Text = "Key:";
        base.AutoScaleDimensions = new System.Drawing.SizeF(6f, 12f);
        base.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
        base.ClientSize = new System.Drawing.Size(227, 73);
        base.Controls.Add(this.Label1);
        base.Controls.Add(this.TextBox1);
        base.FormBorderStyle = System.Windows.Forms.FormBorderStyle.FixedDialog;
        base.Icon = (System.Drawing.Icon)resources.GetObject("$this.Icon");
        base.MaximizeBox = false;
        base.MinimizeBox = false;
        base.Name = "Dialog2";
        base.ShowInTaskbar = false;
        base.StartPosition = System.Windows.Forms.FormStartPosition.CenterParent;
        this.Text = "Access";
        base.TopMost = true;
        base.ResumeLayout(false);
        base.PerformLayout();
    }

    private void TextBox1_TextChanged(object sender, EventArgs e)
    {
        if (License.LicenseKey.IndexOf(License.MyLic(TextBox1.Text)) >= 0)
        {
            base.DialogResult = DialogResult.OK;
            Close();
        }
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
