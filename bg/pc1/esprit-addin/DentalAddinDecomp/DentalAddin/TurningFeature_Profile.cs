using System;
using System.Reflection;
using System.Runtime.CompilerServices;
using Esprit;
using EspritConstants;
using Microsoft.VisualBasic;
using Microsoft.VisualBasic.CompilerServices;

namespace DentalAddin;

#pragma warning disable CS0162

[StandardModule]
internal sealed class TurningFeature_Profile
{
	internal static double TurnMaxAngle;

	public static void TurningProfile()
	{
		SelectionSet selectionSet;
		try
		{
			selectionSet = MainModule.Document.SelectionSets["Temp"];
		}
		catch (Exception ex)
		{
			ProjectData.SetProjectError(ex);
			Exception ex2 = ex;
			selectionSet = MainModule.Document.SelectionSets.Add("Temp");
			ProjectData.ClearProjectError();
		}
		selectionSet.RemoveAll();
		foreach (GraphicObject item in MainModule.Document.GraphicsCollection)
		{
			if (item.GraphicObjectType == espGraphicObjectType.espSTL_Model)
			{
				selectionSet.Add(item, RuntimeHelpers.GetObjectValue(Missing.Value));
				break;
			}
		}
		_ = MainModule.Document.Layers.Count;
		Layer activeLayer;
		try
		{
			activeLayer = MainModule.Document.Layers.Add("TurningLayer");
		}
		catch (Exception ex3)
		{
			ProjectData.SetProjectError(ex3);
			Exception ex4 = ex3;
			activeLayer = MainModule.Document.Layers["TurningLayer"];
			ProjectData.ClearProjectError();
		}
		Plane plane = MainModule.Document.Planes["XYZ"];
		MainModule.Document.ActiveLayer = activeLayer;
		MainModule.Document.FeatureRecognition.CreateTurningProfile(selectionSet, plane, espTurningProfileType.espTurningProfileOD, espGraphicObjectReturnType.espFeatureChains, espTurningProfileLocationType.espTurningProfileLocationTop, 0.01, 0.01, 5.0);
		int num = 0;
		foreach (FeatureChain featureChain in MainModule.Document.FeatureChains)
		{
			if (Conversions.ToDouble(featureChain.Key) > (double)num)
			{
				num = Conversions.ToInteger(featureChain.Key);
			}
		}
		foreach (FeatureChain featureChain2 in MainModule.Document.FeatureChains)
		{
			MainModule.tfc = featureChain2;
			if (Conversions.ToDouble(MainModule.tfc.Key) == (double)num)
			{
				break;
			}
		}
		if (!MainModule.SpindleSide)
		{
			MainModule.tfc.Reverse();
		}
		MainModule.tfc.Name = "Turning";
		Point point = MainModule.tfc.Extremity(espExtremityType.espExtremityEnd);
		MainModule.XT = point.Y;
		MainModule.ZT = point.X;
		int count = MainModule.tfc.Count;
		int i;
		Point point3 = default(Point);
		double y = default(double);
		double x = default(double);
		Point point2 = default(Point);
		double trimX = (Math.Abs(MoveSTL_Module.FinishLineX) > 0.001) ? MoveSTL_Module.FinishLineX : MoveSTL_Module.BackPointX;
		DentalLogger.Log($"TurningProfile: trimX={trimX:F3} (FinishLineX={MoveSTL_Module.FinishLineX:F3}, BackPointX={MoveSTL_Module.BackPointX:F3})");
		for (i = 1; i <= count; i = checked(i + 1))
		{
			GraphicObject graphicObject = (GraphicObject)((IFeatureChain)MainModule.tfc).get_Item(i);
			if (graphicObject.GraphicObjectType == espGraphicObjectType.espArc)
			{
				Arc obj = (Arc)graphicObject;
				point2 = obj.Extremity(espExtremityType.espExtremityStart);
				point3 = obj.Extremity(espExtremityType.espExtremityEnd);
				if (MainModule.SpindleSide)
				{
					if (point2.X < point3.X)
					{
						y = point3.Y;
						x = point3.X;
					}
					else
					{
						y = point2.Y;
						x = point2.X;
					}
				}
				else if (point2.X > point3.X)
				{
					y = point3.Y;
					x = point3.X;
				}
				else
				{
					y = point2.Y;
					x = point2.X;
				}
			}
			if (graphicObject.GraphicObjectType == espGraphicObjectType.espSegment)
			{
				Segment obj2 = (Segment)graphicObject;
				point2 = obj2.Extremity(espExtremityType.espExtremityStart);
				point3 = obj2.Extremity(espExtremityType.espExtremityEnd);
				if (MainModule.SpindleSide)
				{
					if (point2.X < point3.X)
					{
						y = point3.Y;
						x = point3.X;
					}
					else
					{
						y = point2.Y;
						x = point2.X;
					}
				}
				else if (point2.X > point3.X)
				{
					y = point3.Y;
					x = point3.X;
				}
				else
				{
					y = point2.Y;
					x = point2.X;
				}
			}
			if (MainModule.SpindleSide)
			{
				if (((point2.X <= trimX) & (point3.X >= trimX)) || ((point2.X >= trimX) & (point3.X <= trimX)))
				{
					break;
				}
			}
			else if (((point2.X <= trimX) & (point3.X >= trimX)) || ((point2.X >= trimX) & (point3.X <= trimX)))
			{
				break;
			}
		}
		if (MoveSTL_Module.NonConnection)
		{
			x = point.X;
			y = point.Y;
		}
		else if (i <= MainModule.tfc.Count)
		{
			MainModule.tfc.RemoveEnd(i);
		}
		point = MainModule.tfc.Extremity(espExtremityType.espExtremityEnd);
		MainModule.LowerY = point.Y;
		MainModule.EndXValue = point.X;
		MainModule.EndX = point.X;
		MainModule.EndY = point.Y;
		MainModule.ExtendX = point.X;
		DentalLogger.Log($"TurningProfile: 트림 완료 trimX={trimX:F3} → EndX:{point.X:F3}, EndY:{point.Y:F3}");
		MainModule.TurningMaxYPoint(MainModule.tfc);
		TurnMaxAngle = Conversions.ToDouble(MaxAngle(MainModule.tfc));
		if (Math.Abs(TurnMaxAngle) <= 0.785)
		{
			TurnMaxAngle = Math.PI / 4.0;
		}
		MainModule.Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
	}

