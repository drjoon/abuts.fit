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

namespace DentalAddin
{

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
			EventHandler eventHandler = OKStripMenuItem_Click;
			ToolStripMenuItem val = _OKStripMenuItem;
			if (val != null)
			{
				((ToolStripItem)val).Click -= eventHandler;
			}
			_OKStripMenuItem = value;
			val = _OKStripMenuItem;
			if (val != null)
			{
				((ToolStripItem)val).Click += eventHandler;
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
			EventHandler eventHandler = CancelToolStripMenuItem_Click;
			ToolStripMenuItem val = _CancelToolStripMenuItem;
			if (val != null)
			{
				((ToolStripItem)val).Click -= eventHandler;
			}
			_CancelToolStripMenuItem = value;
			val = _CancelToolStripMenuItem;
			if (val != null)
			{
				((ToolStripItem)val).Click += eventHandler;
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
			EventHandler eventHandler = LoadOtherPartToolStripMenuItem_Click;
			ToolStripMenuItem val = _LoadOtherPartToolStripMenuItem;
			if (val != null)
			{
				((ToolStripItem)val).Click -= eventHandler;
			}
			_LoadOtherPartToolStripMenuItem = value;
			val = _LoadOtherPartToolStripMenuItem;
			if (val != null)
			{
				((ToolStripItem)val).Click += eventHandler;
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
			EventHandler eventHandler = SaveToNewPartToolStripMenuItem_Click;
			ToolStripMenuItem val = _SaveToNewPartToolStripMenuItem;
			if (val != null)
			{
				((ToolStripItem)val).Click -= eventHandler;
			}
			_SaveToNewPartToolStripMenuItem = value;
			val = _SaveToNewPartToolStripMenuItem;
			if (val != null)
			{
				((ToolStripItem)val).Click += eventHandler;
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
			EventHandler eventHandler = ShowSettingToolStripMenuItem_Click;
			ToolStripMenuItem val = _ShowSettingToolStripMenuItem;
			if (val != null)
			{
				((ToolStripItem)val).Click -= eventHandler;
			}
			_ShowSettingToolStripMenuItem = value;
			val = _ShowSettingToolStripMenuItem;
			if (val != null)
			{
				((ToolStripItem)val).Click += eventHandler;
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
			//IL_0007: Unknown result type (might be due to invalid IL or missing references)
			//IL_000d: Expected O, but got Unknown
			PaintEventHandler val = new PaintEventHandler(TableLayoutPanel2_Paint);
			TableLayoutPanel val2 = _TableLayoutPanel2;
			if (val2 != null)
			{
				((Control)val2).Paint -= val;
			}
			_TableLayoutPanel2 = value;
			val2 = _TableLayoutPanel2;
			if (val2 != null)
			{
				((Control)val2).Paint += val;
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
			EventHandler eventHandler = TextBox15_TextChanged;
			TextBox val = _TextBox15;
			if (val != null)
			{
				((Control)val).TextChanged -= eventHandler;
			}
			_TextBox15 = value;
			val = _TextBox15;
			if (val != null)
			{
				((Control)val).TextChanged += eventHandler;
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
			EventHandler eventHandler = TextBox13_TextChanged;
			TextBox val = _TextBox13;
			if (val != null)
			{
				((Control)val).TextChanged -= eventHandler;
			}
			_TextBox13 = value;
			val = _TextBox13;
			if (val != null)
			{
				((Control)val).TextChanged += eventHandler;
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
			EventHandler eventHandler = TextBox11_TextChanged;
			TextBox val = _TextBox11;
			if (val != null)
			{
				((Control)val).TextChanged -= eventHandler;
			}
			_TextBox11 = value;
			val = _TextBox11;
			if (val != null)
			{
				((Control)val).TextChanged += eventHandler;
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
			EventHandler eventHandler = TextBox12_TextChanged;
			TextBox val = _TextBox12;
			if (val != null)
			{
				((Control)val).TextChanged -= eventHandler;
			}
			_TextBox12 = value;
			val = _TextBox12;
			if (val != null)
			{
				((Control)val).TextChanged += eventHandler;
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
			EventHandler eventHandler = ComboBox1_SelectedIndexChanged;
			ComboBox val = _ComboBox1;
			if (val != null)
			{
				val.SelectedIndexChanged -= eventHandler;
			}
			_ComboBox1 = value;
			val = _ComboBox1;
			if (val != null)
			{
				val.SelectedIndexChanged += eventHandler;
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
			EventHandler eventHandler = TextBox16_TextChanged;
			TextBox val = _TextBox16;
			if (val != null)
			{
				((Control)val).TextChanged -= eventHandler;
			}
			_TextBox16 = value;
			val = _TextBox16;
			if (val != null)
			{
				((Control)val).TextChanged += eventHandler;
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
			EventHandler eventHandler = GroupBox1_Enter;
			GroupBox val = _GroupBox1;
			if (val != null)
			{
				((Control)val).Enter -= eventHandler;
			}
			_GroupBox1 = value;
			val = _GroupBox1;
			if (val != null)
			{
				((Control)val).Enter += eventHandler;
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
			EventHandler eventHandler = TextBox9_DoubleClick;
			TextBox val = _TextBox9;
			if (val != null)
			{
				((Control)val).DoubleClick -= eventHandler;
			}
			_TextBox9 = value;
			val = _TextBox9;
			if (val != null)
			{
				((Control)val).DoubleClick += eventHandler;
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
			EventHandler eventHandler = Label19_Click;
			Label val = _Label19;
			if (val != null)
			{
				((Control)val).Click -= eventHandler;
			}
			_Label19 = value;
			val = _Label19;
			if (val != null)
			{
				((Control)val).Click += eventHandler;
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
			EventHandler eventHandler = TextBox6_DoubleClick;
			TextBox val = _TextBox6;
			if (val != null)
			{
				((Control)val).DoubleClick -= eventHandler;
			}
			_TextBox6 = value;
			val = _TextBox6;
			if (val != null)
			{
				((Control)val).DoubleClick += eventHandler;
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
			EventHandler eventHandler = TextBox5_DoubleClick;
			TextBox val = _TextBox5;
			if (val != null)
			{
				((Control)val).DoubleClick -= eventHandler;
			}
			_TextBox5 = value;
			val = _TextBox5;
			if (val != null)
			{
				((Control)val).DoubleClick += eventHandler;
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
			EventHandler eventHandler = TextBox4_DoubleClick;
			TextBox val = _TextBox4;
			if (val != null)
			{
				((Control)val).DoubleClick -= eventHandler;
			}
			_TextBox4 = value;
			val = _TextBox4;
			if (val != null)
			{
				((Control)val).DoubleClick += eventHandler;
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
			EventHandler eventHandler = TextBox2_DoubleClick;
			TextBox val = _TextBox2;
			if (val != null)
			{
				((Control)val).DoubleClick -= eventHandler;
			}
			_TextBox2 = value;
			val = _TextBox2;
			if (val != null)
			{
				((Control)val).DoubleClick += eventHandler;
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
			EventHandler eventHandler = TextBox1_DoubleClick;
			TextBox val = _TextBox1;
			if (val != null)
			{
				((Control)val).DoubleClick -= eventHandler;
			}
			_TextBox1 = value;
			val = _TextBox1;
			if (val != null)
			{
				((Control)val).DoubleClick += eventHandler;
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
			EventHandler eventHandler = PictureBox1_Click;
			PictureBox val = _PictureBox1;
			if (val != null)
			{
				((Control)val).Click -= eventHandler;
			}
			_PictureBox1 = value;
			val = _PictureBox1;
			if (val != null)
			{
				((Control)val).Click += eventHandler;
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
			EventHandler eventHandler = TextBox19_Click;
			EventHandler eventHandler2 = TextBox19_TextChanged;
			TextBox val = _TextBox19;
			if (val != null)
			{
				((TextBoxBase)val).Click -= eventHandler;
				((Control)val).TextChanged -= eventHandler2;
			}
			_TextBox19 = value;
			val = _TextBox19;
			if (val != null)
			{
				((TextBoxBase)val).Click += eventHandler;
				((Control)val).TextChanged += eventHandler2;
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
			EventHandler eventHandler = TextBox18_Click;
			EventHandler eventHandler2 = TextBox18_TextChanged;
			TextBox val = _TextBox18;
			if (val != null)
			{
				((TextBoxBase)val).Click -= eventHandler;
				((Control)val).TextChanged -= eventHandler2;
			}
			_TextBox18 = value;
			val = _TextBox18;
			if (val != null)
			{
				((TextBoxBase)val).Click += eventHandler;
				((Control)val).TextChanged += eventHandler2;
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
			EventHandler eventHandler = TextBox7_DoubleClick;
			TextBox val = _TextBox7;
			if (val != null)
			{
				((Control)val).DoubleClick -= eventHandler;
			}
			_TextBox7 = value;
			val = _TextBox7;
			if (val != null)
			{
				((Control)val).DoubleClick += eventHandler;
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
			EventHandler eventHandler = TextBox3_DoubleClick;
			EventHandler eventHandler2 = TextBox3_TextChanged;
			TextBox val = _TextBox3;
			if (val != null)
			{
				((Control)val).DoubleClick -= eventHandler;
				((Control)val).TextChanged -= eventHandler2;
			}
			_TextBox3 = value;
			val = _TextBox3;
			if (val != null)
			{
				((Control)val).DoubleClick += eventHandler;
				((Control)val).TextChanged += eventHandler2;
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
			EventHandler eventHandler = TextBox10_TextChanged;
			TextBox val = _TextBox10;
			if (val != null)
			{
				((Control)val).TextChanged -= eventHandler;
			}
			_TextBox10 = value;
			val = _TextBox10;
			if (val != null)
			{
				((Control)val).TextChanged += eventHandler;
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
			EventHandler eventHandler = TextBox8_DoubleClick;
			TextBox val = _TextBox8;
			if (val != null)
			{
				((Control)val).DoubleClick -= eventHandler;
			}
			_TextBox8 = value;
			val = _TextBox8;
			if (val != null)
			{
				((Control)val).DoubleClick += eventHandler;
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
			EventHandler eventHandler = ComboBox3_SelectedIndexChanged;
			ComboBox val = _ComboBox3;
			if (val != null)
			{
				val.SelectedIndexChanged -= eventHandler;
			}
			_ComboBox3 = value;
			val = _ComboBox3;
			if (val != null)
			{
				val.SelectedIndexChanged += eventHandler;
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
			EventHandler eventHandler = GroupBox6_Enter;
			GroupBox val = _GroupBox6;
			if (val != null)
			{
				((Control)val).Enter -= eventHandler;
			}
			_GroupBox6 = value;
			val = _GroupBox6;
			if (val != null)
			{
				((Control)val).Enter += eventHandler;
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
			EventHandler eventHandler = TextBox20_Click;
			TextBox val = _TextBox20;
			if (val != null)
			{
				((TextBoxBase)val).Click -= eventHandler;
			}
			_TextBox20 = value;
			val = _TextBox20;
			if (val != null)
			{
				((TextBoxBase)val).Click += eventHandler;
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
			EventHandler eventHandler = TextBox17_Click;
			TextBox val = _TextBox17;
			if (val != null)
			{
				((TextBoxBase)val).Click -= eventHandler;
			}
			_TextBox17 = value;
			val = _TextBox17;
			if (val != null)
			{
				((TextBoxBase)val).Click += eventHandler;
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
			EventHandler eventHandler = TextBox14_DoubleClick;
			TextBox val = _TextBox14;
			if (val != null)
			{
				((Control)val).DoubleClick -= eventHandler;
			}
			_TextBox14 = value;
			val = _TextBox14;
			if (val != null)
			{
				((Control)val).DoubleClick += eventHandler;
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
			EventHandler eventHandler = TextBox21_Click;
			TextBox val = _TextBox21;
			if (val != null)
			{
				((TextBoxBase)val).Click -= eventHandler;
			}
			_TextBox21 = value;
			val = _TextBox21;
			if (val != null)
			{
				((TextBoxBase)val).Click += eventHandler;
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
			EventHandler eventHandler = Button1_Click;
			Button val = _Button1;
			if (val != null)
			{
				((Control)val).Click -= eventHandler;
			}
			_Button1 = value;
			val = _Button1;
			if (val != null)
			{
				((Control)val).Click += eventHandler;
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
			EventHandler eventHandler = TextBox22_DoubleClick;
			TextBox val = _TextBox22;
			if (val != null)
			{
				((Control)val).DoubleClick -= eventHandler;
			}
			_TextBox22 = value;
			val = _TextBox22;
			if (val != null)
			{
				((Control)val).DoubleClick += eventHandler;
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
			EventHandler eventHandler = ComboBox4_SelectedIndexChanged;
			ComboBox val = _ComboBox4;
			if (val != null)
			{
				val.SelectedIndexChanged -= eventHandler;
			}
			_ComboBox4 = value;
			val = _ComboBox4;
			if (val != null)
			{
				val.SelectedIndexChanged += eventHandler;
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
			EventHandler eventHandler = TextBox23_TextChanged;
			TextBox val = _TextBox23;
			if (val != null)
			{
				((Control)val).TextChanged -= eventHandler;
			}
			_TextBox23 = value;
			val = _TextBox23;
			if (val != null)
			{
				((Control)val).TextChanged += eventHandler;
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
			EventHandler eventHandler = ComboBox2_SelectedIndexChanged;
			ComboBox val = _ComboBox2;
			if (val != null)
			{
				val.SelectedIndexChanged -= eventHandler;
			}
			_ComboBox2 = value;
			val = _ComboBox2;
			if (val != null)
			{
				val.SelectedIndexChanged += eventHandler;
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
			EventHandler eventHandler = Label28_Click;
			Label val = _Label28;
			if (val != null)
			{
				((Control)val).Click -= eventHandler;
			}
			_Label28 = value;
			val = _Label28;
			if (val != null)
			{
				((Control)val).Click += eventHandler;
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
			EventHandler eventHandler = TextBox24_Click;
			TextBox val = _TextBox24;
			if (val != null)
			{
				((TextBoxBase)val).Click -= eventHandler;
			}
			_TextBox24 = value;
			val = _TextBox24;
			if (val != null)
			{
				((TextBoxBase)val).Click += eventHandler;
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
			EventHandler eventHandler = Label29_Click;
			Label val = _Label29;
			if (val != null)
			{
				((Control)val).Click -= eventHandler;
			}
			_Label29 = value;
			val = _Label29;
			if (val != null)
			{
				((Control)val).Click += eventHandler;
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
			EventHandler eventHandler = ComboBox5_SelectedIndexChanged;
			ComboBox val = _ComboBox5;
			if (val != null)
			{
				val.SelectedIndexChanged -= eventHandler;
			}
			_ComboBox5 = value;
			val = _ComboBox5;
			if (val != null)
			{
				val.SelectedIndexChanged += eventHandler;
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
			EventHandler eventHandler = ComboBox6_SelectedIndexChanged;
			ComboBox val = _ComboBox6;
			if (val != null)
			{
				val.SelectedIndexChanged -= eventHandler;
			}
			_ComboBox6 = value;
			val = _ComboBox6;
			if (val != null)
			{
				val.SelectedIndexChanged += eventHandler;
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
			EventHandler eventHandler = ComboBox7_SelectedIndexChanged;
			ComboBox val = _ComboBox7;
			if (val != null)
			{
				val.SelectedIndexChanged -= eventHandler;
			}
			_ComboBox7 = value;
			val = _ComboBox7;
			if (val != null)
			{
				val.SelectedIndexChanged += eventHandler;
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
		((Form)this).Load += DentalPanel_Load;
		((Form)this).Shown += DentalPanel_Shown;
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
			((Form)this).Dispose(disposing);
		}
	}

	[DebuggerStepThrough]
	private void InitializeComponent()
	{
		//IL_0011: Unknown result type (might be due to invalid IL or missing references)
		//IL_001b: Expected O, but got Unknown
		//IL_001c: Unknown result type (might be due to invalid IL or missing references)
		//IL_0026: Expected O, but got Unknown
		//IL_0027: Unknown result type (might be due to invalid IL or missing references)
		//IL_0031: Expected O, but got Unknown
		//IL_0032: Unknown result type (might be due to invalid IL or missing references)
		//IL_003c: Expected O, but got Unknown
		//IL_003d: Unknown result type (might be due to invalid IL or missing references)
		//IL_0047: Expected O, but got Unknown
		//IL_0048: Unknown result type (might be due to invalid IL or missing references)
		//IL_0052: Expected O, but got Unknown
		//IL_0053: Unknown result type (might be due to invalid IL or missing references)
		//IL_005d: Expected O, but got Unknown
		//IL_005e: Unknown result type (might be due to invalid IL or missing references)
		//IL_0068: Expected O, but got Unknown
		//IL_0069: Unknown result type (might be due to invalid IL or missing references)
		//IL_0073: Expected O, but got Unknown
		//IL_0074: Unknown result type (might be due to invalid IL or missing references)
		//IL_007e: Expected O, but got Unknown
		//IL_007f: Unknown result type (might be due to invalid IL or missing references)
		//IL_0089: Expected O, but got Unknown
		//IL_008a: Unknown result type (might be due to invalid IL or missing references)
		//IL_0094: Expected O, but got Unknown
		//IL_0095: Unknown result type (might be due to invalid IL or missing references)
		//IL_009f: Expected O, but got Unknown
		//IL_00a0: Unknown result type (might be due to invalid IL or missing references)
		//IL_00aa: Expected O, but got Unknown
		//IL_00ab: Unknown result type (might be due to invalid IL or missing references)
		//IL_00b5: Expected O, but got Unknown
		//IL_00b6: Unknown result type (might be due to invalid IL or missing references)
		//IL_00c0: Expected O, but got Unknown
		//IL_00c1: Unknown result type (might be due to invalid IL or missing references)
		//IL_00cb: Expected O, but got Unknown
		//IL_00cc: Unknown result type (might be due to invalid IL or missing references)
		//IL_00d6: Expected O, but got Unknown
		//IL_00d7: Unknown result type (might be due to invalid IL or missing references)
		//IL_00e1: Expected O, but got Unknown
		//IL_00e2: Unknown result type (might be due to invalid IL or missing references)
		//IL_00ec: Expected O, but got Unknown
		//IL_00ed: Unknown result type (might be due to invalid IL or missing references)
		//IL_00f7: Expected O, but got Unknown
		//IL_00f8: Unknown result type (might be due to invalid IL or missing references)
		//IL_0102: Expected O, but got Unknown
		//IL_0103: Unknown result type (might be due to invalid IL or missing references)
		//IL_010d: Expected O, but got Unknown
		//IL_010e: Unknown result type (might be due to invalid IL or missing references)
		//IL_0118: Expected O, but got Unknown
		//IL_0119: Unknown result type (might be due to invalid IL or missing references)
		//IL_0123: Expected O, but got Unknown
		//IL_0124: Unknown result type (might be due to invalid IL or missing references)
		//IL_012e: Expected O, but got Unknown
		//IL_012f: Unknown result type (might be due to invalid IL or missing references)
		//IL_0139: Expected O, but got Unknown
		//IL_013a: Unknown result type (might be due to invalid IL or missing references)
		//IL_0144: Expected O, but got Unknown
		//IL_0145: Unknown result type (might be due to invalid IL or missing references)
		//IL_014f: Expected O, but got Unknown
		//IL_0150: Unknown result type (might be due to invalid IL or missing references)
		//IL_015a: Expected O, but got Unknown
		//IL_015b: Unknown result type (might be due to invalid IL or missing references)
		//IL_0165: Expected O, but got Unknown
		//IL_0166: Unknown result type (might be due to invalid IL or missing references)
		//IL_0170: Expected O, but got Unknown
		//IL_0171: Unknown result type (might be due to invalid IL or missing references)
		//IL_017b: Expected O, but got Unknown
		//IL_017c: Unknown result type (might be due to invalid IL or missing references)
		//IL_0186: Expected O, but got Unknown
		//IL_0187: Unknown result type (might be due to invalid IL or missing references)
		//IL_0191: Expected O, but got Unknown
		//IL_0192: Unknown result type (might be due to invalid IL or missing references)
		//IL_019c: Expected O, but got Unknown
		//IL_019d: Unknown result type (might be due to invalid IL or missing references)
		//IL_01a7: Expected O, but got Unknown
		//IL_01a8: Unknown result type (might be due to invalid IL or missing references)
		//IL_01b2: Expected O, but got Unknown
		//IL_01b3: Unknown result type (might be due to invalid IL or missing references)
		//IL_01bd: Expected O, but got Unknown
		//IL_01be: Unknown result type (might be due to invalid IL or missing references)
		//IL_01c8: Expected O, but got Unknown
		//IL_01c9: Unknown result type (might be due to invalid IL or missing references)
		//IL_01d3: Expected O, but got Unknown
		//IL_01d4: Unknown result type (might be due to invalid IL or missing references)
		//IL_01de: Expected O, but got Unknown
		//IL_01df: Unknown result type (might be due to invalid IL or missing references)
		//IL_01e9: Expected O, but got Unknown
		//IL_01ea: Unknown result type (might be due to invalid IL or missing references)
		//IL_01f4: Expected O, but got Unknown
		//IL_01f5: Unknown result type (might be due to invalid IL or missing references)
		//IL_01ff: Expected O, but got Unknown
		//IL_0200: Unknown result type (might be due to invalid IL or missing references)
		//IL_020a: Expected O, but got Unknown
		//IL_020b: Unknown result type (might be due to invalid IL or missing references)
		//IL_0215: Expected O, but got Unknown
		//IL_0216: Unknown result type (might be due to invalid IL or missing references)
		//IL_0220: Expected O, but got Unknown
		//IL_0221: Unknown result type (might be due to invalid IL or missing references)
		//IL_022b: Expected O, but got Unknown
		//IL_022c: Unknown result type (might be due to invalid IL or missing references)
		//IL_0236: Expected O, but got Unknown
		//IL_0237: Unknown result type (might be due to invalid IL or missing references)
		//IL_0241: Expected O, but got Unknown
		//IL_0242: Unknown result type (might be due to invalid IL or missing references)
		//IL_024c: Expected O, but got Unknown
		//IL_024d: Unknown result type (might be due to invalid IL or missing references)
		//IL_0257: Expected O, but got Unknown
		//IL_0258: Unknown result type (might be due to invalid IL or missing references)
		//IL_0262: Expected O, but got Unknown
		//IL_0263: Unknown result type (might be due to invalid IL or missing references)
		//IL_026d: Expected O, but got Unknown
		//IL_026e: Unknown result type (might be due to invalid IL or missing references)
		//IL_0278: Expected O, but got Unknown
		//IL_0279: Unknown result type (might be due to invalid IL or missing references)
		//IL_0283: Expected O, but got Unknown
		//IL_0284: Unknown result type (might be due to invalid IL or missing references)
		//IL_028e: Expected O, but got Unknown
		//IL_028f: Unknown result type (might be due to invalid IL or missing references)
		//IL_0299: Expected O, but got Unknown
		//IL_029a: Unknown result type (might be due to invalid IL or missing references)
		//IL_02a4: Expected O, but got Unknown
		//IL_02a5: Unknown result type (might be due to invalid IL or missing references)
		//IL_02af: Expected O, but got Unknown
		//IL_02b0: Unknown result type (might be due to invalid IL or missing references)
		//IL_02ba: Expected O, but got Unknown
		//IL_02bb: Unknown result type (might be due to invalid IL or missing references)
		//IL_02c5: Expected O, but got Unknown
		//IL_02c6: Unknown result type (might be due to invalid IL or missing references)
		//IL_02d0: Expected O, but got Unknown
		//IL_02d1: Unknown result type (might be due to invalid IL or missing references)
		//IL_02db: Expected O, but got Unknown
		//IL_02dc: Unknown result type (might be due to invalid IL or missing references)
		//IL_02e6: Expected O, but got Unknown
		//IL_02e7: Unknown result type (might be due to invalid IL or missing references)
		//IL_02f1: Expected O, but got Unknown
		//IL_02f2: Unknown result type (might be due to invalid IL or missing references)
		//IL_02fc: Expected O, but got Unknown
		//IL_02fd: Unknown result type (might be due to invalid IL or missing references)
		//IL_0307: Expected O, but got Unknown
		//IL_0308: Unknown result type (might be due to invalid IL or missing references)
		//IL_0312: Expected O, but got Unknown
		//IL_0313: Unknown result type (might be due to invalid IL or missing references)
		//IL_031d: Expected O, but got Unknown
		//IL_031e: Unknown result type (might be due to invalid IL or missing references)
		//IL_0328: Expected O, but got Unknown
		//IL_0329: Unknown result type (might be due to invalid IL or missing references)
		//IL_0333: Expected O, but got Unknown
		//IL_0334: Unknown result type (might be due to invalid IL or missing references)
		//IL_033e: Expected O, but got Unknown
		//IL_033f: Unknown result type (might be due to invalid IL or missing references)
		//IL_0349: Expected O, but got Unknown
		//IL_034a: Unknown result type (might be due to invalid IL or missing references)
		//IL_0354: Expected O, but got Unknown
		//IL_0355: Unknown result type (might be due to invalid IL or missing references)
		//IL_035f: Expected O, but got Unknown
		//IL_0360: Unknown result type (might be due to invalid IL or missing references)
		//IL_036a: Expected O, but got Unknown
		//IL_036b: Unknown result type (might be due to invalid IL or missing references)
		//IL_0375: Expected O, but got Unknown
		//IL_0376: Unknown result type (might be due to invalid IL or missing references)
		//IL_0380: Expected O, but got Unknown
		//IL_0381: Unknown result type (might be due to invalid IL or missing references)
		//IL_038b: Expected O, but got Unknown
		//IL_038c: Unknown result type (might be due to invalid IL or missing references)
		//IL_0396: Expected O, but got Unknown
		//IL_0397: Unknown result type (might be due to invalid IL or missing references)
		//IL_03a1: Expected O, but got Unknown
		//IL_03a2: Unknown result type (might be due to invalid IL or missing references)
		//IL_03ac: Expected O, but got Unknown
		//IL_03ad: Unknown result type (might be due to invalid IL or missing references)
		//IL_03b7: Expected O, but got Unknown
		//IL_03b8: Unknown result type (might be due to invalid IL or missing references)
		//IL_03c2: Expected O, but got Unknown
		//IL_03c3: Unknown result type (might be due to invalid IL or missing references)
		//IL_03cd: Expected O, but got Unknown
		//IL_03ce: Unknown result type (might be due to invalid IL or missing references)
		//IL_03d8: Expected O, but got Unknown
		//IL_03d9: Unknown result type (might be due to invalid IL or missing references)
		//IL_03e3: Expected O, but got Unknown
		//IL_03e4: Unknown result type (might be due to invalid IL or missing references)
		//IL_03ee: Expected O, but got Unknown
		//IL_03ef: Unknown result type (might be due to invalid IL or missing references)
		//IL_03f9: Expected O, but got Unknown
		//IL_03fa: Unknown result type (might be due to invalid IL or missing references)
		//IL_0404: Expected O, but got Unknown
		//IL_0802: Unknown result type (might be due to invalid IL or missing references)
		//IL_086b: Unknown result type (might be due to invalid IL or missing references)
		//IL_0875: Expected O, but got Unknown
		//IL_0939: Unknown result type (might be due to invalid IL or missing references)
		//IL_0943: Expected O, but got Unknown
		//IL_0955: Unknown result type (might be due to invalid IL or missing references)
		//IL_095f: Expected O, but got Unknown
		//IL_0971: Unknown result type (might be due to invalid IL or missing references)
		//IL_097b: Expected O, but got Unknown
		//IL_0987: Unknown result type (might be due to invalid IL or missing references)
		//IL_0991: Expected O, but got Unknown
		//IL_099d: Unknown result type (might be due to invalid IL or missing references)
		//IL_09a7: Expected O, but got Unknown
		//IL_09eb: Unknown result type (might be due to invalid IL or missing references)
		//IL_09f5: Expected O, but got Unknown
		//IL_0a0e: Unknown result type (might be due to invalid IL or missing references)
		//IL_0e5a: Unknown result type (might be due to invalid IL or missing references)
		//IL_0f16: Unknown result type (might be due to invalid IL or missing references)
		//IL_0fe4: Unknown result type (might be due to invalid IL or missing references)
		//IL_103d: Unknown result type (might be due to invalid IL or missing references)
		//IL_10bd: Unknown result type (might be due to invalid IL or missing references)
		//IL_132f: Unknown result type (might be due to invalid IL or missing references)
		//IL_1350: Unknown result type (might be due to invalid IL or missing references)
		//IL_1618: Unknown result type (might be due to invalid IL or missing references)
		//IL_1639: Unknown result type (might be due to invalid IL or missing references)
		//IL_16a0: Unknown result type (might be due to invalid IL or missing references)
		//IL_1701: Unknown result type (might be due to invalid IL or missing references)
		//IL_177c: Unknown result type (might be due to invalid IL or missing references)
		//IL_17fb: Unknown result type (might be due to invalid IL or missing references)
		//IL_18dd: Unknown result type (might be due to invalid IL or missing references)
		//IL_18e7: Expected O, but got Unknown
		//IL_1963: Unknown result type (might be due to invalid IL or missing references)
		//IL_196d: Expected O, but got Unknown
		//IL_1979: Unknown result type (might be due to invalid IL or missing references)
		//IL_1983: Expected O, but got Unknown
		//IL_1af7: Unknown result type (might be due to invalid IL or missing references)
		//IL_2060: Unknown result type (might be due to invalid IL or missing references)
		//IL_20c8: Unknown result type (might be due to invalid IL or missing references)
		//IL_2140: Unknown result type (might be due to invalid IL or missing references)
		//IL_21a8: Unknown result type (might be due to invalid IL or missing references)
		//IL_2577: Unknown result type (might be due to invalid IL or missing references)
		//IL_25e0: Unknown result type (might be due to invalid IL or missing references)
		//IL_25ea: Expected O, but got Unknown
		//IL_2664: Unknown result type (might be due to invalid IL or missing references)
		//IL_269b: Unknown result type (might be due to invalid IL or missing references)
		//IL_26a5: Expected O, but got Unknown
		//IL_26b1: Unknown result type (might be due to invalid IL or missing references)
		//IL_26bb: Expected O, but got Unknown
		//IL_26c7: Unknown result type (might be due to invalid IL or missing references)
		//IL_26d1: Expected O, but got Unknown
		//IL_26dd: Unknown result type (might be due to invalid IL or missing references)
		//IL_26e7: Expected O, but got Unknown
		//IL_28dd: Unknown result type (might be due to invalid IL or missing references)
		//IL_2945: Unknown result type (might be due to invalid IL or missing references)
		//IL_2e3c: Unknown result type (might be due to invalid IL or missing references)
		//IL_2e5d: Unknown result type (might be due to invalid IL or missing references)
		//IL_2ec1: Unknown result type (might be due to invalid IL or missing references)
		//IL_2f29: Unknown result type (might be due to invalid IL or missing references)
		//IL_2fbd: Unknown result type (might be due to invalid IL or missing references)
		//IL_2fde: Unknown result type (might be due to invalid IL or missing references)
		//IL_312d: Unknown result type (might be due to invalid IL or missing references)
		//IL_314e: Unknown result type (might be due to invalid IL or missing references)
		ComponentResourceManager componentResourceManager = new ComponentResourceManager(typeof(DentalPanel));
		MenuStrip1 = new MenuStrip();
		OKStripMenuItem = new ToolStripMenuItem();
		CancelToolStripMenuItem = new ToolStripMenuItem();
		ToolStripMenuItem2 = new ToolStripMenuItem();
		LoadOtherPartToolStripMenuItem = new ToolStripMenuItem();
		SaveToNewPartToolStripMenuItem = new ToolStripMenuItem();
		ShowSettingToolStripMenuItem = new ToolStripMenuItem();
		TabControl1 = new TabControl();
		TabPage1 = new TabPage();
		TableLayoutPanel1 = new TableLayoutPanel();
		PictureBox1 = new PictureBox();
		GroupBox3 = new GroupBox();
		TextBox19 = new TextBox();
		TextBox18 = new TextBox();
		Label15 = new Label();
		Label14 = new Label();
		GroupBox5 = new GroupBox();
		ComboBox9 = new ComboBox();
		TextBox23 = new TextBox();
		ComboBox8 = new ComboBox();
		Label27 = new Label();
		ComboBox2 = new ComboBox();
		TextBox10 = new TextBox();
		Label20 = new Label();
		TextBox7 = new TextBox();
		Label7 = new Label();
		Label3 = new Label();
		TextBox3 = new TextBox();
		GroupBox6 = new GroupBox();
		Label24 = new Label();
		TextBox20 = new TextBox();
		TextBox17 = new TextBox();
		Label23 = new Label();
		Label22 = new Label();
		GroupBox7 = new GroupBox();
		Button1 = new Button();
		RichTextBox1 = new RichTextBox();
		TextBox21 = new TextBox();
		Label25 = new Label();
		TabPage2 = new TabPage();
		TableLayoutPanel2 = new TableLayoutPanel();
		GroupBox2 = new GroupBox();
		ComboBox5 = new ComboBox();
		Label29 = new Label();
		TextBox15 = new TextBox();
		TextBox13 = new TextBox();
		Label12 = new Label();
		Label10 = new Label();
		TextBox11 = new TextBox();
		Label8 = new Label();
		GroupBox4 = new GroupBox();
		ComboBox7 = new ComboBox();
		Label31 = new Label();
		ComboBox6 = new ComboBox();
		Label30 = new Label();
		ComboBox4 = new ComboBox();
		Label18 = new Label();
		ComboBox3 = new ComboBox();
		Label21 = new Label();
		TextBox12 = new TextBox();
		ComboBox1 = new ComboBox();
		TextBox16 = new TextBox();
		Label17 = new Label();
		Label9 = new Label();
		Label16 = new Label();
		TabPage3 = new TabPage();
		TableLayoutPanel3 = new TableLayoutPanel();
		GroupBox1 = new GroupBox();
		TextBox24 = new TextBox();
		Label28 = new Label();
		TextBox8 = new TextBox();
		Label13 = new Label();
		TextBox6 = new TextBox();
		TextBox5 = new TextBox();
		TextBox4 = new TextBox();
		TextBox2 = new TextBox();
		TextBox1 = new TextBox();
		Label6 = new Label();
		Label5 = new Label();
		Label4 = new Label();
		Label1 = new Label();
		Label2 = new Label();
		GroupBox8 = new GroupBox();
		TextBox22 = new TextBox();
		Label26 = new Label();
		GroupBox9 = new GroupBox();
		Label19 = new Label();
		TextBox9 = new TextBox();
		GroupBox10 = new GroupBox();
		Label11 = new Label();
		TextBox14 = new TextBox();
		FolderBrowserDialog1 = new FolderBrowserDialog();
		((Control)MenuStrip1).SuspendLayout();
		((Control)TabControl1).SuspendLayout();
		((Control)TabPage1).SuspendLayout();
		((Control)TableLayoutPanel1).SuspendLayout();
		((ISupportInitialize)PictureBox1).BeginInit();
		((Control)GroupBox3).SuspendLayout();
		((Control)GroupBox5).SuspendLayout();
		((Control)GroupBox6).SuspendLayout();
		((Control)GroupBox7).SuspendLayout();
		((Control)TabPage2).SuspendLayout();
		((Control)TableLayoutPanel2).SuspendLayout();
		((Control)GroupBox2).SuspendLayout();
		((Control)GroupBox4).SuspendLayout();
		((Control)TabPage3).SuspendLayout();
		((Control)TableLayoutPanel3).SuspendLayout();
		((Control)GroupBox1).SuspendLayout();
		((Control)GroupBox8).SuspendLayout();
		((Control)GroupBox9).SuspendLayout();
		((Control)GroupBox10).SuspendLayout();
		((Control)this).SuspendLayout();
		((ToolStrip)MenuStrip1).ImageScalingSize = new Size(20, 20);
		((ToolStrip)MenuStrip1).Items.AddRange((ToolStripItem[])(object)new ToolStripItem[3]
		{
			(ToolStripItem)OKStripMenuItem,
			(ToolStripItem)CancelToolStripMenuItem,
			(ToolStripItem)ToolStripMenuItem2
		});
		((Control)MenuStrip1).Location = new System.Drawing.Point(0, 0);
		((Control)MenuStrip1).Name = "MenuStrip1";
		((Control)MenuStrip1).Size = new Size(308, 28);
		((Control)MenuStrip1).TabIndex = 0;
		((Control)MenuStrip1).Text = "MenuStrip1";
		((ToolStripItem)OKStripMenuItem).Image = (Image)(object)Resources.ok0;
		((ToolStripItem)OKStripMenuItem).Name = "OKStripMenuItem";
		((ToolStripItem)OKStripMenuItem).Size = new Size(58, 24);
		((ToolStripItem)OKStripMenuItem).Text = "OK";
		((ToolStripItem)CancelToolStripMenuItem).Image = (Image)(object)Resources.cancel;
		((ToolStripItem)CancelToolStripMenuItem).Name = "CancelToolStripMenuItem";
		((ToolStripItem)CancelToolStripMenuItem).Size = new Size(78, 24);
		((ToolStripItem)CancelToolStripMenuItem).Text = "Cancel";
		((ToolStripDropDownItem)ToolStripMenuItem2).DropDownItems.AddRange((ToolStripItem[])(object)new ToolStripItem[3]
		{
			(ToolStripItem)LoadOtherPartToolStripMenuItem,
			(ToolStripItem)SaveToNewPartToolStripMenuItem,
			(ToolStripItem)ShowSettingToolStripMenuItem
		});
		((ToolStripItem)ToolStripMenuItem2).Name = "ToolStripMenuItem2";
		((ToolStripItem)ToolStripMenuItem2).Size = new Size(28, 24);
		((ToolStripItem)ToolStripMenuItem2).Text = "V";
		((ToolStripItem)LoadOtherPartToolStripMenuItem).Name = "LoadOtherPartToolStripMenuItem";
		((ToolStripItem)LoadOtherPartToolStripMenuItem).Size = new Size(176, 22);
		((ToolStripItem)LoadOtherPartToolStripMenuItem).Text = "Load Other Part";
		((ToolStripItem)SaveToNewPartToolStripMenuItem).Name = "SaveToNewPartToolStripMenuItem";
		((ToolStripItem)SaveToNewPartToolStripMenuItem).Size = new Size(176, 22);
		((ToolStripItem)SaveToNewPartToolStripMenuItem).Text = "Save to New Part";
		((ToolStripItem)ShowSettingToolStripMenuItem).Name = "ShowSettingToolStripMenuItem";
		((ToolStripItem)ShowSettingToolStripMenuItem).Size = new Size(176, 22);
		((ToolStripItem)ShowSettingToolStripMenuItem).Text = "Show Setting...";
		TabControl1.Alignment = (TabAlignment)2;
		((Control)TabControl1).Controls.Add((Control)(object)TabPage1);
		((Control)TabControl1).Controls.Add((Control)(object)TabPage2);
		((Control)TabControl1).Controls.Add((Control)(object)TabPage3);
		((Control)TabControl1).Dock = (DockStyle)5;
		((Control)TabControl1).Location = new System.Drawing.Point(0, 28);
		TabControl1.Multiline = true;
		((Control)TabControl1).Name = "TabControl1";
		TabControl1.SelectedIndex = 0;
		((Control)TabControl1).Size = new Size(308, 624);
		((Control)TabControl1).TabIndex = 1;
		((Control)TabPage1).Controls.Add((Control)(object)TableLayoutPanel1);
		TabPage1.Location = new System.Drawing.Point(22, 4);
		((Control)TabPage1).Name = "TabPage1";
		((Control)TabPage1).Padding = new Padding(3);
		((Control)TabPage1).Size = new Size(282, 616);
		TabPage1.TabIndex = 0;
		TabPage1.Text = "General";
		TabPage1.UseVisualStyleBackColor = true;
		TableLayoutPanel1.ColumnCount = 1;
		TableLayoutPanel1.ColumnStyles.Add(new ColumnStyle((SizeType)2, 100f));
		TableLayoutPanel1.Controls.Add((Control)(object)PictureBox1, 0, 0);
		TableLayoutPanel1.Controls.Add((Control)(object)GroupBox3, 0, 1);
		TableLayoutPanel1.Controls.Add((Control)(object)GroupBox5, 0, 2);
		TableLayoutPanel1.Controls.Add((Control)(object)GroupBox6, 0, 4);
		TableLayoutPanel1.Controls.Add((Control)(object)GroupBox7, 0, 3);
		((Control)TableLayoutPanel1).Dock = (DockStyle)5;
		((Control)TableLayoutPanel1).Location = new System.Drawing.Point(3, 3);
		((Control)TableLayoutPanel1).Name = "TableLayoutPanel1";
		TableLayoutPanel1.RowCount = 5;
		TableLayoutPanel1.RowStyles.Add(new RowStyle((SizeType)1, 84f));
		TableLayoutPanel1.RowStyles.Add(new RowStyle((SizeType)1, 78f));
		TableLayoutPanel1.RowStyles.Add(new RowStyle((SizeType)1, 180f));
		TableLayoutPanel1.RowStyles.Add(new RowStyle());
		TableLayoutPanel1.RowStyles.Add(new RowStyle());
		((Control)TableLayoutPanel1).Size = new Size(276, 610);
		((Control)TableLayoutPanel1).TabIndex = 1;
		((Control)PictureBox1).Dock = (DockStyle)5;
		PictureBox1.Image = (Image)componentResourceManager.GetObject("PictureBox1.Image");
		((Control)PictureBox1).Location = new System.Drawing.Point(0, 0);
		((Control)PictureBox1).Margin = new Padding(0);
		((Control)PictureBox1).Name = "PictureBox1";
		((Control)PictureBox1).Size = new Size(276, 84);
		PictureBox1.SizeMode = (PictureBoxSizeMode)4;
		PictureBox1.TabIndex = 1;
		PictureBox1.TabStop = false;
		((Control)GroupBox3).Controls.Add((Control)(object)TextBox19);
		((Control)GroupBox3).Controls.Add((Control)(object)TextBox18);
		((Control)GroupBox3).Controls.Add((Control)(object)Label15);
		((Control)GroupBox3).Controls.Add((Control)(object)Label14);
		((Control)GroupBox3).Dock = (DockStyle)5;
		((Control)GroupBox3).Location = new System.Drawing.Point(3, 87);
		((Control)GroupBox3).Name = "GroupBox3";
		((Control)GroupBox3).Size = new Size(270, 72);
		((Control)GroupBox3).TabIndex = 0;
		GroupBox3.TabStop = false;
		GroupBox3.Text = "Limit Points";
		((TextBoxBase)TextBox19).BackColor = Color.Red;
		((Control)TextBox19).Location = new System.Drawing.Point(131, 46);
		((Control)TextBox19).Name = "TextBox19";
		((TextBoxBase)TextBox19).ReadOnly = true;
		((Control)TextBox19).Size = new Size(134, 21);
		((Control)TextBox19).TabIndex = 5;
		TextBox19.TextAlign = (HorizontalAlignment)2;
		((TextBoxBase)TextBox18).BackColor = Color.Red;
		((Control)TextBox18).Location = new System.Drawing.Point(131, 17);
		((Control)TextBox18).Name = "TextBox18";
		((TextBoxBase)TextBox18).ReadOnly = true;
		((Control)TextBox18).Size = new Size(134, 21);
		((Control)TextBox18).TabIndex = 4;
		TextBox18.TextAlign = (HorizontalAlignment)2;
		Label15.AutoSize = true;
		((Control)Label15).Location = new System.Drawing.Point(9, 48);
		((Control)Label15).Name = "Label15";
		((Control)Label15).Size = new Size(53, 12);
		((Control)Label15).TabIndex = 2;
		Label15.Text = "Point 2:";
		Label14.AutoSize = true;
		((Control)Label14).Location = new System.Drawing.Point(9, 19);
		((Control)Label14).Name = "Label14";
		((Control)Label14).Size = new Size(53, 12);
		((Control)Label14).TabIndex = 1;
		Label14.Text = "Point 1:";
		((Control)GroupBox5).Controls.Add((Control)(object)ComboBox9);
		((Control)GroupBox5).Controls.Add((Control)(object)TextBox23);
		((Control)GroupBox5).Controls.Add((Control)(object)ComboBox8);
		((Control)GroupBox5).Controls.Add((Control)(object)Label27);
		((Control)GroupBox5).Controls.Add((Control)(object)ComboBox2);
		((Control)GroupBox5).Controls.Add((Control)(object)TextBox10);
		((Control)GroupBox5).Controls.Add((Control)(object)Label20);
		((Control)GroupBox5).Controls.Add((Control)(object)TextBox7);
		((Control)GroupBox5).Controls.Add((Control)(object)Label7);
		((Control)GroupBox5).Controls.Add((Control)(object)Label3);
		((Control)GroupBox5).Controls.Add((Control)(object)TextBox3);
		((Control)GroupBox5).Dock = (DockStyle)5;
		((Control)GroupBox5).Location = new System.Drawing.Point(3, 165);
		((Control)GroupBox5).Name = "GroupBox5";
		((Control)GroupBox5).Size = new Size(270, 174);
		((Control)GroupBox5).TabIndex = 2;
		GroupBox5.TabStop = false;
		GroupBox5.Text = "Technology File";
		((ListControl)ComboBox9).FormattingEnabled = true;
		((Control)ComboBox9).Location = new System.Drawing.Point(10, 84);
		((Control)ComboBox9).Margin = new Padding(2);
		((Control)ComboBox9).Name = "ComboBox9";
		((Control)ComboBox9).Size = new Size(230, 20);
		((Control)ComboBox9).TabIndex = 9;
		TextBox23.Location = new System.Drawing.Point(231, 144);
		((Control)TextBox23).Name = "TextBox23";
		((Control)TextBox23).Size = new Size(34, 21);
		((Control)TextBox23).TabIndex = 27;
		TextBox23.TextAlign = (HorizontalAlignment)2;
		((ListControl)ComboBox8).FormattingEnabled = true;
		((Control)ComboBox8).Location = new System.Drawing.Point(10, 38);
		((Control)ComboBox8).Margin = new Padding(2);
		((Control)ComboBox8).Name = "ComboBox8";
		((Control)ComboBox8).Size = new Size(230, 20);
		((Control)ComboBox8).TabIndex = 8;
		Label27.AutoSize = true;
		((Control)Label27).Location = new System.Drawing.Point(9, 146);
		((Control)Label27).Name = "Label27";
		((Control)Label27).Size = new Size(71, 12);
		((Control)Label27).TabIndex = 26;
		Label27.Text = "Steep Angle";
		((ListControl)ComboBox2).FormattingEnabled = true;
		((Control)ComboBox2).Location = new System.Drawing.Point(131, 144);
		((Control)ComboBox2).Margin = new Padding(2);
		((Control)ComboBox2).Name = "ComboBox2";
		((Control)ComboBox2).Size = new Size(96, 20);
		((Control)ComboBox2).TabIndex = 25;
		((Control)TextBox10).Location = new System.Drawing.Point(131, 112);
		((Control)TextBox10).Margin = new Padding(2);
		((Control)TextBox10).Name = "TextBox10";
		((TextBoxBase)TextBox10).ReadOnly = true;
		((Control)TextBox10).Size = new Size(134, 21);
		((Control)TextBox10).TabIndex = 24;
		TextBox10.TextAlign = (HorizontalAlignment)2;
		Label20.AutoSize = true;
		((Control)Label20).Location = new System.Drawing.Point(9, 114);
		((Control)Label20).Margin = new Padding(2, 0, 2, 0);
		((Control)Label20).Name = "Label20";
		((Control)Label20).Size = new Size(83, 12);
		((Control)Label20).TabIndex = 23;
		Label20.Text = "End Position:";
		((Control)TextBox7).Location = new System.Drawing.Point(244, 82);
		((Control)TextBox7).Name = "TextBox7";
		((TextBoxBase)TextBox7).ReadOnly = true;
		((Control)TextBox7).Size = new Size(21, 21);
		((Control)TextBox7).TabIndex = 22;
		TextBox7.Text = "...";
		Label7.AutoSize = true;
		((Control)Label7).Location = new System.Drawing.Point(9, 64);
		((Control)Label7).Name = "Label7";
		((Control)Label7).Size = new Size(209, 12);
		((Control)Label7).TabIndex = 21;
		Label7.Text = "Connection Machining Process File:";
		Label3.AutoSize = true;
		((Control)Label3).Location = new System.Drawing.Point(9, 18);
		((Control)Label3).Name = "Label3";
		((Control)Label3).Size = new Size(143, 12);
		((Control)Label3).TabIndex = 17;
		Label3.Text = "Face Hole Process File:";
		((Control)TextBox3).Location = new System.Drawing.Point(244, 36);
		((Control)TextBox3).Name = "TextBox3";
		((TextBoxBase)TextBox3).ReadOnly = true;
		((Control)TextBox3).Size = new Size(21, 21);
		((Control)TextBox3).TabIndex = 18;
		TextBox3.Text = "...";
		((Control)GroupBox6).Controls.Add((Control)(object)Label24);
		((Control)GroupBox6).Controls.Add((Control)(object)TextBox20);
		((Control)GroupBox6).Controls.Add((Control)(object)TextBox17);
		((Control)GroupBox6).Controls.Add((Control)(object)Label23);
		((Control)GroupBox6).Controls.Add((Control)(object)Label22);
		((Control)GroupBox6).Dock = (DockStyle)5;
		((Control)GroupBox6).Location = new System.Drawing.Point(2, 448);
		((Control)GroupBox6).Margin = new Padding(2);
		((Control)GroupBox6).Name = "GroupBox6";
		((Control)GroupBox6).Padding = new Padding(2);
		((Control)GroupBox6).Size = new Size(272, 284);
		((Control)GroupBox6).TabIndex = 3;
		GroupBox6.TabStop = false;
		GroupBox6.Text = "Chamfer Composite Limit";
		Label24.AutoSize = true;
		((Control)Label24).Location = new System.Drawing.Point(10, 54);
		((Control)Label24).Name = "Label24";
		((Control)Label24).Size = new Size(53, 12);
		((Control)Label24).TabIndex = 7;
		Label24.Text = "Point 2:";
		((TextBoxBase)TextBox20).BackColor = Color.Red;
		((Control)TextBox20).Location = new System.Drawing.Point(132, 51);
		((Control)TextBox20).Name = "TextBox20";
		((TextBoxBase)TextBox20).ReadOnly = true;
		((Control)TextBox20).Size = new Size(134, 21);
		((Control)TextBox20).TabIndex = 6;
		TextBox20.TextAlign = (HorizontalAlignment)2;
		((TextBoxBase)TextBox17).BackColor = Color.Red;
		((Control)TextBox17).Location = new System.Drawing.Point(132, 22);
		((Control)TextBox17).Name = "TextBox17";
		((TextBoxBase)TextBox17).ReadOnly = true;
		((Control)TextBox17).Size = new Size(134, 21);
		((Control)TextBox17).TabIndex = 5;
		TextBox17.TextAlign = (HorizontalAlignment)2;
		Label23.AutoSize = true;
		((Control)Label23).Location = new System.Drawing.Point(160, 54);
		((Control)Label23).Name = "Label23";
		((Control)Label23).Size = new Size(53, 12);
		((Control)Label23).TabIndex = 3;
		Label23.Text = "Point 2:";
		Label22.AutoSize = true;
		((Control)Label22).Location = new System.Drawing.Point(10, 25);
		((Control)Label22).Name = "Label22";
		((Control)Label22).Size = new Size(53, 12);
		((Control)Label22).TabIndex = 2;
		Label22.Text = "Point 1:";
		((Control)GroupBox7).Controls.Add((Control)(object)Button1);
		((Control)GroupBox7).Controls.Add((Control)(object)RichTextBox1);
		((Control)GroupBox7).Controls.Add((Control)(object)TextBox21);
		((Control)GroupBox7).Controls.Add((Control)(object)Label25);
		((Control)GroupBox7).Location = new System.Drawing.Point(2, 344);
		((Control)GroupBox7).Margin = new Padding(2);
		((Control)GroupBox7).Name = "GroupBox7";
		((Control)GroupBox7).Padding = new Padding(2);
		((Control)GroupBox7).Size = new Size(272, 100);
		((Control)GroupBox7).TabIndex = 4;
		GroupBox7.TabStop = false;
		GroupBox7.Text = "Mark";
		((Control)Button1).Location = new System.Drawing.Point(176, 74);
		((Control)Button1).Margin = new Padding(2);
		((Control)Button1).Name = "Button1";
		((Control)Button1).Size = new Size(89, 18);
		((Control)Button1).TabIndex = 6;
		((ButtonBase)Button1).UseVisualStyleBackColor = true;
		((Control)RichTextBox1).Location = new System.Drawing.Point(11, 39);
		((Control)RichTextBox1).Margin = new Padding(2);
		((Control)RichTextBox1).Name = "RichTextBox1";
		((Control)RichTextBox1).Size = new Size(254, 31);
		((Control)RichTextBox1).TabIndex = 5;
		RichTextBox1.Text = "";
		((TextBoxBase)TextBox21).BackColor = Color.Red;
		((Control)TextBox21).Location = new System.Drawing.Point(132, 14);
		((Control)TextBox21).Margin = new Padding(2);
		((Control)TextBox21).Name = "TextBox21";
		((TextBoxBase)TextBox21).ReadOnly = true;
		((Control)TextBox21).Size = new Size(134, 21);
		((Control)TextBox21).TabIndex = 3;
		TextBox21.TextAlign = (HorizontalAlignment)2;
		Label25.AutoSize = true;
		((Control)Label25).Location = new System.Drawing.Point(10, 17);
		((Control)Label25).Margin = new Padding(2, 0, 2, 0);
		((Control)Label25).Name = "Label25";
		((Control)Label25).Size = new Size(77, 12);
		((Control)Label25).TabIndex = 2;
		Label25.Text = "Rotate Angle";
		((Control)TabPage2).Controls.Add((Control)(object)TableLayoutPanel2);
		TabPage2.Location = new System.Drawing.Point(22, 4);
		((Control)TabPage2).Name = "TabPage2";
		((Control)TabPage2).Size = new Size(282, 616);
		TabPage2.TabIndex = 1;
		TabPage2.Text = "Setting";
		TabPage2.UseVisualStyleBackColor = true;
		TableLayoutPanel2.ColumnCount = 1;
		TableLayoutPanel2.ColumnStyles.Add(new ColumnStyle((SizeType)2, 100f));
		TableLayoutPanel2.Controls.Add((Control)(object)GroupBox2, 0, 0);
		TableLayoutPanel2.Controls.Add((Control)(object)GroupBox4, 0, 1);
		((Control)TableLayoutPanel2).Dock = (DockStyle)5;
		((Control)TableLayoutPanel2).Location = new System.Drawing.Point(0, 0);
		((Control)TableLayoutPanel2).Name = "TableLayoutPanel2";
		TableLayoutPanel2.RowCount = 2;
		TableLayoutPanel2.RowStyles.Add(new RowStyle((SizeType)1, 160f));
		TableLayoutPanel2.RowStyles.Add(new RowStyle());
		((Control)TableLayoutPanel2).Size = new Size(282, 616);
		((Control)TableLayoutPanel2).TabIndex = 3;
		((Control)GroupBox2).Controls.Add((Control)(object)ComboBox5);
		((Control)GroupBox2).Controls.Add((Control)(object)Label29);
		((Control)GroupBox2).Controls.Add((Control)(object)TextBox15);
		((Control)GroupBox2).Controls.Add((Control)(object)TextBox13);
		((Control)GroupBox2).Controls.Add((Control)(object)Label12);
		((Control)GroupBox2).Controls.Add((Control)(object)Label10);
		((Control)GroupBox2).Controls.Add((Control)(object)TextBox11);
		((Control)GroupBox2).Controls.Add((Control)(object)Label8);
		((Control)GroupBox2).Dock = (DockStyle)5;
		((Control)GroupBox2).Location = new System.Drawing.Point(3, 3);
		((Control)GroupBox2).Name = "GroupBox2";
		((Control)GroupBox2).Size = new Size(276, 154);
		((Control)GroupBox2).TabIndex = 1;
		GroupBox2.TabStop = false;
		GroupBox2.Text = "Turning Setting";
		((ListControl)ComboBox5).FormattingEnabled = true;
		((Control)ComboBox5).Location = new System.Drawing.Point(140, 130);
		((Control)ComboBox5).Margin = new Padding(2);
		((Control)ComboBox5).Name = "ComboBox5";
		((Control)ComboBox5).Size = new Size(123, 20);
		((Control)ComboBox5).TabIndex = 11;
		Label29.AutoSize = true;
		((Control)Label29).Location = new System.Drawing.Point(9, 130);
		((Control)Label29).Name = "Label29";
		((Control)Label29).Size = new Size(95, 12);
		((Control)Label29).TabIndex = 10;
		Label29.Text = "Reverse Turning";
		((Control)TextBox15).Location = new System.Drawing.Point(140, 94);
		((Control)TextBox15).Name = "TextBox15";
		((Control)TextBox15).Size = new Size(123, 21);
		((Control)TextBox15).TabIndex = 9;
		TextBox15.TextAlign = (HorizontalAlignment)2;
		((Control)TextBox13).Location = new System.Drawing.Point(140, 30);
		((Control)TextBox13).Name = "TextBox13";
		((Control)TextBox13).Size = new Size(123, 21);
		((Control)TextBox13).TabIndex = 7;
		TextBox13.TextAlign = (HorizontalAlignment)2;
		Label12.AutoSize = true;
		((Control)Label12).Location = new System.Drawing.Point(9, 96);
		((Control)Label12).Name = "Label12";
		((Control)Label12).Size = new Size(89, 12);
		((Control)Label12).TabIndex = 5;
		Label12.Text = "Turning Extend";
		Label10.AutoSize = true;
		((Control)Label10).Location = new System.Drawing.Point(9, 32);
		((Control)Label10).Name = "Label10";
		((Control)Label10).Size = new Size(83, 12);
		((Control)Label10).TabIndex = 3;
		Label10.Text = "Turning Depth";
		((Control)TextBox11).Location = new System.Drawing.Point(140, 60);
		((Control)TextBox11).Name = "TextBox11";
		((Control)TextBox11).Size = new Size(123, 21);
		((Control)TextBox11).TabIndex = 1;
		TextBox11.TextAlign = (HorizontalAlignment)2;
		Label8.AutoSize = true;
		((Control)Label8).Location = new System.Drawing.Point(9, 62);
		((Control)Label8).Name = "Label8";
		((Control)Label8).Size = new Size(65, 12);
		((Control)Label8).TabIndex = 0;
		Label8.Text = "Exit Angle";
		((Control)GroupBox4).Controls.Add((Control)(object)ComboBox7);
		((Control)GroupBox4).Controls.Add((Control)(object)Label31);
		((Control)GroupBox4).Controls.Add((Control)(object)ComboBox6);
		((Control)GroupBox4).Controls.Add((Control)(object)Label30);
		((Control)GroupBox4).Controls.Add((Control)(object)ComboBox4);
		((Control)GroupBox4).Controls.Add((Control)(object)Label18);
		((Control)GroupBox4).Controls.Add((Control)(object)ComboBox3);
		((Control)GroupBox4).Controls.Add((Control)(object)Label21);
		((Control)GroupBox4).Controls.Add((Control)(object)TextBox12);
		((Control)GroupBox4).Controls.Add((Control)(object)ComboBox1);
		((Control)GroupBox4).Controls.Add((Control)(object)TextBox16);
		((Control)GroupBox4).Controls.Add((Control)(object)Label17);
		((Control)GroupBox4).Controls.Add((Control)(object)Label9);
		((Control)GroupBox4).Controls.Add((Control)(object)Label16);
		((Control)GroupBox4).Dock = (DockStyle)1;
		((Control)GroupBox4).Location = new System.Drawing.Point(3, 163);
		((Control)GroupBox4).Name = "GroupBox4";
		((Control)GroupBox4).Size = new Size(276, 276);
		((Control)GroupBox4).TabIndex = 2;
		GroupBox4.TabStop = false;
		GroupBox4.Text = "Others";
		((ListControl)ComboBox7).FormattingEnabled = true;
		ComboBox7.Items.AddRange(new object[2] { "3D Milling", "4 Axis Milling" });
		((Control)ComboBox7).Location = new System.Drawing.Point(137, 99);
		((Control)ComboBox7).Name = "ComboBox7";
		((Control)ComboBox7).Size = new Size(123, 20);
		((Control)ComboBox7).TabIndex = 17;
		Label31.AutoSize = true;
		((Control)Label31).Location = new System.Drawing.Point(9, 102);
		((Control)Label31).Name = "Label31";
		((Control)Label31).Size = new Size(77, 12);
		((Control)Label31).TabIndex = 16;
		Label31.Text = "Rough Method";
		((ListControl)ComboBox6).FormattingEnabled = true;
		((Control)ComboBox6).Location = new System.Drawing.Point(137, 246);
		((Control)ComboBox6).Margin = new Padding(2);
		((Control)ComboBox6).Name = "ComboBox6";
		((Control)ComboBox6).Size = new Size(123, 20);
		((Control)ComboBox6).TabIndex = 15;
		Label30.AutoSize = true;
		((Control)Label30).Location = new System.Drawing.Point(9, 249);
		((Control)Label30).Margin = new Padding(2, 0, 2, 0);
		((Control)Label30).Name = "Label30";
		((Control)Label30).Size = new Size(107, 12);
		((Control)Label30).TabIndex = 14;
		Label30.Text = "Semi-Rough Degree";
		((ListControl)ComboBox4).FormattingEnabled = true;
		((Control)ComboBox4).Location = new System.Drawing.Point(137, 206);
		((Control)ComboBox4).Margin = new Padding(2);
		((Control)ComboBox4).Name = "ComboBox4";
		((Control)ComboBox4).Size = new Size(123, 20);
		((Control)ComboBox4).TabIndex = 13;
		Label18.AutoSize = true;
		((Control)Label18).Location = new System.Drawing.Point(9, 209);
		((Control)Label18).Margin = new Padding(2, 0, 2, 0);
		((Control)Label18).Name = "Label18";
		((Control)Label18).Size = new Size(71, 12);
		((Control)Label18).TabIndex = 12;
		Label18.Text = "Mark Number";
		((ListControl)ComboBox3).FormattingEnabled = true;
		ComboBox3.Items.AddRange(new object[2] { "OFF", "ON" });
		((Control)ComboBox3).Location = new System.Drawing.Point(137, 168);
		((Control)ComboBox3).Name = "ComboBox3";
		((Control)ComboBox3).Size = new Size(123, 20);
		((Control)ComboBox3).TabIndex = 8;
		ComboBox3.Text = "OFF";
		Label21.AutoSize = true;
		((Control)Label21).Location = new System.Drawing.Point(9, 170);
		((Control)Label21).Name = "Label21";
		((Control)Label21).Size = new Size(101, 12);
		((Control)Label21).TabIndex = 7;
		Label21.Text = "Margin Finishing";
		((Control)TextBox12).Location = new System.Drawing.Point(137, 66);
		((Control)TextBox12).Name = "TextBox12";
		((Control)TextBox12).Size = new Size(123, 21);
		((Control)TextBox12).TabIndex = 6;
		TextBox12.TextAlign = (HorizontalAlignment)2;
		((ListControl)ComboBox1).FormattingEnabled = true;
		ComboBox1.Items.AddRange(new object[2] { "3D Milling", "4 Axis Milling" });
		((Control)ComboBox1).Location = new System.Drawing.Point(137, 131);
		((Control)ComboBox1).Name = "ComboBox1";
		((Control)ComboBox1).Size = new Size(123, 20);
		((Control)ComboBox1).TabIndex = 4;
		ComboBox1.Text = "3D Milling";
		((Control)TextBox16).Location = new System.Drawing.Point(137, 30);
		((Control)TextBox16).Name = "TextBox16";
		((Control)TextBox16).Size = new Size(123, 21);
		((Control)TextBox16).TabIndex = 3;
		TextBox16.TextAlign = (HorizontalAlignment)2;
		Label17.AutoSize = true;
		((Control)Label17).Location = new System.Drawing.Point(9, 134);
		((Control)Label17).Name = "Label17";
		((Control)Label17).Size = new Size(101, 12);
		((Control)Label17).TabIndex = 1;
		Label17.Text = "Finishing Method";
		Label9.AutoSize = true;
		((Control)Label9).Location = new System.Drawing.Point(9, 68);
		((Control)Label9).Name = "Label9";
		((Control)Label9).Size = new Size(101, 12);
		((Control)Label9).TabIndex = 2;
		Label9.Text = "Front Mill Depth";
		Label16.AutoSize = true;
		((Control)Label16).Location = new System.Drawing.Point(9, 33);
		((Control)Label16).Name = "Label16";
		((Control)Label16).Size = new Size(95, 12);
		((Control)Label16).TabIndex = 0;
		Label16.Text = "Rough Mill Step";
		((Control)TabPage3).Controls.Add((Control)(object)TableLayoutPanel3);
		TabPage3.Location = new System.Drawing.Point(22, 4);
		((Control)TabPage3).Name = "TabPage3";
		((Control)TabPage3).Padding = new Padding(3);
		((Control)TabPage3).Size = new Size(282, 616);
		TabPage3.TabIndex = 2;
		TabPage3.Text = "Prc Files";
		TabPage3.UseVisualStyleBackColor = true;
		TableLayoutPanel3.ColumnCount = 1;
		TableLayoutPanel3.ColumnStyles.Add(new ColumnStyle((SizeType)2, 100f));
		TableLayoutPanel3.Controls.Add((Control)(object)GroupBox1, 0, 0);
		TableLayoutPanel3.Controls.Add((Control)(object)GroupBox8, 0, 1);
		TableLayoutPanel3.Controls.Add((Control)(object)GroupBox9, 0, 2);
		TableLayoutPanel3.Controls.Add((Control)(object)GroupBox10, 0, 3);
		((Control)TableLayoutPanel3).Location = new System.Drawing.Point(2, 2);
		((Control)TableLayoutPanel3).Margin = new Padding(2);
		((Control)TableLayoutPanel3).Name = "TableLayoutPanel3";
		TableLayoutPanel3.RowCount = 4;
		TableLayoutPanel3.RowStyles.Add(new RowStyle((SizeType)1, 392f));
		TableLayoutPanel3.RowStyles.Add(new RowStyle());
		TableLayoutPanel3.RowStyles.Add(new RowStyle());
		TableLayoutPanel3.RowStyles.Add(new RowStyle());
		((Control)TableLayoutPanel3).Size = new Size(280, 614);
		((Control)TableLayoutPanel3).TabIndex = 2;
		((Control)GroupBox1).BackgroundImageLayout = (ImageLayout)0;
		((Control)GroupBox1).Controls.Add((Control)(object)TextBox24);
		((Control)GroupBox1).Controls.Add((Control)(object)Label28);
		((Control)GroupBox1).Controls.Add((Control)(object)TextBox8);
		((Control)GroupBox1).Controls.Add((Control)(object)Label13);
		((Control)GroupBox1).Controls.Add((Control)(object)TextBox6);
		((Control)GroupBox1).Controls.Add((Control)(object)TextBox5);
		((Control)GroupBox1).Controls.Add((Control)(object)TextBox4);
		((Control)GroupBox1).Controls.Add((Control)(object)TextBox2);
		((Control)GroupBox1).Controls.Add((Control)(object)TextBox1);
		((Control)GroupBox1).Controls.Add((Control)(object)Label6);
		((Control)GroupBox1).Controls.Add((Control)(object)Label5);
		((Control)GroupBox1).Controls.Add((Control)(object)Label4);
		((Control)GroupBox1).Controls.Add((Control)(object)Label1);
		((Control)GroupBox1).Controls.Add((Control)(object)Label2);
		((Control)GroupBox1).Location = new System.Drawing.Point(3, 3);
		((Control)GroupBox1).Name = "GroupBox1";
		((Control)GroupBox1).Size = new Size(270, 383);
		((Control)GroupBox1).TabIndex = 1;
		GroupBox1.TabStop = false;
		GroupBox1.Text = "Technology Setting Files";
		((TextBoxBase)TextBox24).BackColor = SystemColors.Control;
		((Control)TextBox24).Location = new System.Drawing.Point(11, 92);
		((Control)TextBox24).Margin = new Padding(2);
		((Control)TextBox24).Name = "TextBox24";
		((Control)TextBox24).Size = new Size(250, 21);
		((Control)TextBox24).TabIndex = 26;
		Label28.AutoSize = true;
		((Control)Label28).Location = new System.Drawing.Point(12, 72);
		((Control)Label28).Margin = new Padding(2, 0, 2, 0);
		((Control)Label28).Name = "Label28";
		((Control)Label28).Size = new Size(179, 12);
		((Control)Label28).TabIndex = 25;
		Label28.Text = "Reverse Turning Process File:";
		((Control)TextBox8).Location = new System.Drawing.Point(11, 196);
		((Control)TextBox8).Name = "TextBox8";
		((TextBoxBase)TextBox8).ReadOnly = true;
		((Control)TextBox8).Size = new Size(251, 21);
		((Control)TextBox8).TabIndex = 24;
		Label13.AutoSize = true;
		((Control)Label13).Location = new System.Drawing.Point(11, 176);
		((Control)Label13).Name = "Label13";
		((Control)Label13).Size = new Size(215, 12);
		((Control)Label13).TabIndex = 23;
		Label13.Text = "Semi-Roughing Milling Process File:";
		((Control)TextBox6).Location = new System.Drawing.Point(12, 352);
		((Control)TextBox6).Name = "TextBox6";
		((TextBoxBase)TextBox6).ReadOnly = true;
		((Control)TextBox6).Size = new Size(250, 21);
		((Control)TextBox6).TabIndex = 19;
		((Control)TextBox5).Location = new System.Drawing.Point(12, 300);
		((Control)TextBox5).Name = "TextBox5";
		((TextBoxBase)TextBox5).ReadOnly = true;
		((Control)TextBox5).Size = new Size(250, 21);
		((Control)TextBox5).TabIndex = 18;
		((Control)TextBox4).Location = new System.Drawing.Point(12, 248);
		((Control)TextBox4).Name = "TextBox4";
		((TextBoxBase)TextBox4).ReadOnly = true;
		((Control)TextBox4).Size = new Size(250, 21);
		((Control)TextBox4).TabIndex = 17;
		((Control)TextBox2).Location = new System.Drawing.Point(11, 144);
		((Control)TextBox2).Name = "TextBox2";
		((TextBoxBase)TextBox2).ReadOnly = true;
		((Control)TextBox2).Size = new Size(251, 21);
		((Control)TextBox2).TabIndex = 15;
		((Control)TextBox1).Location = new System.Drawing.Point(11, 40);
		((Control)TextBox1).Name = "TextBox1";
		((TextBoxBase)TextBox1).ReadOnly = true;
		((Control)TextBox1).Size = new Size(250, 21);
		((Control)TextBox1).TabIndex = 14;
		Label6.AutoSize = true;
		((Control)Label6).Location = new System.Drawing.Point(12, 332);
		((Control)Label6).Name = "Label6";
		((Control)Label6).Size = new Size(95, 12);
		((Control)Label6).TabIndex = 12;
		Label6.Text = "90-270 Postion:";
		Label5.AutoSize = true;
		((Control)Label5).Location = new System.Drawing.Point(12, 280);
		((Control)Label5).Name = "Label5";
		((Control)Label5).Size = new Size(95, 12);
		((Control)Label5).TabIndex = 11;
		Label5.Text = "0-180 Position:";
		Label4.AutoSize = true;
		((Control)Label4).Location = new System.Drawing.Point(12, 228);
		((Control)Label4).Name = "Label4";
		((Control)Label4).Size = new Size(95, 12);
		((Control)Label4).TabIndex = 10;
		Label4.Text = "Face Machining:";
		Label1.AutoSize = true;
		((Control)Label1).Location = new System.Drawing.Point(11, 20);
		((Control)Label1).Name = "Label1";
		((Control)Label1).Size = new Size(131, 12);
		((Control)Label1).TabIndex = 0;
		Label1.Text = "Turning Process File:";
		Label2.AutoSize = true;
		((Control)Label2).Location = new System.Drawing.Point(11, 124);
		((Control)Label2).Name = "Label2";
		((Control)Label2).Size = new Size(185, 12);
		((Control)Label2).TabIndex = 1;
		Label2.Text = "Roughing Milling Process File:";
		((Control)GroupBox8).Controls.Add((Control)(object)TextBox22);
		((Control)GroupBox8).Controls.Add((Control)(object)Label26);
		((Control)GroupBox8).Location = new System.Drawing.Point(2, 394);
		((Control)GroupBox8).Margin = new Padding(2);
		((Control)GroupBox8).Name = "GroupBox8";
		((Control)GroupBox8).Padding = new Padding(2);
		((Control)GroupBox8).Size = new Size(271, 68);
		((Control)GroupBox8).TabIndex = 2;
		GroupBox8.TabStop = false;
		((TextBoxBase)TextBox22).BackColor = SystemColors.Control;
		((Control)TextBox22).Location = new System.Drawing.Point(13, 40);
		((Control)TextBox22).Margin = new Padding(2);
		((Control)TextBox22).Name = "TextBox22";
		((Control)TextBox22).Size = new Size(249, 21);
		((Control)TextBox22).TabIndex = 28;
		Label26.AutoSize = true;
		((Control)Label26).Location = new System.Drawing.Point(12, 16);
		((Control)Label26).Margin = new Padding(2, 0, 2, 0);
		((Control)Label26).Name = "Label26";
		((Control)Label26).Size = new Size(53, 12);
		((Control)Label26).TabIndex = 27;
		Label26.Text = "MarkText";
		((Control)GroupBox9).Controls.Add((Control)(object)Label19);
		((Control)GroupBox9).Controls.Add((Control)(object)TextBox9);
		((Control)GroupBox9).Location = new System.Drawing.Point(2, 466);
		((Control)GroupBox9).Margin = new Padding(2);
		((Control)GroupBox9).Name = "GroupBox9";
		((Control)GroupBox9).Padding = new Padding(2);
		((Control)GroupBox9).Size = new Size(271, 66);
		((Control)GroupBox9).TabIndex = 3;
		GroupBox9.TabStop = false;
		Label19.AutoSize = true;
		((Control)Label19).Location = new System.Drawing.Point(12, 16);
		((Control)Label19).Name = "Label19";
		((Control)Label19).Size = new Size(107, 12);
		((Control)Label19).TabIndex = 21;
		Label19.Text = "4 Axis Composite:";
		((Control)Label19).Visible = false;
		((Control)TextBox9).Location = new System.Drawing.Point(14, 40);
		((Control)TextBox9).Name = "TextBox9";
		((TextBoxBase)TextBox9).ReadOnly = true;
		((Control)TextBox9).Size = new Size(249, 21);
		((Control)TextBox9).TabIndex = 22;
		((Control)TextBox9).Visible = false;
		((Control)GroupBox10).Controls.Add((Control)(object)Label11);
		((Control)GroupBox10).Controls.Add((Control)(object)TextBox14);
		((Control)GroupBox10).Location = new System.Drawing.Point(2, 536);
		((Control)GroupBox10).Margin = new Padding(2);
		((Control)GroupBox10).Name = "GroupBox10";
		((Control)GroupBox10).Padding = new Padding(2);
		((Control)GroupBox10).Size = new Size(271, 66);
		((Control)GroupBox10).TabIndex = 4;
		GroupBox10.TabStop = false;
		Label11.AutoSize = true;
		((Control)Label11).Location = new System.Drawing.Point(12, 16);
		((Control)Label11).Name = "Label11";
		((Control)Label11).Size = new Size(89, 12);
		((Control)Label11).TabIndex = 25;
		Label11.Text = "Margin Finish:";
		((Control)Label11).Visible = false;
		((Control)TextBox14).Location = new System.Drawing.Point(14, 40);
		((Control)TextBox14).Name = "TextBox14";
		((TextBoxBase)TextBox14).ReadOnly = true;
		((Control)TextBox14).Size = new Size(249, 21);
		((Control)TextBox14).TabIndex = 26;
		((Control)TextBox14).Visible = false;
		((ContainerControl)this).AutoScaleDimensions = new SizeF(6f, 12f);
		((ContainerControl)this).AutoScaleMode = (AutoScaleMode)1;
		((Form)this).ClientSize = new Size(308, 652);
		((Control)this).Controls.Add((Control)(object)TabControl1);
		((Control)this).Controls.Add((Control)(object)MenuStrip1);
		((Form)this).FormBorderStyle = (FormBorderStyle)0;
		((Form)this).MainMenuStrip = MenuStrip1;
		((Form)this).MaximizeBox = false;
		((Form)this).MinimizeBox = false;
		((Control)this).Name = "DentalPanel";
		((Form)this).Text = "DentalPanel";
		((Control)MenuStrip1).ResumeLayout(false);
		((Control)MenuStrip1).PerformLayout();
		((Control)TabControl1).ResumeLayout(false);
		((Control)TabPage1).ResumeLayout(false);
		((Control)TableLayoutPanel1).ResumeLayout(false);
		((ISupportInitialize)PictureBox1).EndInit();
		((Control)GroupBox3).ResumeLayout(false);
		((Control)GroupBox3).PerformLayout();
		((Control)GroupBox5).ResumeLayout(false);
		((Control)GroupBox5).PerformLayout();
		((Control)GroupBox6).ResumeLayout(false);
		((Control)GroupBox6).PerformLayout();
		((Control)GroupBox7).ResumeLayout(false);
		((Control)GroupBox7).PerformLayout();
		((Control)TabPage2).ResumeLayout(false);
		((Control)TableLayoutPanel2).ResumeLayout(false);
		((Control)GroupBox2).ResumeLayout(false);
		((Control)GroupBox2).PerformLayout();
		((Control)GroupBox4).ResumeLayout(false);
		((Control)GroupBox4).PerformLayout();
		((Control)TabPage3).ResumeLayout(false);
		((Control)TableLayoutPanel3).ResumeLayout(false);
		((Control)GroupBox1).ResumeLayout(false);
		((Control)GroupBox1).PerformLayout();
		((Control)GroupBox8).ResumeLayout(false);
		((Control)GroupBox8).PerformLayout();
		((Control)GroupBox9).ResumeLayout(false);
		((Control)GroupBox9).PerformLayout();
		((Control)GroupBox10).ResumeLayout(false);
		((Control)GroupBox10).PerformLayout();
		((Control)this).ResumeLayout(false);
		((Control)this).PerformLayout();
	}

	private void DentalPanel_Load(object sender, EventArgs e)
	{
		MainModule.EspritApp.OutputWindow.Text(Conversions.ToString(DateAndTime.Now) + "\r\n");
		if (GetMachineType())
		{
			((Form)this).Close();
			return;
		}
		LoadData();
		ComboBox4.Items.Add((object)"OFF");
		ComboBox4.Items.Add((object)"ON");
		ComboBox5.Items.Add((object)"OFF");
		ComboBox5.Items.Add((object)"ON");
		ComboBox6.Items.Clear();
		ComboBox6.Items.Add((object)"5 Degree");
		ComboBox6.Items.Add((object)"10 Degree");
		ComboBox6.Items.Add((object)"15 Degree");
		ComboBox6.Items.Add((object)"20 Degree");
		ComboBox7.Items.Clear();
		ComboBox7.Items.Add((object)"FlatEndMillRough");
		ComboBox7.Items.Add((object)"BallEndMillRough2Position");
		ComboBox7.Items.Add((object)"BallEndMillRough3Position");
		ComboBox2.Items.Add((object)"A Type > 45");
		ComboBox2.Items.Add((object)"B Type < 45");
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
				ComboBox8.Items.Add((object)text3);
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
				ComboBox9.Items.Add((object)text3);
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
			((ButtonBase)Button1).Text = "MarkX=";
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
				ComboBox8.Items.Add((object)text);
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
				ComboBox9.Items.Add((object)text);
			}
			ComboBox9.SelectedIndex = 0;
		}
	}

	private void LoadOtherPartToolStripMenuItem_Click(object sender, EventArgs e)
	{
		//IL_0000: Unknown result type (might be due to invalid IL or missing references)
		//IL_0006: Expected O, but got Unknown
		//IL_0038: Unknown result type (might be due to invalid IL or missing references)
		//IL_003e: Invalid comparison between Unknown and I4
		OpenFileDialog val = new OpenFileDialog();
		((FileDialog)val).Title = "";
		((FileDialog)val).Filter = "Xml Files(*.xml)|*.xml|All Files(*.*)|*.*";
		((FileDialog)val).FilterIndex = 1;
		((FileDialog)val).RestoreDirectory = true;
		((FileDialog)val).InitialDirectory = "C:\\Program Files (x86)\\D.P.Technology\\ESPRIT\\AddIns\\DentalAddin\\Viles\\DefaultPath\\";
		_ = null;
		if ((int)((CommonDialog)val).ShowDialog() == 1)
		{
			Connect.UD = (UserData)SerializableData.Load(((FileDialog)val).FileName, typeof(UserData));
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
		//IL_0000: Unknown result type (might be due to invalid IL or missing references)
		//IL_0006: Expected O, but got Unknown
		//IL_0038: Unknown result type (might be due to invalid IL or missing references)
		//IL_003e: Invalid comparison between Unknown and I4
		SaveFileDialog val = new SaveFileDialog();
		((FileDialog)val).Title = "";
		((FileDialog)val).Filter = "Xml Files(*.xml)|*.xml|All Files(*.*)|*.*";
		((FileDialog)val).FilterIndex = 1;
		((FileDialog)val).RestoreDirectory = true;
		((FileDialog)val).InitialDirectory = "C:\\Program Files (x86)\\D.P.Technology\\ESPRIT\\AddIns\\DentalAddin\\Viles\\DefaultPath\\";
		_ = null;
		if ((int)((CommonDialog)val).ShowDialog() == 1)
		{
			SaveData(((FileDialog)val).FileName);
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
				/*Note: ILSpy has introduced the following switch to emulate a goto from catch-block to try-block*/;
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
					((Control)TabControl1.TabPages[1]).Parent = null;
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
					((Control)TabControl1.TabPages[2]).Parent = null;
					goto IL_00b1;
					end_IL_0000_2:
					break;
				}
				num2 = 13;
				((ToolStripItem)ShowSettingToolStripMenuItem).Text = "Lock Setting...";
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
		((Form)this).Close();
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
		if ((((TextBoxBase)TextBox18).BackColor == Color.Red) | (((TextBoxBase)TextBox19).BackColor == Color.Red))
		{
			Trace.WriteLine("Please Select the limit Points! (MessageBox suppressed)");
			MainModule.EspritApp.Processing = false;
			MainModule.Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
		}
		else if (((Control)ComboBox3).Enabled && MainModule.NumCombobox[3] == 1 && ((((TextBoxBase)TextBox17).BackColor == Color.Red) | (((TextBoxBase)TextBox20).BackColor == Color.Red)))
		{
			Trace.WriteLine("Please Select the chamfer limit Points! (MessageBox suppressed)");
			MainModule.EspritApp.Processing = false;
			MainModule.Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
		}
		else
		{
			MainModule.Document.LatheMachineSetup.CustomSetting20 = Conversion.Val(TextBox10.Text);
			((Form)this).Close();
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
		//IL_0000: Unknown result type (might be due to invalid IL or missing references)
		//IL_0006: Expected O, but got Unknown
		//IL_0034: Unknown result type (might be due to invalid IL or missing references)
		//IL_003a: Invalid comparison between Unknown and I4
		OpenFileDialog val = new OpenFileDialog();
		((FileDialog)val).Title = Title;
		((FileDialog)val).Filter = "Process Files(*.prc)|*.prc|All Files(*.*)|*.*";
		((FileDialog)val).FilterIndex = 1;
		((FileDialog)val).RestoreDirectory = true;
		((FileDialog)val).InitialDirectory = MainModule.PrcDirectory;
		_ = null;
		if ((int)((CommonDialog)val).ShowDialog() == 1)
		{
			MainModule.PrcFilePath[index] = ((FileDialog)val).FileName;
			MainModule.PrcFileName[index] = val.SafeFileName;
			return val.SafeFileName;
		}
		return MainModule.FSName[index];
	}

	private string GetProcessFolder(string Title, int Index)
	{
		//IL_0000: Unknown result type (might be due to invalid IL or missing references)
		//IL_0006: Expected O, but got Unknown
		//IL_0023: Unknown result type (might be due to invalid IL or missing references)
		//IL_0029: Invalid comparison between Unknown and I4
		FolderBrowserDialog val = new FolderBrowserDialog();
		val.Description = Title;
		val.RootFolder = Environment.SpecialFolder.ProgramFilesX86;
		val.SelectedPath = MainModule.PrcDirectory;
		_ = null;
		if ((int)((CommonDialog)val).ShowDialog() == 1)
		{
			MainModule.PrcFilePath[Index] = val.SelectedPath;
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
			((Control)GroupBox9).Visible = false;
			((Control)Label19).Visible = false;
			((Control)TextBox9).Visible = false;
		}
		else
		{
			((Control)GroupBox9).Visible = true;
			((Control)Label19).Visible = true;
			((Control)TextBox9).Visible = true;
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
			((Control)GroupBox6).Visible = true;
			((Control)GroupBox10).Visible = true;
			((Control)Label11).Visible = true;
			((Control)TextBox14).Visible = true;
		}
		else
		{
			((Control)GroupBox6).Visible = false;
			((Control)GroupBox10).Visible = false;
			((Control)Label11).Visible = false;
			((Control)TextBox14).Visible = false;
		}
	}

	private void ComboBox4_SelectedIndexChanged(object sender, EventArgs e)
	{
		MainModule.NumCombobox[2] = ComboBox4.SelectedIndex;
		if (ComboBox4.SelectedIndex == 0)
		{
			((Control)GroupBox7).Visible = false;
			((Control)GroupBox8).Visible = false;
			Mark.MarkSign = false;
		}
		else if (ComboBox4.SelectedIndex == 1)
		{
			((Control)GroupBox7).Visible = true;
			((Control)GroupBox8).Visible = true;
			Mark.MarkSign = true;
		}
	}

	private void ComboBox5_SelectedIndexChanged(object sender, EventArgs e)
	{
		MainModule.NumCombobox[4] = ComboBox5.SelectedIndex;
		if (ComboBox5.SelectedIndex == 0)
		{
			((Control)TextBox24).Enabled = false;
			MainModule.ReverseOn = false;
		}
		else if (ComboBox5.SelectedIndex == 1)
		{
			((Control)TextBox24).Enabled = true;
			MainModule.ReverseOn = true;
		}
	}

	private void ComboBox7_SelectedIndexChanged(object sender, EventArgs e)
	{
		MainModule.NumCombobox[6] = ComboBox7.SelectedIndex;
		if (ComboBox7.SelectedIndex == 0)
		{
			MainModule.RoughType = 1.0;
			((Control)TextBox8).Enabled = true;
			((Control)ComboBox6).Enabled = true;
		}
		else if (ComboBox7.SelectedIndex == 1)
		{
			MainModule.RoughType = 2.0;
			((Control)TextBox8).Enabled = false;
			((Control)ComboBox6).Enabled = false;
		}
		else
		{
			MainModule.RoughType = 3.0;
			((Control)TextBox8).Enabled = false;
			((Control)ComboBox6).Enabled = false;
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
				((TextBoxBase)TextBox17).BackColor = Color.Gray;
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
				((TextBoxBase)TextBox18).BackColor = Color.Gray;
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
				((TextBoxBase)TextBox19).BackColor = Color.Gray;
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
				((TextBoxBase)TextBox20).BackColor = Color.Gray;
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
		((ButtonBase)Button1).Text = "MarkX=" + Conversions.ToString(Mark.MarkX);
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
		//IL_0084: Unknown result type (might be due to invalid IL or missing references)
		//IL_008a: Invalid comparison between Unknown and I4
		string text = ((ToolStripItem)ShowSettingToolStripMenuItem).Text;
		if (Operators.CompareString(text, "Lock Setting...", false) != 0)
		{
			if (Operators.CompareString(text, "Show Setting...", false) == 0 && (int)((Form)new Dialog2()).ShowDialog() == 1)
			{
				((Control)TabPage2).Parent = (Control)(object)TabControl1;
				((Control)TabPage3).Parent = (Control)(object)TabControl1;
				Connect.LockMode = false;
				((ToolStripItem)ShowSettingToolStripMenuItem).Text = "Lock Setting...";
			}
			return;
		}
		try
		{
			((Control)TabControl1.TabPages[2]).Parent = null;
			((Control)TabControl1.TabPages[1]).Parent = null;
			Connect.LockMode = true;
		}
		catch (Exception ex)
		{
			ProjectData.SetProjectError(ex);
			Exception ex2 = ex;
			ProjectData.ClearProjectError();
		}
		((ToolStripItem)ShowSettingToolStripMenuItem).Text = "Show Setting...";
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
		((Control)TextBox18).Text = $"{d:0.######}";
		((Control)TextBox18).BackColor = Color.Gray;
	}

	public void InputBPointVal(double d)
	{
		((Control)TextBox19).Text = $"{d:0.######}";
		((Control)TextBox19).BackColor = Color.Gray;
	}
}
}
