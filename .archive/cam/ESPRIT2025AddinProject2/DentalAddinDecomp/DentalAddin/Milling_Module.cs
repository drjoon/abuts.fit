using System;
using System.Reflection;
using System.Runtime.CompilerServices;
using Esprit;
using EspritConstants;
using Microsoft.VisualBasic;
using Microsoft.VisualBasic.CompilerServices;

namespace DentalAddin
{

 [StandardModule]
 internal sealed class Milling_Module
 {
	public static void MillingStart()
	{
		//IL_0681: Unknown result type (might be due to invalid IL or missing references)
		checked
		{
			try
			{
				int count = MainModule.Document.Layers.Count;
				Layer layer;
				int i;
				for (i = 1; i <= count; i++)
				{
					layer = MainModule.Document.Layers[i];
					if (Operators.CompareString(layer.Name, "RoughMillingLayer", false) == 0)
					{
						MainModule.Document.Layers.Remove("RoughMillingLayer");
					}
				}
				i = 0;
				layer = MainModule.Document.Layers.Add("RoughMillingLayer");
				Point point = MainModule.Document.GetPoint(0, 0, 0);
				Point point2 = MainModule.Document.GetPoint(15, 0, 0);
				Layer activeLayer;
				try
				{
					activeLayer = MainModule.Document.Layers.Add("RotateCenter");
				}
				catch (Exception ex)
				{
					ProjectData.SetProjectError(ex);
					Exception ex2 = ex;
					activeLayer = MainModule.Document.Layers["RotateCenter"];
					ProjectData.ClearProjectError();
				}
				MainModule.Document.ActiveLayer = activeLayer;
				MainModule.seg = MainModule.Document.GetSegment(point, point2);
				MainModule.SS1 = MainModule.Document.SelectionSets["Temp1"];
				if (MainModule.SS1 == null)
				{
					MainModule.SS1 = MainModule.Document.SelectionSets.Add("Temp1");
				}
				MainModule.SS1.RemoveAll();
				foreach (GraphicObject item in MainModule.Document.GraphicsCollection)
				{
					if (item.GraphicObjectType == espGraphicObjectType.espSTL_Model)
					{
						MainModule.SS1.Add(item, RuntimeHelpers.GetObjectValue(Missing.Value));
					}
				}
				MainModule.Wp = MainModule.Document.Planes["XYZ"];
				MainModule.Document.ActiveLayer = layer;
				MainModule.TurningBoth();
				MainModule.Document.ActiveLayer = layer;
				if (MoveSTL_Module.NonConnection)
				{
					if (MainModule.RL == 1.0)
					{
						MoveSTL_Module.BackPointX += 0.5;
					}
					else
					{
						MoveSTL_Module.BackPointX -= 0.5;
					}
				}
				MainModule.n = 0;
				do
				{
					MainModule.Ang = Math.PI * 10.0 * (double)MainModule.n / 180.0;
					RotatePart();
					MainModule.Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
					Layer activeLayer2;
					try
					{
						activeLayer2 = MainModule.Document.Layers.Add("MillingGeoLayer");
					}
					catch (Exception ex3)
					{
						ProjectData.SetProjectError(ex3);
						Exception ex4 = ex3;
						activeLayer2 = MainModule.Document.Layers["MillingGeoLayer"];
						ProjectData.ClearProjectError();
					}
					MainModule.Document.ActiveLayer = activeLayer2;
					MainModule.GenerateGeometry();
					MainModule.Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
					MainModule.HandleFeature();
					MainModule.Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
					try
					{
						MainModule.Document.Layers.Remove("MillingGeoLayer");
					}
					catch (Exception ex5)
					{
						ProjectData.SetProjectError(ex5);
						Exception ex6 = ex5;
						ProjectData.ClearProjectError();
					}
					MainModule.CompareArea();
					MainModule.Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
					if (MainModule.SS1 == null)
					{
						MainModule.SS1 = MainModule.Document.SelectionSets.Add("Temp1");
					}
					MainModule.SS1.RemoveAll();
					foreach (GraphicObject item2 in MainModule.Document.GraphicsCollection)
					{
						if (item2.GraphicObjectType == espGraphicObjectType.espSTL_Model)
						{
							MainModule.SS1.Add(item2, RuntimeHelpers.GetObjectValue(Missing.Value));
						}
					}
					RotatePartBack();
					MainModule.Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
					MainModule.n++;
				}
				while (MainModule.n <= 17);
				MainModule.Document.FeatureChains.Remove(MainModule.FC1.Key);
				MainModule.Document.FeatureChains.Remove(MainModule.FC2.Key);
				MainModule.Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
				MainModule.PickupFinal();
				MainModule.roughm = 1;
				MainModule.EspritApp.Processing = false;
				int angNumber = MainModule.AngNumber;
				for (i = 1; i <= angNumber; i++)
				{
					if (MainModule.RL == 1.0)
					{
						MainModule.Xmin = 50.0;
					}
					else if (MainModule.RL == 2.0)
					{
						MainModule.Xmin = -50.0;
					}
					MainModule.YWant = -10.0;
					MainModule.GenerateMillFeature(i);
					MainModule.Document.ActiveLayer = layer;
					if (MainModule.FC1 != null)
					{
						MainModule.OffsetMulti(i);
					}
					int count2 = MainModule.Document.FeatureChains.Count;
					for (int j = 1; j <= count2; j++)
					{
						MainModule.FC2 = MainModule.Document.FeatureChains[j];
						if (Operators.CompareString(Strings.Left(MainModule.FC2.Name, 10), "RoughMill" + Conversions.ToString(i), false) == 0)
						{
							MainModule.SS1.Add(MainModule.FC2, RuntimeHelpers.GetObjectValue(Missing.Value));
						}
					}
					RotatePartBack();
					int count3 = MainModule.Document.FeatureChains.Count;
					for (int j = 1; j <= count3; j++)
					{
						MainModule.FC2 = MainModule.Document.FeatureChains[j];
						if (Operators.CompareString(Strings.Left(MainModule.FC2.Name, 10), "RoughMill" + Conversions.ToString(i), false) == 0)
						{
							MainModule.SS1.Remove(MainModule.FC2);
							MainModule.Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
						}
						if (MainModule.SS1.Count == 1)
						{
							break;
						}
					}
					MainModule.FC1 = null;
					MainModule.FC2 = null;
					MainModule.FC3 = null;
					MainModule.FC4 = null;
					MainModule.FC5 = null;
					MainModule.Fcc = null;
					MainModule.Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
				}
			}
			catch (Exception ex7)
			{
				ProjectData.SetProjectError(ex7);
				Exception ex8 = ex7;
				Interaction.MsgBox((object)ex8.Message, (MsgBoxStyle)0, (object)null);
				ProjectData.ClearProjectError();
			}
			int count4 = MainModule.Document.FeatureSets.Count;
			FeatureSet featureSet;
			for (int k = 1; k <= count4; k++)
			{
				featureSet = MainModule.Document.FeatureSets[k];
				if (Operators.CompareString(featureSet.Name, "RoughMill", false) == 0)
				{
					MainModule.Document.FeatureSets.Remove(k);
					break;
				}
			}
			featureSet = MainModule.Document.FeatureSets.Add(RuntimeHelpers.GetObjectValue(Missing.Value));
			featureSet.Name = "RoughMill";
			featureSet.Layer = MainModule.Document.Layers["RoughMillingLayer"];
			int count5 = MainModule.Document.FeatureChains.Count;
			for (int l = 1; l <= count5; l++)
			{
				FeatureChain featureChain = MainModule.Document.FeatureChains[l];
				if (Operators.CompareString(Strings.Left(featureChain.Name, 9), "RoughMill", false) == 0)
				{
					featureSet.Add(featureChain);
				}
			}
		}
	}

	public static void RotatePartBack()
	{
		Point point = MainModule.Document.GetPoint(0, 0, 0);
		Point point2 = MainModule.Document.GetPoint(10, 0, 0);
		MainModule.seg = MainModule.Document.GetSegment(point, point2);
		MainModule.SS1.Rotate(MainModule.seg, -1.0 * MainModule.Ang, 0);
	}

	public static void RotatePart()
	{
		Point point = MainModule.Document.GetPoint(0, 0, 0);
		Point point2 = MainModule.Document.GetPoint(10, 0, 0);
		MainModule.seg = MainModule.Document.GetSegment(point, point2);
		MainModule.SS1.Rotate(MainModule.seg, MainModule.Ang, 0);
	}
}
