#region 어셈블리 DentalAddin, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null
// C:\Program Files (x86)\D.P.Technology\ESPRIT\AddIns\DentalAddin\DentalAddin.dll
// Decompiled with ICSharpCode.Decompiler 9.1.0.7988
#endregion

using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Windows.Forms;
using DentalAddin.My.Resources;
using Esprit;
using EspritConstants;
using Microsoft.VisualBasic;
using Microsoft.VisualBasic.CompilerServices;

namespace DentalAddin;

[DesignerGenerated]
public class DentalPanel : Form
{
    private IContainer components;

    [CompilerGenerated]
    [AccessedThroughProperty("OKStripMenuItem")]
    private ToolStripMenuItem _OKStripMenuItem;

    [CompilerGenerated]
    [AccessedThroughProperty("CancelToolStripMenuItem")]
    private ToolStripMenuItem _CancelToolStripMenuItem;

    [CompilerGenerated]
    [AccessedThroughProperty("LoadOtherPartToolStripMenuItem")]
    private ToolStripMenuItem _LoadOtherPartToolStripMenuItem;

    [CompilerGenerated]
    [AccessedThroughProperty("SaveToNewPartToolStripMenuItem")]
    private ToolStripMenuItem _SaveToNewPartToolStripMenuItem;

    [CompilerGenerated]
    [AccessedThroughProperty("ShowSettingToolStripMenuItem")]
    private ToolStripMenuItem _ShowSettingToolStripMenuItem;

    [CompilerGenerated]
    [AccessedThroughProperty("TableLayoutPanel2")]
    private TableLayoutPanel _TableLayoutPanel2;

    [CompilerGenerated]
    [AccessedThroughProperty("TextBox15")]
    private TextBox _TextBox15;

    [CompilerGenerated]
    [AccessedThroughProperty("TextBox13")]
    private TextBox _TextBox13;

    [CompilerGenerated]
    [AccessedThroughProperty("TextBox11")]
    private TextBox _TextBox11;

    [CompilerGenerated]
    [AccessedThroughProperty("TextBox12")]
    private TextBox _TextBox12;

    [CompilerGenerated]
    [AccessedThroughProperty("ComboBox1")]
    private ComboBox _ComboBox1;

    [CompilerGenerated]
    [AccessedThroughProperty("TextBox16")]
    private TextBox _TextBox16;

    [CompilerGenerated]
    [AccessedThroughProperty("GroupBox1")]
    private GroupBox _GroupBox1;

    [CompilerGenerated]
    [AccessedThroughProperty("TextBox9")]
    private TextBox _TextBox9;

    [CompilerGenerated]
    [AccessedThroughProperty("Label19")]
    private Label _Label19;

    [CompilerGenerated]
    [AccessedThroughProperty("TextBox6")]
    private TextBox _TextBox6;

    [CompilerGenerated]
    [AccessedThroughProperty("TextBox5")]
    private TextBox _TextBox5;

    [CompilerGenerated]
    [AccessedThroughProperty("TextBox4")]
    private TextBox _TextBox4;

    [CompilerGenerated]
    [AccessedThroughProperty("TextBox2")]
    private TextBox _TextBox2;

    [CompilerGenerated]
    [AccessedThroughProperty("TextBox1")]
    private TextBox _TextBox1;

    [CompilerGenerated]
    [AccessedThroughProperty("PictureBox1")]
    private PictureBox _PictureBox1;

    [CompilerGenerated]
    [AccessedThroughProperty("TextBox19")]
    private TextBox _TextBox19;

    [CompilerGenerated]
    [AccessedThroughProperty("TextBox18")]
    private TextBox _TextBox18;

    [CompilerGenerated]
    [AccessedThroughProperty("TextBox7")]
    private TextBox _TextBox7;

    [CompilerGenerated]
    [AccessedThroughProperty("TextBox3")]
    private TextBox _TextBox3;

    [CompilerGenerated]
    [AccessedThroughProperty("TextBox10")]
    private TextBox _TextBox10;

    [CompilerGenerated]
    [AccessedThroughProperty("TextBox8")]
    private TextBox _TextBox8;

    [CompilerGenerated]
    [AccessedThroughProperty("ComboBox3")]
    private ComboBox _ComboBox3;

    [CompilerGenerated]
    [AccessedThroughProperty("GroupBox6")]
    private GroupBox _GroupBox6;

    [CompilerGenerated]
    [AccessedThroughProperty("TextBox20")]
    private TextBox _TextBox20;

    [CompilerGenerated]
    [AccessedThroughProperty("TextBox17")]
    private TextBox _TextBox17;

    [CompilerGenerated]
    [AccessedThroughProperty("TextBox14")]
    private TextBox _TextBox14;

    [CompilerGenerated]
    [AccessedThroughProperty("TextBox21")]
    private TextBox _TextBox21;

    [CompilerGenerated]
    [AccessedThroughProperty("Button1")]
    private Button _Button1;

    [CompilerGenerated]
    [AccessedThroughProperty("TextBox22")]
    private TextBox _TextBox22;

    [CompilerGenerated]
    [AccessedThroughProperty("ComboBox4")]
    private ComboBox _ComboBox4;

    [CompilerGenerated]
    [AccessedThroughProperty("TextBox23")]
    private TextBox _TextBox23;

    [CompilerGenerated]
    [AccessedThroughProperty("ComboBox2")]
    private ComboBox _ComboBox2;

    [CompilerGenerated]
    [AccessedThroughProperty("Label28")]
    private Label _Label28;

    [CompilerGenerated]
    [AccessedThroughProperty("TextBox24")]
    private TextBox _TextBox24;

    [CompilerGenerated]
    [AccessedThroughProperty("Label29")]
    private Label _Label29;

    [CompilerGenerated]
    [AccessedThroughProperty("ComboBox5")]
    private ComboBox _ComboBox5;

    [CompilerGenerated]
    [AccessedThroughProperty("ComboBox6")]
    private ComboBox _ComboBox6;

    [CompilerGenerated]
    [AccessedThroughProperty("ComboBox7")]
    private ComboBox _ComboBox7;

    public double TempData;

    private bool FromT;

    private string Temp;

    [field: AccessedThroughProperty("MenuStrip1")]
    internal virtual MenuStrip MenuStrip1
    {
        get; [MethodImpl(MethodImplOptions.Synchronized)]
        set;
    }

    internal virtual ToolStripMenuItem OKStripMenuItem
    {
        [CompilerGenerated]
        get
        {
            return _OKStripMenuItem;
        }
        [MethodImpl(MethodImplOptions.Synchronized)]
        [CompilerGenerated]
        set
        {
            EventHandler value2 = OKStripMenuItem_Click;
            ToolStripMenuItem toolStripMenuItem = _OKStripMenuItem;
            if (toolStripMenuItem != null)
            {
                toolStripMenuItem.Click -= value2;
            }

            _OKStripMenuItem = value;
            toolStripMenuItem = _OKStripMenuItem;
            if (toolStripMenuItem != null)
            {
                toolStripMenuItem.Click += value2;
            }
        }
    }

    internal virtual ToolStripMenuItem CancelToolStripMenuItem
    {
        [CompilerGenerated]
        get
        {
            return _CancelToolStripMenuItem;
        }
        [MethodImpl(MethodImplOptions.Synchronized)]
        [CompilerGenerated]
        set
        {
            EventHandler value2 = CancelToolStripMenuItem_Click;
            ToolStripMenuItem toolStripMenuItem = _CancelToolStripMenuItem;
            if (toolStripMenuItem != null)
            {
                toolStripMenuItem.Click -= value2;
            }

            _CancelToolStripMenuItem = value;
            toolStripMenuItem = _CancelToolStripMenuItem;
            if (toolStripMenuItem != null)
            {
                toolStripMenuItem.Click += value2;
            }
        }
    }

    [field: AccessedThroughProperty("TabControl1")]
    internal virtual TabControl TabControl1
    {
        get; [MethodImpl(MethodImplOptions.Synchronized)]
        set;
    }

    [field: AccessedThroughProperty("TabPage1")]
    internal virtual TabPage TabPage1
    {
        get; [MethodImpl(MethodImplOptions.Synchronized)]
        set;
    }

    [field: AccessedThroughProperty("ToolStripMenuItem2")]
    internal virtual ToolStripMenuItem ToolStripMenuItem2
    {
        get; [MethodImpl(MethodImplOptions.Synchronized)]
        set;
    }

    [field: AccessedThroughProperty("TabPage2")]
    internal virtual TabPage TabPage2
    {
        get; [MethodImpl(MethodImplOptions.Synchronized)]
        set;
    }

    internal virtual ToolStripMenuItem LoadOtherPartToolStripMenuItem
    {
        [CompilerGenerated]
        get
        {
            return _LoadOtherPartToolStripMenuItem;
        }
        [MethodImpl(MethodImplOptions.Synchronized)]
        [CompilerGenerated]
        set
        {
            EventHandler value2 = LoadOtherPartToolStripMenuItem_Click;
            ToolStripMenuItem toolStripMenuItem = _LoadOtherPartToolStripMenuItem;
            if (toolStripMenuItem != null)
            {
                toolStripMenuItem.Click -= value2;
            }

            _LoadOtherPartToolStripMenuItem = value;
            toolStripMenuItem = _LoadOtherPartToolStripMenuItem;
            if (toolStripMenuItem != null)
            {
                toolStripMenuItem.Click += value2;
            }
        }
    }

    internal virtual ToolStripMenuItem SaveToNewPartToolStripMenuItem
    {
        [CompilerGenerated]
        get
        {
            return _SaveToNewPartToolStripMenuItem;
        }
        [MethodImpl(MethodImplOptions.Synchronized)]
        [CompilerGenerated]
        set
        {
            EventHandler value2 = SaveToNewPartToolStripMenuItem_Click;
            ToolStripMenuItem toolStripMenuItem = _SaveToNewPartToolStripMenuItem;
            if (toolStripMenuItem != null)
            {
                toolStripMenuItem.Click -= value2;
            }

            _SaveToNewPartToolStripMenuItem = value;
            toolStripMenuItem = _SaveToNewPartToolStripMenuItem;
            if (toolStripMenuItem != null)
            {
                toolStripMenuItem.Click += value2;
            }
        }
    }

    internal virtual ToolStripMenuItem ShowSettingToolStripMenuItem
    {
        [CompilerGenerated]
        get
        {
            return _ShowSettingToolStripMenuItem;
        }
        [MethodImpl(MethodImplOptions.Synchronized)]
        [CompilerGenerated]
        set
        {
            EventHandler value2 = ShowSettingToolStripMenuItem_Click;
            ToolStripMenuItem toolStripMenuItem = _ShowSettingToolStripMenuItem;
            if (toolStripMenuItem != null)
            {
                toolStripMenuItem.Click -= value2;
            }

            _ShowSettingToolStripMenuItem = value;
            toolStripMenuItem = _ShowSettingToolStripMenuItem;
            if (toolStripMenuItem != null)
            {
                toolStripMenuItem.Click += value2;
            }
        }
    }

    internal virtual TableLayoutPanel TableLayoutPanel2
    {
        [CompilerGenerated]
        get
        {
            return _TableLayoutPanel2;
        }
        [MethodImpl(MethodImplOptions.Synchronized)]
        [CompilerGenerated]
        set
        {
            PaintEventHandler value2 = TableLayoutPanel2_Paint;
            TableLayoutPanel tableLayoutPanel = _TableLayoutPanel2;
            if (tableLayoutPanel != null)
            {
                tableLayoutPanel.Paint -= value2;
            }

            _TableLayoutPanel2 = value;
            tableLayoutPanel = _TableLayoutPanel2;
            if (tableLayoutPanel != null)
            {
                tableLayoutPanel.Paint += value2;
            }
        }
    }

    [field: AccessedThroughProperty("GroupBox2")]
    internal virtual GroupBox GroupBox2
    {
        get; [MethodImpl(MethodImplOptions.Synchronized)]
        set;
    }

    internal virtual TextBox TextBox15
    {
        [CompilerGenerated]
        get
        {
            return _TextBox15;
        }
        [MethodImpl(MethodImplOptions.Synchronized)]
        [CompilerGenerated]
        set
        {
            EventHandler value2 = TextBox15_TextChanged;
            TextBox textBox = _TextBox15;
            if (textBox != null)
            {
                textBox.TextChanged -= value2;
            }

            _TextBox15 = value;
            textBox = _TextBox15;
            if (textBox != null)
            {
                textBox.TextChanged += value2;
            }
        }
    }

    internal virtual TextBox TextBox13
    {
        [CompilerGenerated]
        get
        {
            return _TextBox13;
        }
        [MethodImpl(MethodImplOptions.Synchronized)]
        [CompilerGenerated]
        set
        {
            EventHandler value2 = TextBox13_TextChanged;
            TextBox textBox = _TextBox13;
            if (textBox != null)
            {
                textBox.TextChanged -= value2;
            }

            _TextBox13 = value;
            textBox = _TextBox13;
            if (textBox != null)
            {
                textBox.TextChanged += value2;
            }
        }
    }

    [field: AccessedThroughProperty("Label12")]
    internal virtual Label Label12
    {
        get; [MethodImpl(MethodImplOptions.Synchronized)]
        set;
    }

    [field: AccessedThroughProperty("Label10")]
    internal virtual Label Label10
    {
        get; [MethodImpl(MethodImplOptions.Synchronized)]
        set;
    }

    internal virtual TextBox TextBox11
    {
        [CompilerGenerated]
        get
        {
            return _TextBox11;
        }
        [MethodImpl(MethodImplOptions.Synchronized)]
        [CompilerGenerated]
        set
        {
            EventHandler value2 = TextBox11_TextChanged;
            TextBox textBox = _TextBox11;
            if (textBox != null)
            {
                textBox.TextChanged -= value2;
            }

            _TextBox11 = value;
            textBox = _TextBox11;
            if (textBox != null)
            {
                textBox.TextChanged += value2;
            }
        }
    }

    [field: AccessedThroughProperty("Label8")]
    internal virtual Label Label8
    {
        get; [MethodImpl(MethodImplOptions.Synchronized)]
        set;
    }

    [field: AccessedThroughProperty("GroupBox4")]
    internal virtual GroupBox GroupBox4
    {
        get; [MethodImpl(MethodImplOptions.Synchronized)]
        set;
    }

    internal virtual TextBox TextBox12
    {
        [CompilerGenerated]
        get
        {
            return _TextBox12;
        }
        [MethodImpl(MethodImplOptions.Synchronized)]
        [CompilerGenerated]
        set
        {
            EventHandler value2 = TextBox12_TextChanged;
            TextBox textBox = _TextBox12;
            if (textBox != null)
            {
                textBox.TextChanged -= value2;
            }

            _TextBox12 = value;
            textBox = _TextBox12;
            if (textBox != null)
            {
                textBox.TextChanged += value2;
            }
        }
    }

    internal virtual ComboBox ComboBox1
    {
        [CompilerGenerated]
        get
        {
            return _ComboBox1;
        }
        [MethodImpl(MethodImplOptions.Synchronized)]
        [CompilerGenerated]
        set
        {
            EventHandler value2 = ComboBox1_SelectedIndexChanged;
            ComboBox comboBox = _ComboBox1;
            if (comboBox != null)
            {
                comboBox.SelectedIndexChanged -= value2;
            }

            _ComboBox1 = value;
            comboBox = _ComboBox1;
            if (comboBox != null)
            {
                comboBox.SelectedIndexChanged += value2;
            }
        }
    }

    internal virtual TextBox TextBox16
    {
        [CompilerGenerated]
        get
        {
            return _TextBox16;
        }
        [MethodImpl(MethodImplOptions.Synchronized)]
        [CompilerGenerated]
        set
        {
            EventHandler value2 = TextBox16_TextChanged;
            TextBox textBox = _TextBox16;
            if (textBox != null)
            {
                textBox.TextChanged -= value2;
            }

            _TextBox16 = value;
            textBox = _TextBox16;
            if (textBox != null)
            {
                textBox.TextChanged += value2;
            }
        }
    }