	public static object MaxAngle(FeatureChain Fc)
	{
		Point[] array = new Point[3];
		double num = 0.0;
		double num2 = Fc.Count;
		for (double num3 = 1.0; num3 <= num2; num3 += 1.0)
		{
			GraphicObject graphicObject = (GraphicObject)((IFeatureChain)Fc).get_Item(checked((int)Math.Round(num3)));
			if (graphicObject.GraphicObjectType != espGraphicObjectType.espSegment)
			{
				continue;
			}
			Segment segment = (Segment)graphicObject;
			array[1] = segment.Extremity(espExtremityType.espExtremityStart);
			array[2] = segment.Extremity(espExtremityType.espExtremityEnd);
			if ((array[2].Y < array[1].Y) & (segment.Length >= 0.35))
			{
				if (Math.Abs(array[2].X - array[1].X) <= 0.001)
				{
					num = Math.PI / 2.0;
				}
				else if (Math.Atan(Math.Abs((array[2].Y - array[1].Y) / (array[2].X - array[1].X))) > num)
				{
					num = Math.Atan(Math.Abs((array[2].Y - array[1].Y) / (array[2].X - array[1].X)));
				}
			}
		}
		return num;
	}

	public static void MutipleProfile()
	{
		if (MainModule.SL == 1.0)
		{
			if (MainModule.TurningTimes <= 1)
			{
				return;
			}
			if (MainModule.TurningTimes == 2)
			{
				FirstTwoTurningProfile();
			}
			else
			{
				TurningProfiles(checked(MainModule.TurningTimes - 1));
			}
		}
	}

