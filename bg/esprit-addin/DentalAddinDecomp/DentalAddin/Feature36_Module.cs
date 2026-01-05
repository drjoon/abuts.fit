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
 internal sealed class Feature36_Module
 {
	public static FeatureChain[] ffc = new FeatureChain[37];

	public static Plane[] PL = new Plane[37];

	public static double LimitX;

	public static void Main_Feature()
	{
		LimitX = MoveSTL_Module.BackPointX;
		CreatePlanes();
		GetProfiles();
		ScanRoughFeature();
	}

	public static void CreatePlanes()
	{
		Plane PL = MainModule.Document.Planes["XYZ"];
		double num = MainModule.AngleNumber - 1.0;
		checked
		{
			for (double num2 = 0.0; num2 <= num; num2 += 1.0)
			{
				Feature36_Module.PL[(int)Math.Round(num2)] = MainModule.Document.Planes.Add("Temp" + Conversions.ToString(num2));
				CopyPlane(ref PL, ref Feature36_Module.PL[(int)Math.Round(num2)]);
				Feature36_Module.PL[(int)Math.Round(num2)].RotateUVW(Math.PI * MainModule.SemiAngle * num2 / 180.0, 0.0, 0.0);
			}
		}
	}

	public static void CopyPlane(ref Plane PL, ref Plane NewPL)
	{
		NewPL.IsView = false;
		NewPL.IsWork = true;
		NewPL.Ux = PL.Ux;
		NewPL.Uy = PL.Uy;
		NewPL.Uz = PL.Uz;
		NewPL.Vx = PL.Vx;
		NewPL.Vy = PL.Vy;
		NewPL.Vz = PL.Vz;
		NewPL.Wx = PL.Wx;
		NewPL.Wy = PL.Wy;
		NewPL.Wz = PL.Wz;
		NewPL.X = PL.X;
		NewPL.Y = PL.Y;
		NewPL.Z = PL.Z;
	}

	public static void GetProfiles()
	{
		Layer activeLayer;
		try
		{
			activeLayer = MainModule.Document.Layers.Add("GeoTemp");
		}
		catch (Exception ex)
		{
			ProjectData.SetProjectError(ex);
			Exception ex2 = ex;
			activeLayer = MainModule.Document.Layers["GeoTemp"];
			ProjectData.ClearProjectError();
		}
		MainModule.Document.ActiveLayer = activeLayer;
		int count = MainModule.Document.GraphicsCollection.Count;
		SelectionSet selectionSet;
		int num;
		checked
		{
			STL_Model sTL_Model = default(STL_Model);
			for (int i = 1; i <= count; i++)
			{
				if (MainModule.Document.GraphicsCollection[i].GraphicObjectType == espGraphicObjectType.espSTL_Model)
				{
					sTL_Model = (STL_Model)MainModule.Document.GraphicsCollection[i];
					break;
				}
			}
			if (sTL_Model == null)
			{
				sTL_Model = (STL_Model)MainModule.Document.GetAnyElement("Select the STL Model.", RuntimeHelpers.GetObjectValue(Missing.Value));
			}
			try
			{
				selectionSet = MainModule.Document.SelectionSets.Add("Temp");
			}
			catch (Exception ex3)
			{
				ProjectData.SetProjectError(ex3);
				Exception ex4 = ex3;
				selectionSet = MainModule.Document.SelectionSets["Temp"];
				ProjectData.ClearProjectError();
			}
			selectionSet.Clear();
			selectionSet.Add(sTL_Model, RuntimeHelpers.GetObjectValue(Missing.Value));
			MainModule.EspritApp.Configuration.ConfigurationFeatureRecognition.Tolerance = 0.01;
			num = (int)Math.Round(MainModule.AngleNumber - 1.0);
		}
		for (int j = 0; j <= num; j = checked(j + 1))
		{
			MoveSTL_Module.FeatureList();
			MainModule.Document.ActivePlane = PL[j];
			MainModule.Document.FeatureRecognition.CreatePartProfileShadow(selectionSet, PL[j], espGraphicObjectReturnType.espFeatureChains);
			FeatureChain fc = MoveSTL_Module.NewFeature();
			ffc[j] = MainModule.ChangeStartPointFc(fc);
			Point point = ffc[j].PointAlong(0.0);
			Point point2 = ffc[j].PointAlong(1.0);
			if (Math.Abs(point.X - point2.X) <= 0.01)
			{
				ffc[j].Reverse();
				MainModule.Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
				point = ffc[j].PointAlong(0.0);
				point2 = ffc[j].PointAlong(1.0);
			}
			if (Math.Abs(point.X) < Math.Abs(point2.X))
			{
				ffc[j].Reverse();
				MainModule.Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
			}
			DeleteBackPart(ffc[j]);
			ffc[j] = GetOffsetNewFc(ffc[j]);
			ffc[j].Name = Conversions.ToString(j) + " FeatureChain";
			ffc[j].Plane = PL[j];
			if ((double)j > MainModule.AngleNumber / 2.0)
			{
				if (j % 2 == 1)
				{
					ffc[j].Reverse();
				}
			}
			else if ((double)j <= MainModule.AngleNumber / 2.0 && j % 2 != 1)
			{
				ffc[j].Reverse();
			}
		}
	}

	public static void DeleteBackPart(FeatureChain Fc)
	{
		Point[] array = new Point[3];
		int num = Fc.Count;
		int count = Fc.Count;
		for (int i = 10; i <= count; i = checked(i + 1))
		{
			GraphicObject graphicObject = (GraphicObject)((IFeatureChain)Fc).get_Item(i);
			if (graphicObject.GraphicObjectType == espGraphicObjectType.espSegment)
			{
				Segment segment = (Segment)graphicObject;
				if (Math.Abs(segment.Extremity(espExtremityType.espExtremityMiddle).X) > Math.Abs(LimitX))
				{
					num = i;
					break;
				}
			}
			if (graphicObject.GraphicObjectType == espGraphicObjectType.espArc)
			{
				Arc arc = (Arc)graphicObject;
				if (Math.Abs(arc.Extremity(espExtremityType.espExtremityMiddle).X) > Math.Abs(LimitX))
				{
					num = i;
					break;
				}
			}
		}
		Fc.RemoveEnd(num);
		if (MoveSTL_Module.NonConnection)
		{
			GraphicObject graphicObject = (GraphicObject)((IFeatureChain)Fc).get_Item(Fc.Count);
			if (graphicObject.GraphicObjectType == espGraphicObjectType.espSegment)
			{
				Segment segment = (Segment)graphicObject;
				array[1] = segment.Extremity(espExtremityType.espExtremityStart);
				array[2] = segment.Extremity(espExtremityType.espExtremityEnd);
			}
			if (graphicObject.GraphicObjectType == espGraphicObjectType.espArc)
			{
				Arc arc = (Arc)graphicObject;
				array[1] = arc.Extremity(espExtremityType.espExtremityStart);
				array[2] = arc.Extremity(espExtremityType.espExtremityEnd);
			}
			if (Math.Abs(array[1].X - array[2].X) <= 0.01)
			{
				Fc.RemoveEnd(Fc.Count);
			}
			Fc.Reverse();
			MainModule.Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
			graphicObject = (GraphicObject)((IFeatureChain)Fc).get_Item(Fc.Count);
			if (graphicObject.GraphicObjectType == espGraphicObjectType.espSegment)
			{
				Segment segment = (Segment)graphicObject;
				array[1] = segment.Extremity(espExtremityType.espExtremityStart);
				array[2] = segment.Extremity(espExtremityType.espExtremityEnd);
			}
			if (graphicObject.GraphicObjectType == espGraphicObjectType.espArc)
			{
				Arc arc = (Arc)graphicObject;
				array[1] = arc.Extremity(espExtremityType.espExtremityStart);
				array[2] = arc.Extremity(espExtremityType.espExtremityEnd);
			}
			if (Math.Abs(array[1].X - array[2].X) <= 0.01)
			{
				Fc.RemoveEnd(Fc.Count);
			}
			Fc.Reverse();
			MainModule.Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
		}
	}

	public static FeatureChain GetOffsetNewFc(FeatureChain Fc)
	{
		SelectionSet selectionSet = MainModule.Document.SelectionSets["SSFC"];
		if (selectionSet == null)
		{
			selectionSet = MainModule.Document.SelectionSets.Add("SSFC");
		}
		selectionSet.RemoveAll();
		selectionSet.Add(Fc, RuntimeHelpers.GetObjectValue(Missing.Value));
		selectionSet.AddCopiesToSelectionSet = true;
		selectionSet.Offset(0.01, espOffsetSide.espOffsetRight, ToolBlend: true, espLookAheadMode.espLookAheadOn, RuntimeHelpers.GetObjectValue(Missing.Value));
		FeatureChain result = (FeatureChain)selectionSet[2];
		selectionSet.RemoveAll();
		MainModule.Document.FeatureChains.Remove(Fc.Key);
		return result;
	}

	public static void ScanRoughFeature()
	{
		int count = MainModule.Document.FeatureSets.Count;
		checked
		{
			FeatureSet featureSet;
			for (int i = 1; i <= count; i++)
			{
				featureSet = MainModule.Document.FeatureSets[i];
				if (Operators.CompareString(featureSet.Name, "Semi_Rough", false) == 0)
				{
					MainModule.Document.FeatureSets.Remove(i);
					break;
				}
			}
			featureSet = MainModule.Document.FeatureSets.Add(RuntimeHelpers.GetObjectValue(Missing.Value));
			featureSet.Name = "Semi_Rough";
			int count2 = MainModule.Document.FeatureChains.Count;
			for (int i = 1; i <= count2; i++)
			{
				FeatureChain featureChain = MainModule.Document.FeatureChains[i];
				if (Operators.CompareString(Strings.Right(featureChain.Name, 12), "FeatureChain", false) == 0)
				{
					ExtendFeature(featureChain);
					featureSet.Add(featureChain);
				}
			}
		}
	}

	public static void ExtendFeature(FeatureChain Fc)
	{
		Point point = Fc.PointAlong(Fc.Length);
		double num = MainModule.Document.LatheMachineSetup.BarDiameter / 2.0;
		Point point2 = ((MainModule.RL != 1.0) ? MainModule.Document.GetPoint(MainModule.ExtendX + 0.5, point.Y, point.Z) : MainModule.Document.GetPoint(MainModule.ExtendX - 0.5, point.Y, point.Z));
		double num2 = num - Math.Sqrt(Math.Pow(point2.Y, 2.0) + Math.Pow(point2.Z, 2.0));
		double num4 = default(double);
		if (MainModule.Chamfer == 90.0)
		{
			num4 = point2.X;
		}
		else if (MainModule.SpindleSide)
		{
			double offset = num2 / Math.Tan(Math.PI * MainModule.Chamfer / 180.0);
			num4 = point2.X - offset;
		}
		else
		{
			double offset = num2 / Math.Tan(Math.PI * MainModule.Chamfer / 180.0);
			num4 = point2.X + offset;
		}
		double num5 = default(double);
		double num6 = default(double);
		if (point2.Z == 0.0)
		{
			num5 = 0.0;
			num6 = ((!(point2.Y > 0.0)) ? (0.0 - num) : num);
		}
		else if (point2.Z > 0.0)
		{
			num5 = num / Math.Sqrt(1.0 + Math.Pow(point2.Y, 2.0) / Math.Pow(point2.Z, 2.0));
			num6 = num5 * point2.Y / point2.Z;
		}
		else if (point2.Z < 0.0)
		{
			num5 = (0.0 - num) / Math.Sqrt(1.0 + Math.Pow(point2.Y, 2.0) / Math.Pow(point2.Z, 2.0));
			num6 = num5 * point2.Y / point2.Z;
		}
		Point point3 = MainModule.Document.GetPoint(num4, num6, num5);
		Fc.Add(point2);
		Fc.Add(point3);
		Fc.Reverse();
		MainModule.Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
		point = Fc.PointAlong(Fc.Length);
		point2 = ((MainModule.RL != 1.0) ? MainModule.Document.GetPoint(MainModule.ExtendX + 0.5, point.Y, point.Z) : MainModule.Document.GetPoint(MainModule.ExtendX - 0.5, point.Y, point.Z));
		num2 = num - Math.Sqrt(Math.Pow(point2.Y, 2.0) + Math.Pow(point2.Z, 2.0));
		if (MainModule.Chamfer == 90.0)
		{
			num4 = point2.X;
		}
		else if (MainModule.SpindleSide)
		{
			double offset2 = num2 / Math.Tan(Math.PI * MainModule.Chamfer / 180.0);
			num4 = point2.X - offset2;
		}
		else
		{
			double offset2 = num2 / Math.Tan(Math.PI * MainModule.Chamfer / 180.0);
			num4 = point2.X + offset2;
		}
		if (point2.Z == 0.0)
		{
			num6 = ((!(point2.Y > 0.0)) ? (0.0 - num) : num);
		}
		else if (point2.Z > 0.0)
		{
			num5 = num / Math.Sqrt(1.0 + Math.Pow(point2.Y, 2.0) / Math.Pow(point2.Z, 2.0));
			num6 = num5 * point2.Y / point2.Z;
		}
		else if (point2.Z < 0.0)
		{
			num5 = (0.0 - num) / Math.Sqrt(1.0 + Math.Pow(point2.Y, 2.0) / Math.Pow(point2.Z, 2.0));
			num6 = num5 * point2.Y / point2.Z;
		}
		point3 = MainModule.Document.GetPoint(num4, num6, num5);
		Fc.Add(point2);
		Fc.Add(point3);
		Fc.Reverse();
		MainModule.Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
	}
 }
}