    [field: AccessedThroughProperty("Label17")]
    internal virtual Label Label17
    {
        get; [MethodImpl(MethodImplOptions.Synchronized)]
        set;
    }

    [field: AccessedThroughProperty("Label9")]
    internal virtual Label Label9
    {
        get; [MethodImpl(MethodImplOptions.Synchronized)]
        set;
    }

    [field: AccessedThroughProperty("Label16")]
    internal virtual Label Label16
    {
        get; [MethodImpl(MethodImplOptions.Synchronized)]
        set;
    }

    [field: AccessedThroughProperty("TabPage3")]
    internal virtual TabPage TabPage3
    {
        get; [MethodImpl(MethodImplOptions.Synchronized)]
        set;
    }

    internal virtual GroupBox GroupBox1
    {
        [CompilerGenerated]
        get
        {
            return _GroupBox1;
        }
        [MethodImpl(MethodImplOptions.Synchronized)]
        [CompilerGenerated]
        set
        {
            EventHandler value2 = GroupBox1_Enter;
            GroupBox groupBox = _GroupBox1;
            if (groupBox != null)
            {
                groupBox.Enter -= value2;
            }

            _GroupBox1 = value;
            groupBox = _GroupBox1;
            if (groupBox != null)
            {
                groupBox.Enter += value2;
            }
        }
    }

    internal virtual TextBox TextBox9
    {
        [CompilerGenerated]
        get
        {
            return _TextBox9;
        }
        [MethodImpl(MethodImplOptions.Synchronized)]
        [CompilerGenerated]
        set
        {
            EventHandler value2 = TextBox9_DoubleClick;
            TextBox textBox = _TextBox9;
            if (textBox != null)
            {
                textBox.DoubleClick -= value2;
            }

            _TextBox9 = value;
            textBox = _TextBox9;
            if (textBox != null)
            {
                textBox.DoubleClick += value2;
            }
        }
    }

    internal virtual Label Label19
    {
        [CompilerGenerated]
        get
        {
            return _Label19;
        }
        [MethodImpl(MethodImplOptions.Synchronized)]
        [CompilerGenerated]
        set
        {
            EventHandler value2 = Label19_Click;
            Label label = _Label19;
            if (label != null)
            {
                label.Click -= value2;
            }

            _Label19 = value;
            label = _Label19;
            if (label != null)
            {
                label.Click += value2;
            }
        }
    }

    internal virtual TextBox TextBox6
    {
        [CompilerGenerated]
        get
        {
            return _TextBox6;
        }
        [MethodImpl(MethodImplOptions.Synchronized)]
        [CompilerGenerated]
        set
        {
            EventHandler value2 = TextBox6_DoubleClick;
            TextBox textBox = _TextBox6;
            if (textBox != null)
            {
                textBox.DoubleClick -= value2;
            }

            _TextBox6 = value;
            textBox = _TextBox6;
            if (textBox != null)
            {
                textBox.DoubleClick += value2;
            }
        }
    }

    internal virtual TextBox TextBox5
    {
        [CompilerGenerated]
        get
        {
            return _TextBox5;
        }
        [MethodImpl(MethodImplOptions.Synchronized)]
        [CompilerGenerated]
        set
        {
            EventHandler value2 = TextBox5_DoubleClick;
            TextBox textBox = _TextBox5;
            if (textBox != null)
            {
                textBox.DoubleClick -= value2;
            }

            _TextBox5 = value;
            textBox = _TextBox5;
            if (textBox != null)
            {
                textBox.DoubleClick += value2;
            }
        }
    }

    internal virtual TextBox TextBox4
    {
        [CompilerGenerated]
        get
        {
            return _TextBox4;
        }
        [MethodImpl(MethodImplOptions.Synchronized)]
        [CompilerGenerated]
        set
        {
            EventHandler value2 = TextBox4_DoubleClick;
            TextBox textBox = _TextBox4;
            if (textBox != null)
            {
                textBox.DoubleClick -= value2;
            }

            _TextBox4 = value;
            textBox = _TextBox4;
            if (textBox != null)
            {
                textBox.DoubleClick += value2;
            }
        }
    }

    internal virtual TextBox TextBox2
    {
        [CompilerGenerated]
        get
        {
            return _TextBox2;
        }
        [MethodImpl(MethodImplOptions.Synchronized)]
        [CompilerGenerated]
        set
        {
            EventHandler value2 = TextBox2_DoubleClick;
            TextBox textBox = _TextBox2;
            if (textBox != null)
            {
                textBox.DoubleClick -= value2;
            }

            _TextBox2 = value;
            textBox = _TextBox2;
            if (textBox != null)
            {
                textBox.DoubleClick += value2;
            }
        }
    }

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
            EventHandler value2 = TextBox1_DoubleClick;
            TextBox textBox = _TextBox1;
            if (textBox != null)
            {
                textBox.DoubleClick -= value2;
            }