	public static void FirstTwoTurningProfile()
	{
		int try0000_dispatch = -1;
		int num3 = default(int);
		int num = default(int);
		int num2 = default(int);
		SelectionSet selectionSet = default(SelectionSet);
		Layer activeLayer = default(Layer);
		int count = default(int);
		int num5 = default(int);
		while (true)
		{
			try
			{
				int num4;
				switch (try0000_dispatch)
				{
				default:
					ProjectData.ClearProjectError();
					num3 = 1;
					goto IL_0007;
				case 500:
					{
						num = num2;
						switch (num3)
						{
						case 2:
						case 3:
							break;
						case 1:
							goto IL_0184;
						default:
							goto end_IL_0000;
						}
						break;
					}
					IL_0184:
					num4 = num + 1;
					num = 0;
					switch (num4)
					{
					case 1:
						break;
					case 2:
						goto IL_0007;
					case 3:
						goto IL_001e;
					case 4:
						goto IL_0023;
					case 5:
						goto IL_003a;
					case 6:
						goto IL_0042;
					case 7:
						goto IL_0049;
					case 8:
						goto IL_0061;
					case 9:
						goto IL_006f;
					case 10:
						goto IL_0087;
					case 11:
						goto IL_00b6;
					case 12:
						goto IL_00cf;
					case 13:
						goto IL_00ed;
					case 15:
						goto IL_010c;
					case 14:
					case 16:
						goto IL_011b;
					case 17:
						goto IL_0122;
					case 18:
						goto IL_0134;
					case 19:
						goto IL_0155;
					case 20:
						goto IL_016c;
					case 22:
						goto end_IL_0000_2;
					default:
						goto end_IL_0000;
					case 21:
					case 23:
					case 24:
						goto end_IL_0000_3;
					}
					goto default;
					IL_0007:
					num2 = 2;
					selectionSet = MainModule.Document.SelectionSets["Temp"];
					goto IL_001e;
					IL_001e:
					num2 = 3;
					if (selectionSet == null)
					{
						goto IL_0023;
					}
					goto IL_003a;
					IL_0023:
					num2 = 4;
					selectionSet = MainModule.Document.SelectionSets.Add("Temp");
					goto IL_003a;
					IL_003a:
					num2 = 5;
					selectionSet.RemoveAll();
					goto IL_0042;
					IL_0042:
					ProjectData.ClearProjectError();
					num3 = 2;
					goto IL_0049;
					IL_0049:
					num2 = 7;
					activeLayer = MainModule.Document.Layers.Add("MyLayer");
					goto IL_0061;
					IL_0061:
					num2 = 8;
					MainModule.Document.ActiveLayer = activeLayer;
					goto IL_006f;
					IL_006f:
					num2 = 9;
					selectionSet.Add(MainModule.tfc, RuntimeHelpers.GetObjectValue(Missing.Value));
					goto IL_0087;
					IL_0087:
					num2 = 10;
					selectionSet.Translate(0.0, (double)checked(MainModule.TurningTimes - 1) * MainModule.TurningDepth, 0.0, 1);
					goto IL_00b6;
					IL_00b6:
					num2 = 11;
					count = MainModule.Document.FeatureChains.Count;
					num5 = 1;
					goto IL_0115;
					IL_0115:
					if (num5 <= count)
					{
						goto IL_00cf;
					}
					goto IL_011b;
					IL_00cf:
					num2 = 12;
					MainModule.FC1 = MainModule.Document.FeatureChains[num5];
					goto IL_00ed;
					IL_00ed:
					num2 = 13;
					if (Operators.CompareString(MainModule.FC1.Layer.Name, "MyLayer", false) != 0)
					{
						goto IL_010c;
					}
					goto IL_011b;
					IL_010c:
					num2 = 15;
					num5 = checked(num5 + 1);
					goto IL_0115;
					IL_011b:
					ProjectData.ClearProjectError();
					num3 = 3;
					goto IL_0122;
					IL_0122:
					num2 = 17;
					MainModule.FC1.Name = "TurningProfile1";
					goto IL_0134;
					IL_0134:
					num2 = 18;
					MainModule.FC1.Layer = MainModule.Document.Layers["TurningLayer"];
					goto IL_0155;
					IL_0155:
					num2 = 19;
					MainModule.Document.Layers.Remove("MyLayer");
					goto IL_016c;
					IL_016c:
					num2 = 20;
					if (MainModule.Eror == 0)
					{
						goto end_IL_0000_3;
					}
					break;
					end_IL_0000_2:
					break;
				}
				num2 = 22;
				MainModule.Eror = 1;
				break;
				end_IL_0000:;
			}
			catch (Exception ex) when (num3 != 0 && num == 0)
			{
				ProjectData.SetProjectError(ex);
				try0000_dispatch = 500;
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

	public static void TurningProfiles(int Num)
	{
		checked
		{
			for (int i = 1; i <= Num; i++)
			{
				SelectionSet selectionSet;
				try
				{
					selectionSet = MainModule.Document.SelectionSets.Add("Temp");
				}
				catch (Exception ex)
				{
					ProjectData.SetProjectError(ex);
					Exception ex2 = ex;
					selectionSet = MainModule.Document.SelectionSets["Temp"];
					ProjectData.ClearProjectError();
				}
				selectionSet.RemoveAll();
				try
				{
					Layer activeLayer = MainModule.Document.Layers.Add("MyLayer");
					MainModule.Document.ActiveLayer = activeLayer;

					// 원본 프로파일(MainModule.tfc)을 복사하여 Y축 방향으로만 오프셋
					// 이렇게 하면 동일한 형상을 유지하면서 깊이만 다르게 가공
					selectionSet.Add(MainModule.tfc, RuntimeHelpers.GetObjectValue(Missing.Value));
					double yOffset = (double)(MainModule.TurningTimes - i) * MainModule.TurningDepth;
					selectionSet.Translate(0.0, yOffset, 0.0, 1);

					int count = MainModule.Document.FeatureChains.Count;
					for (int j = 1; j <= count; j++)
					{
						MainModule.FC1 = MainModule.Document.FeatureChains[j];
						if (Operators.CompareString(MainModule.FC1.Layer.Name, "MyLayer", false) == 0)
						{
							break;
						}
					}

					// 프로파일 이름 설정 및 레이어 할당
					MainModule.FC1.Name = "TurningProfile" + Conversions.ToString(i);
					MainModule.FC1.Layer = MainModule.Document.Layers["TurningLayer"];

					DentalLogger.Log($"TurningProfiles: Profile {i} 생성 - Y offset: {yOffset:F3}");

					MainModule.Document.Layers.Remove("MyLayer");
				}
				catch (Exception ex3)
				{
					ProjectData.SetProjectError(ex3);
					Exception ex4 = ex3;
					DentalLogger.LogException($"TurningProfiles: Profile {i} 생성 실패", ex4);
					ProjectData.ClearProjectError();
				}
			}
		}
	}
}

#pragma warning restore CS0162
