using System;
using System.IO;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;
using Esprit;
using EspritCommands;
using EspritConstants;
using EspritMenus;
using Extensibility;
using Microsoft.VisualBasic;
using Microsoft.VisualBasic.CompilerServices;
using Org.BouncyCastle.Crypto;
using Org.BouncyCastle.Crypto.Engines;
using Org.BouncyCastle.Security;

namespace DentalAddin
{

[ProgId("DentalAddin.Connect")]
[Guid("74E17CE8-C077-4E1F-AB7A-2449AE193FF9")]
[ClassInterface(ClassInterfaceType.None)]
[ComVisible(true)]
public class Connect : IDTExtensibility2
{
	[CompilerGenerated]
	[AccessedThroughProperty("EspritApp")]
	private static Application _EspritApp;

	[CompilerGenerated]
	[AccessedThroughProperty("AddIn")]
	private AddIn _AddIn;

	private int MyCookie;

	private int[] MyCommand;

	private ToolBar TBar;

	private Menu MyMenu;

	public const int CommandNum = 1;

	public const string TBName = "DentalAddin";

	public const string ProjectName = "DentalAddin";

	public static string DataFileName;

	public static UserData UD = new UserData();

	public static bool LockMode;

	public static Application EspritApp
	{
		[CompilerGenerated]
		get
		{
			return _EspritApp;
		}
		[MethodImpl(MethodImplOptions.Synchronized)]
		[CompilerGenerated]
		set
		{
			_IApplicationEvents_AfterDocumentOpenEventHandler handler = EspritApp_AfterDocumentOpen;
			_IApplicationEvents_AfterNewDocumentOpenEventHandler handler2 = EspritApp_AfterNewDocumentOpen;
			_IApplicationEvents_AfterTemplateOpenEventHandler handler3 = EspritApp_AfterTemplateOpen;
			Application espritApp = _EspritApp;
			if (espritApp != null)
			{
				new ComAwareEventInfo(typeof(_IApplicationEvents_Event), "AfterDocumentOpen").RemoveEventHandler(espritApp, handler);
				new ComAwareEventInfo(typeof(_IApplicationEvents_Event), "AfterNewDocumentOpen").RemoveEventHandler(espritApp, handler2);
				new ComAwareEventInfo(typeof(_IApplicationEvents_Event), "AfterTemplateOpen").RemoveEventHandler(espritApp, handler3);
			}
			_EspritApp = value;
			espritApp = _EspritApp;
			if (espritApp != null)
			{
				new ComAwareEventInfo(typeof(_IApplicationEvents_Event), "AfterDocumentOpen").AddEventHandler(espritApp, handler);
				new ComAwareEventInfo(typeof(_IApplicationEvents_Event), "AfterNewDocumentOpen").AddEventHandler(espritApp, handler2);
				new ComAwareEventInfo(typeof(_IApplicationEvents_Event), "AfterTemplateOpen").AddEventHandler(espritApp, handler3);
			}
		}
	}

	[field: AccessedThroughProperty("Document")]
	public static Document Document
	{
		get; [MethodImpl(MethodImplOptions.Synchronized)]
		set;
	}

	private virtual AddIn AddIn
	{
		[CompilerGenerated]
		get
		{
			return _AddIn;
		}
		[MethodImpl(MethodImplOptions.Synchronized)]
		[CompilerGenerated]
		set
		{
			_IAddInEvents_OnCommandEventHandler handler = AddIn_OnCommand;
			AddIn addIn = _AddIn;
			if (addIn != null)
			{
				new ComAwareEventInfo(typeof(_IAddInEvents_Event), "OnCommand").RemoveEventHandler(addIn, handler);
			}
			_AddIn = value;
			addIn = _AddIn;
			if (addIn != null)
			{
				new ComAwareEventInfo(typeof(_IAddInEvents_Event), "OnCommand").AddEventHandler(addIn, handler);
			}
		}
	}

	public void OnAddInsUpdate(ref Array custom)
	{
	}

	void IDTExtensibility2.OnAddInsUpdate(ref Array custom)
	{
		//ILSpy generated this explicit interface implementation from .override directive in OnAddInsUpdate
		this.OnAddInsUpdate(ref custom);
	}

	public void OnBeginShutdown(ref Array custom)
	{
	}

