using System;
using Esprit;
using Microsoft.VisualBasic.CompilerServices;

namespace DentalAddin
{

 [StandardModule]
 internal sealed class Clean_Module
 {
	public static void Clean()
	{
		int try0000_dispatch = -1;
		int num2 = default(int);
		int num = default(int);
		while (true)
		{
			try
			{
				/*Note: ILSpy has introduced the following switch to emulate a goto from catch-block to try-block*/;
				checked
				{
					switch (try0000_dispatch)
					{
					default:
					{
						MainModule.ProfileType = 0;
						MainModule.ProfileT = 0;
						MainModule.LowerY = 0.0;
						MainModule.HighY = 0.0;
						MainModule.iLine = 0.0;
						MainModule.HighY1 = 0.0;
						MainModule.HighY2 = 0.0;
						MainModule.FirstYy = 0.0;
						MainModule.Hdepth = 0.0;
						MainModule.Bdepth = 0.0;
						MainModule.FrontYvalue = 0.0;
						MainModule.FirstH = 0.0;
						MainModule.Dayu = 0;
						MainModule.TurningTimes = 0;
						MainModule.Ang = 0.0;
						MainModule.BtmY = 0.0;
						MainModule.MidX = 0.0;
						MainModule.roughm = 0;
						MainModule.EndX = 0.0;
						MainModule.EndY = 0.0;
						MainModule.n = 0;
						MainModule.m = 0;
						MainModule.tek = 0;
						MainModule.MidXc = 0.0;
						MainModule.Eror = 0;
						MainModule.MinF = 0;
						MainModule.Fcb1 = null;
						MainModule.seg = null;
						MainModule.Wp = null;
						MainModule.FC1 = null;
						MainModule.FC2 = null;
						MainModule.FC3 = null;
						MainModule.FC4 = null;
						MainModule.FC5 = null;
						MainModule.Fcc = null;
						MainModule.roughm = 0;
						MainModule.SS1 = null;
						MainModule.MidXc = 0.0;
						MainModule.Ss = null;
						MainModule.Px = 0.0;
						MainModule.Py = 0.0;
						MainModule.DeleteLine = 0;
						MainModule.DeleteOLine = 0;
						MainModule.Incline = 0.0;
						MainModule.Xmin = 0.0;
						MainModule.YWant = 0.0;
						MainModule.CPen = 0;
						MainModule.NeedEndPart = 0;
						MainModule.EndTimes = 0;
						MainModule.NeediLine = 0;
						MainModule.Jump = 0;
						ProjectData.ClearProjectError();
						num2 = 2;
						int count = MainModule.Document.FeatureChains.Count;
						if (count != 0)
						{
							int num3 = count;
							for (int i = 1; i <= num3; i++)
							{
								MainModule.Document.FeatureChains.Remove(count - i + 1);
							}
						}
						int count2 = MainModule.Document.Layers.Count;
						for (int i = 1; i <= count2 && i <= MainModule.Document.Layers.Count; i++)
						{
							Layer layer = MainModule.Document.Layers[i];
							if ((Operators.CompareString(layer.Name, "Boundry", false) == 0) | (Operators.CompareString(layer.Name, "TurningLayer", false) == 0) | (Operators.CompareString(layer.Name, "RoughMillingLayer", false) == 0) | (Operators.CompareString(layer.Name, "RotateCenter", false) == 0) | (Operators.CompareString(layer.Name, "GeoTemp", false) == 0) | (Operators.CompareString(layer.Name, "FreeFormLayer", false) == 0) | (Operators.CompareString(layer.Name, "FaceDrill", false) == 0) | (Operators.CompareString(layer.Name, "TurnOperation", false) == 0) | (Operators.CompareString(layer.Name, "RoughMillingOperation", false) == 0) | (Operators.CompareString(layer.Name, "FreeFormMill", false) == 0) | (Operators.CompareString(layer.Name, "EndTurning", false) == 0))
							{
								MainModule.Document.Layers.Remove(layer.Name);
								i = 0;
							}
						}
						break;
					}
					case 898:
						num = -1;
						switch (num2)
						{
						case 2:
							break;
						default:
							goto IL_03b8;
						}
						break;
					}
				}
			}
			catch (Exception ex) when (num2 != 0 && num == 0)
			{
				ProjectData.SetProjectError(ex);
				try0000_dispatch = 898;
				continue;
			}
			break;
			IL_03b8:
			throw ProjectData.CreateProjectError(-2146828237);
		}
		if (num != 0)
		{
			ProjectData.ClearProjectError();
		}
	}
 }
}