            _TextBox1 = value;
            textBox = _TextBox1;
            if (textBox != null)
            {
                textBox.DoubleClick += value2;
            }
        }
    }

    [field: AccessedThroughProperty("Label6")]
    internal virtual Label Label6
    {
        get; [MethodImpl(MethodImplOptions.Synchronized)]
        set;
    }

    [field: AccessedThroughProperty("Label5")]
    internal virtual Label Label5
    {
        get; [MethodImpl(MethodImplOptions.Synchronized)]
        set;
    }

    [field: AccessedThroughProperty("Label4")]
    internal virtual Label Label4
    {
        get; [MethodImpl(MethodImplOptions.Synchronized)]
        set;
    }

    [field: AccessedThroughProperty("Label1")]
    internal virtual Label Label1
    {
        get; [MethodImpl(MethodImplOptions.Synchronized)]
        set;
    }

    [field: AccessedThroughProperty("Label2")]
    internal virtual Label Label2
    {
        get; [MethodImpl(MethodImplOptions.Synchronized)]
        set;
    }

    [field: AccessedThroughProperty("TableLayoutPanel1")]
    internal virtual TableLayoutPanel TableLayoutPanel1
    {
        get; [MethodImpl(MethodImplOptions.Synchronized)]
        set;
    }

    internal virtual PictureBox PictureBox1
    {
        [CompilerGenerated]
        get
        {
            return _PictureBox1;
        }
        [MethodImpl(MethodImplOptions.Synchronized)]
        [CompilerGenerated]
        set
        {
            EventHandler value2 = PictureBox1_Click;
            PictureBox pictureBox = _PictureBox1;
            if (pictureBox != null)
            {
                pictureBox.Click -= value2;
            }

            _PictureBox1 = value;
            pictureBox = _PictureBox1;
            if (pictureBox != null)
            {
                pictureBox.Click += value2;
            }
        }
    }

    [field: AccessedThroughProperty("GroupBox3")]
    internal virtual GroupBox GroupBox3
    {
        get; [MethodImpl(MethodImplOptions.Synchronized)]
        set;
    }

    internal virtual TextBox TextBox19
    {
        [CompilerGenerated]
        get
        {
            return _TextBox19;
        }
        [MethodImpl(MethodImplOptions.Synchronized)]
        [CompilerGenerated]
        set
        {
            EventHandler value2 = TextBox19_Click;
            EventHandler value3 = TextBox19_TextChanged;
            TextBox textBox = _TextBox19;
            if (textBox != null)
            {
                textBox.Click -= value2;
                textBox.TextChanged -= value3;
            }

            _TextBox19 = value;
            textBox = _TextBox19;
            if (textBox != null)
            {
                textBox.Click += value2;
                textBox.TextChanged += value3;
            }
        }
    }

    internal virtual TextBox TextBox18
    {
        [CompilerGenerated]
        get
        {
            return _TextBox18;
        }
        [MethodImpl(MethodImplOptions.Synchronized)]
        [CompilerGenerated]
        set
        {
            EventHandler value2 = TextBox18_Click;
            EventHandler value3 = TextBox18_TextChanged;
            TextBox textBox = _TextBox18;
            if (textBox != null)
            {
                textBox.Click -= value2;
                textBox.TextChanged -= value3;
            }

            _TextBox18 = value;
            textBox = _TextBox18;
            if (textBox != null)
            {
                textBox.Click += value2;
                textBox.TextChanged += value3;
            }
        }
    }

    [field: AccessedThroughProperty("Label15")]
    internal virtual Label Label15
    {
        get; [MethodImpl(MethodImplOptions.Synchronized)]
        set;
    }

    [field: AccessedThroughProperty("Label14")]
    internal virtual Label Label14
    {
        get; [MethodImpl(MethodImplOptions.Synchronized)]
        set;
    }

    [field: AccessedThroughProperty("GroupBox5")]
    internal virtual GroupBox GroupBox5
    {
        get; [MethodImpl(MethodImplOptions.Synchronized)]
        set;
    }

    internal virtual TextBox TextBox7
    {
        [CompilerGenerated]
        get
        {
            return _TextBox7;
        }
        [MethodImpl(MethodImplOptions.Synchronized)]
        [CompilerGenerated]
        set
        {
            EventHandler value2 = TextBox7_DoubleClick;
            TextBox textBox = _TextBox7;
            if (textBox != null)
            {
                textBox.DoubleClick -= value2;
            }

            _TextBox7 = value;
            textBox = _TextBox7;
            if (textBox != null)
            {
                textBox.DoubleClick += value2;
            }
        }
    }

    [field: AccessedThroughProperty("Label7")]
    internal virtual Label Label7
    {
        get; [MethodImpl(MethodImplOptions.Synchronized)]
        set;
    }

    [field: AccessedThroughProperty("Label3")]
    internal virtual Label Label3
    {
        get; [MethodImpl(MethodImplOptions.Synchronized)]
        set;
    }

    internal virtual TextBox TextBox3
    {
        [CompilerGenerated]
        get
        {
            return _TextBox3;
        }
        [MethodImpl(MethodImplOptions.Synchronized)]
        [CompilerGenerated]
        set
        {
            EventHandler value2 = TextBox3_DoubleClick;
            EventHandler value3 = TextBox3_TextChanged;
            TextBox textBox = _TextBox3;
            if (textBox != null)
            {
                textBox.DoubleClick -= value2;
                textBox.TextChanged -= value3;
            }

            _TextBox3 = value;
            textBox = _TextBox3;
            if (textBox != null)
            {
                textBox.DoubleClick += value2;
                textBox.TextChanged += value3;
            }
        }
    }

    internal virtual TextBox TextBox10
    {
        [CompilerGenerated]
        get
        {
            return _TextBox10;
        }
        [MethodImpl(MethodImplOptions.Synchronized)]
        [CompilerGenerated]
        set
        {
            EventHandler value2 = TextBox10_TextChanged;
            TextBox textBox = _TextBox10;
            if (textBox != null)
            {
                textBox.TextChanged -= value2;
            }

            _TextBox10 = value;
            textBox = _TextBox10;
            if (textBox != null)
            {
                textBox.TextChanged += value2;
            }
        }
    }

    [field: AccessedThroughProperty("Label20")]
    internal virtual Label Label20
    {
        get; [MethodImpl(MethodImplOptions.Synchronized)]
        set;
    }

    internal virtual TextBox TextBox8
    {
        [CompilerGenerated]
        get
        {
            return _TextBox8;
        }
        [MethodImpl(MethodImplOptions.Synchronized)]
        [CompilerGenerated]
        set
        {
            EventHandler value2 = TextBox8_DoubleClick;
            TextBox textBox = _TextBox8;
            if (textBox != null)
            {
                textBox.DoubleClick -= value2;
            }

            _TextBox8 = value;
            textBox = _TextBox8;
            if (textBox != null)
            {
                textBox.DoubleClick += value2;
            }
        }
    }

    [field: AccessedThroughProperty("Label13")]
    internal virtual Label Label13
    {
        get; [MethodImpl(MethodImplOptions.Synchronized)]
        set;
    }

    internal virtual ComboBox ComboBox3
    {
        [CompilerGenerated]
        get
        {
            return _ComboBox3;
        }
        [MethodImpl(MethodImplOptions.Synchronized)]
        [CompilerGenerated]
        set
        {
            EventHandler value2 = ComboBox3_SelectedIndexChanged;
            ComboBox comboBox = _ComboBox3;
            if (comboBox != null)
            {
                comboBox.SelectedIndexChanged -= value2;
            }

            _ComboBox3 = value;
            comboBox = _ComboBox3;
            if (comboBox != null)
            {
                comboBox.SelectedIndexChanged += value2;
            }
        }
    }

    [field: AccessedThroughProperty("Label21")]
    internal virtual Label Label21
    {
        get; [MethodImpl(MethodImplOptions.Synchronized)]
        set;
    }

    internal virtual GroupBox GroupBox6
    {
        [CompilerGenerated]
        get
        {
            return _GroupBox6;
        }
        [MethodImpl(MethodImplOptions.Synchronized)]
        [CompilerGenerated]
        set
        {
            EventHandler value2 = GroupBox6_Enter;
            GroupBox groupBox = _GroupBox6;
            if (groupBox != null)
            {
                groupBox.Enter -= value2;
            }

            _GroupBox6 = value;
            groupBox = _GroupBox6;
            if (groupBox != null)
            {
                groupBox.Enter += value2;
            }
        }
    }

    internal virtual TextBox TextBox20
    {
        [CompilerGenerated]
        get
        {
            return _TextBox20;
        }
        [MethodImpl(MethodImplOptions.Synchronized)]
        [CompilerGenerated]
        set
        {
            EventHandler value2 = TextBox20_Click;
            TextBox textBox = _TextBox20;
            if (textBox != null)
            {
                textBox.Click -= value2;
            }

            _TextBox20 = value;
            textBox = _TextBox20;
            if (textBox != null)
            {
                textBox.Click += value2;
            }
        }
    }

    internal virtual TextBox TextBox17
    {
        [CompilerGenerated]
        get
        {
            return _TextBox17;
        }
        [MethodImpl(MethodImplOptions.Synchronized)]
        [CompilerGenerated]
        set
        {
            EventHandler value2 = TextBox17_Click;
            TextBox textBox = _TextBox17;
            if (textBox != null)
            {
                textBox.Click -= value2;
            }

            _TextBox17 = value;
            textBox = _TextBox17;
            if (textBox != null)
            {
                textBox.Click += value2;
            }
        }
    }

    [field: AccessedThroughProperty("Label23")]
    internal virtual Label Label23
    {
        get; [MethodImpl(MethodImplOptions.Synchronized)]
        set;
    }

    [field: AccessedThroughProperty("Label22")]
    internal virtual Label Label22
    {
        get; [MethodImpl(MethodImplOptions.Synchronized)]
        set;
    }

    [field: AccessedThroughProperty("Label24")]
    internal virtual Label Label24
    {
        get; [MethodImpl(MethodImplOptions.Synchronized)]
        set;
    }

    [field: AccessedThroughProperty("Label11")]
    internal virtual Label Label11
    {
        get; [MethodImpl(MethodImplOptions.Synchronized)]
        set;
    }

    internal virtual TextBox TextBox14
    {
        [CompilerGenerated]
        get
        {
            return _TextBox14;
        }
        [MethodImpl(MethodImplOptions.Synchronized)]
        [CompilerGenerated]
        set
        {
            EventHandler value2 = TextBox14_DoubleClick;
            TextBox textBox = _TextBox14;
            if (textBox != null)
            {
                textBox.DoubleClick -= value2;
            }

            _TextBox14 = value;
            textBox = _TextBox14;
            if (textBox != null)
            {
                textBox.DoubleClick += value2;
            }
        }
    }

    [field: AccessedThroughProperty("GroupBox7")]
    internal virtual GroupBox GroupBox7
    {
        get; [MethodImpl(MethodImplOptions.Synchronized)]
        set;
    }

    internal virtual TextBox TextBox21
    {
        [CompilerGenerated]
        get
        {
            return _TextBox21;
        }
        [MethodImpl(MethodImplOptions.Synchronized)]
        [CompilerGenerated]
        set
        {
            EventHandler value2 = TextBox21_Click;
            TextBox textBox = _TextBox21;
            if (textBox != null)
            {
                textBox.Click -= value2;
            }

            _TextBox21 = value;
            textBox = _TextBox21;
            if (textBox != null)
            {
                textBox.Click += value2;
            }
        }
    }

    [field: AccessedThroughProperty("Label25")]
    internal virtual Label Label25
    {
        get; [MethodImpl(MethodImplOptions.Synchronized)]
        set;
    }

    internal virtual Button Button1
    {
        [CompilerGenerated]
        get
        {
            return _Button1;
        }
        [MethodImpl(MethodImplOptions.Synchronized)]
        [CompilerGenerated]
        set
        {
            EventHandler value2 = Button1_Click;
            Button button = _Button1;
            if (button != null)
            {
                button.Click -= value2;
            }

            _Button1 = value;
            button = _Button1;
            if (button != null)
            {
                button.Click += value2;
            }
        }
    }

    [field: AccessedThroughProperty("RichTextBox1")]
    internal virtual RichTextBox RichTextBox1
    {
        get; [MethodImpl(MethodImplOptions.Synchronized)]
        set;
    }

    internal virtual TextBox TextBox22
    {
        [CompilerGenerated]
        get
        {
            return _TextBox22;
        }
        [MethodImpl(MethodImplOptions.Synchronized)]
        [CompilerGenerated]
        set
        {
            EventHandler value2 = TextBox22_DoubleClick;
            TextBox textBox = _TextBox22;
            if (textBox != null)
            {
                textBox.DoubleClick -= value2;
            }

            _TextBox22 = value;
            textBox = _TextBox22;
            if (textBox != null)
            {
                textBox.DoubleClick += value2;
            }
        }
    }

    [field: AccessedThroughProperty("Label26")]
    internal virtual Label Label26
    {
        get; [MethodImpl(MethodImplOptions.Synchronized)]
        set;
    }

    internal virtual ComboBox ComboBox4
    {
        [CompilerGenerated]
        get
        {
            return _ComboBox4;
        }
        [MethodImpl(MethodImplOptions.Synchronized)]
        [CompilerGenerated]
        set
        {
            EventHandler value2 = ComboBox4_SelectedIndexChanged;
            ComboBox comboBox = _ComboBox4;
            if (comboBox != null)
            {
                comboBox.SelectedIndexChanged -= value2;
            }

            _ComboBox4 = value;
            comboBox = _ComboBox4;
            if (comboBox != null)
            {
                comboBox.SelectedIndexChanged += value2;
            }
        }
    }

    [field: AccessedThroughProperty("Label18")]
    internal virtual Label Label18
    {
        get; [MethodImpl(MethodImplOptions.Synchronized)]
        set;
    }

    internal virtual TextBox TextBox23
    {
        [CompilerGenerated]
        get
        {
            return _TextBox23;
        }
        [MethodImpl(MethodImplOptions.Synchronized)]
        [CompilerGenerated]
        set
        {
            EventHandler value2 = TextBox23_TextChanged;
            TextBox textBox = _TextBox23;
            if (textBox != null)
            {
                textBox.TextChanged -= value2;
            }

            _TextBox23 = value;
            textBox = _TextBox23;
            if (textBox != null)
            {
                textBox.TextChanged += value2;
            }
        }
    }

    [field: AccessedThroughProperty("Label27")]
    internal virtual Label Label27
    {
        get; [MethodImpl(MethodImplOptions.Synchronized)]
        set;
    }

    internal virtual ComboBox ComboBox2
    {
        [CompilerGenerated]
        get
        {
            return _ComboBox2;
        }
        [MethodImpl(MethodImplOptions.Synchronized)]
        [CompilerGenerated]
        set
        {
            EventHandler value2 = ComboBox2_SelectedIndexChanged;
            ComboBox comboBox = _ComboBox2;
            if (comboBox != null)
            {
                comboBox.SelectedIndexChanged -= value2;
            }

            _ComboBox2 = value;
            comboBox = _ComboBox2;
            if (comboBox != null)
            {
                comboBox.SelectedIndexChanged += value2;
            }
        }
    }

    [field: AccessedThroughProperty("TableLayoutPanel3")]
    internal virtual TableLayoutPanel TableLayoutPanel3
    {
        get; [MethodImpl(MethodImplOptions.Synchronized)]
        set;
    }

    [field: AccessedThroughProperty("GroupBox8")]
    internal virtual GroupBox GroupBox8
    {
        get; [MethodImpl(MethodImplOptions.Synchronized)]
        set;
    }

    [field: AccessedThroughProperty("GroupBox9")]
    internal virtual GroupBox GroupBox9
    {
        get; [MethodImpl(MethodImplOptions.Synchronized)]
        set;
    }

    [field: AccessedThroughProperty("GroupBox10")]
    internal virtual GroupBox GroupBox10
    {
        get; [MethodImpl(MethodImplOptions.Synchronized)]
        set;
    }

    internal virtual Label Label28
    {
        [CompilerGenerated]
        get
        {
            return _Label28;
        }
        [MethodImpl(MethodImplOptions.Synchronized)]
        [CompilerGenerated]
        set
        {
            EventHandler value2 = Label28_Click;
            Label label = _Label28;
            if (label != null)
            {
                label.Click -= value2;
            }

            _Label28 = value;
            label = _Label28;
            if (label != null)
            {
                label.Click += value2;
            }
        }
    }

    internal virtual TextBox TextBox24
    {
        [CompilerGenerated]
        get
        {
            return _TextBox24;
        }
        [MethodImpl(MethodImplOptions.Synchronized)]
        [CompilerGenerated]
        set
        {
            EventHandler value2 = TextBox24_Click;
            TextBox textBox = _TextBox24;
            if (textBox != null)
            {
                textBox.Click -= value2;
            }

            _TextBox24 = value;
            textBox = _TextBox24;
            if (textBox != null)
            {
                textBox.Click += value2;
            }
        }
    }

    internal virtual Label Label29
    {
        [CompilerGenerated]
        get
        {
            return _Label29;
        }
        [MethodImpl(MethodImplOptions.Synchronized)]
        [CompilerGenerated]
        set
        {
            EventHandler value2 = Label29_Click;
            Label label = _Label29;
            if (label != null)
            {
                label.Click -= value2;
            }

            _Label29 = value;
            label = _Label29;
            if (label != null)
            {
                label.Click += value2;
            }
        }
    }

    internal virtual ComboBox ComboBox5
    {
        [CompilerGenerated]
        get
        {
            return _ComboBox5;
        }
        [MethodImpl(MethodImplOptions.Synchronized)]
        [CompilerGenerated]
        set
        {
            EventHandler value2 = ComboBox5_SelectedIndexChanged;
            ComboBox comboBox = _ComboBox5;
            if (comboBox != null)
            {
                comboBox.SelectedIndexChanged -= value2;
            }

            _ComboBox5 = value;
            comboBox = _ComboBox5;
            if (comboBox != null)
            {
                comboBox.SelectedIndexChanged += value2;
            }
        }
    }

    internal virtual ComboBox ComboBox6
    {
        [CompilerGenerated]
        get
        {
            return _ComboBox6;
        }
        [MethodImpl(MethodImplOptions.Synchronized)]
        [CompilerGenerated]
        set
        {
            EventHandler value2 = ComboBox6_SelectedIndexChanged;
            ComboBox comboBox = _ComboBox6;
            if (comboBox != null)
            {
                comboBox.SelectedIndexChanged -= value2;
            }

            _ComboBox6 = value;
            comboBox = _ComboBox6;
            if (comboBox != null)
            {
                comboBox.SelectedIndexChanged += value2;
            }
        }
    }

    [field: AccessedThroughProperty("Label30")]
    internal virtual Label Label30
    {
        get; [MethodImpl(MethodImplOptions.Synchronized)]
        set;
    }

    internal virtual ComboBox ComboBox7
    {
        [CompilerGenerated]
        get
        {
            return _ComboBox7;
        }
        [MethodImpl(MethodImplOptions.Synchronized)]
        [CompilerGenerated]
        set
        {
            EventHandler value2 = ComboBox7_SelectedIndexChanged;
            ComboBox comboBox = _ComboBox7;
            if (comboBox != null)
            {
                comboBox.SelectedIndexChanged -= value2;
            }

            _ComboBox7 = value;
            comboBox = _ComboBox7;
            if (comboBox != null)
            {
                comboBox.SelectedIndexChanged += value2;
            }
        }
    }

    [field: AccessedThroughProperty("Label31")]
    internal virtual Label Label31
    {
        get; [MethodImpl(MethodImplOptions.Synchronized)]
        set;
    }

    [field: AccessedThroughProperty("ComboBox8")]
    internal virtual ComboBox ComboBox8
    {
        get; [MethodImpl(MethodImplOptions.Synchronized)]
        set;
    }

    [field: AccessedThroughProperty("ComboBox9")]
    internal virtual ComboBox ComboBox9
    {
        get; [MethodImpl(MethodImplOptions.Synchronized)]
        set;
    }

    [field: AccessedThroughProperty("FolderBrowserDialog1")]
    internal virtual FolderBrowserDialog FolderBrowserDialog1
    {
        get; [MethodImpl(MethodImplOptions.Synchronized)]
        set;
    }

    public DentalPanel()
    {
        base.Load += DentalPanel_Load;
        base.Shown += DentalPanel_Shown;
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
        System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(DentalAddin.DentalPanel));
        this.MenuStrip1 = new System.Windows.Forms.MenuStrip();
        this.OKStripMenuItem = new System.Windows.Forms.ToolStripMenuItem();
        this.CancelToolStripMenuItem = new System.Windows.Forms.ToolStripMenuItem();
        this.ToolStripMenuItem2 = new System.Windows.Forms.ToolStripMenuItem();
        this.LoadOtherPartToolStripMenuItem = new System.Windows.Forms.ToolStripMenuItem();
        this.SaveToNewPartToolStripMenuItem = new System.Windows.Forms.ToolStripMenuItem();
        this.ShowSettingToolStripMenuItem = new System.Windows.Forms.ToolStripMenuItem();
        this.TabControl1 = new System.Windows.Forms.TabControl();
        this.TabPage1 = new System.Windows.Forms.TabPage();
        this.TableLayoutPanel1 = new System.Windows.Forms.TableLayoutPanel();
        this.PictureBox1 = new System.Windows.Forms.PictureBox();
        this.GroupBox3 = new System.Windows.Forms.GroupBox();
        this.TextBox19 = new System.Windows.Forms.TextBox();
        this.TextBox18 = new System.Windows.Forms.TextBox();
        this.Label15 = new System.Windows.Forms.Label();
        this.Label14 = new System.Windows.Forms.Label();
        this.GroupBox5 = new System.Windows.Forms.GroupBox();
        this.ComboBox9 = new System.Windows.Forms.ComboBox();
        this.TextBox23 = new System.Windows.Forms.TextBox();
        this.ComboBox8 = new System.Windows.Forms.ComboBox();
        this.Label27 = new System.Windows.Forms.Label();
        this.ComboBox2 = new System.Windows.Forms.ComboBox();
        this.TextBox10 = new System.Windows.Forms.TextBox();
        this.Label20 = new System.Windows.Forms.Label();
        this.TextBox7 = new System.Windows.Forms.TextBox();
        this.Label7 = new System.Windows.Forms.Label();
        this.Label3 = new System.Windows.Forms.Label();
        this.TextBox3 = new System.Windows.Forms.TextBox();
        this.GroupBox6 = new System.Windows.Forms.GroupBox();
        this.Label24 = new System.Windows.Forms.Label();
        this.TextBox20 = new System.Windows.Forms.TextBox();
        this.TextBox17 = new System.Windows.Forms.TextBox();
        this.Label23 = new System.Windows.Forms.Label();
        this.Label22 = new System.Windows.Forms.Label();
        this.GroupBox7 = new System.Windows.Forms.GroupBox();
        this.Button1 = new System.Windows.Forms.Button();
        this.RichTextBox1 = new System.Windows.Forms.RichTextBox();
        this.TextBox21 = new System.Windows.Forms.TextBox();
        this.Label25 = new System.Windows.Forms.Label();
        this.TabPage2 = new System.Windows.Forms.TabPage();
        this.TableLayoutPanel2 = new System.Windows.Forms.TableLayoutPanel();
        this.GroupBox2 = new System.Windows.Forms.GroupBox();
        this.ComboBox5 = new System.Windows.Forms.ComboBox();
        this.Label29 = new System.Windows.Forms.Label();
        this.TextBox15 = new System.Windows.Forms.TextBox();
        this.TextBox13 = new System.Windows.Forms.TextBox();
        this.Label12 = new System.Windows.Forms.Label();
        this.Label10 = new System.Windows.Forms.Label();
        this.TextBox11 = new System.Windows.Forms.TextBox();
        this.Label8 = new System.Windows.Forms.Label();
        this.GroupBox4 = new System.Windows.Forms.GroupBox();
        this.ComboBox7 = new System.Windows.Forms.ComboBox();
        this.Label31 = new System.Windows.Forms.Label();
        this.ComboBox6 = new System.Windows.Forms.ComboBox();
        this.Label30 = new System.Windows.Forms.Label();
        this.ComboBox4 = new System.Windows.Forms.ComboBox();
        this.Label18 = new System.Windows.Forms.Label();
        this.ComboBox3 = new System.Windows.Forms.ComboBox();
        this.Label21 = new System.Windows.Forms.Label();
        this.TextBox12 = new System.Windows.Forms.TextBox();
        this.ComboBox1 = new System.Windows.Forms.ComboBox();
        this.TextBox16 = new System.Windows.Forms.TextBox();
        this.Label17 = new System.Windows.Forms.Label();
        this.Label9 = new System.Windows.Forms.Label();
        this.Label16 = new System.Windows.Forms.Label();
        this.TabPage3 = new System.Windows.Forms.TabPage();
        this.TableLayoutPanel3 = new System.Windows.Forms.TableLayoutPanel();
        this.GroupBox1 = new System.Windows.Forms.GroupBox();
        this.TextBox24 = new System.Windows.Forms.TextBox();
        this.Label28 = new System.Windows.Forms.Label();
        this.TextBox8 = new System.Windows.Forms.TextBox();
        this.Label13 = new System.Windows.Forms.Label();
        this.TextBox6 = new System.Windows.Forms.TextBox();
        this.TextBox5 = new System.Windows.Forms.TextBox();
        this.TextBox4 = new System.Windows.Forms.TextBox();
        this.TextBox2 = new System.Windows.Forms.TextBox();
        this.TextBox1 = new System.Windows.Forms.TextBox();
        this.Label6 = new System.Windows.Forms.Label();
        this.Label5 = new System.Windows.Forms.Label();
        this.Label4 = new System.Windows.Forms.Label();
        this.Label1 = new System.Windows.Forms.Label();
        this.Label2 = new System.Windows.Forms.Label();
        this.GroupBox8 = new System.Windows.Forms.GroupBox();
        this.TextBox22 = new System.Windows.Forms.TextBox();
        this.Label26 = new System.Windows.Forms.Label();
        this.GroupBox9 = new System.Windows.Forms.GroupBox();
        this.Label19 = new System.Windows.Forms.Label();
        this.TextBox9 = new System.Windows.Forms.TextBox();
        this.GroupBox10 = new System.Windows.Forms.GroupBox();
        this.Label11 = new System.Windows.Forms.Label();
        this.TextBox14 = new System.Windows.Forms.TextBox();
        this.FolderBrowserDialog1 = new System.Windows.Forms.FolderBrowserDialog();
        this.MenuStrip1.SuspendLayout();
        this.TabControl1.SuspendLayout();
        this.TabPage1.SuspendLayout();
        this.TableLayoutPanel1.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)this.PictureBox1).BeginInit();
        this.GroupBox3.SuspendLayout();
        this.GroupBox5.SuspendLayout();
        this.GroupBox6.SuspendLayout();
        this.GroupBox7.SuspendLayout();
        this.TabPage2.SuspendLayout();
        this.TableLayoutPanel2.SuspendLayout();
        this.GroupBox2.SuspendLayout();
        this.GroupBox4.SuspendLayout();
        this.TabPage3.SuspendLayout();
        this.TableLayoutPanel3.SuspendLayout();
        this.GroupBox1.SuspendLayout();
        this.GroupBox8.SuspendLayout();
        this.GroupBox9.SuspendLayout();
        this.GroupBox10.SuspendLayout();
        base.SuspendLayout();
        this.MenuStrip1.ImageScalingSize = new System.Drawing.Size(20, 20);
        this.MenuStrip1.Items.AddRange(new System.Windows.Forms.ToolStripItem[3] { this.OKStripMenuItem, this.CancelToolStripMenuItem, this.ToolStripMenuItem2 });
        this.MenuStrip1.Location = new System.Drawing.Point(0, 0);
        this.MenuStrip1.Name = "MenuStrip1";
        this.MenuStrip1.Size = new System.Drawing.Size(308, 28);
        this.MenuStrip1.TabIndex = 0;
        this.MenuStrip1.Text = "MenuStrip1";
        this.OKStripMenuItem.Image = DentalAddin.My.Resources.Resources.ok0;
        this.OKStripMenuItem.Name = "OKStripMenuItem";
        this.OKStripMenuItem.Size = new System.Drawing.Size(58, 24);
        this.OKStripMenuItem.Text = "OK";
        this.CancelToolStripMenuItem.Image = DentalAddin.My.Resources.Resources.cancel;
        this.CancelToolStripMenuItem.Name = "CancelToolStripMenuItem";
        this.CancelToolStripMenuItem.Size = new System.Drawing.Size(78, 24);
        this.CancelToolStripMenuItem.Text = "Cancel";
        this.ToolStripMenuItem2.DropDownItems.AddRange(new System.Windows.Forms.ToolStripItem[3] { this.LoadOtherPartToolStripMenuItem, this.SaveToNewPartToolStripMenuItem, this.ShowSettingToolStripMenuItem });
        this.ToolStripMenuItem2.Name = "ToolStripMenuItem2";
        this.ToolStripMenuItem2.Size = new System.Drawing.Size(28, 24);
        this.ToolStripMenuItem2.Text = "V";
        this.LoadOtherPartToolStripMenuItem.Name = "LoadOtherPartToolStripMenuItem";
        this.LoadOtherPartToolStripMenuItem.Size = new System.Drawing.Size(176, 22);
        this.LoadOtherPartToolStripMenuItem.Text = "Load Other Part";
        this.SaveToNewPartToolStripMenuItem.Name = "SaveToNewPartToolStripMenuItem";
        this.SaveToNewPartToolStripMenuItem.Size = new System.Drawing.Size(176, 22);
        this.SaveToNewPartToolStripMenuItem.Text = "Save to New Part";
        this.ShowSettingToolStripMenuItem.Name = "ShowSettingToolStripMenuItem";
        this.ShowSettingToolStripMenuItem.Size = new System.Drawing.Size(176, 22);
        this.ShowSettingToolStripMenuItem.Text = "Show Setting...";
        this.TabControl1.Alignment = System.Windows.Forms.TabAlignment.Left;
        this.TabControl1.Controls.Add(this.TabPage1);
        this.TabControl1.Controls.Add(this.TabPage2);
        this.TabControl1.Controls.Add(this.TabPage3);
        this.TabControl1.Dock = System.Windows.Forms.DockStyle.Fill;
        this.TabControl1.Location = new System.Drawing.Point(0, 28);
        this.TabControl1.Multiline = true;
        this.TabControl1.Name = "TabControl1";
        this.TabControl1.SelectedIndex = 0;
        this.TabControl1.Size = new System.Drawing.Size(308, 624);
        this.TabControl1.TabIndex = 1;
        this.TabPage1.Controls.Add(this.TableLayoutPanel1);
        this.TabPage1.Location = new System.Drawing.Point(22, 4);
        this.TabPage1.Name = "TabPage1";
        this.TabPage1.Padding = new System.Windows.Forms.Padding(3);
        this.TabPage1.Size = new System.Drawing.Size(282, 616);
        this.TabPage1.TabIndex = 0;
        this.TabPage1.Text = "General";
        this.TabPage1.UseVisualStyleBackColor = true;
        this.TableLayoutPanel1.ColumnCount = 1;
        this.TableLayoutPanel1.ColumnStyles.Add(new System.Windows.Forms.ColumnStyle(System.Windows.Forms.SizeType.Percent, 100f));
        this.TableLayoutPanel1.Controls.Add(this.PictureBox1, 0, 0);
        this.TableLayoutPanel1.Controls.Add(this.GroupBox3, 0, 1);
        this.TableLayoutPanel1.Controls.Add(this.GroupBox5, 0, 2);
        this.TableLayoutPanel1.Controls.Add(this.GroupBox6, 0, 4);
        this.TableLayoutPanel1.Controls.Add(this.GroupBox7, 0, 3);
        this.TableLayoutPanel1.Dock = System.Windows.Forms.DockStyle.Fill;
        this.TableLayoutPanel1.Location = new System.Drawing.Point(3, 3);
        this.TableLayoutPanel1.Name = "TableLayoutPanel1";
        this.TableLayoutPanel1.RowCount = 5;
        this.TableLayoutPanel1.RowStyles.Add(new System.Windows.Forms.RowStyle(System.Windows.Forms.SizeType.Absolute, 84f));
        this.TableLayoutPanel1.RowStyles.Add(new System.Windows.Forms.RowStyle(System.Windows.Forms.SizeType.Absolute, 78f));
        this.TableLayoutPanel1.RowStyles.Add(new System.Windows.Forms.RowStyle(System.Windows.Forms.SizeType.Absolute, 180f));
        this.TableLayoutPanel1.RowStyles.Add(new System.Windows.Forms.RowStyle());
        this.TableLayoutPanel1.RowStyles.Add(new System.Windows.Forms.RowStyle());
        this.TableLayoutPanel1.Size = new System.Drawing.Size(276, 610);
        this.TableLayoutPanel1.TabIndex = 1;
        this.PictureBox1.Dock = System.Windows.Forms.DockStyle.Fill;
        this.PictureBox1.Image = (System.Drawing.Image)resources.GetObject("PictureBox1.Image");
        this.PictureBox1.Location = new System.Drawing.Point(0, 0);
        this.PictureBox1.Margin = new System.Windows.Forms.Padding(0);
        this.PictureBox1.Name = "PictureBox1";
        this.PictureBox1.Size = new System.Drawing.Size(276, 84);
        this.PictureBox1.SizeMode = System.Windows.Forms.PictureBoxSizeMode.Zoom;
        this.PictureBox1.TabIndex = 1;
        this.PictureBox1.TabStop = false;
        this.GroupBox3.Controls.Add(this.TextBox19);
        this.GroupBox3.Controls.Add(this.TextBox18);
        this.GroupBox3.Controls.Add(this.Label15);
        this.GroupBox3.Controls.Add(this.Label14);
        this.GroupBox3.Dock = System.Windows.Forms.DockStyle.Fill;
        this.GroupBox3.Location = new System.Drawing.Point(3, 87);
        this.GroupBox3.Name = "GroupBox3";
        this.GroupBox3.Size = new System.Drawing.Size(270, 72);
        this.GroupBox3.TabIndex = 0;
        this.GroupBox3.TabStop = false;
        this.GroupBox3.Text = "Limit Points";
        this.TextBox19.BackColor = System.Drawing.Color.Red;
        this.TextBox19.Location = new System.Drawing.Point(131, 46);
        this.TextBox19.Name = "TextBox19";
        this.TextBox19.ReadOnly = true;
        this.TextBox19.Size = new System.Drawing.Size(134, 21);
        this.TextBox19.TabIndex = 5;
        this.TextBox19.TextAlign = System.Windows.Forms.HorizontalAlignment.Center;
        this.TextBox18.BackColor = System.Drawing.Color.Red;
        this.TextBox18.Location = new System.Drawing.Point(131, 17);
        this.TextBox18.Name = "TextBox18";
        this.TextBox18.ReadOnly = true;
        this.TextBox18.Size = new System.Drawing.Size(134, 21);
        this.TextBox18.TabIndex = 4;
        this.TextBox18.TextAlign = System.Windows.Forms.HorizontalAlignment.Center;
        this.Label15.AutoSize = true;
        this.Label15.Location = new System.Drawing.Point(9, 48);
        this.Label15.Name = "Label15";
        this.Label15.Size = new System.Drawing.Size(53, 12);
        this.Label15.TabIndex = 2;
        this.Label15.Text = "Point 2:";
        this.Label14.AutoSize = true;
        this.Label14.Location = new System.Drawing.Point(9, 19);
        this.Label14.Name = "Label14";
        this.Label14.Size = new System.Drawing.Size(53, 12);
        this.Label14.TabIndex = 1;
        this.Label14.Text = "Point 1:";
        this.GroupBox5.Controls.Add(this.ComboBox9);
        this.GroupBox5.Controls.Add(this.TextBox23);
        this.GroupBox5.Controls.Add(this.ComboBox8);
        this.GroupBox5.Controls.Add(this.Label27);
        this.GroupBox5.Controls.Add(this.ComboBox2);
        this.GroupBox5.Controls.Add(this.TextBox10);
        this.GroupBox5.Controls.Add(this.Label20);
        this.GroupBox5.Controls.Add(this.TextBox7);
        this.GroupBox5.Controls.Add(this.Label7);
        this.GroupBox5.Controls.Add(this.Label3);
        this.GroupBox5.Controls.Add(this.TextBox3);
        this.GroupBox5.Dock = System.Windows.Forms.DockStyle.Fill;
        this.GroupBox5.Location = new System.Drawing.Point(3, 165);
        this.GroupBox5.Name = "GroupBox5";
        this.GroupBox5.Size = new System.Drawing.Size(270, 174);
        this.GroupBox5.TabIndex = 2;
        this.GroupBox5.TabStop = false;
        this.GroupBox5.Text = "Technology File";
        this.ComboBox9.FormattingEnabled = true;
        this.ComboBox9.Location = new System.Drawing.Point(10, 84);
        this.ComboBox9.Margin = new System.Windows.Forms.Padding(2);
        this.ComboBox9.Name = "ComboBox9";
        this.ComboBox9.Size = new System.Drawing.Size(230, 20);
        this.ComboBox9.TabIndex = 9;
        this.TextBox23.Location = new System.Drawing.Point(231, 144);
        this.TextBox23.Name = "TextBox23";
        this.TextBox23.Size = new System.Drawing.Size(34, 21);
        this.TextBox23.TabIndex = 27;
        this.TextBox23.TextAlign = System.Windows.Forms.HorizontalAlignment.Center;
        this.ComboBox8.FormattingEnabled = true;
        this.ComboBox8.Location = new System.Drawing.Point(10, 38);
        this.ComboBox8.Margin = new System.Windows.Forms.Padding(2);
        this.ComboBox8.Name = "ComboBox8";
        this.ComboBox8.Size = new System.Drawing.Size(230, 20);
        this.ComboBox8.TabIndex = 8;
        this.Label27.AutoSize = true;
        this.Label27.Location = new System.Drawing.Point(9, 146);
        this.Label27.Name = "Label27";
        this.Label27.Size = new System.Drawing.Size(71, 12);
        this.Label27.TabIndex = 26;
        this.Label27.Text = "Steep Angle";
        this.ComboBox2.FormattingEnabled = true;
        this.ComboBox2.Location = new System.Drawing.Point(131, 144);
        this.ComboBox2.Margin = new System.Windows.Forms.Padding(2);
        this.ComboBox2.Name = "ComboBox2";
        this.ComboBox2.Size = new System.Drawing.Size(96, 20);
        this.ComboBox2.TabIndex = 25;
        this.TextBox10.Location = new System.Drawing.Point(131, 112);
        this.TextBox10.Margin = new System.Windows.Forms.Padding(2);
        this.TextBox10.Name = "TextBox10";
        this.TextBox10.ReadOnly = true;
        this.TextBox10.Size = new System.Drawing.Size(134, 21);
        this.TextBox10.TabIndex = 24;
        this.TextBox10.TextAlign = System.Windows.Forms.HorizontalAlignment.Center;
        this.Label20.AutoSize = true;
        this.Label20.Location = new System.Drawing.Point(9, 114);
        this.Label20.Margin = new System.Windows.Forms.Padding(2, 0, 2, 0);
        this.Label20.Name = "Label20";
        this.Label20.Size = new System.Drawing.Size(83, 12);
        this.Label20.TabIndex = 23;
        this.Label20.Text = "End Position:";
        this.TextBox7.Location = new System.Drawing.Point(244, 82);
        this.TextBox7.Name = "TextBox7";
        this.TextBox7.ReadOnly = true;
        this.TextBox7.Size = new System.Drawing.Size(21, 21);
        this.TextBox7.TabIndex = 22;
        this.TextBox7.Text = "...";
        this.Label7.AutoSize = true;
        this.Label7.Location = new System.Drawing.Point(9, 64);
        this.Label7.Name = "Label7";
        this.Label7.Size = new System.Drawing.Size(209, 12);
        this.Label7.TabIndex = 21;
        this.Label7.Text = "Connection Machining Process File:";
        this.Label3.AutoSize = true;
        this.Label3.Location = new System.Drawing.Point(9, 18);
        this.Label3.Name = "Label3";
        this.Label3.Size = new System.Drawing.Size(143, 12);
        this.Label3.TabIndex = 17;
        this.Label3.Text = "Face Hole Process File:";
        this.TextBox3.Location = new System.Drawing.Point(244, 36);
        this.TextBox3.Name = "TextBox3";
        this.TextBox3.ReadOnly = true;
        this.TextBox3.Size = new System.Drawing.Size(21, 21);
        this.TextBox3.TabIndex = 18;
        this.TextBox3.Text = "...";
        this.GroupBox6.Controls.Add(this.Label24);
        this.GroupBox6.Controls.Add(this.TextBox20);
        this.GroupBox6.Controls.Add(this.TextBox17);
        this.GroupBox6.Controls.Add(this.Label23);
        this.GroupBox6.Controls.Add(this.Label22);
        this.GroupBox6.Dock = System.Windows.Forms.DockStyle.Fill;
        this.GroupBox6.Location = new System.Drawing.Point(2, 448);
        this.GroupBox6.Margin = new System.Windows.Forms.Padding(2);
        this.GroupBox6.Name = "GroupBox6";
        this.GroupBox6.Padding = new System.Windows.Forms.Padding(2);
        this.GroupBox6.Size = new System.Drawing.Size(272, 284);
        this.GroupBox6.TabIndex = 3;
        this.GroupBox6.TabStop = false;
        this.GroupBox6.Text = "Chamfer Composite Limit";
        this.Label24.AutoSize = true;
        this.Label24.Location = new System.Drawing.Point(10, 54);
        this.Label24.Name = "Label24";
        this.Label24.Size = new System.Drawing.Size(53, 12);
        this.Label24.TabIndex = 7;
        this.Label24.Text = "Point 2:";
        this.TextBox20.BackColor = System.Drawing.Color.Red;
        this.TextBox20.Location = new System.Drawing.Point(132, 51);
        this.TextBox20.Name = "TextBox20";
        this.TextBox20.ReadOnly = true;
        this.TextBox20.Size = new System.Drawing.Size(134, 21);
        this.TextBox20.TabIndex = 6;
        this.TextBox20.TextAlign = System.Windows.Forms.HorizontalAlignment.Center;
        this.TextBox17.BackColor = System.Drawing.Color.Red;
        this.TextBox17.Location = new System.Drawing.Point(132, 22);
        this.TextBox17.Name = "TextBox17";
        this.TextBox17.ReadOnly = true;
        this.TextBox17.Size = new System.Drawing.Size(134, 21);
        this.TextBox17.TabIndex = 5;
        this.TextBox17.TextAlign = System.Windows.Forms.HorizontalAlignment.Center;
        this.Label23.AutoSize = true;
        this.Label23.Location = new System.Drawing.Point(160, 54);
        this.Label23.Name = "Label23";
        this.Label23.Size = new System.Drawing.Size(53, 12);
        this.Label23.TabIndex = 3;
        this.Label23.Text = "Point 2:";
        this.Label22.AutoSize = true;
        this.Label22.Location = new System.Drawing.Point(10, 25);
        this.Label22.Name = "Label22";
        this.Label22.Size = new System.Drawing.Size(53, 12);
        this.Label22.TabIndex = 2;
        this.Label22.Text = "Point 1:";
        this.GroupBox7.Controls.Add(this.Button1);
        this.GroupBox7.Controls.Add(this.RichTextBox1);
        this.GroupBox7.Controls.Add(this.TextBox21);
        this.GroupBox7.Controls.Add(this.Label25);
        this.GroupBox7.Location = new System.Drawing.Point(2, 344);
        this.GroupBox7.Margin = new System.Windows.Forms.Padding(2);
        this.GroupBox7.Name = "GroupBox7";
        this.GroupBox7.Padding = new System.Windows.Forms.Padding(2);
        this.GroupBox7.Size = new System.Drawing.Size(272, 100);
        this.GroupBox7.TabIndex = 4;
        this.GroupBox7.TabStop = false;
        this.GroupBox7.Text = "Mark";
        this.Button1.Location = new System.Drawing.Point(176, 74);
        this.Button1.Margin = new System.Windows.Forms.Padding(2);
        this.Button1.Name = "Button1";
        this.Button1.Size = new System.Drawing.Size(89, 18);
        this.Button1.TabIndex = 6;
        this.Button1.UseVisualStyleBackColor = true;
        this.RichTextBox1.Location = new System.Drawing.Point(11, 39);
        this.RichTextBox1.Margin = new System.Windows.Forms.Padding(2);
        this.RichTextBox1.Name = "RichTextBox1";
        this.RichTextBox1.Size = new System.Drawing.Size(254, 31);
        this.RichTextBox1.TabIndex = 5;
        this.RichTextBox1.Text = "";
        this.TextBox21.BackColor = System.Drawing.Color.Red;
        this.TextBox21.Location = new System.Drawing.Point(132, 14);
        this.TextBox21.Margin = new System.Windows.Forms.Padding(2);
        this.TextBox21.Name = "TextBox21";
        this.TextBox21.ReadOnly = true;
        this.TextBox21.Size = new System.Drawing.Size(134, 21);
        this.TextBox21.TabIndex = 3;
        this.TextBox21.TextAlign = System.Windows.Forms.HorizontalAlignment.Center;
        this.Label25.AutoSize = true;
        this.Label25.Location = new System.Drawing.Point(10, 17);
        this.Label25.Margin = new System.Windows.Forms.Padding(2, 0, 2, 0);
        this.Label25.Name = "Label25";
        this.Label25.Size = new System.Drawing.Size(77, 12);
        this.Label25.TabIndex = 2;
        this.Label25.Text = "Rotate Angle";
        this.TabPage2.Controls.Add(this.TableLayoutPanel2);
        this.TabPage2.Location = new System.Drawing.Point(22, 4);
        this.TabPage2.Name = "TabPage2";
        this.TabPage2.Size = new System.Drawing.Size(282, 616);
        this.TabPage2.TabIndex = 1;
        this.TabPage2.Text = "Setting";
        this.TabPage2.UseVisualStyleBackColor = true;
        this.TableLayoutPanel2.ColumnCount = 1;
        this.TableLayoutPanel2.ColumnStyles.Add(new System.Windows.Forms.ColumnStyle(System.Windows.Forms.SizeType.Percent, 100f));
        this.TableLayoutPanel2.Controls.Add(this.GroupBox2, 0, 0);
        this.TableLayoutPanel2.Controls.Add(this.GroupBox4, 0, 1);
        this.TableLayoutPanel2.Dock = System.Windows.Forms.DockStyle.Fill;
        this.TableLayoutPanel2.Location = new System.Drawing.Point(0, 0);
        this.TableLayoutPanel2.Name = "TableLayoutPanel2";
        this.TableLayoutPanel2.RowCount = 2;
        this.TableLayoutPanel2.RowStyles.Add(new System.Windows.Forms.RowStyle(System.Windows.Forms.SizeType.Absolute, 160f));
        this.TableLayoutPanel2.RowStyles.Add(new System.Windows.Forms.RowStyle());
        this.TableLayoutPanel2.Size = new System.Drawing.Size(282, 616);
        this.TableLayoutPanel2.TabIndex = 3;
        this.GroupBox2.Controls.Add(this.ComboBox5);
        this.GroupBox2.Controls.Add(this.Label29);
        this.GroupBox2.Controls.Add(this.TextBox15);
        this.GroupBox2.Controls.Add(this.TextBox13);
        this.GroupBox2.Controls.Add(this.Label12);
        this.GroupBox2.Controls.Add(this.Label10);
        this.GroupBox2.Controls.Add(this.TextBox11);
        this.GroupBox2.Controls.Add(this.Label8);
        this.GroupBox2.Dock = System.Windows.Forms.DockStyle.Fill;
        this.GroupBox2.Location = new System.Drawing.Point(3, 3);
        this.GroupBox2.Name = "GroupBox2";
        this.GroupBox2.Size = new System.Drawing.Size(276, 154);
        this.GroupBox2.TabIndex = 1;
        this.GroupBox2.TabStop = false;
        this.GroupBox2.Text = "Turning Setting";
        this.ComboBox5.FormattingEnabled = true;
        this.ComboBox5.Location = new System.Drawing.Point(140, 130);
        this.ComboBox5.Margin = new System.Windows.Forms.Padding(2);
        this.ComboBox5.Name = "ComboBox5";
        this.ComboBox5.Size = new System.Drawing.Size(123, 20);
        this.ComboBox5.TabIndex = 11;
        this.Label29.AutoSize = true;
        this.Label29.Location = new System.Drawing.Point(9, 130);
        this.Label29.Name = "Label29";
        this.Label29.Size = new System.Drawing.Size(95, 12);
        this.Label29.TabIndex = 10;
        this.Label29.Text = "Reverse Turning";
        this.TextBox15.Location = new System.Drawing.Point(140, 94);
        this.TextBox15.Name = "TextBox15";
        this.TextBox15.Size = new System.Drawing.Size(123, 21);
        this.TextBox15.TabIndex = 9;
        this.TextBox15.TextAlign = System.Windows.Forms.HorizontalAlignment.Center;
        this.TextBox13.Location = new System.Drawing.Point(140, 30);
        this.TextBox13.Name = "TextBox13";
        this.TextBox13.Size = new System.Drawing.Size(123, 21);
        this.TextBox13.TabIndex = 7;
        this.TextBox13.TextAlign = System.Windows.Forms.HorizontalAlignment.Center;
        this.Label12.AutoSize = true;
        this.Label12.Location = new System.Drawing.Point(9, 96);
        this.Label12.Name = "Label12";
        this.Label12.Size = new System.Drawing.Size(89, 12);
        this.Label12.TabIndex = 5;
        this.Label12.Text = "Turning Extend";
        this.Label10.AutoSize = true;
        this.Label10.Location = new System.Drawing.Point(9, 32);
        this.Label10.Name = "Label10";
        this.Label10.Size = new System.Drawing.Size(83, 12);
        this.Label10.TabIndex = 3;
        this.Label10.Text = "Turning Depth";
        this.TextBox11.Location = new System.Drawing.Point(140, 60);
        this.TextBox11.Name = "TextBox11";
        this.TextBox11.Size = new System.Drawing.Size(123, 21);
        this.TextBox11.TabIndex = 1;
        this.TextBox11.TextAlign = System.Windows.Forms.HorizontalAlignment.Center;
        this.Label8.AutoSize = true;
        this.Label8.Location = new System.Drawing.Point(9, 62);
        this.Label8.Name = "Label8";
        this.Label8.Size = new System.Drawing.Size(65, 12);
        this.Label8.TabIndex = 0;
        this.Label8.Text = "Exit Angle";
        this.GroupBox4.Controls.Add(this.ComboBox7);
        this.GroupBox4.Controls.Add(this.Label31);
        this.GroupBox4.Controls.Add(this.ComboBox6);
        this.GroupBox4.Controls.Add(this.Label30);
        this.GroupBox4.Controls.Add(this.ComboBox4);
        this.GroupBox4.Controls.Add(this.Label18);
        this.GroupBox4.Controls.Add(this.ComboBox3);
        this.GroupBox4.Controls.Add(this.Label21);
        this.GroupBox4.Controls.Add(this.TextBox12);
        this.GroupBox4.Controls.Add(this.ComboBox1);
        this.GroupBox4.Controls.Add(this.TextBox16);
        this.GroupBox4.Controls.Add(this.Label17);
        this.GroupBox4.Controls.Add(this.Label9);
        this.GroupBox4.Controls.Add(this.Label16);
        this.GroupBox4.Dock = System.Windows.Forms.DockStyle.Top;
        this.GroupBox4.Location = new System.Drawing.Point(3, 163);
        this.GroupBox4.Name = "GroupBox4";
        this.GroupBox4.Size = new System.Drawing.Size(276, 276);
        this.GroupBox4.TabIndex = 2;
        this.GroupBox4.TabStop = false;
        this.GroupBox4.Text = "Others";
        this.ComboBox7.FormattingEnabled = true;
        this.ComboBox7.Items.AddRange(new object[2] { "3D Milling", "4 Axis Milling" });
        this.ComboBox7.Location = new System.Drawing.Point(137, 99);
        this.ComboBox7.Name = "ComboBox7";
        this.ComboBox7.Size = new System.Drawing.Size(123, 20);
        this.ComboBox7.TabIndex = 17;
        this.Label31.AutoSize = true;
        this.Label31.Location = new System.Drawing.Point(9, 102);
        this.Label31.Name = "Label31";
        this.Label31.Size = new System.Drawing.Size(77, 12);
        this.Label31.TabIndex = 16;
        this.Label31.Text = "Rough Method";
        this.ComboBox6.FormattingEnabled = true;
        this.ComboBox6.Location = new System.Drawing.Point(137, 246);
        this.ComboBox6.Margin = new System.Windows.Forms.Padding(2);
        this.ComboBox6.Name = "ComboBox6";
        this.ComboBox6.Size = new System.Drawing.Size(123, 20);
        this.ComboBox6.TabIndex = 15;
        this.Label30.AutoSize = true;
        this.Label30.Location = new System.Drawing.Point(9, 249);
        this.Label30.Margin = new System.Windows.Forms.Padding(2, 0, 2, 0);
        this.Label30.Name = "Label30";
        this.Label30.Size = new System.Drawing.Size(107, 12);
        this.Label30.TabIndex = 14;
        this.Label30.Text = "Semi-Rough Degree";
        this.ComboBox4.FormattingEnabled = true;
        this.ComboBox4.Location = new System.Drawing.Point(137, 206);
        this.ComboBox4.Margin = new System.Windows.Forms.Padding(2);
        this.ComboBox4.Name = "ComboBox4";
        this.ComboBox4.Size = new System.Drawing.Size(123, 20);
        this.ComboBox4.TabIndex = 13;
        this.Label18.AutoSize = true;
        this.Label18.Location = new System.Drawing.Point(9, 209);
        this.Label18.Margin = new System.Windows.Forms.Padding(2, 0, 2, 0);
        this.Label18.Name = "Label18";
        this.Label18.Size = new System.Drawing.Size(71, 12);
        this.Label18.TabIndex = 12;
        this.Label18.Text = "Mark Number";
        this.ComboBox3.FormattingEnabled = true;
        this.ComboBox3.Items.AddRange(new object[2] { "OFF", "ON" });
        this.ComboBox3.Location = new System.Drawing.Point(137, 168);
        this.ComboBox3.Name = "ComboBox3";
        this.ComboBox3.Size = new System.Drawing.Size(123, 20);
        this.ComboBox3.TabIndex = 8;
        this.ComboBox3.Text = "OFF";
        this.Label21.AutoSize = true;
        this.Label21.Location = new System.Drawing.Point(9, 170);
        this.Label21.Name = "Label21";
        this.Label21.Size = new System.Drawing.Size(101, 12);
        this.Label21.TabIndex = 7;
        this.Label21.Text = "Margin Finishing";
        this.TextBox12.Location = new System.Drawing.Point(137, 66);
        this.TextBox12.Name = "TextBox12";
        this.TextBox12.Size = new System.Drawing.Size(123, 21);
        this.TextBox12.TabIndex = 6;
        this.TextBox12.TextAlign = System.Windows.Forms.HorizontalAlignment.Center;
        this.ComboBox1.FormattingEnabled = true;
        this.ComboBox1.Items.AddRange(new object[2] { "3D Milling", "4 Axis Milling" });
        this.ComboBox1.Location = new System.Drawing.Point(137, 131);
        this.ComboBox1.Name = "ComboBox1";
        this.ComboBox1.Size = new System.Drawing.Size(123, 20);
        this.ComboBox1.TabIndex = 4;
        this.ComboBox1.Text = "3D Milling";
        this.TextBox16.Location = new System.Drawing.Point(137, 30);
        this.TextBox16.Name = "TextBox16";
        this.TextBox16.Size = new System.Drawing.Size(123, 21);
        this.TextBox16.TabIndex = 3;
        this.TextBox16.TextAlign = System.Windows.Forms.HorizontalAlignment.Center;
        this.Label17.AutoSize = true;
        this.Label17.Location = new System.Drawing.Point(9, 134);
        this.Label17.Name = "Label17";
        this.Label17.Size = new System.Drawing.Size(101, 12);
        this.Label17.TabIndex = 1;
        this.Label17.Text = "Finishing Method";
        this.Label9.AutoSize = true;
        this.Label9.Location = new System.Drawing.Point(9, 68);
        this.Label9.Name = "Label9";
        this.Label9.Size = new System.Drawing.Size(101, 12);
        this.Label9.TabIndex = 2;
        this.Label9.Text = "Front Mill Depth";
        this.Label16.AutoSize = true;
        this.Label16.Location = new System.Drawing.Point(9, 33);
        this.Label16.Name = "Label16";
        this.Label16.Size = new System.Drawing.Size(95, 12);
        this.Label16.TabIndex = 0;
        this.Label16.Text = "Rough Mill Step";
        this.TabPage3.Controls.Add(this.TableLayoutPanel3);
        this.TabPage3.Location = new System.Drawing.Point(22, 4);
        this.TabPage3.Name = "TabPage3";
        this.TabPage3.Padding = new System.Windows.Forms.Padding(3);
        this.TabPage3.Size = new System.Drawing.Size(282, 616);
        this.TabPage3.TabIndex = 2;
        this.TabPage3.Text = "Prc Files";
        this.TabPage3.UseVisualStyleBackColor = true;
        this.TableLayoutPanel3.ColumnCount = 1;
        this.TableLayoutPanel3.ColumnStyles.Add(new System.Windows.Forms.ColumnStyle(System.Windows.Forms.SizeType.Percent, 100f));
        this.TableLayoutPanel3.Controls.Add(this.GroupBox1, 0, 0);
        this.TableLayoutPanel3.Controls.Add(this.GroupBox8, 0, 1);
        this.TableLayoutPanel3.Controls.Add(this.GroupBox9, 0, 2);
        this.TableLayoutPanel3.Controls.Add(this.GroupBox10, 0, 3);
        this.TableLayoutPanel3.Location = new System.Drawing.Point(2, 2);
        this.TableLayoutPanel3.Margin = new System.Windows.Forms.Padding(2);
        this.TableLayoutPanel3.Name = "TableLayoutPanel3";
        this.TableLayoutPanel3.RowCount = 4;
        this.TableLayoutPanel3.RowStyles.Add(new System.Windows.Forms.RowStyle(System.Windows.Forms.SizeType.Absolute, 392f));
        this.TableLayoutPanel3.RowStyles.Add(new System.Windows.Forms.RowStyle());
        this.TableLayoutPanel3.RowStyles.Add(new System.Windows.Forms.RowStyle());
        this.TableLayoutPanel3.RowStyles.Add(new System.Windows.Forms.RowStyle());
        this.TableLayoutPanel3.Size = new System.Drawing.Size(280, 614);
        this.TableLayoutPanel3.TabIndex = 2;
        this.GroupBox1.BackgroundImageLayout = System.Windows.Forms.ImageLayout.None;
        this.GroupBox1.Controls.Add(this.TextBox24);
        this.GroupBox1.Controls.Add(this.Label28);
        this.GroupBox1.Controls.Add(this.TextBox8);
        this.GroupBox1.Controls.Add(this.Label13);
        this.GroupBox1.Controls.Add(this.TextBox6);
        this.GroupBox1.Controls.Add(this.TextBox5);
        this.GroupBox1.Controls.Add(this.TextBox4);
        this.GroupBox1.Controls.Add(this.TextBox2);
        this.GroupBox1.Controls.Add(this.TextBox1);
        this.GroupBox1.Controls.Add(this.Label6);
        this.GroupBox1.Controls.Add(this.Label5);
        this.GroupBox1.Controls.Add(this.Label4);
        this.GroupBox1.Controls.Add(this.Label1);
        this.GroupBox1.Controls.Add(this.Label2);
        this.GroupBox1.Location = new System.Drawing.Point(3, 3);
        this.GroupBox1.Name = "GroupBox1";
        this.GroupBox1.Size = new System.Drawing.Size(270, 383);
        this.GroupBox1.TabIndex = 1;
        this.GroupBox1.TabStop = false;
        this.GroupBox1.Text = "Technology Setting Files";
        this.TextBox24.BackColor = System.Drawing.SystemColors.Control;
        this.TextBox24.Location = new System.Drawing.Point(11, 92);
        this.TextBox24.Margin = new System.Windows.Forms.Padding(2);
        this.TextBox24.Name = "TextBox24";
        this.TextBox24.Size = new System.Drawing.Size(250, 21);
        this.TextBox24.TabIndex = 26;
        this.Label28.AutoSize = true;
        this.Label28.Location = new System.Drawing.Point(12, 72);
        this.Label28.Margin = new System.Windows.Forms.Padding(2, 0, 2, 0);
        this.Label28.Name = "Label28";
        this.Label28.Size = new System.Drawing.Size(179, 12);
        this.Label28.TabIndex = 25;
        this.Label28.Text = "Reverse Turning Process File:";
        this.TextBox8.Location = new System.Drawing.Point(11, 196);
        this.TextBox8.Name = "TextBox8";
        this.TextBox8.ReadOnly = true;
        this.TextBox8.Size = new System.Drawing.Size(251, 21);
        this.TextBox8.TabIndex = 24;
        this.Label13.AutoSize = true;
        this.Label13.Location = new System.Drawing.Point(11, 176);
        this.Label13.Name = "Label13";
        this.Label13.Size = new System.Drawing.Size(215, 12);
        this.Label13.TabIndex = 23;
        this.Label13.Text = "Semi-Roughing Milling Process File:";
        this.TextBox6.Location = new System.Drawing.Point(12, 352);
        this.TextBox6.Name = "TextBox6";
        this.TextBox6.ReadOnly = true;
        this.TextBox6.Size = new System.Drawing.Size(250, 21);
        this.TextBox6.TabIndex = 19;
        this.TextBox5.Location = new System.Drawing.Point(12, 300);
        this.TextBox5.Name = "TextBox5";
        this.TextBox5.ReadOnly = true;
        this.TextBox5.Size = new System.Drawing.Size(250, 21);
        this.TextBox5.TabIndex = 18;
        this.TextBox4.Location = new System.Drawing.Point(12, 248);
        this.TextBox4.Name = "TextBox4";
        this.TextBox4.ReadOnly = true;
        this.TextBox4.Size = new System.Drawing.Size(250, 21);
        this.TextBox4.TabIndex = 17;
        this.TextBox2.Location = new System.Drawing.Point(11, 144);
        this.TextBox2.Name = "TextBox2";
        this.TextBox2.ReadOnly = true;
        this.TextBox2.Size = new System.Drawing.Size(251, 21);
        this.TextBox2.TabIndex = 15;
        this.TextBox1.Location = new System.Drawing.Point(11, 40);
        this.TextBox1.Name = "TextBox1";
        this.TextBox1.ReadOnly = true;
        this.TextBox1.Size = new System.Drawing.Size(250, 21);
        this.TextBox1.TabIndex = 14;
        this.Label6.AutoSize = true;
        this.Label6.Location = new System.Drawing.Point(12, 332);
        this.Label6.Name = "Label6";
        this.Label6.Size = new System.Drawing.Size(95, 12);
        this.Label6.TabIndex = 12;
        this.Label6.Text = "90-270 Postion:";
        this.Label5.AutoSize = true;
        this.Label5.Location = new System.Drawing.Point(12, 280);
        this.Label5.Name = "Label5";
        this.Label5.Size = new System.Drawing.Size(95, 12);
        this.Label5.TabIndex = 11;
        this.Label5.Text = "0-180 Position:";
        this.Label4.AutoSize = true;
        this.Label4.Location = new System.Drawing.Point(12, 228);
        this.Label4.Name = "Label4";
        this.Label4.Size = new System.Drawing.Size(95, 12);
        this.Label4.TabIndex = 10;
        this.Label4.Text = "Face Machining:";
        this.Label1.AutoSize = true;
        this.Label1.Location = new System.Drawing.Point(11, 20);
        this.Label1.Name = "Label1";
        this.Label1.Size = new System.Drawing.Size(131, 12);
        this.Label1.TabIndex = 0;
        this.Label1.Text = "Turning Process File:";
        this.Label2.AutoSize = true;
        this.Label2.Location = new System.Drawing.Point(11, 124);
        this.Label2.Name = "Label2";
        this.Label2.Size = new System.Drawing.Size(185, 12);
        this.Label2.TabIndex = 1;
        this.Label2.Text = "Roughing Milling Process File:";
        this.GroupBox8.Controls.Add(this.TextBox22);
        this.GroupBox8.Controls.Add(this.Label26);
        this.GroupBox8.Location = new System.Drawing.Point(2, 394);
        this.GroupBox8.Margin = new System.Windows.Forms.Padding(2);
        this.GroupBox8.Name = "GroupBox8";
        this.GroupBox8.Padding = new System.Windows.Forms.Padding(2);
        this.GroupBox8.Size = new System.Drawing.Size(271, 68);
        this.GroupBox8.TabIndex = 2;
        this.GroupBox8.TabStop = false;
        this.TextBox22.BackColor = System.Drawing.SystemColors.Control;
        this.TextBox22.Location = new System.Drawing.Point(13, 40);
        this.TextBox22.Margin = new System.Windows.Forms.Padding(2);
        this.TextBox22.Name = "TextBox22";
        this.TextBox22.Size = new System.Drawing.Size(249, 21);
        this.TextBox22.TabIndex = 28;
        this.Label26.AutoSize = true;
        this.Label26.Location = new System.Drawing.Point(12, 16);
        this.Label26.Margin = new System.Windows.Forms.Padding(2, 0, 2, 0);
        this.Label26.Name = "Label26";
        this.Label26.Size = new System.Drawing.Size(53, 12);
        this.Label26.TabIndex = 27;
        this.Label26.Text = "MarkText";
        this.GroupBox9.Controls.Add(this.Label19);
        this.GroupBox9.Controls.Add(this.TextBox9);
        this.GroupBox9.Location = new System.Drawing.Point(2, 466);
        this.GroupBox9.Margin = new System.Windows.Forms.Padding(2);
        this.GroupBox9.Name = "GroupBox9";
        this.GroupBox9.Padding = new System.Windows.Forms.Padding(2);
        this.GroupBox9.Size = new System.Drawing.Size(271, 66);
        this.GroupBox9.TabIndex = 3;
        this.GroupBox9.TabStop = false;
        this.Label19.AutoSize = true;
        this.Label19.Location = new System.Drawing.Point(12, 16);
        this.Label19.Name = "Label19";
        this.Label19.Size = new System.Drawing.Size(107, 12);
        this.Label19.TabIndex = 21;
        this.Label19.Text = "4 Axis Composite:";
        this.Label19.Visible = false;
        this.TextBox9.Location = new System.Drawing.Point(14, 40);
        this.TextBox9.Name = "TextBox9";
        this.TextBox9.ReadOnly = true;
        this.TextBox9.Size = new System.Drawing.Size(249, 21);
        this.TextBox9.TabIndex = 22;
        this.TextBox9.Visible = false;
        this.GroupBox10.Controls.Add(this.Label11);
        this.GroupBox10.Controls.Add(this.TextBox14);
        this.GroupBox10.Location = new System.Drawing.Point(2, 536);
        this.GroupBox10.Margin = new System.Windows.Forms.Padding(2);
        this.GroupBox10.Name = "GroupBox10";
        this.GroupBox10.Padding = new System.Windows.Forms.Padding(2);
        this.GroupBox10.Size = new System.Drawing.Size(271, 66);
        this.GroupBox10.TabIndex = 4;
        this.GroupBox10.TabStop = false;
        this.Label11.AutoSize = true;
        this.Label11.Location = new System.Drawing.Point(12, 16);
        this.Label11.Name = "Label11";
        this.Label11.Size = new System.Drawing.Size(89, 12);
        this.Label11.TabIndex = 25;
        this.Label11.Text = "Margin Finish:";
        this.Label11.Visible = false;
        this.TextBox14.Location = new System.Drawing.Point(14, 40);
        this.TextBox14.Name = "TextBox14";
        this.TextBox14.ReadOnly = true;
        this.TextBox14.Size = new System.Drawing.Size(249, 21);
        this.TextBox14.TabIndex = 26;
        this.TextBox14.Visible = false;
        base.AutoScaleDimensions = new System.Drawing.SizeF(6f, 12f);
        base.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
        base.ClientSize = new System.Drawing.Size(308, 652);
        base.Controls.Add(this.TabControl1);
        base.Controls.Add(this.MenuStrip1);
        base.FormBorderStyle = System.Windows.Forms.FormBorderStyle.None;
        base.MainMenuStrip = this.MenuStrip1;
        base.MaximizeBox = false;
        base.MinimizeBox = false;
        base.Name = "DentalPanel";
        this.Text = "DentalPanel";
        this.MenuStrip1.ResumeLayout(false);
        this.MenuStrip1.PerformLayout();
        this.TabControl1.ResumeLayout(false);
        this.TabPage1.ResumeLayout(false);
        this.TableLayoutPanel1.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)this.PictureBox1).EndInit();
        this.GroupBox3.ResumeLayout(false);
        this.GroupBox3.PerformLayout();
        this.GroupBox5.ResumeLayout(false);
        this.GroupBox5.PerformLayout();
        this.GroupBox6.ResumeLayout(false);
        this.GroupBox6.PerformLayout();
        this.GroupBox7.ResumeLayout(false);
        this.GroupBox7.PerformLayout();
        this.TabPage2.ResumeLayout(false);
        this.TableLayoutPanel2.ResumeLayout(false);
        this.GroupBox2.ResumeLayout(false);
        this.GroupBox2.PerformLayout();
        this.GroupBox4.ResumeLayout(false);
        this.GroupBox4.PerformLayout();
        this.TabPage3.ResumeLayout(false);
        this.TableLayoutPanel3.ResumeLayout(false);
        this.GroupBox1.ResumeLayout(false);
        this.GroupBox1.PerformLayout();
        this.GroupBox8.ResumeLayout(false);
        this.GroupBox8.PerformLayout();
        this.GroupBox9.ResumeLayout(false);
        this.GroupBox9.PerformLayout();
        this.GroupBox10.ResumeLayout(false);
        this.GroupBox10.PerformLayout();
        base.ResumeLayout(false);
        base.PerformLayout();
    }

    private void DentalPanel_Load(object sender, EventArgs e)
    {
        MainModule.EspritApp.OutputWindow.Text(Conversions.ToString(DateAndTime.Now) + "\r\n");
        if (GetMachineType())
        {
            Close();
            return;
        }

        LoadData();
        ComboBox4.Items.Add("OFF");
        ComboBox4.Items.Add("ON");
        ComboBox5.Items.Add("OFF");
        ComboBox5.Items.Add("ON");
        ComboBox6.Items.Clear();
        ComboBox6.Items.Add("5 Degree");
        ComboBox6.Items.Add("10 Degree");
        ComboBox6.Items.Add("15 Degree");
        ComboBox6.Items.Add("20 Degree");
        ComboBox7.Items.Clear();
        ComboBox7.Items.Add("FlatEndMillRough");
        ComboBox7.Items.Add("BallEndMillRough2Position");
        ComboBox7.Items.Add("BallEndMillRough3Position");
        ComboBox2.Items.Add("A Type > 45");
        ComboBox2.Items.Add("B Type < 45");
        TextBox11.Text = Conversions.ToString(MainModule.NumData[1]);
        TextBox12.Text = Conversions.ToString(MainModule.NumData[2]);
        TextBox13.Text = Conversions.ToString(MainModule.NumData[3]);
        TextBox15.Text = Conversions.ToString(MainModule.NumData[5]);
        TextBox16.Text = Conversions.ToString(MainModule.NumData[6]);
        TextBox1.Text = MainModule.PrcFileName[1];
        TextBox24.Text = MainModule.PrcFileName[2];
        TextBox2.Text = MainModule.PrcFileName[3];
        TextBox4.Text = MainModule.PrcFileName[5];
        TextBox5.Text = MainModule.PrcFileName[6];
        TextBox6.Text = MainModule.PrcFileName[7];
        TextBox8.Text = MainModule.PrcFileName[9];
        TextBox9.Text = MainModule.PrcFileName[10];
        TextBox14.Text = MainModule.PrcFileName[11];
        TextBox22.Text = MainModule.PrcFileName[12];
        string text = "";
        string text2 = MainModule.PrcFilePath[4];
        double num = Strings.Len(text2);
        checked
        {
            for (double num2 = 1.0; num2 <= num; num2 += 1.0)
            {
                if (Operators.CompareString(Strings.Mid(text2, (int)Math.Round((double)Strings.Len(text2) - num2 + 1.0), 1), "\\", false) == 0)
                {
                    text = Strings.Right(text2, (int)Math.Round(num2 - 1.0));
                    text2 = Strings.Left(text2, (int)Math.Round((double)Strings.Len(text2) - num2 + 1.0));
                    break;
                }
            }

            double num3 = 1.0;
            ComboBox8.Items.Clear();
            string[] files = Directory.GetFiles(text2);
            double num5 = default(double);
            for (int i = 0; i < files.Length; i++)
            {
                string text3 = files[i];
                double num4 = Strings.Len(text3);
                for (double num2 = 1.0; num2 <= num4; num2 += 1.0)
                {
                    if (Operators.CompareString(Strings.Mid(text3, (int)Math.Round((double)Strings.Len(text3) - num2 + 1.0), 1), "\\", false) == 0)
                    {
                        text3 = Strings.Right(text3, (int)Math.Round(num2 - 1.0));
                        break;
                    }
                }

                ComboBox8.Items.Add(text3);
                if (Operators.CompareString(text3, text, false) == 0)
                {
                    num5 = num3;
                }

                num3 += 1.0;
            }

            ComboBox8.SelectedIndex = (int)Math.Round(num5 - 1.0);
            string text4 = "";
            string text5 = MainModule.PrcFilePath[8];
            double num6 = Strings.Len(text5);
            for (double num2 = 1.0; num2 <= num6; num2 += 1.0)
            {
                if (Operators.CompareString(Strings.Mid(text5, (int)Math.Round((double)Strings.Len(text5) - num2 + 1.0), 1), "\\", false) == 0)
                {
                    text4 = Strings.Right(text5, (int)Math.Round(num2 - 1.0));
                    text5 = Strings.Left(text5, (int)Math.Round((double)Strings.Len(text5) - num2 + 1.0));
                    break;
                }
            }

            num3 = 1.0;
            ComboBox9.Items.Clear();
            string[] files2 = Directory.GetFiles(text5);
            for (int j = 0; j < files2.Length; j++)
            {
                string text3 = files2[j];
                double num7 = Strings.Len(text3);
                for (double num2 = 1.0; num2 <= num7; num2 += 1.0)
                {
                    if (Operators.CompareString(Strings.Mid(text3, (int)Math.Round((double)Strings.Len(text3) - num2 + 1.0), 1), "\\", false) == 0)
                    {
                        text3 = Strings.Right(text3, (int)Math.Round(num2 - 1.0));
                        break;
                    }
                }

                ComboBox9.Items.Add(text3);
                if (Operators.CompareString(text3, text4, false) == 0)
                {
                    num5 = num3;
                }

                num3 += 1.0;
            }

            ComboBox9.SelectedIndex = (int)Math.Round(num5 - 1.0);
            MainModule.PrcFilePath[4] = text2;
            MainModule.PrcFilePath[8] = text5;
            TextBox21.Text = Conversions.ToString(0);
            Button1.Text = "MarkX=";
            Mark.AngC = 0.0;
            ComboBox1.SelectedIndex = MainModule.NumCombobox[1];
            ComboBox3.SelectedIndex = MainModule.NumCombobox[3];
            ComboBox4.SelectedIndex = MainModule.NumCombobox[2];
            ComboBox5.SelectedIndex = MainModule.NumCombobox[4];
            ComboBox6.SelectedIndex = MainModule.NumCombobox[5];
            ComboBox7.SelectedIndex = MainModule.NumCombobox[6];
            FromT = false;
            ComboBox2.SelectedIndex = 1;
            TextBox23.Text = Conversions.ToString(0.3);
        }
    }

    public bool GetMachineType()
    {
        //IL_0077: Unknown result type (might be due to invalid IL or missing references)
        bool result;
        try
        {
            int count = MainModule.Document.LatheMachineSetup.Spindles.Count;
            for (int i = 1; i <= count; i = checked(i + 1))
            {
                Spindle spindle = MainModule.Document.LatheMachineSetup.Spindles[i];
                if (spindle.Type == espSpindleType.espSpindleMain)
                {
                    switch (spindle.Orientation)
                    {
                        case espSpindleOrientation.espSpindleOrientationRightPositive:
                            MainModule.SpindleSide = false;
                            break;
                        case espSpindleOrientation.espSpindleOrientationLeftPositive:
                            MainModule.SpindleSide = true;
                            break;
                    }
                }
            }

            result = false;
        }
        catch (Exception ex)
        {
            ProjectData.SetProjectError(ex);
            Exception ex2 = ex;
            Trace.WriteLine("Machine Type Error! (MessageBox suppressed)");
            result = true;
            ProjectData.ClearProjectError();
        }

        return result;
    }

    private void ChangeHoleList()
    {
        string path = MainModule.PrcFilePath[4];
        ComboBox8.Items.Clear();
        string[] files = Directory.GetFiles(path);
        checked
        {
            for (int i = 0; i < files.Length; i++)
            {
                string text = files[i];
                double num = Strings.Len(text);
                for (double num2 = 1.0; num2 <= num; num2 += 1.0)
                {
                    if (Operators.CompareString(Strings.Mid(text, (int)Math.Round((double)Strings.Len(text) - num2 + 1.0), 1), "\\", false) == 0)
                    {
                        text = Strings.Right(text, (int)Math.Round(num2 - 1.0));
                        break;
                    }
                }

                ComboBox8.Items.Add(text);
            }

            ComboBox8.SelectedIndex = 0;
        }
    }

    private void ChangeBackTurningList()
    {
        string path = MainModule.PrcFilePath[8];
        ComboBox9.Items.Clear();
        string[] files = Directory.GetFiles(path);
        checked
        {
            for (int i = 0; i < files.Length; i++)
            {
                string text = files[i];
                double num = Strings.Len(text);
                for (double num2 = 1.0; num2 <= num; num2 += 1.0)
                {
                    if (Operators.CompareString(Strings.Mid(text, (int)Math.Round((double)Strings.Len(text) - num2 + 1.0), 1), "\\", false) == 0)
                    {
                        text = Strings.Right(text, (int)Math.Round(num2 - 1.0));
                        break;
                    }
                }

                ComboBox9.Items.Add(text);
            }

            ComboBox9.SelectedIndex = 0;
        }
    }

    private void LoadOtherPartToolStripMenuItem_Click(object sender, EventArgs e)
    {
        OpenFileDialog openFileDialog = new OpenFileDialog();
        openFileDialog.Title = "";
        openFileDialog.Filter = "Xml Files(*.xml)|*.xml|All Files(*.*)|*.*";
        openFileDialog.FilterIndex = 1;
        openFileDialog.RestoreDirectory = true;
        openFileDialog.InitialDirectory = "C:\\Program Files (x86)\\D.P.Technology\\ESPRIT\\AddIns\\DentalAddin\\Viles\\DefaultPath\\";
        _ = null;
        if (openFileDialog.ShowDialog() == DialogResult.OK)
        {
            Connect.UD = (UserData)SerializableData.Load(openFileDialog.FileName, typeof(UserData));
            MainModule.PrcFileName = Connect.UD.PrcFileName;
            MainModule.PrcFilePath = Connect.UD.PrcFilePath;
            MainModule.NumData = Connect.UD.NumData;
            MainModule.NumCombobox = Connect.UD.NumCombobox;
            MainModule.PrcDirectory = Connect.UD.PrcDirectory;
            TextBox11.Text = Conversions.ToString(MainModule.NumData[1]);
            TextBox12.Text = Conversions.ToString(MainModule.NumData[2]);
            TextBox13.Text = Conversions.ToString(MainModule.NumData[3]);
            TextBox15.Text = Conversions.ToString(MainModule.NumData[5]);
            TextBox16.Text = Conversions.ToString(MainModule.NumData[6]);
            TextBox1.Text = MainModule.PrcFileName[1];
            TextBox2.Text = MainModule.PrcFileName[2];
            TextBox4.Text = MainModule.PrcFileName[4];
            TextBox5.Text = MainModule.PrcFileName[5];
            TextBox6.Text = MainModule.PrcFileName[6];
            TextBox14.Text = MainModule.PrcFileName[10];
            TextBox22.Text = MainModule.PrcFileName[11];
        }
    }

    private void SaveToNewPartToolStripMenuItem_Click(object sender, EventArgs e)
    {
        SaveFileDialog saveFileDialog = new SaveFileDialog();
        saveFileDialog.Title = "";
        saveFileDialog.Filter = "Xml Files(*.xml)|*.xml|All Files(*.*)|*.*";
        saveFileDialog.FilterIndex = 1;
        saveFileDialog.RestoreDirectory = true;
        saveFileDialog.InitialDirectory = "C:\\Program Files (x86)\\D.P.Technology\\ESPRIT\\AddIns\\DentalAddin\\Viles\\DefaultPath\\";
        _ = null;
        if (saveFileDialog.ShowDialog() == DialogResult.OK)
        {
            SaveData(saveFileDialog.FileName);
        }
    }

    private void LoadData()
    {
        int try0000_dispatch = -1;
        int num3 = default(int);
        int num = default(int);
        int num2 = default(int);
        while (true)
        {
            try
            {
                /*Note: ILSpy has introduced the following switch to emulate a goto from catch-block to try-block*/
                ;
                switch (try0000_dispatch)
                {
                    default:
                        ProjectData.ClearProjectError();
                        num3 = 1;
                        goto IL_0007;
                    case 301:
                        {
                            num = num2;
                            switch (num3)
                            {
                                case 1:
                                    break;
                                default:
                                    goto end_IL_0000;
                            }

                            int num4 = num + 1;
                            num = 0;
                            switch (num4)
                            {
                                case 1:
                                    break;
                                case 2:
                                    goto IL_0007;
                                case 3:
                                    goto IL_0027;
                                case 4:
                                    goto IL_0038;
                                case 5:
                                    goto IL_0049;
                                case 6:
                                    goto IL_005a;
                                case 7:
                                    goto IL_006b;
                                case 8:
                                    goto IL_007c;
                                case 9:
                                    goto IL_008d;
                                case 10:
                                    goto IL_0097;
                                case 11:
                                    goto IL_00b1;
                                case 13:
                                    goto end_IL_0000_2;
                                default:
                                    goto end_IL_0000;
                                case 12:
                                case 14:
                                    goto end_IL_0000_3;
                            }

                            goto default;
                        }

                    IL_00b1:
                        num2 = 11;
                        TabControl1.TabPages[1].Parent = null;
                        goto end_IL_0000_3;
                    IL_0007:
                        num2 = 2;
                        Connect.UD = (UserData)SerializableData.Load(MainModule.DefaultXmlFileName, typeof(UserData));
                        goto IL_0027;
                    IL_0027:
                        num2 = 3;
                        MainModule.PrcFileName = Connect.UD.PrcFileName;
                        goto IL_0038;
                    IL_0038:
                        num2 = 4;
                        MainModule.PrcFilePath = Connect.UD.PrcFilePath;
                        goto IL_0049;
                    IL_0049:
                        num2 = 5;
                        MainModule.NumData = Connect.UD.NumData;
                        goto IL_005a;
                    IL_005a:
                        num2 = 6;
                        MainModule.NumCombobox = Connect.UD.NumCombobox;
                        goto IL_006b;
                    IL_006b:
                        num2 = 7;
                        MainModule.PrcDirectory = Connect.UD.PrcDirectory;
                        goto IL_007c;
                    IL_007c:
                        num2 = 8;
                        Connect.LockMode = Connect.UD.LockSetting;
                        goto IL_008d;
                    IL_008d:
                        num2 = 9;
                        if (!Connect.LockMode)
                        {
                            break;
                        }

                        goto IL_0097;
                    IL_0097:
                        num2 = 10;
                        TabControl1.TabPages[2].Parent = null;
                        goto IL_00b1;
                    end_IL_0000_2:
                        break;
                }

                num2 = 13;
                ShowSettingToolStripMenuItem.Text = "Lock Setting...";
                break;
            end_IL_0000:;
            }
            catch (Exception ex) when (num3 != 0 && num == 0)
            {
                ProjectData.SetProjectError(ex);
                try0000_dispatch = 301;
                continue;
            }

            throw ProjectData.CreateProjectError(-2146828237);
            continue;
        end_IL_0000_3:
            break;
        }

        if (num != 0)
        {
            ProjectData.ClearProjectError();
        }
    }

    private void SaveData(string dir)
    {
        Connect.UD.PrcFileName = MainModule.PrcFileName;
        Connect.UD.PrcFilePath = MainModule.PrcFilePath;
        Connect.UD.NumData = MainModule.NumData;
        Connect.UD.NumCombobox = MainModule.NumCombobox;
        Connect.UD.PrcDirectory = MainModule.PrcDirectory;
        Connect.UD.LockSetting = Connect.LockMode;
        Connect.UD.Save(dir);
    }

    private void CancelToolStripMenuItem_Click(object sender, EventArgs e)
    {
        Close();
    }

    private void OKStripMenuItem_Click(object sender, EventArgs e)
    {
        OK();
        MainModule.Document.Windows.ActiveWindow.Fit();
    }

    public void OK()
    {
        //IL_01b4: Unknown result type (might be due to invalid IL or missing references)
        //IL_022f: Unknown result type (might be due to invalid IL or missing references)
        MainModule.Chamfer = Conversions.ToDouble(TextBox11.Text);
        MainModule.DownZ = Conversions.ToDouble(TextBox12.Text);
        MainModule.TurningExtend = Conversions.ToDouble(TextBox15.Text);
        MainModule.TurningDepth = Conversions.ToDouble(TextBox13.Text);
        MainModule.MillingDepth = Conversions.ToDouble(TextBox16.Text);
        MainModule.machinetype = checked(ComboBox1.SelectedIndex + 1);
        MoveSTL_Module.ExtendMill = Conversions.ToDouble(TextBox23.Text);
        if (Operators.CompareString(ComboBox8.Text, "", false) != 0)
        {
            MainModule.PrcFileName[4] = ComboBox8.Text;
            MainModule.PrcFilePath[4] = MainModule.PrcFilePath[4] + "\\" + MainModule.PrcFileName[4];
        }

        if (Operators.CompareString(ComboBox9.Text, "", false) != 0)
        {
            MainModule.PrcFileName[8] = ComboBox9.Text;
            MainModule.PrcFilePath[8] = MainModule.PrcFilePath[8] + "\\" + MainModule.PrcFileName[8];
        }

        if (MoveSTL_Module.MTI > 0.0)
        {
            MoveSTL_Module.MTI += Conversions.ToDouble(TextBox23.Text);
        }
        else
        {
            MoveSTL_Module.MTI -= Conversions.ToDouble(TextBox23.Text);
        }

        SaveData(MainModule.DefaultXmlFileName);
        MainModule.EspritApp.Processing = true;
        if ((TextBox18.BackColor == Color.Red) | (TextBox19.BackColor == Color.Red))
        {
            Trace.WriteLine("Please Select the limit Points! (MessageBox suppressed)");
            MainModule.EspritApp.Processing = false;
            MainModule.Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
        }
        else if (ComboBox3.Enabled && MainModule.NumCombobox[3] == 1 && ((TextBox17.BackColor == Color.Red) | (TextBox20.BackColor == Color.Red)))
        {
            Trace.WriteLine("Please Select the chamfer limit Points! (MessageBox suppressed)");
            MainModule.EspritApp.Processing = false;
            MainModule.Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
        }
        else
        {
            MainModule.Document.LatheMachineSetup.CustomSetting20 = Conversion.Val(TextBox10.Text);
            Close();
            MainModule.Main();
        }
    }

    private void TextBox1_DoubleClick(object sender, EventArgs e)
    {
        TextBox1.Text = GetProcessFile("Turning Process File", 1);
    }

    private void TextBox24_Click(object sender, EventArgs e)
    {
        TextBox24.Text = GetProcessFile("Reverse Turning Process File", 2);
    }

    private void TextBox2_DoubleClick(object sender, EventArgs e)
    {
        TextBox2.Text = GetProcessFile("Roughing Milling Process File", 3);
    }

    private void TextBox3_DoubleClick(object sender, EventArgs e)
    {
        Temp = GetProcessFolder("Please Set Face Hole Process Folder", 4);
    }

    private void TextBox4_DoubleClick(object sender, EventArgs e)
    {
        TextBox4.Text = GetProcessFile("Face Machining Process File", 5);
    }

    private void TextBox5_DoubleClick(object sender, EventArgs e)
    {
        TextBox5.Text = GetProcessFile("0-180 Position Process File", 6);
    }

    private void TextBox6_DoubleClick(object sender, EventArgs e)
    {
        TextBox6.Text = GetProcessFile("90-270 Postion Process File", 7);
    }

    private void TextBox7_DoubleClick(object sender, EventArgs e)
    {
        Temp = GetProcessFolder("Please Set Back Machining Process Folder", 8);
    }

    private void TextBox8_DoubleClick(object sender, EventArgs e)
    {
        TextBox8.Text = GetProcessFile("Semi-Roughing Milling Process File", 9);
    }

    private void TextBox9_DoubleClick(object sender, EventArgs e)
    {
        TextBox9.Text = GetProcessFile("Composite Process File", 10);
    }

    private void TextBox14_DoubleClick(object sender, EventArgs e)
    {
        TextBox14.Text = GetProcessFile("Margin Process File", 11);
    }

    private void TextBox22_DoubleClick(object sender, EventArgs e)
    {
        TextBox22.Text = GetProcessFile("MarkText Process File", 12);
    }

    private string GetProcessFile(string Title, int index)
    {
        OpenFileDialog openFileDialog = new OpenFileDialog();
        openFileDialog.Title = Title;
        openFileDialog.Filter = "Process Files(*.prc)|*.prc|All Files(*.*)|*.*";
        openFileDialog.FilterIndex = 1;
        openFileDialog.RestoreDirectory = true;
        openFileDialog.InitialDirectory = MainModule.PrcDirectory;
        _ = null;
        if (openFileDialog.ShowDialog() == DialogResult.OK)
        {
            MainModule.PrcFilePath[index] = openFileDialog.FileName;
            MainModule.PrcFileName[index] = openFileDialog.SafeFileName;
            return openFileDialog.SafeFileName;
        }

        return MainModule.FSName[index];
    }

    private string GetProcessFolder(string Title, int Index)
    {
        FolderBrowserDialog folderBrowserDialog = new FolderBrowserDialog();
        folderBrowserDialog.Description = Title;
        folderBrowserDialog.RootFolder = Environment.SpecialFolder.ProgramFilesX86;
        folderBrowserDialog.SelectedPath = MainModule.PrcDirectory;
        _ = null;
        if (folderBrowserDialog.ShowDialog() == DialogResult.OK)
        {
            MainModule.PrcFilePath[Index] = folderBrowserDialog.SelectedPath;
            if (Index == 4)
            {
                ChangeHoleList();
            }
            else
            {
                ChangeBackTurningList();
            }
        }

        string result = default(string);
        return result;
    }

    private void TextBox11_TextChanged(object sender, EventArgs e)
    {
        try
        {
            TempData = Conversions.ToDouble(TextBox11.Text);
            MainModule.NumData[1] = Conversions.ToDouble(TextBox11.Text);
        }
        catch (Exception ex)
        {
            ProjectData.SetProjectError(ex);
            Exception ex2 = ex;
            TextBox11.Text = Conversions.ToString(MainModule.NumData[1]);
            ProjectData.ClearProjectError();
        }
    }

    private void TextBox12_TextChanged(object sender, EventArgs e)
    {
        try
        {
            TempData = Conversions.ToDouble(TextBox12.Text);
            MainModule.NumData[2] = Conversions.ToDouble(TextBox12.Text);
        }
        catch (Exception ex)
        {
            ProjectData.SetProjectError(ex);
            Exception ex2 = ex;
            TextBox12.Text = Conversions.ToString(MainModule.NumData[2]);
            ProjectData.ClearProjectError();
        }
    }

    private void TextBox13_TextChanged(object sender, EventArgs e)
    {
        try
        {
            TempData = Conversions.ToDouble(TextBox13.Text);
            MainModule.NumData[3] = Conversions.ToDouble(TextBox13.Text);
        }
        catch (Exception ex)
        {
            ProjectData.SetProjectError(ex);
            Exception ex2 = ex;
            TextBox13.Text = Conversions.ToString(MainModule.NumData[3]);
            ProjectData.ClearProjectError();
        }
    }

    private void TextBox15_TextChanged(object sender, EventArgs e)
    {
        try
        {
            TempData = Conversions.ToDouble(TextBox15.Text);
            MainModule.NumData[5] = Conversions.ToDouble(TextBox15.Text);
        }
        catch (Exception ex)
        {
            ProjectData.SetProjectError(ex);
            Exception ex2 = ex;
            TextBox15.Text = Conversions.ToString(MainModule.NumData[5]);
            ProjectData.ClearProjectError();
        }
    }

    private void TextBox16_TextChanged(object sender, EventArgs e)
    {
        try
        {
            TempData = Conversions.ToDouble(TextBox16.Text);
            MainModule.NumData[6] = Conversions.ToDouble(TextBox16.Text);
        }
        catch (Exception ex)
        {
            ProjectData.SetProjectError(ex);
            Exception ex2 = ex;
            TextBox16.Text = Conversions.ToString(MainModule.NumData[6]);
            ProjectData.ClearProjectError();
        }
    }

    private void ComboBox1_SelectedIndexChanged(object sender, EventArgs e)
    {
        MainModule.NumCombobox[1] = ComboBox1.SelectedIndex;
        if (ComboBox1.SelectedIndex == 0)
        {
            GroupBox9.Visible = false;
            Label19.Visible = false;
            TextBox9.Visible = false;
        }
        else
        {
            GroupBox9.Visible = true;
            Label19.Visible = true;
            TextBox9.Visible = true;
        }
    }

    private void ComboBox2_SelectedIndexChanged(object sender, EventArgs e)
    {
        if (ComboBox2.SelectedIndex == 0)
        {
            TextBox23.Text = Conversions.ToString(1.2);
        }
        else if (ComboBox2.SelectedIndex == 1)
        {
            TextBox23.Text = Conversions.ToString(0.2);
        }
    }

    private void ComboBox3_SelectedIndexChanged(object sender, EventArgs e)
    {
        MainModule.NumCombobox[3] = ComboBox3.SelectedIndex;
        if (ComboBox3.SelectedIndex == 1)
        {
            GroupBox6.Visible = true;
            GroupBox10.Visible = true;
            Label11.Visible = true;
            TextBox14.Visible = true;
        }
        else
        {
            GroupBox6.Visible = false;
            GroupBox10.Visible = false;
            Label11.Visible = false;
            TextBox14.Visible = false;
        }
    }

    private void ComboBox4_SelectedIndexChanged(object sender, EventArgs e)
    {
        MainModule.NumCombobox[2] = ComboBox4.SelectedIndex;
        if (ComboBox4.SelectedIndex == 0)
        {
            GroupBox7.Visible = false;
            GroupBox8.Visible = false;
            Mark.MarkSign = false;
        }
        else if (ComboBox4.SelectedIndex == 1)
        {
            GroupBox7.Visible = true;
            GroupBox8.Visible = true;
            Mark.MarkSign = true;
        }
    }

    private void ComboBox5_SelectedIndexChanged(object sender, EventArgs e)
    {
        MainModule.NumCombobox[4] = ComboBox5.SelectedIndex;
        if (ComboBox5.SelectedIndex == 0)
        {
            TextBox24.Enabled = false;
            MainModule.ReverseOn = false;
        }
        else if (ComboBox5.SelectedIndex == 1)
        {
            TextBox24.Enabled = true;
            MainModule.ReverseOn = true;
        }
    }

    private void ComboBox7_SelectedIndexChanged(object sender, EventArgs e)
    {
        MainModule.NumCombobox[6] = ComboBox7.SelectedIndex;
        if (ComboBox7.SelectedIndex == 0)
        {
            MainModule.RoughType = 1.0;
            TextBox8.Enabled = true;
            ComboBox6.Enabled = true;
        }
        else if (ComboBox7.SelectedIndex == 1)
        {
            MainModule.RoughType = 2.0;
            TextBox8.Enabled = false;
            ComboBox6.Enabled = false;
        }
        else
        {
            MainModule.RoughType = 3.0;
            TextBox8.Enabled = false;
            ComboBox6.Enabled = false;
        }
    }

    private void ComboBox6_SelectedIndexChanged(object sender, EventArgs e)
    {
        MainModule.NumCombobox[5] = ComboBox6.SelectedIndex;
        if (ComboBox6.SelectedIndex == 0)
        {
            MainModule.SemiAngle = 5.0;
            MainModule.AngleNumber = 36.0;
        }
        else if (ComboBox6.SelectedIndex == 1)
        {
            MainModule.SemiAngle = 10.0;
            MainModule.AngleNumber = 18.0;
        }
        else if (ComboBox6.SelectedIndex == 2)
        {
            MainModule.SemiAngle = 15.0;
            MainModule.AngleNumber = 12.0;
        }
        else
        {
            MainModule.SemiAngle = 20.0;
            MainModule.AngleNumber = 9.0;
        }
    }

    private void TextBox17_Click(object sender, EventArgs e)
    {
        try
        {
            TextBox17.Text = Conversions.ToString(COMFrontPoint());
            if (Operators.CompareString(TextBox17.Text, "", false) != 0)
            {
                TextBox17.BackColor = Color.Gray;
            }
        }
        catch (Exception ex)
        {
            ProjectData.SetProjectError(ex);
            Exception ex2 = ex;
            ProjectData.ClearProjectError();
        }
    }

    private void TextBox18_Click(object sender, EventArgs e)
    {
        try
        {
            TextBox18.Text = Conversions.ToString(FrontPoint());
            if (Operators.CompareString(TextBox18.Text, "", false) != 0)
            {
                TextBox18.BackColor = Color.Gray;
            }
        }
        catch (Exception ex)
        {
            ProjectData.SetProjectError(ex);
            Exception ex2 = ex;
            ProjectData.ClearProjectError();
        }
    }

    private void TextBox19_Click(object sender, EventArgs e)
    {
        try
        {
            TextBox19.Text = Conversions.ToString(BackPoint());
            if (Operators.CompareString(TextBox19.Text, "", false) != 0)
            {
                TextBox19.BackColor = Color.Gray;
            }
        }
        catch (Exception ex)
        {
            ProjectData.SetProjectError(ex);
            Exception ex2 = ex;
            ProjectData.ClearProjectError();
        }

        MoveSTL_Module.FindExactX();
        TextBox10.Text = Conversions.ToString(MoveSTL_Module.MTI);
        TextBox18.Text = Conversions.ToString(Math.Round(MoveSTL_Module.FrontPointX, 2));
        MoveSTL_Module.FirstPX = Math.Round(MoveSTL_Module.FrontPointX, 2);
        if (MoveSTL_Module.MTI > 0.0)
        {
            TextBox19.Text = Conversions.ToString(MoveSTL_Module.MTI + Conversions.ToDouble(TextBox23.Text));
        }
        else
        {
            TextBox19.Text = Conversions.ToString(MoveSTL_Module.MTI - Conversions.ToDouble(TextBox23.Text));
        }

        FromT = true;
    }

    private void TextBox20_Click(object sender, EventArgs e)
    {
        try
        {
            TextBox20.Text = Conversions.ToString(COMBackPoint());
            if (Operators.CompareString(TextBox20.Text, "", false) != 0)
            {
                TextBox20.BackColor = Color.Gray;
            }
        }
        catch (Exception ex)
        {
            ProjectData.SetProjectError(ex);
            Exception ex2 = ex;
            ProjectData.ClearProjectError();
        }
    }

    private void TextBox21_Click(object sender, EventArgs e)
    {
        Mark.AngC += 30.0;
        if (Mark.AngC >= 360.0)
        {
            Mark.AngC -= 360.0;
        }

        TextBox21.Text = Conversions.ToString(Mark.AngC);
        Mark.MarkRotatePart(30.0);
    }

    private void Button1_Click(object sender, EventArgs e)
    {
        //IL_0049: Unknown result type (might be due to invalid IL or missing references)
        Mark.MarkX = MarkPoint();
        Button1.Text = "MarkX=" + Conversions.ToString(Mark.MarkX);
        if (Operators.CompareString(RichTextBox1.Text, "", false) == 0)
        {
            Trace.WriteLine("Please input Number for Mark (MessageBox suppressed)");
            return;
        }

        Mark.MarkString = RichTextBox1.Text;
        Mark.MarkRotatePart(Mark.AngC * -1.0);
    }

    public double MarkPoint()
    {
        return ((Esprit.Point)MainModule.Document.GetAnyElement("Select the Mark Point", 1))?.X ?? Conversions.ToDouble("");
    }

    public double FrontPoint()
    {
        Esprit.Point point = MainModule.Document.GetPoint("Select the Front Point", RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
        return (point == null) ? Conversions.ToDouble("") : (MoveSTL_Module.FrontPointX = point.X);
    }

    public double BackPoint()
    {
        Esprit.Point point = MainModule.Document.GetPoint("Select the Back Point", RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
        return (point == null) ? Conversions.ToDouble("") : (MoveSTL_Module.BackPointX = point.X);
    }

    public double COMFrontPoint()
    {
        Esprit.Point point = MainModule.Document.GetPoint("Select the Front Point", RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
        return (point == null) ? Conversions.ToDouble("") : (MainModule.COMX1 = point.X);
    }

    public double COMBackPoint()
    {
        Esprit.Point point = MainModule.Document.GetPoint("Select the Back Point", RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
        return (point == null) ? Conversions.ToDouble("") : (MainModule.COMX2 = point.X);
    }

    private void DentalPanel_Shown(object sender, EventArgs e)
    {
        MoveSTL_Module.RotateSTL();
        MoveSTL_Module.MoveSTL();
        TextBox10.Text = Conversions.ToString(Math.Round(MoveSTL_Module.FrontStock, 2));
    }

    private void ShowSettingToolStripMenuItem_Click(object sender, EventArgs e)
    {
        string text = ShowSettingToolStripMenuItem.Text;
        if (Operators.CompareString(text, "Lock Setting...", false) != 0)
        {
            if (Operators.CompareString(text, "Show Setting...", false) == 0 && new Dialog2().ShowDialog() == DialogResult.OK)
            {
                TabPage2.Parent = TabControl1;
                TabPage3.Parent = TabControl1;
                Connect.LockMode = false;
                ShowSettingToolStripMenuItem.Text = "Lock Setting...";
            }

            return;
        }

        try
        {
            TabControl1.TabPages[2].Parent = null;
            TabControl1.TabPages[1].Parent = null;
            Connect.LockMode = true;
        }
        catch (Exception ex)
        {
            ProjectData.SetProjectError(ex);
            Exception ex2 = ex;
            ProjectData.ClearProjectError();
        }

        ShowSettingToolStripMenuItem.Text = "Show Setting...";
    }

    private void Label19_Click(object sender, EventArgs e)
    {
    }

    private void TableLayoutPanel2_Paint(object sender, PaintEventArgs e)
    {
    }

    private void GroupBox1_Enter(object sender, EventArgs e)
    {
    }

    private void GroupBox6_Enter(object sender, EventArgs e)
    {
    }

    private void TextBox23_TextChanged(object sender, EventArgs e)
    {
        if (FromT)
        {
            if (MoveSTL_Module.MTI > 0.0)
            {
                TextBox19.Text = Conversions.ToString(MoveSTL_Module.MTI + Conversions.ToDouble(TextBox23.Text));
            }
            else
            {
                TextBox19.Text = Conversions.ToString(MoveSTL_Module.MTI - Conversions.ToDouble(TextBox23.Text));
            }
        }
    }

    private void PictureBox1_Click(object sender, EventArgs e)
    {
    }

    private void TextBox19_TextChanged(object sender, EventArgs e)
    {
    }

    private void TextBox10_TextChanged(object sender, EventArgs e)
    {
    }

    private void Label28_Click(object sender, EventArgs e)
    {
    }

    private void TextBox18_TextChanged(object sender, EventArgs e)
    {
    }

    private void Label29_Click(object sender, EventArgs e)
    {
    }

    private void TextBox3_TextChanged(object sender, EventArgs e)
    {
    }

    public void InputFPointVal(double d)
    {
        TextBox18.Text = $"{d:0.######}";
        TextBox18.BackColor = Color.Gray;
    }

    public void InputBPointVal(double d)
    {
        TextBox19.Text = $"{d:0.######}";
        TextBox19.BackColor = Color.Gray;
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