	void IDTExtensibility2.OnBeginShutdown(ref Array custom)
	{
		//ILSpy generated this explicit interface implementation from .override directive in OnBeginShutdown
		this.OnBeginShutdown(ref custom);
	}

	private string DecryptPublicKeyJava(string publicKeyJava, string data)
	{
		//IL_0013: Unknown result type (might be due to invalid IL or missing references)
		//IL_0018: Unknown result type (might be due to invalid IL or missing references)
		AsymmetricKeyParameter val = PublicKeyFactory.CreateKey(Convert.FromBase64String(publicKeyJava));
		byte[] array = Convert.FromBase64String(data);
		RsaEngine val2 = new RsaEngine();
		val2.Init(false, (ICipherParameters)(object)val);
		array = val2.ProcessBlock(array, 0, array.Length);
		return Encoding.GetEncoding("UTF-8").GetString(array);
	}

	private bool CheckLicense(string ctmcode, string licnumber)
	{
		//IL_004c: Unknown result type (might be due to invalid IL or missing references)
		//IL_0052: Unknown result type (might be due to invalid IL or missing references)
		//IL_0058: Expected O, but got Unknown
		//IL_006f: Unknown result type (might be due to invalid IL or missing references)
		//IL_0075: Invalid comparison between Unknown and I4
		//IL_019b: Unknown result type (might be due to invalid IL or missing references)
		string publicKeyJava = "MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAlOeFqFI7jcX5ysWh1soF18ReY6sUdTnNrvHkr1KDZ6BWVC1yw8Vm0Oy+dleiI4gwLUUKsVudi7NxShzCaoVzetcRI2mH5VNI5u1gwDQc1Jtwzg0zzFWOBRSBDZ3gb/vgVCLFVaFat2Mr1p8PSC3na6Ea3MuOIrveBIe5TCZvqN6S4hxdIH7t1t11LdwgoerrxDYpvcXqwlVhsdHT1okOpVV5I/QxS1D70UvQx4qkaOVmj+vBLXXp7HgPQgNKZgmszbYfd32yLV+CV2BekkHQLYvVgmhVGb0tpQixsS9euiOVIY2TtHOwOKsVmCrgONgACXzQFcmHYnjKy5K0EPxPmh/7wnB82s1jifqNokpkKH3L+ZqCDqKw8XVixcs0iiTTt0ia6KpqXGy0qyk43wRvnRrO3uZ9fN1cdKbW0ElkBJGdfOxnL7MYNofnGRMJpmJHXHJLGU3YrdrGdIu/E8KQ8tY2BULYEioORw9uchJGpnLjf/d1bn+VqTmhfFgjolci5OhxzpBZNWaVGmTZ142AfJ2OljbI1N9aRg5aNgQ9ZHh6JTArgun5rHYWRXcE/N+6jMNkeTIAo3H7kAaqh9HJgz5NtS5yc3Ju0hwcgEvMRCFYpvqNLYnxN0Ne7dXLF5YoryS2Aiy/zALDMW/+Zq8LRf1N3y5lIsDK/+0JBnqHEe8CAwEAAQ==";
		string destFileName = EspritApp.Path + "AddIns\\DentalAddin\\" + licnumber + ".Lic";
		try
		{
			if (!File.Exists(EspritApp.Path + "AddIns\\DentalAddin\\" + licnumber + ".Lic"))
			{
				Trace.WriteLine("License file missing. (MessageBox suppressed)");
				return false;
			}
			if (File.Exists(EspritApp.Path + "AddIns\\DentalAddin\\" + licnumber + ".Lic"))
			{
				StreamReader streamReader = new StreamReader(EspritApp.Path + "AddIns\\DentalAddin\\" + licnumber + ".Lic");
				string data = streamReader.ReadToEnd();
				streamReader.Close();
				string text = DecryptPublicKeyJava(publicKeyJava, data);
				string[] array = text.Split(new char[1] { '|' });
				text = DecryptPublicKeyJava(array[1], array[0]);
				bool flag = Operators.CompareString(text.Split(new char[1] { '|' })[0].ToLower(), ctmcode.ToLower(), false) == 0;
				bool flag2 = Operators.CompareString(text.Split(new char[1] { '|' })[1].ToLower(), licnumber.ToLower(), false) == 0;
				bool flag3 = DateTime.Compare(DateTime.Parse(text.Split(new char[1] { '|' })[2].ToLower()), DateTime.Now) > 0;
				if (!flag3)
				{
					Trace.WriteLine("Authorization expired. (MessageBox suppressed)");
				}
				return flag && flag2 && flag3;
			}
		}
		catch (Exception ex)
		{
			ProjectData.SetProjectError(ex);
			Exception ex2 = ex;
			ProjectData.ClearProjectError();
		}
		return false;
	}

	public void OnConnection(object CallingApplication, ext_ConnectMode ConnectMode, object AddInInst, ref Array custom)
	{
		//IL_0c8c: Unknown result type (might be due to invalid IL or missing references)
		//IL_0dbe: Unknown result type (might be due to invalid IL or missing references)
		//IL_00bd: Unknown result type (might be due to invalid IL or missing references)
		EspritApp = (Application)CallingApplication;
		AddIn = (AddIn)EspritApp.AddIn;
		CleanUp();
		Conversions.ToString(DateTime.Now);
		try
		{
			License.LoadLicenseFile(EspritApp.Path + "AddIns\\DentalAddin\\Viles\\License.key");
		}
		catch (Exception ex)
		{
			ProjectData.SetProjectError(ex);
			Exception ex2 = ex;
			ProjectData.ClearProjectError();
		}
		object objectValue = RuntimeHelpers.GetObjectValue(NewLateBinding.LateGet(EspritApp.License, (Type)null, "SerialNumber", new object[0], (string[])null, (Type[])null, (bool[])null));
		object objectValue2 = RuntimeHelpers.GetObjectValue(NewLateBinding.LateGet(EspritApp.License, (Type)null, "CustomerCode", new object[0], (string[])null, (Type[])null, (bool[])null));
		if (!CheckLicense(Conversions.ToString(objectValue2), Conversions.ToString(objectValue)))
		{
			Trace.WriteLine("License is not Authorized. (MessageBox suppressed)");
			return;
		}
		_ = (double)EspritApp.ReleaseNumber;
		_ = 180.0;
		AddIn = (AddIn)EspritApp.AddIn;
		MyCookie = AddIn.GetCookie();
		MyCommand = new int[2];
		checked
		{
			try
			{
				string text = EspritApp.Path + "AddIns\\DentalAddin\\Viles\\Dental\\";
				int[] array = new int[31];
				array = new int[31];
				string[,] array2 = new string[5, 21];
				array2 = new string[31, 5]
				{
					{
						Conversions.ToString(0),
						"ScreenTip",
						"HelpString",
						"BmpPaths16",
						"BmpPaths32"
					},
					{
						Conversions.ToString(1),
						"Dental Addin",
						"Dental Addin",
						"Dental_16.bmp",
						"Dental_32.bmp"
					},
					{
						Conversions.ToString(2),
						"Dental Addin",
						"Dental Addin",
						"Dental_16.bmp",
						"Dental_32.bmp"
					},
					{
						Conversions.ToString(3),
						"Form2",
						"This is a Form",
						"Copy_16.bmp",
						"Copy_32.bmp"
					},
					{
						Conversions.ToString(4),
						"ScreenTip",
						"HelpString",
						"Copy_16.bmp",
						"Copy_32.bmp"
					},
					{
						Conversions.ToString(5),
						"ScreenTip",
						"HelpString",
						"Copy_16.bmp",
						"Copy_32.bmp"
					},
					{
						Conversions.ToString(6),
						"ScreenTip",
						"HelpString",
						"Copy_16.bmp",
						"Copy_32.bmp"
					},
					{
						Conversions.ToString(7),
						"ScreenTip",
						"HelpString",
						"Copy_16.bmp",
						"Copy_32.bmp"
					},
					{
						Conversions.ToString(8),
						"ScreenTip",
						"HelpString",
						"Copy_16.bmp",
						"Copy_32.bmp"
					},
					{
						Conversions.ToString(9),
						"ScreenTip",
						"HelpString",
						"Copy_16.bmp",
						"Copy_32.bmp"
					},
					{
						Conversions.ToString(10),
						"ScreenTip",
						"HelpString",
						"Copy_16.bmp",
						"Copy_32.bmp"
					},
					{
						Conversions.ToString(11),
						"ScreenTip",
						"HelpString",
						"BmpPaths16",
						"BmpPaths32"
					},
					{
						Conversions.ToString(12),
						"ScreenTip",
						"HelpString",
						"BmpPaths16",
						"BmpPaths32"
					},
					{
						Conversions.ToString(13),
						"ScreenTip",
						"HelpString",
						"BmpPaths16",
						"BmpPaths32"
					},
					{
						Conversions.ToString(14),
						"ScreenTip",
						"HelpString",
						"BmpPaths16",
						"BmpPaths32"
					},
					{
						Conversions.ToString(15),
						"ScreenTip",
						"HelpString",
						"BmpPaths16",
						"BmpPaths32"
					},
					{
						Conversions.ToString(16),
						"ScreenTip",
						"HelpString",
						"BmpPaths16",
						"BmpPaths32"
					},
					{
						Conversions.ToString(17),
						"ScreenTip",
						"HelpString",
						"BmpPaths16",
						"BmpPaths32"
					},
					{
						Conversions.ToString(18),
						"ScreenTip",
						"HelpString",
						"BmpPaths16",
						"BmpPaths32"
					},
					{
						Conversions.ToString(19),
						"ScreenTip",
						"HelpString",
						"BmpPaths16",
						"BmpPaths32"
					},
					{
						Conversions.ToString(20),
						"ScreenTip",
						"HelpString",
						"BmpPaths16",
						"BmpPaths32"
					},
					{
						Conversions.ToString(21),
						"ScreenTip",
						"HelpString",
						"BmpPaths16",
						"BmpPaths32"
					},
					{
						Conversions.ToString(22),
						"ScreenTip",
						"HelpString",
						"BmpPaths16",
						"BmpPaths32"
					},
					{
						Conversions.ToString(23),
						"ScreenTip",
						"HelpString",
						"BmpPaths16",
						"BmpPaths32"
					},
					{
						Conversions.ToString(24),
						"ScreenTip",
						"HelpString",
						"BmpPaths16",
						"BmpPaths32"
					},
					{
						Conversions.ToString(25),
						"ScreenTip",
						"HelpString",
						"BmpPaths16",
						"BmpPaths32"
					},
					{
						Conversions.ToString(26),
						"ScreenTip",
						"HelpString",
						"BmpPaths16",
						"BmpPaths32"
					},
					{
						Conversions.ToString(27),
						"ScreenTip",
						"HelpString",
						"BmpPaths16",
						"BmpPaths32"
					},
					{
						Conversions.ToString(28),
						"ScreenTip",
						"HelpString",
						"BmpPaths16",
						"BmpPaths32"
					},
					{
						Conversions.ToString(29),
						"ScreenTip",
						"HelpString",
						"BmpPaths16",
						"BmpPaths32"
					},
					{
						Conversions.ToString(30),
						"ScreenTip",
						"HelpString",
						"BmpPaths16",
						"BmpPaths32"
					}
				};
				int num = 0;
				do
				{
					MyCommand[num] = AddIn.AddCommand(MyCookie, num, "Command" + Conversion.Str((object)num));
					num++;
				}
				while (num <= 1);
				MyMenu = (Menu)NewLateBinding.LateGet(EspritApp.Menus, (Type)null, "item", new object[1] { 3 }, (string[])null, (Type[])null, (bool[])null);
				int count = MyMenu.Count;
				for (num = 1; num <= count; num++)
				{
					MenuItem menuItem = MyMenu[num];
					if ((Operators.CompareString(menuItem.Name, "&工具栏...", false) == 0) | (Operators.CompareString(menuItem.Name, "&Toolbars...", false) == 0) | (Operators.CompareString(menuItem.Name, "툴바(&T)", false) == 0))
					{
						Menu subMenu = menuItem.SubMenu;
						if (subMenu[subMenu.Count].Type != espMenuItemType.espMenuItemSeparator)
						{
							subMenu.Add(espMenuItemType.espMenuItemSeparator, "Just a Separator", RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
						}
						subMenu.Add(espMenuItemType.espMenuItemCommand, "DentalAddin", MyCommand[0], RuntimeHelpers.GetObjectValue(Missing.Value));
						subMenu = null;
						break;
					}
				}
				try
				{
					TBar = EspritApp.ToolBars.Add("DentalAddin");
				}
				catch (Exception ex3)
				{
					ProjectData.SetProjectError(ex3);
					Exception ex4 = ex3;
					TBar = EspritApp.ToolBars["DentalAddin"];
					ProjectData.ClearProjectError();
				}
				ToolBar tBar = TBar;
				tBar.Visible = false;
				num = 1;
				do
				{
					if (array[num] == 0)
					{
						tBar.Add(espToolBarControl.espToolBarControlButton, "Command" + Conversion.Str((object)num), MyCommand[num], RuntimeHelpers.GetObjectValue(Missing.Value));
						((IToolBar)tBar).get_Item(num).Enabled = true;
						((IToolBar)tBar).get_Item(num).ScreenTip = array2[num, 1];
						((IToolBar)tBar).get_Item(num).HelpString = array2[num, 2];
						try
						{
							((IToolBar)tBar).get_Item(num).SetBitmap(text + array2[num, 3], text + array2[num, 4]);
						}
						catch (Exception ex5)
						{
							ProjectData.SetProjectError(ex5);
							Exception ex6 = ex5;
							ProjectData.ClearProjectError();
						}
					}
					else
					{
						TBar.AddSeparator(RuntimeHelpers.GetObjectValue(Missing.Value));
					}
					num++;
				}
				while (num <= 1);
				tBar = null;
				try
				{
					TBar = EspritApp.ToolBars[5];
				}
				catch (Exception ex7)
				{
					ProjectData.SetProjectError(ex7);
					Exception ex8 = ex7;
					DentalLogger.Log($"Connect: ToolBars[5] 접근 실패 - {ex8.Message}");
					ProjectData.ClearProjectError();
				}
				TBar.AddSeparator(RuntimeHelpers.GetObjectValue(Missing.Value));
				ToolBar tBar2 = TBar;
				num = 1;
				do
				{
					if (array[num] == 0)
					{
						tBar2.Add(espToolBarControl.espToolBarControlButton, "Command" + Conversion.Str((object)num), MyCommand[num], RuntimeHelpers.GetObjectValue(Missing.Value));
						((IToolBar)tBar2).get_Item(tBar2.Count).Enabled = true;
						((IToolBar)tBar2).get_Item(tBar2.Count).ScreenTip = array2[num, 1];
						((IToolBar)tBar2).get_Item(tBar2.Count).HelpString = array2[num, 2];
						try
						{
							((IToolBar)tBar2).get_Item(tBar2.Count).SetBitmap(text + array2[num, 3], text + array2[num, 4]);
						}
						catch (Exception ex9)
						{
							ProjectData.SetProjectError(ex9);
							Exception ex10 = ex9;
							ProjectData.ClearProjectError();
						}
					}
					else
					{
						TBar.AddSeparator(RuntimeHelpers.GetObjectValue(Missing.Value));
					}
					num++;
				}
				while (num <= 1);
				tBar2 = null;
			}
			catch (Exception ex11)
			{
				ProjectData.SetProjectError(ex11);
				Exception ex12 = ex11;
				DentalLogger.Log("Connect: Error When Load the ToolBar.");
				ProjectData.ClearProjectError();
			}
			UD = (UserData)SerializableData.Load(MainModule.DefaultXmlFileName, typeof(UserData));
			UD.PrcFileName = UD.PrcFileName;
			UD.PrcFilePath = UD.PrcFilePath;
			UD.NumData = UD.NumData;
			UD.NumCombobox = UD.NumCombobox;
			UD.PrcDirectory = UD.PrcDirectory;
			UD.Save(MainModule.DefaultXmlFileName);
		}
	}

	void IDTExtensibility2.OnConnection(object CallingApplication, ext_ConnectMode ConnectMode, object AddInInst, ref Array custom)
	{
		//ILSpy generated this explicit interface implementation from .override directive in OnConnection
		this.OnConnection(CallingApplication, ConnectMode, AddInInst, ref custom);
	}

	public void OnDisconnection(ext_DisconnectMode RemoveMode, ref Array custom)
	{
	}

	void IDTExtensibility2.OnDisconnection(ext_DisconnectMode RemoveMode, ref Array custom)
	{
		//ILSpy generated this explicit interface implementation from .override directive in OnDisconnection
		this.OnDisconnection(RemoveMode, ref custom);
	}

	public void OnStartupComplete(ref Array custom)
	{
	}

	void IDTExtensibility2.OnStartupComplete(ref Array custom)
	{
		//ILSpy generated this explicit interface implementation from .override directive in OnStartupComplete
		this.OnStartupComplete(ref custom);
	}

	private void AddIn_OnCommand(int Cookie, int UserId)
	{
		//IL_00ac: Unknown result type (might be due to invalid IL or missing references)
		//IL_00b2: Invalid comparison between Unknown and I4
		if (Cookie != MyCookie)
		{
			return;
		}
		Document = EspritApp.Document;
		switch (UserId)
		{
		case 0:
			ShowTB();
			break;
		case 1:
			if ((int)((Form)new Dialog1()).ShowDialog() == 1)
			{
				AddTab.Init();
			}
			break;
		case 2:
		case 3:
		case 4:
		case 5:
		case 6:
		case 7:
		case 8:
		case 9:
		case 10:
		case 11:
		case 12:
		case 13:
		case 14:
		case 15:
		case 16:
		case 17:
		case 18:
		case 19:
		case 20:
		case 21:
		case 22:
		case 23:
		case 24:
		case 25:
		case 26:
		case 27:
		case 28:
		case 29:
		case 30:
			break;
		}
	}

	private void ShowTB()
	{
		foreach (ToolBar toolBar in EspritApp.ToolBars)
		{
			if (Operators.CompareString(toolBar.Name, "DentalAddin", false) == 0)
			{
				if (toolBar.Visible)
				{
					toolBar.Visible = false;
				}
				else
				{
					toolBar.Visible = true;
				}
				break;
			}
		}
	}

	private void CleanUp()
	{
		checked
		{
			try
			{
				MyMenu = (Menu)NewLateBinding.LateGet(EspritApp.Menus, (Type)null, "item", new object[1] { 3 }, (string[])null, (Type[])null, (bool[])null);
				int count = MyMenu.Count;
				for (int i = 1; i <= count; i++)
				{
					MenuItem menuItem = MyMenu[i];
					if ((Operators.CompareString(menuItem.Name, "&工具栏...", false) == 0) | (Operators.CompareString(menuItem.Name, "&Toolbars...", false) == 0) | (Operators.CompareString(menuItem.Name, "툴바(&T)", false) == 0))
					{
						Menu subMenu = menuItem.SubMenu;
						try
						{
							subMenu.Remove("DentalAddin");
						}
						catch (Exception ex)
						{
							ProjectData.SetProjectError(ex);
							Exception ex2 = ex;
							ProjectData.ClearProjectError();
						}
						try
						{
							subMenu.Remove("Just a Separator");
						}
						catch (Exception ex3)
						{
							ProjectData.SetProjectError(ex3);
							Exception ex4 = ex3;
							ProjectData.ClearProjectError();
						}
						subMenu = null;
						break;
					}
				}
				for (int j = EspritApp.ToolBars.Count; j >= 35; j += -1)
				{
					TBar = EspritApp.ToolBars[j];
					if (Operators.CompareString(TBar.Name, "DentalAddin", false) == 0)
					{
						TBar = null;
						EspritApp.ToolBars.Remove("DentalAddin");
						break;
					}
				}
			}
			catch (Exception ex5)
			{
				ProjectData.SetProjectError(ex5);
				Exception ex6 = ex5;
				ProjectData.ClearProjectError();
			}
			try
			{
				TBar = EspritApp.ToolBars[5];
			}
			catch (Exception ex7)
			{
				ProjectData.SetProjectError(ex7);
				Exception ex8 = ex7;
				ProjectData.ClearProjectError();
			}
			try
			{
				while (((IToolBar)TBar).get_Item(TBar.Count).Command != 3055)
				{
					TBar.Remove(TBar.Count);
				}
			}
			catch (Exception ex9)
			{
				ProjectData.SetProjectError(ex9);
				Exception ex10 = ex9;
				ProjectData.ClearProjectError();
			}
		}
	}

	private static void EspritApp_AfterDocumentOpen(string FileName)
	{
		Document = EspritApp.Document;
	}

	private static void EspritApp_AfterNewDocumentOpen()
	{
		Document = EspritApp.Document;
	}

	private static void EspritApp_AfterTemplateOpen(string FileName)
	{
		Document = EspritApp.Document;
	}
}
}
