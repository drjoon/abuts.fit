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
internal sealed class TurningFeature_Module
{
	private const int FeatureSlotCapacity = 128;
	private static double TurnMaxAngle;

	public static void TurningMain()
	{
		MainModule.FirstFeatureNeed = 0;
		MainModule.NeedFirstFeature = 0;
		MainModule.MinF = 0;
		MainModule.SL = 1.0;
		TurningProfile();
		double halfBarDiameter = 0.0;
		double turningSpan = 0.0;
		double turningDepth = MainModule.TurningDepth;
		try
		{
			double barDiameter = MainModule.Document?.LatheMachineSetup?.BarDiameter ?? 0.0;
			halfBarDiameter = barDiameter / 2.0;
			turningSpan = halfBarDiameter - MainModule.LowerY;
		}
		catch (Exception ex)
		{
			DentalLogger.Log($"TurningMain: LatheMachineSetup 데이터 조회 실패 - {ex.Message}");
		}
		if (double.IsNaN(turningSpan) || double.IsInfinity(turningSpan) || turningSpan <= 0)
		{
			turningSpan = Math.Max(1.0, Math.Abs(MainModule.LowerY));
			DentalLogger.Log($"TurningMain: 유효하지 않은 TurningSpan, fallback 사용 (Span:{turningSpan}, LowerY:{MainModule.LowerY})");
		}
		if (double.IsNaN(turningDepth) || double.IsInfinity(turningDepth) || Math.Abs(turningDepth) < 1e-6)
		{
			turningDepth = Math.Max(0.5, turningSpan / 5.0);
			DentalLogger.Log($"TurningMain: TurningDepth 보정 - Original:{MainModule.TurningDepth}, Applied:{turningDepth}");
			MainModule.TurningDepth = turningDepth;
		}
		checked
		{
			MainModule.TurningTimes = (int)Conversion.Int(turningSpan / turningDepth);
			double turningRatio = turningSpan / turningDepth - (double)MainModule.TurningTimes;
			if (turningRatio > 0.1 && turningRatio + turningDepth > 1.05)
			{
				MainModule.TurningTimes++;
			}
			if (MainModule.TurningTimes == 2)
			{
				MainModule.TurningTimes = 3;
			}
			if (MainModule.TurningTimes == 1)
			{
				MainModule.TurningTimes = 2;
			}
			if (MainModule.TurningTimes >= 15)
			{
				MainModule.TurningTimes = 15;
			}
			MutipleProfile();
			MainModule.Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
			if (MainModule.TurningTimes > 2)
			{
				FeatureExchange();
				HandleTurningFeature();
				MainModule.Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
			}
			int count = MainModule.Document.FeatureChains.Count;
			for (int i = 1; i <= count && i <= MainModule.Document.FeatureChains.Count; i++)
			{
				MainModule.FC1 = MainModule.Document.FeatureChains[i];
				if ((Operators.CompareString(Strings.Left(MainModule.FC1.Name, 4), "Turn", false) == 0) & (MainModule.FC1.Length <= 0.001))
				{
					MainModule.Document.FeatureChains.Remove(i);
					i = 0;
				}
			}
			OffFrontFeature();
			MainModule.Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
			MainModule.FC1 = null;
			MainModule.FC2 = null;
			ExtendTurning();
			if (MainModule.FirstFeatureNeed == 1)
			{
				HandleFirstFeature();
			}
			MainModule.FC1 = null;
			MainModule.FC2 = null;
		}
	}

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
				if (((point2.X <= MoveSTL_Module.BackPointX) & (point3.X >= MoveSTL_Module.BackPointX)) || ((point2.X >= MoveSTL_Module.BackPointX) & (point3.X <= MoveSTL_Module.BackPointX)))
				{
					break;
				}
			}
			else if (((point2.X <= MoveSTL_Module.BackPointX) & (point3.X >= MoveSTL_Module.BackPointX)) || ((point2.X >= MoveSTL_Module.BackPointX) & (point3.X <= MoveSTL_Module.BackPointX)))
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
		point.Y = y;
		MainModule.LowerY = y;
		point = MainModule.tfc.Extremity(espExtremityType.espExtremityEnd);
		MainModule.EndXValue = point.X;
		if (MainModule.SpindleSide)
		{
			point.X -= MainModule.TurningExtend;
		}
		else
		{
			point.X += MainModule.TurningExtend;
		}
		point2 = MainModule.Document.GetPoint(x, y, 0);
		Segment segment = MainModule.Document.GetSegment(point2, point);
		MainModule.EndX = point.X;
		MainModule.EndY = y;
		MainModule.ExtendX = point.X;
		MainModule.tfc.Add(segment);
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
				/*Note: ILSpy has introduced the following switch to emulate a goto from catch-block to try-block*/;
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
					selectionSet.Add(MainModule.tfc, RuntimeHelpers.GetObjectValue(Missing.Value));
					selectionSet.Translate(0.0, (double)(MainModule.TurningTimes - i) * MainModule.TurningDepth, 0.0, 1);
					int count = MainModule.Document.FeatureChains.Count;
					for (int j = 1; j <= count; j++)
					{
						MainModule.FC1 = MainModule.Document.FeatureChains[j];
						if (Operators.CompareString(MainModule.FC1.Layer.Name, "MyLayer", false) == 0)
						{
							break;
						}
					}
					MainModule.FC1.Reverse();
					double Count = MainModule.FC1.Count;
					SearchSubNumber(ref Count, MainModule.Document.LatheMachineSetup.BarDiameter / 2.0, 1);
					int num = (int)Math.Round(MainModule.iLine);
					if (MainModule.iLine > (double)MainModule.FC1.Count)
					{
						MainModule.FC1.Name = "TurningProfile" + Conversions.ToString(i);
						MainModule.FC1.Layer = MainModule.Document.Layers["TurningLayer"];
						MainModule.FC1.Reverse();
					}
					else
					{
						MainModule.FC1.Name = "TurningProfile" + Conversions.ToString(i) + "_Gr" + Conversions.ToString(i);
						MainModule.FC1.Layer = MainModule.Document.Layers["TurningLayer"];
						MainModule.FC1.RemoveEnd(MainModule.iLine + 1.0);
						MainModule.FC1.Reverse();
						Point point = MainModule.FC1.Extremity(espExtremityType.espExtremityStart);
						selectionSet.Translate(0.0, (double)(MainModule.TurningTimes - i) * MainModule.TurningDepth, 0.0, 1);
						int count2 = MainModule.Document.FeatureChains.Count;
						for (int j = 1; j <= count2; j++)
						{
							MainModule.FC2 = MainModule.Document.FeatureChains[j];
							if (Operators.CompareString(MainModule.FC2.Layer.Name, "MyLayer", false) == 0)
							{
								break;
							}
						}
						MainModule.Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
						Count = MainModule.FC2.Count;
						SearchSubNumber(ref Count, MainModule.Document.LatheMachineSetup.BarDiameter / 2.0, 2);
						if (MainModule.iLine > (double)MainModule.FC2.Count)
						{
							MainModule.Document.FeatureChains.Remove(MainModule.FC2.Key);
							MainModule.FC2 = null;
						}
						else if (MainModule.iLine == (double)(MainModule.FC2.Count - num + 1))
						{
							MainModule.Document.FeatureChains.Remove(MainModule.FC2.Key);
							MainModule.FC2 = null;
						}
						else
						{
							MainModule.FC2.Name = "TurningProfile" + Conversions.ToString(i) + "_Front";
							MainModule.FC2.Layer = MainModule.Document.Layers["TurningLayer"];
							MainModule.FC2.RemoveEnd(MainModule.iLine + 1.0);
							if ((MainModule.FC2.Extremity(espExtremityType.espExtremityStart).Y > MainModule.Document.LatheMachineSetup.BarDiameter / 2.0) | (MainModule.FC2.Extremity(espExtremityType.espExtremityMiddle).Y > MainModule.Document.LatheMachineSetup.BarDiameter / 2.0))
							{
								MainModule.Document.FeatureChains.Remove(MainModule.FC2.Key);
								MainModule.FC2 = null;
							}
							else
							{
								Point point2 = MainModule.FC2.Extremity(espExtremityType.espExtremityEnd);
								if (Math.Sqrt((point.X - point2.X) * (point.X - point2.X) + (point.Y - point2.Y) * (point.Y - point2.Y)) < 0.5)
								{
									MainModule.Document.FeatureChains.Remove(MainModule.FC2.Key);
									MainModule.Document.FeatureChains.Remove(MainModule.FC1.Key);
									selectionSet.Translate(0.0, (double)(MainModule.TurningTimes - i) * MainModule.TurningDepth, 0.0, 1);
									int count3 = MainModule.Document.FeatureChains.Count;
									for (int j = 1; j <= count3; j++)
									{
										MainModule.FC1 = MainModule.Document.FeatureChains[j];
										if (Operators.CompareString(MainModule.FC1.Layer.Name, "MyLayer", false) == 0)
										{
											break;
										}
									}
									MainModule.FC1.Name = "TurningProfile" + Conversions.ToString(i);
									MainModule.FC1.Layer = MainModule.Document.Layers["TurningLayer"];
								}
							}
						}
					}
					MainModule.Document.Layers.Remove("MyLayer");
				}
				catch (Exception ex3)
				{
					ProjectData.SetProjectError(ex3);
					Exception ex4 = ex3;
					ProjectData.ClearProjectError();
				}
			}
		}
	}

	public static void FeatureExchange()
	{
		int try0000_dispatch = -1;
		int num2 = default(int);
		FeatureChain[] array = default(FeatureChain[]);
		int num = default(int);
		int num3 = default(int);
		int num5 = default(int);
		FeatureChain[] array2 = default(FeatureChain[]);
		int count = default(int);
		int num6 = default(int);
		int num7 = default(int);
		int num8 = default(int);
		int num9 = default(int);
		int num11 = default(int);
		FeatureChain featureChain = default(FeatureChain);
		FeatureChain featureChain2 = default(FeatureChain);
		int num12 = default(int);
		Point point = default(Point);
		Point point2 = default(Point);
		Segment segment = default(Segment);
		int count2 = default(int);
		int num13 = default(int);
		GraphicObject graphicObject = default(GraphicObject);
		int num14 = default(int);
		FeatureChain featureChain3 = default(FeatureChain);
		string text = default(string);
		while (true)
		{
			try
			{
				/*Note: ILSpy has introduced the following switch to emulate a goto from catch-block to try-block*/;
				checked
				{
					int num10;
					switch (try0000_dispatch)
					{
					default:
						num2 = 1;
						array = new FeatureChain[FeatureSlotCapacity];
						goto IL_000a;
					case 2176:
						{
							num = num2;
							switch (num3)
							{
							case 1:
								break;
							default:
								goto end_IL_0000;
							}
							int num4 = unchecked(num + 1);
							num = 0;
							switch (num4)
							{
							case 1:
								break;
							case 2:
								goto IL_000a;
							case 3:
								goto IL_0015;
							case 4:
								goto IL_0030;
							case 5:
								goto IL_004a;
							case 6:
								goto IL_005c;
							case 7:
								goto IL_006d;
							case 8:
								goto IL_0078;
							case 9:
								goto IL_0094;
							case 10:
								goto IL_00a7;
							case 11:
								goto IL_00b9;
							case 12:
								goto IL_00c5;
							case 13:
								goto IL_00e2;
							case 14:
								goto IL_00f5;
							case 15:
								goto IL_0107;
							case 16:
								goto IL_0113;
							case 17:
								goto IL_0131;
							case 18:
								goto IL_0144;
							case 19:
								goto IL_0157;
							case 20:
								goto IL_0164;
							case 21:
								goto IL_0176;
							case 22:
								goto IL_0188;
							case 23:
								goto IL_0194;
							case 24:
								goto IL_01b2;
							case 25:
								goto IL_01c4;
							case 26:
								goto IL_01ca;
							case 27:
								goto IL_01eb;
							case 28:
								goto IL_01f1;
							case 29:
								goto IL_01f7;
							case 30:
								goto IL_01fd;
							case 32:
								goto IL_0206;
							case 33:
								goto IL_020f;
							case 34:
								goto IL_0217;
							case 31:
							case 35:
								goto IL_021e;
							case 37:
								goto IL_0228;
							case 36:
							case 38:
								goto IL_0231;
							case 39:
								goto IL_0240;
							case 40:
								goto IL_0246;
							case 41:
								goto IL_0250;
							case 42:
								goto IL_0257;
							case 43:
								goto IL_025e;
							case 46:
								goto IL_0268;
							case 48:
								goto IL_0272;
							case 49:
								goto IL_0287;
							case 50:
								goto IL_0290;
							case 51:
								goto IL_0299;
							case 52:
								goto IL_02a2;
							case 53:
								goto IL_02a8;
							case 56:
								goto IL_02b3;
							case 55:
							case 57:
								goto IL_02c2;
							case 58:
								goto IL_02cc;
							case 59:
								goto IL_02d6;
							case 60:
								goto IL_02e8;
							case 61:
								goto IL_02f8;
							case 62:
								goto IL_0302;
							case 63:
								goto IL_030e;
							case 64:
								goto IL_0318;
							case 65:
								goto IL_0322;
							case 66:
								goto IL_034b;
							case 67:
								goto IL_0355;
							case 69:
								goto IL_038a;
							case 68:
							case 70:
								goto IL_03bd;
							case 71:
								goto IL_03d0;
							case 72:
								goto IL_03df;
							case 73:
								goto IL_03eb;
							case 74:
								goto IL_03fc;
							case 75:
								goto IL_040f;
							case 76:
								goto IL_041c;
							case 77:
								goto IL_0428;
							case 79:
								goto IL_0443;
							case 78:
							case 80:
								goto IL_0452;
							case 82:
								goto IL_046a;
							case 83:
								goto IL_048a;
							case 84:
								goto IL_049a;
							case 85:
								goto IL_04ab;
							case 86:
								goto IL_04ed;
							case 87:
								goto IL_04f9;
							case 81:
							case 88:
								goto IL_051a;
							case 89:
								goto IL_052b;
							case 90:
								goto IL_0538;
							case 91:
								goto IL_055f;
							case 92:
								goto IL_0577;
							case 93:
								goto IL_0583;
							case 94:
								goto IL_059c;
							case 95:
								goto IL_05b5;
							case 96:
								goto IL_05bb;
							case 97:
								goto IL_05c1;
							case 98:
								goto IL_05c7;
							case 99:
								goto IL_05d1;
							case 100:
								goto IL_05db;
							case 101:
								goto IL_05e5;
							case 102:
								goto IL_05ed;
							case 103:
								goto IL_0603;
							case 104:
								goto IL_0621;
							case 105:
								goto IL_0637;
							case 106:
								goto IL_0655;
							case 107:
								goto IL_066e;
							case 108:
								goto IL_0674;
							case 109:
								goto IL_067d;
							case 45:
							case 47:
							case 54:
							case 110:
								goto IL_068f;
							case 111:
								goto IL_0696;
							case 112:
								goto end_IL_0000_2;
							default:
								goto end_IL_0000;
							case 44:
							case 113:
								goto end_IL_0000_3;
							}
							goto default;
						}
						IL_01b2:
						num2 = 24;
						num5++;
						goto IL_01bb;
						IL_000a:
						num2 = 2;
						array2 = new FeatureChain[FeatureSlotCapacity];
						goto IL_0015;
						IL_0015:
						num2 = 3;
						count = MainModule.Document.FeatureChains.Count;
						num5 = 1;
						goto IL_01bb;
						IL_01bb:
						if (num5 <= count)
						{
							goto IL_0030;
						}
						goto IL_01c4;
						IL_01c4:
						num2 = 25;
						num6 = 0;
						goto IL_01ca;
						IL_01ca:
						num2 = 26;
						MainModule.Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
						goto IL_01eb;
						IL_01eb:
						num2 = 27;
						num7 = 0;
						goto IL_01f1;
						IL_01f1:
						num2 = 28;
						num8 = 0;
						goto IL_01f7;
						IL_01f7:
						num2 = 29;
						num5 = 1;
						goto IL_01fd;
						IL_01fd:
						num2 = 30;
						if (array[num5] != null)
						{
							goto IL_0206;
						}
						goto IL_021e;
						IL_0206:
						num2 = 32;
						num6++;
						goto IL_020f;
						IL_020f:
						num2 = 33;
						if (num6 == 1)
						{
							goto IL_0217;
						}
						goto IL_021e;
						IL_0217:
						num2 = 34;
						num8 = num5;
						goto IL_021e;
						IL_021e:
						num2 = 35;
						if (array2[num5] != null)
						{
							goto IL_0228;
						}
						goto IL_0231;
						IL_0228:
						num2 = 37;
						num7++;
						goto IL_0231;
						IL_0231:
						num2 = 38;
						num5++;
						if (num5 <= 12)
						{
							goto IL_01fd;
						}
						goto IL_0240;
						IL_0240:
						num2 = 39;
						num9 = 0;
						goto IL_0246;
						IL_0246:
						num2 = 40;
						MainModule.GrFeature = num7;
						goto IL_0250;
						IL_0250:
						num2 = 41;
						num5 = num8;
						goto IL_0257;
						IL_0257:
						ProjectData.ClearProjectError();
						num3 = 1;
						goto IL_025e;
						IL_025e:
						num2 = 43;
						if (num7 == 0)
						{
							goto end_IL_0000_3;
						}
						goto IL_0268;
						IL_0268:
						num2 = 46;
						if (num8 != 0)
						{
							goto IL_0272;
						}
						goto IL_068f;
						IL_0272:
						num2 = 48;
						num10 = num8;
						num11 = num6 + num8 - 1;
						num5 = num10;
						goto IL_0686;
						IL_0686:
						if (num5 <= num11)
						{
							goto IL_0287;
						}
						goto IL_068f;
						IL_0287:
						num2 = 49;
						num9++;
						goto IL_0290;
						IL_0290:
						num2 = 50;
						featureChain = array[num5];
						goto IL_0299;
						IL_0299:
						num2 = 51;
						if (num9 > num7)
						{
							goto IL_02a2;
						}
						goto IL_02b3;
						IL_02a2:
						num2 = 52;
						featureChain2 = null;
						goto IL_02a8;
						IL_02a8:
						num2 = 53;
						featureChain = null;
						goto IL_068f;
						IL_02b3:
						num2 = 56;
						featureChain2 = array2[num5 - num8 + 1];
						goto IL_02c2;
						IL_02c2:
						num2 = 57;
						MainModule.MaxYPoint(featureChain);
						goto IL_02cc;
						IL_02cc:
						num2 = 58;
						MainModule.FC1 = featureChain;
						goto IL_02d6;
						IL_02d6:
						num2 = 59;
						FindPointL(MainModule.MaxX, MainModule.MaxY);
						goto IL_02e8;
						IL_02e8:
						num2 = 60;
						num12 = (int)Math.Round(MainModule.iLine);
						goto IL_02f8;
						IL_02f8:
						num2 = 61;
						MainModule.CopyFeature(num5);
						goto IL_0302;
						IL_0302:
						num2 = 62;
						MainModule.DeleteFeature(num12, num5);
						goto IL_030e;
						IL_030e:
						num2 = 63;
						if (featureChain2 == null)
						{
							DentalLogger.Log("FeatureExchange: featureChain2 null - Reverse 생략");
							goto IL_068f;
						}
						featureChain2.Reverse();
						goto IL_0318;
						IL_0318:
						num2 = 64;
						MainModule.FC1 = featureChain2;
						goto IL_0322;
						IL_0322:
						num2 = 65;
						point = MainModule.Document.GetPoint(MainModule.MaxX, MainModule.MaxY, 0);
						goto IL_034b;
						IL_034b:
						num2 = 66;
						if (MainModule.SpindleSide)
						{
							goto IL_0355;
						}
						goto IL_038a;
						IL_0355:
						num2 = 67;
						point2 = MainModule.Document.GetPoint(MainModule.MaxX - 20.0, MainModule.MaxY, 0);
						goto IL_03bd;
						IL_038a:
						num2 = 69;
						point2 = MainModule.Document.GetPoint(MainModule.MaxX + 20.0, MainModule.MaxY, 0);
						goto IL_03bd;
						IL_03bd:
						num2 = 70;
						segment = MainModule.Document.GetSegment(point, point2);
						goto IL_03d0;
						IL_03d0:
						num2 = 71;
						Intersection2.Calculate(segment, MainModule.FC1);
						goto IL_03df;
						IL_03df:
						num2 = 72;
						if (MainModule.ptp[1] == null)
						{
							goto IL_03eb;
						}
						goto IL_046a;
						IL_03eb:
						num2 = 73;
						count2 = featureChain2.Count;
						num13 = 1;
						goto IL_044c;
						IL_044c:
						if (num13 <= count2)
						{
							goto IL_03fc;
						}
						goto IL_0452;
						IL_03fc:
						num2 = 74;
						graphicObject = (GraphicObject)((IFeatureChain)featureChain2).get_Item(num13);
						goto IL_040f;
						IL_040f:
						num2 = 75;
						if (graphicObject.GraphicObjectType == espGraphicObjectType.espSegment)
						{
							goto IL_041c;
						}
						goto IL_0443;
						IL_041c:
						num2 = 76;
						segment = (Segment)graphicObject;
						goto IL_0428;
						IL_0428:
						num2 = 77;
						if (!(segment.Length - MainModule.TurningExtend <= 0.01))
						{
							goto IL_0443;
						}
						goto IL_0452;
						IL_0452:
						num2 = 80;
						featureChain2.RemoveEnd(num13 + 1);
						goto IL_051a;
						IL_0443:
						num2 = 79;
						num13++;
						goto IL_044c;
						IL_046a:
						num2 = 82;
						FindPointL(MainModule.ptp[1].X, MainModule.ptp[1].Y);
						goto IL_048a;
						IL_048a:
						num2 = 83;
						num14 = (int)Math.Round(MainModule.iLine);
						goto IL_049a;
						IL_049a:
						num2 = 84;
						featureChain2.RemoveEnd(num14);
						goto IL_04ab;
						IL_04ab:
						num2 = 85;
						point = MainModule.Document.GetPoint(MainModule.ptp[1].X, MainModule.ptp[1].Y, MainModule.ptp[1].Z);
						goto IL_04ed;
						IL_04ed:
						num2 = 86;
						featureChain2.Add(point);
						goto IL_04f9;
						IL_04f9:
						num2 = 87;
						MainModule.Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
						goto IL_051a;
						IL_051a:
						num2 = 88;
						featureChain.RemoveEnd(num12);
						goto IL_052b;
						IL_052b:
						num2 = 89;
						point = featureChain.Extremity(espExtremityType.espExtremityEnd);
						goto IL_0538;
						IL_0538:
						num2 = 90;
						point2 = MainModule.Document.Points.Add(MainModule.MaxX, MainModule.MaxY, 0.0);
						goto IL_055f;
						IL_055f:
						num2 = 91;
						segment = MainModule.Document.Segments.Add(point, point2);
						goto IL_0577;
						IL_0577:
						num2 = 92;
						featureChain.Add(segment);
						goto IL_0583;
						IL_0583:
						num2 = 93;
						MainModule.Document.Points.Remove(point2.Key);
						goto IL_059c;
						IL_059c:
						num2 = 94;
						MainModule.Document.Segments.Remove(segment.Key);
						goto IL_05b5;
						IL_05b5:
						num2 = 95;
						point = null;
						goto IL_05bb;
						IL_05bb:
						num2 = 96;
						point2 = null;
						goto IL_05c1;
						IL_05c1:
						num2 = 97;
						segment = null;
						goto IL_05c7;
						IL_05c7:
						num2 = 98;
						featureChain2.Reverse();
						goto IL_05d1;
						IL_05d1:
						num2 = 99;
						MainModule.FC1 = featureChain;
						goto IL_05db;
						IL_05db:
						num2 = 100;
						MainModule.FC2 = featureChain2;
						goto IL_05e5;
						IL_05e5:
						num2 = 101;
						MainModule.Connect2Feature();
						goto IL_05ed;
						IL_05ed:
						num2 = 102;
						if (Strings.Len(MainModule.FC2.Name) == 15)
						{
							goto IL_0603;
						}
						goto IL_0621;
						IL_0603:
						num2 = 103;
						MainModule.FC1.Name = Strings.Left(MainModule.FC2.Name, 15);
						goto IL_0621;
						IL_0621:
						num2 = 104;
						if (Strings.Len(MainModule.FC2.Name) == 16)
						{
							goto IL_0637;
						}
						goto IL_0655;
						IL_0637:
						num2 = 105;
						MainModule.FC1.Name = Strings.Left(MainModule.FC2.Name, 16);
						goto IL_0655;
						IL_0655:
						num2 = 106;
						MainModule.Document.FeatureChains.Remove(featureChain2.Key);
						goto IL_066e;
						IL_066e:
						num2 = 107;
						featureChain2 = null;
						goto IL_0674;
						IL_0674:
						num2 = 108;
						MainModule.FC2 = null;
						goto IL_067d;
						IL_067d:
						num2 = 109;
						num5++;
						goto IL_0686;
						IL_068f:
						num2 = 110;
						if (num6 != 0)
						{
							break;
						}
						goto IL_0696;
						IL_0696:
						num2 = 111;
						MainModule.FirstFeatureNeed = 1;
						break;
						IL_0030:
						num2 = 4;
						featureChain3 = MainModule.Document.FeatureChains[num5];
						goto IL_004a;
						IL_004a:
						num2 = 5;
						if (Strings.Len(featureChain3.Name) == 15)
						{
							goto IL_005c;
						}
						goto IL_0094;
						IL_005c:
						num2 = 6;
						text = Strings.Right(featureChain3.Name, 1);
						goto IL_006d;
						IL_006d:
						num2 = 7;
						num6 = Conversions.ToInteger(text);
						goto IL_0078;
						IL_0078:
						num2 = 8;
						array[num6] = MainModule.Document.FeatureChains[num5];
						goto IL_0094;
						IL_0094:
						num2 = 9;
						if (Strings.Len(featureChain3.Name) == 16)
						{
							goto IL_00a7;
						}
						goto IL_00e2;
						IL_00a7:
						num2 = 10;
						text = Strings.Right(featureChain3.Name, 2);
						goto IL_00b9;
						IL_00b9:
						num2 = 11;
						num6 = Conversions.ToInteger(text);
						goto IL_00c5;
						IL_00c5:
						num2 = 12;
						array[num6] = MainModule.Document.FeatureChains[num5];
						goto IL_00e2;
						IL_00e2:
						num2 = 13;
						if (Strings.Len(featureChain3.Name) == 19)
						{
							goto IL_00f5;
						}
						goto IL_0131;
						IL_00f5:
						num2 = 14;
						text = Strings.Right(featureChain3.Name, 1);
						goto IL_0107;
						IL_0107:
						num2 = 15;
						num6 = Conversions.ToInteger(text);
						goto IL_0113;
						IL_0113:
						num2 = 16;
						array2[num6] = MainModule.Document.FeatureChains[num5];
						goto IL_0131;
						IL_0131:
						num2 = 17;
						if (Strings.Len(featureChain3.Name) == 21)
						{
							goto IL_0144;
						}
						goto IL_01b2;
						IL_0144:
						num2 = 18;
						text = Strings.Left(featureChain3.Name, 19);
						goto IL_0157;
						IL_0157:
						num2 = 19;
						text = Strings.Right(text, 2);
						goto IL_0164;
						IL_0164:
						num2 = 20;
						if (Operators.CompareString(text, "Gr", false) == 0)
						{
							goto IL_0176;
						}
						goto IL_01b2;
						IL_0176:
						num2 = 21;
						text = Strings.Right(featureChain3.Name, 2);
						goto IL_0188;
						IL_0188:
						num2 = 22;
						num6 = Conversions.ToInteger(text);
						goto IL_0194;
						IL_0194:
						num2 = 23;
						array2[num6] = MainModule.Document.FeatureChains[num5];
						goto IL_01b2;
						end_IL_0000_2:
						break;
					}
					num2 = 112;
					ReSequence();
					break;
				}
				end_IL_0000:;
			}
			catch (Exception ex) when (num3 != 0 && num == 0)
			{
				ProjectData.SetProjectError(ex);
				try0000_dispatch = 2176;
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

	public static void FindPointL(double TValue, double VValue)
	{
		double num = MainModule.FC1.Count;
		MainModule.iLine = 1.0;
		Point point = default(Point);
		Point point2 = default(Point);
		while (MainModule.iLine <= num)
		{
			GraphicObject graphicObject = (GraphicObject)((IFeatureChain)MainModule.FC1).get_Item(checked((int)Math.Round(MainModule.iLine)));
			if (graphicObject.GraphicObjectType == espGraphicObjectType.espArc)
			{
				Arc obj = (Arc)graphicObject;
				point = obj.Extremity(espExtremityType.espExtremityStart);
				point2 = obj.Extremity(espExtremityType.espExtremityEnd);
				if (point.X > point2.X)
				{
					double x = point2.X;
					double y = point2.Y;
					point2.X = point.X;
					point2.Y = point.Y;
					point.X = x;
					point.Y = y;
				}
			}
			if (graphicObject.GraphicObjectType == espGraphicObjectType.espSegment)
			{
				Segment obj2 = (Segment)graphicObject;
				point = obj2.Extremity(espExtremityType.espExtremityStart);
				point2 = obj2.Extremity(espExtremityType.espExtremityEnd);
				if (point.X > point2.X)
				{
					double x = point2.X;
					double y = point2.Y;
					point2.X = point.X;
					point2.Y = point.Y;
					point.X = x;
					point.Y = y;
				}
			}
			if ((Math.Abs(point.X - TValue) <= 0.001) | (Math.Abs(point2.X - TValue) <= 0.001))
			{
				if (point2.Y > point.Y)
				{
					if ((VValue > point.Y) & (VValue < point2.Y))
					{
						break;
					}
				}
				else if ((VValue < point.Y) & (VValue > point2.Y))
				{
					break;
				}
			}
			if (!((TValue > point.X) & (TValue < point2.X)))
			{
				MainModule.iLine += 1.0;
				continue;
			}
			break;
		}
	}

	public static void ReSequence()
	{
		FeatureChain[] array = new FeatureChain[13];
		FeatureChain[] array2 = new FeatureChain[13];
		MainModule.Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
		int count = MainModule.Document.FeatureChains.Count;
		checked
		{
			int num;
			int i;
			for (i = 1; i <= count; i++)
			{
				MainModule.FcM = MainModule.Document.FeatureChains[i];
				if (Strings.Len(MainModule.FcM.Name) == 15)
				{
					num = Conversions.ToInteger(Strings.Right(MainModule.FcM.Name, 1));
					array[num] = MainModule.Document.FeatureChains[i];
				}
				if (Strings.Len(MainModule.FcM.Name) == 16)
				{
					num = Conversions.ToInteger(Strings.Right(MainModule.FcM.Name, 2));
					array[num] = MainModule.Document.FeatureChains[i];
				}
				if (Strings.Len(MainModule.FcM.Name) == 19)
				{
					num = Conversions.ToInteger(Strings.Right(MainModule.FcM.Name, 1));
					array2[num] = MainModule.Document.FeatureChains[i];
				}
				if (Strings.Len(MainModule.FcM.Name) == 21 && Operators.CompareString(Strings.Right(Strings.Left(MainModule.FcM.Name, 19), 2), "Gr", false) == 0)
				{
					num = Conversions.ToInteger(Strings.Right(MainModule.FcM.Name, 2));
					array2[num] = MainModule.Document.FeatureChains[i];
				}
			}
			num = 1;
			i = 1;
			int num2 = default(int);
			do
			{
				if (array[i] != null)
				{
					if (num > MainModule.GrFeature)
					{
						break;
					}
					array[i].Name = Strings.Left(array[i].Name, 14) + Conversions.ToString(num);
					array[i].Layer = MainModule.Document.Layers["TurningLayer"];
					num2 = i;
					num++;
				}
				i++;
			}
			while (i <= 12);
			MainModule.Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
			i = 1;
			do
			{
				if (array2[i] != null)
				{
					array2[i].Name = Strings.Left(array2[i].Name, 14) + Conversions.ToString(num);
					array2[i].Layer = MainModule.Document.Layers["TurningLayer"];
					num++;
					MainModule.Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
					if (num2 != 0)
					{
						MainModule.FC1 = array[num2];
						MainModule.FC2 = array2[i];
						Intersection.DemoFc();
						if (MainModule.FcNumber[3] > 0)
						{
							double x = MainModule.ptp[3].X;
							MainModule.SearchSubNumberX(MainModule.FC2.Count, x, 2);
							MainModule.FC2.Reverse();
							MainModule.FC2.RemoveEnd((double)MainModule.FC2.Count - MainModule.iLine + 2.0);
							Point point = MainModule.FC2.Extremity(espExtremityType.espExtremityEnd);
							Point point2 = ((!MainModule.SpindleSide) ? MainModule.Document.Points.Add(point.X - Math.Cos(TurnMaxAngle) * 0.8, point.Y + Math.Sin(TurnMaxAngle) * 0.8, 0.0) : MainModule.Document.Points.Add(point.X + Math.Cos(TurnMaxAngle) * 0.8, point.Y + Math.Sin(TurnMaxAngle) * 0.8, 0.0));
							Segment segment = MainModule.Document.Segments.Add(point, point2);
							MainModule.FC2.Add(segment);
							MainModule.Document.Points.Remove(point2.Key);
							MainModule.Document.Segments.Remove(segment.Key);
							point2 = null;
							point = null;
							segment = null;
							MainModule.FC2.Reverse();
						}
						else if (MainModule.FcNumber[1] > 0)
						{
							double x = MainModule.ptp[1].X;
							MainModule.SearchSubNumberX(MainModule.FC2.Count, x, 2);
							MainModule.FC2.Reverse();
							MainModule.FC2.RemoveEnd((double)MainModule.FC2.Count - MainModule.iLine + 2.0);
							Point point = MainModule.FC2.Extremity(espExtremityType.espExtremityEnd);
							Point point2 = ((!MainModule.SpindleSide) ? MainModule.Document.Points.Add(point.X - Math.Cos(TurnMaxAngle) * 0.8, point.Y + Math.Sin(TurnMaxAngle) * 0.8, 0.0) : MainModule.Document.Points.Add(point.X + Math.Cos(TurnMaxAngle) * 0.8, point.Y + Math.Sin(TurnMaxAngle) * 0.8, 0.0));
							Segment segment = MainModule.Document.Segments.Add(point, point2);
							MainModule.FC2.Add(segment);
							MainModule.Document.Points.Remove(point2.Key);
							MainModule.Document.Segments.Remove(segment.Key);
							point2 = null;
							point = null;
							segment = null;
							MainModule.FC2.Reverse();
						}
						else if (MainModule.FcNumber[1] == 0)
						{
							MainModule.FC2.Reverse();
							Point point = MainModule.FC2.Extremity(espExtremityType.espExtremityEnd);
							Point point2 = ((!MainModule.SpindleSide) ? MainModule.Document.Points.Add(point.X - Math.Cos(TurnMaxAngle) * 0.8, point.Y + Math.Sin(TurnMaxAngle) * 0.8, 0.0) : MainModule.Document.Points.Add(point.X + Math.Cos(TurnMaxAngle) * 0.8, point.Y + Math.Sin(TurnMaxAngle) * 8.0, 0.0));
							Segment segment = MainModule.Document.Segments.Add(point, point2);
							MainModule.FC2.Add(segment);
							MainModule.Document.Points.Remove(point2.Key);
							MainModule.Document.Segments.Remove(segment.Key);
							point2 = null;
							point = null;
							segment = null;
							MainModule.FC2.Reverse();
						}
					}
				}
				i++;
			}
			while (i <= 12);
			for (i = num2 + 1; i <= 12; i++)
			{
				if (array[i] != null)
				{
					array[i].Name = Strings.Left(array[i].Name, 14) + Conversions.ToString(num);
					array[i].Layer = MainModule.Document.Layers["TurningLayer"];
					num++;
				}
			}
		}
	}

	public static void HandleTurningFeature()
	{
		int count = MainModule.Document.FeatureChains.Count;
		checked
		{
			for (int i = 1; i <= count && i <= MainModule.Document.FeatureChains.Count; i++)
			{
				MainModule.FC1 = MainModule.Document.FeatureChains[i];
				if ((Operators.CompareString(MainModule.FC1.Name, "TurningProfile1_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile2_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile3_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile4_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile5_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile6_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile7_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile8_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile9_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile10_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile11_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile12_Front", false) == 0))
				{
					MainModule.FC1.Extremity(espExtremityType.espExtremityEnd);
					if (MainModule.FC1.Length <= 1.0)
					{
						MainModule.Document.FeatureChains.Remove(MainModule.FC1.Key);
						MainModule.FC1 = null;
						i = 0;
					}
				}
			}
			int count2 = MainModule.Document.FeatureChains.Count;
			for (int i = 1; i <= count2; i++)
			{
				MainModule.FC1 = MainModule.Document.FeatureChains[i];
				if (Operators.CompareString(MainModule.FC1.Name, "TurningProfile1_Front", false) == 0)
				{
					MainModule.MinF = 1;
					break;
				}
			}
			int count3 = MainModule.Document.FeatureChains.Count;
			for (int i = 1; i <= count3; i++)
			{
				MainModule.FC1 = MainModule.Document.FeatureChains[i];
				if (Operators.CompareString(MainModule.FC1.Name, "TurningProfile2_Front", false) == 0)
				{
					MainModule.MinF = 2;
					break;
				}
			}
			int count4 = MainModule.Document.FeatureChains.Count;
			for (int i = 1; i <= count4; i++)
			{
				MainModule.FC1 = MainModule.Document.FeatureChains[i];
				if (Operators.CompareString(MainModule.FC1.Name, "TurningProfile3_Front", false) == 0)
				{
					MainModule.MinF = 3;
					break;
				}
			}
			int count5 = MainModule.Document.FeatureChains.Count;
			for (int i = 1; i <= count5; i++)
			{
				MainModule.FC1 = MainModule.Document.FeatureChains[i];
				if (Operators.CompareString(MainModule.FC1.Name, "TurningProfile4_Front", false) == 0)
				{
					MainModule.MinF = 4;
					break;
				}
			}
			int count6 = MainModule.Document.FeatureChains.Count;
			for (int i = 1; i <= count6; i++)
			{
				MainModule.FC1 = MainModule.Document.FeatureChains[i];
				if (Operators.CompareString(MainModule.FC1.Name, "TurningProfile5_Front", false) == 0)
				{
					MainModule.MinF = 5;
					break;
				}
			}
			int count7 = MainModule.Document.FeatureChains.Count;
			for (int i = 1; i <= count7; i++)
			{
				MainModule.FC1 = MainModule.Document.FeatureChains[i];
				if (Operators.CompareString(MainModule.FC1.Name, "TurningProfile6_Front", false) == 0)
				{
					MainModule.MinF = 6;
					break;
				}
			}
			int count8 = MainModule.Document.FeatureChains.Count;
			for (int i = 1; i <= count8; i++)
			{
				MainModule.FC1 = MainModule.Document.FeatureChains[i];
				if (Operators.CompareString(MainModule.FC1.Name, "TurningProfile7_Front", false) == 0)
				{
					MainModule.MinF = 7;
					break;
				}
			}
			int count9 = MainModule.Document.FeatureChains.Count;
			for (int i = 1; i <= count9; i++)
			{
				MainModule.FC1 = MainModule.Document.FeatureChains[i];
				if (Operators.CompareString(MainModule.FC1.Name, "TurningProfile8_Front", false) == 0)
				{
					MainModule.MinF = 8;
					break;
				}
			}
			int count10 = MainModule.Document.FeatureChains.Count;
			for (int i = 1; i <= count10; i++)
			{
				MainModule.FC1 = MainModule.Document.FeatureChains[i];
				if (Operators.CompareString(MainModule.FC1.Name, "TurningProfile9_Front", false) == 0)
				{
					MainModule.MinF = 9;
					break;
				}
			}
			int count11 = MainModule.Document.FeatureChains.Count;
			for (int i = 1; i <= count11; i++)
			{
				MainModule.FC1 = MainModule.Document.FeatureChains[i];
				if (Operators.CompareString(MainModule.FC1.Name, "TurningProfile10_Front", false) == 0)
				{
					MainModule.MinF = 10;
					break;
				}
			}
			int count12 = MainModule.Document.FeatureChains.Count;
			for (int i = 1; i <= count12; i++)
			{
				MainModule.FC1 = MainModule.Document.FeatureChains[i];
				if (Operators.CompareString(MainModule.FC1.Name, "TurningProfile11_Front", false) == 0)
				{
					MainModule.MinF = 11;
					break;
				}
			}
			int count13 = MainModule.Document.FeatureChains.Count;
			for (int i = 1; i <= count13; i++)
			{
				MainModule.FC1 = MainModule.Document.FeatureChains[i];
				if (Operators.CompareString(MainModule.FC1.Name, "TurningProfile12_Front", false) == 0)
				{
					MainModule.MinF = 12;
					break;
				}
			}
			int count14 = MainModule.Document.FeatureChains.Count;
			for (int i = 1; i <= count14 && i <= MainModule.Document.FeatureChains.Count; i++)
			{
				MainModule.FC1 = MainModule.Document.FeatureChains[i];
				if (MainModule.MinF == 12 && ((Operators.CompareString(MainModule.FC1.Name, "TurningProfile1_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile2_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile3_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile4_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile5_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile6_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile7_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile8_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile9_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile10_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile11_Front", false) == 0)))
				{
					MainModule.Document.FeatureChains.Remove(MainModule.FC1.Key);
					MainModule.FC1 = null;
					i = 0;
				}
				if (MainModule.MinF == 11 && ((Operators.CompareString(MainModule.FC1.Name, "TurningProfile1_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile2_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile3_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile4_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile5_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile6_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile7_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile8_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile9_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile10_Front", false) == 0)))
				{
					MainModule.Document.FeatureChains.Remove(MainModule.FC1.Key);
					MainModule.FC1 = null;
					i = 0;
				}
				if (MainModule.MinF == 10 && ((Operators.CompareString(MainModule.FC1.Name, "TurningProfile1_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile2_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile3_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile4_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile5_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile6_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile7_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile8_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile9_Front", false) == 0)))
				{
					MainModule.Document.FeatureChains.Remove(MainModule.FC1.Key);
					MainModule.FC1 = null;
					i = 0;
				}
				if (MainModule.MinF == 9 && ((Operators.CompareString(MainModule.FC1.Name, "TurningProfile1_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile2_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile3_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile4_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile5_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile6_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile7_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile8_Front", false) == 0)))
				{
					MainModule.Document.FeatureChains.Remove(MainModule.FC1.Key);
					MainModule.FC1 = null;
					i = 0;
				}
				if (MainModule.MinF == 8 && ((Operators.CompareString(MainModule.FC1.Name, "TurningProfile1_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile2_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile3_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile4_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile5_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile6_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile7_Front", false) == 0)))
				{
					MainModule.Document.FeatureChains.Remove(MainModule.FC1.Key);
					MainModule.FC1 = null;
					i = 0;
				}
				if (MainModule.MinF == 7 && ((Operators.CompareString(MainModule.FC1.Name, "TurningProfile1_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile2_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile3_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile4_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile5_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile6_Front", false) == 0)))
				{
					MainModule.Document.FeatureChains.Remove(MainModule.FC1.Key);
					MainModule.FC1 = null;
					i = 0;
				}
				if (MainModule.MinF == 6 && ((Operators.CompareString(MainModule.FC1.Name, "TurningProfile2_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile1_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile3_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile4_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile5_Front", false) == 0)))
				{
					MainModule.Document.FeatureChains.Remove(MainModule.FC1.Key);
					MainModule.FC1 = null;
					i = 0;
				}
				if (MainModule.MinF == 5 && ((Operators.CompareString(MainModule.FC1.Name, "TurningProfile2_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile1_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile3_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile4_Front", false) == 0)))
				{
					MainModule.Document.FeatureChains.Remove(MainModule.FC1.Key);
					MainModule.FC1 = null;
					i = 0;
				}
				if (MainModule.MinF == 4 && ((Operators.CompareString(MainModule.FC1.Name, "TurningProfile2_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile1_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile3_Front", false) == 0)))
				{
					MainModule.Document.FeatureChains.Remove(MainModule.FC1.Key);
					MainModule.FC1 = null;
					i = 0;
				}
				if (MainModule.MinF == 3 && ((Operators.CompareString(MainModule.FC1.Name, "TurningProfile2_Front", false) == 0) | (Operators.CompareString(MainModule.FC1.Name, "TurningProfile1_Front", false) == 0)))
				{
					MainModule.Document.FeatureChains.Remove(MainModule.FC1.Key);
					MainModule.FC1 = null;
					i = 0;
				}
				if (MainModule.MinF == 2 && Operators.CompareString(MainModule.FC1.Name, "TurningProfile1_Front", false) == 0)
				{
					MainModule.Document.FeatureChains.Remove(MainModule.FC1.Key);
					MainModule.FC1 = null;
					i = 0;
				}
			}
		}
	}

	public static void OffFrontFeature()
	{
		int try0000_dispatch = -1;
		int num2 = default(int);
		int num = default(int);
		int num3 = default(int);
		int num5 = default(int);
		int count = default(int);
		int num6 = default(int);
		SelectionSet selectionSet = default(SelectionSet);
		int num7 = default(int);
		Layer activeLayer = default(Layer);
		int count2 = default(int);
		Point point = default(Point);
		Point point2 = default(Point);
		int num8 = default(int);
		Point point3 = default(Point);
		int num9 = default(int);
		Point point4 = default(Point);
		while (true)
		{
			try
			{
				/*Note: ILSpy has introduced the following switch to emulate a goto from catch-block to try-block*/;
				checked
				{
					double Count;
					switch (try0000_dispatch)
					{
					default:
						num2 = 1;
						MainModule.FC1 = null;
						goto IL_0008;
					case 1748:
						{
							num = num2;
							switch (num3)
							{
							case 1:
								break;
							default:
								goto end_IL_0000;
							}
							int num4 = unchecked(num + 1);
							num = 0;
							switch (num4)
							{
							case 1:
								break;
							case 2:
								goto IL_0008;
							case 3:
								goto IL_001f;
							case 4:
								goto IL_003b;
							case 5:
								goto IL_0068;
							case 7:
								goto IL_006f;
							case 6:
							case 8:
								goto IL_007a;
							case 9:
								goto IL_0081;
							case 10:
								goto IL_008a;
							case 12:
								goto IL_0097;
							case 13:
								goto IL_00a9;
							case 14:
								goto IL_00b0;
							case 15:
								goto IL_00c9;
							case 16:
								goto IL_00d0;
							case 17:
								goto IL_00e9;
							case 18:
								goto IL_00f3;
							case 19:
								goto IL_010c;
							case 20:
								goto IL_0112;
							case 21:
								goto IL_012b;
							case 22:
								goto IL_013a;
							case 23:
								goto IL_0170;
							case 24:
								goto IL_0188;
							case 25:
								goto IL_01a5;
							case 27:
								goto IL_01c4;
							case 26:
							case 28:
								goto IL_01d0;
							case 29:
								goto IL_0201;
							case 30:
								goto IL_0216;
							case 31:
								goto IL_0232;
							case 33:
								goto IL_0240;
							case 34:
								goto IL_0261;
							case 35:
								goto IL_026e;
							case 36:
								goto IL_028a;
							case 37:
								goto IL_029f;
							case 39:
								goto IL_02ae;
							case 40:
								goto IL_02cf;
							case 38:
							case 41:
								goto IL_02dc;
							case 42:
								goto IL_02ec;
							case 43:
								goto IL_02fc;
							case 44:
								goto IL_0344;
							case 45:
								goto IL_0360;
							case 47:
								goto IL_036e;
							case 48:
								goto IL_0381;
							case 49:
								goto IL_03a5;
							case 50:
								goto IL_03c1;
							case 52:
								goto IL_03db;
							case 51:
							case 53:
								goto IL_03ea;
							case 54:
								goto IL_040e;
							case 55:
								goto IL_042a;
							case 57:
								goto IL_045e;
							case 56:
							case 58:
								goto IL_046d;
							case 59:
								goto IL_04c1;
							case 60:
								goto IL_04dd;
							case 62:
								goto IL_04eb;
							case 63:
								goto IL_04fb;
							case 64:
								goto IL_0510;
							case 65:
								goto IL_052c;
							case 67:
								goto IL_0537;
							case 68:
								goto IL_055a;
							case 69:
								goto IL_057b;
							case 32:
							case 46:
							case 61:
							case 66:
							case 70:
								goto end_IL_0000_2;
							default:
								goto end_IL_0000;
							case 11:
							case 71:
								goto end_IL_0000_3;
							}
							goto default;
						}
						IL_006f:
						num2 = 7;
						num5++;
						goto IL_0075;
						IL_0008:
						num2 = 2;
						count = MainModule.Document.FeatureChains.Count;
						num5 = 1;
						goto IL_0075;
						IL_0075:
						if (num5 <= count)
						{
							goto IL_001f;
						}
						goto IL_007a;
						IL_001f:
						num2 = 3;
						MainModule.FC1 = MainModule.Document.FeatureChains[num5];
						goto IL_003b;
						IL_003b:
						num2 = 4;
						if (Operators.CompareString(MainModule.FC1.Name, "TurningProfile" + Conversions.ToString(MainModule.MinF) + "_Front", false) == 0)
						{
							goto IL_0068;
						}
						goto IL_006f;
						IL_0068:
						num2 = 5;
						num6 = 1;
						goto IL_007a;
						IL_007a:
						num2 = 8;
						if (num6 != 1)
						{
							goto IL_0081;
						}
						goto IL_008a;
						IL_0081:
						num2 = 9;
						MainModule.FC1 = null;
						goto IL_008a;
						IL_008a:
						num2 = 10;
						if (MainModule.FC1 == null)
						{
							goto end_IL_0000_3;
						}
						goto IL_0097;
						IL_0097:
						num2 = 12;
						MainModule.FC1.Name = "TurningProfile1_Front";
						goto IL_00a9;
						IL_00a9:
						ProjectData.ClearProjectError();
						num3 = 1;
						goto IL_00b0;
						IL_00b0:
						num2 = 14;
						selectionSet = MainModule.Document.SelectionSets["Temp"];
						goto IL_00c9;
						IL_00c9:
						num2 = 15;
						if (selectionSet == null)
						{
							goto IL_00d0;
						}
						goto IL_00e9;
						IL_00d0:
						num2 = 16;
						selectionSet = MainModule.Document.SelectionSets.Add("Temp");
						goto IL_00e9;
						IL_00e9:
						num2 = 17;
						selectionSet.RemoveAll();
						goto IL_00f3;
						IL_00f3:
						num2 = 18;
						selectionSet.Add(MainModule.FC1, RuntimeHelpers.GetObjectValue(Missing.Value));
						goto IL_010c;
						IL_010c:
						num2 = 19;
						num7 = 2;
						goto IL_0112;
						IL_0112:
						num2 = 20;
						activeLayer = MainModule.Document.Layers.Add("MyLayer");
						goto IL_012b;
						IL_012b:
						num2 = 21;
						MainModule.Document.ActiveLayer = activeLayer;
						goto IL_013a;
						IL_013a:
						num2 = 22;
						selectionSet.Offset(MainModule.TurningDepth * 2.0 / 3.0 * (double)(num7 - 1), espOffsetSide.espOffsetLeft, ToolBlend: true, espLookAheadMode.espLookAheadOn, RuntimeHelpers.GetObjectValue(Missing.Value));
						goto IL_0170;
						IL_0170:
						num2 = 23;
						count2 = MainModule.Document.FeatureChains.Count;
						num5 = 1;
						goto IL_01cb;
						IL_01cb:
						if (num5 <= count2)
						{
							goto IL_0188;
						}
						goto IL_01d0;
						IL_0188:
						num2 = 24;
						MainModule.FC2 = MainModule.Document.FeatureChains[num5];
						goto IL_01a5;
						IL_01a5:
						num2 = 25;
						if (Operators.CompareString(MainModule.FC2.Layer.Name, "MyLayer", false) != 0)
						{
							goto IL_01c4;
						}
						goto IL_01d0;
						IL_01c4:
						num2 = 27;
						num5++;
						goto IL_01cb;
						IL_01d0:
						num2 = 28;
						Count = MainModule.FC2.Count;
						SearchSubNumber(ref Count, MainModule.Document.LatheMachineSetup.BarDiameter / 2.0, 2);
						goto IL_0201;
						IL_0201:
						num2 = 29;
						if (MainModule.iLine > (double)MainModule.FC2.Count)
						{
							goto IL_0216;
						}
						goto IL_0240;
						IL_0216:
						num2 = 30;
						MainModule.Document.FeatureChains.Remove(MainModule.FC2.Key);
						goto IL_0232;
						IL_0232:
						num2 = 31;
						MainModule.FC2 = null;
						break;
						IL_0240:
						num2 = 33;
						MainModule.FC2.RemoveEnd(MainModule.iLine + 1.0);
						goto IL_0261;
						IL_0261:
						num2 = 34;
						MainModule.FC2.Reverse();
						goto IL_026e;
						IL_026e:
						num2 = 35;
						MainModule.SearchSubNumberX(MainModule.FC2.Count, 0.0, 2);
						goto IL_028a;
						IL_028a:
						num2 = 36;
						if (MainModule.iLine > (double)MainModule.FC2.Count)
						{
							goto IL_029f;
						}
						goto IL_02ae;
						IL_029f:
						num2 = 37;
						MainModule.FC2.Reverse();
						goto IL_02dc;
						IL_02ae:
						num2 = 39;
						MainModule.FC2.RemoveEnd(MainModule.iLine + 1.0);
						goto IL_02cf;
						IL_02cf:
						num2 = 40;
						MainModule.FC2.Reverse();
						goto IL_02dc;
						IL_02dc:
						num2 = 41;
						point = MainModule.FC2.Extremity(espExtremityType.espExtremityEnd);
						goto IL_02ec;
						IL_02ec:
						num2 = 42;
						point2 = MainModule.FC2.Extremity(espExtremityType.espExtremityStart);
						goto IL_02fc;
						IL_02fc:
						num2 = 43;
						if ((point.X <= MainModule.TurningDepth) & (Math.Abs(point2.Y - MainModule.Document.LatheMachineSetup.BarDiameter / 2.0) < 0.5))
						{
							goto IL_0344;
						}
						goto IL_036e;
						IL_0344:
						num2 = 44;
						MainModule.Document.FeatureChains.Remove(MainModule.FC2.Key);
						goto IL_0360;
						IL_0360:
						num2 = 45;
						MainModule.FC2 = null;
						break;
						IL_036e:
						num2 = 47;
						if (MainModule.FC2.Count >= 1)
						{
							goto IL_0381;
						}
						goto IL_0537;
						IL_0381:
						num2 = 48;
						num8 = (int)Conversion.Int(MainModule.FC2.Length / 0.02);
						num6 = 1;
						goto IL_03e4;
						IL_03e4:
						if (num6 <= num8)
						{
							goto IL_03a5;
						}
						goto IL_03ea;
						IL_03a5:
						num2 = 49;
						point3 = MainModule.FC2.PointAlong(0.02 * (double)num6);
						goto IL_03c1;
						IL_03c1:
						num2 = 50;
						if (!(Math.Abs(point3.X) <= 0.025))
						{
							goto IL_03db;
						}
						goto IL_03ea;
						IL_03db:
						num2 = 52;
						num6++;
						goto IL_03e4;
						IL_03ea:
						num2 = 53;
						num9 = (int)Conversion.Int(MainModule.FC2.Length / 0.02);
						num6 = 1;
						goto IL_0467;
						IL_0467:
						if (num6 <= num9)
						{
							goto IL_040e;
						}
						goto IL_046d;
						IL_040e:
						num2 = 54;
						point4 = MainModule.FC2.PointAlong(0.02 * (double)num6);
						goto IL_042a;
						IL_042a:
						num2 = 55;
						if (!(Math.Abs(point4.Y - MainModule.Document.LatheMachineSetup.BarDiameter / 2.0) <= 0.025))
						{
							goto IL_045e;
						}
						goto IL_046d;
						IL_045e:
						num2 = 57;
						num6++;
						goto IL_0467;
						IL_046d:
						num2 = 58;
						if ((Math.Abs(point3.Y - MainModule.Document.LatheMachineSetup.BarDiameter / 2.0) <= 0.25) & (Math.Abs(point4.X) <= 0.25))
						{
							goto IL_04c1;
						}
						goto IL_04eb;
						IL_04c1:
						num2 = 59;
						MainModule.Document.FeatureChains.Remove(MainModule.FC2.Key);
						goto IL_04dd;
						IL_04dd:
						num2 = 60;
						MainModule.FC2 = null;
						break;
						IL_04eb:
						num2 = 62;
						point4 = MainModule.FC2.Extremity(espExtremityType.espExtremityEnd);
						goto IL_04fb;
						IL_04fb:
						num2 = 63;
						if (point4.X < 0.0)
						{
							goto IL_0510;
						}
						goto IL_0537;
						IL_0510:
						num2 = 64;
						MainModule.Document.FeatureChains.Remove(MainModule.FC2.Key);
						goto IL_052c;
						IL_052c:
						num2 = 65;
						MainModule.FC2 = null;
						break;
						IL_0537:
						num2 = 67;
						MainModule.FC2.Name = "TurningProfile" + Conversions.ToString(num7) + "_Front";
						goto IL_055a;
						IL_055a:
						num2 = 68;
						MainModule.FC2.Layer = MainModule.Document.Layers["TurningLayer"];
						goto IL_057b;
						IL_057b:
						num2 = 69;
						num7++;
						if (num7 > 8)
						{
							break;
						}
						goto IL_0112;
						end_IL_0000_2:
						break;
					}
					num2 = 70;
					MainModule.Document.Layers.Remove("MyLayer");
					break;
				}
				end_IL_0000:;
			}
			catch (Exception ex) when (num3 != 0 && num == 0)
			{
				ProjectData.SetProjectError(ex);
				try0000_dispatch = 1748;
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

	public static void ExtendTurning()
	{
		int count = MainModule.Document.FeatureChains.Count;
		checked
		{
			double x = default(double);
			for (int i = 1; i <= count; i++)
			{
				MainModule.FC1 = MainModule.Document.FeatureChains[i];
				if (MainModule.FC1 == null)
				{
					DentalLogger.Log($"ExtendTurning: FeatureChain[{i}]가 null입니다.");
					continue;
				}
				Point point = MainModule.FC1.Extremity(espExtremityType.espExtremityEnd);
				if (Operators.CompareString(MainModule.FC1.Name, "Turning", false) == 0)
				{
					point = MainModule.FC1.Extremity(espExtremityType.espExtremityEnd);
					double num = MainModule.Document.LatheMachineSetup.BarDiameter / 2.0;
					double chamferTan = Math.Tan(Math.PI * MainModule.Chamfer / 180.0);
					if (double.IsNaN(chamferTan) || Math.Abs(chamferTan) < 1e-6)
					{
						chamferTan = Math.Tan(Math.PI / 4.0);
						DentalLogger.Log($"ExtendTurning: Chamfer({MainModule.Chamfer})가 유효하지 않아 45도로 보정");
					}
					x = ((!MainModule.SpindleSide) ? (point.X + (num - point.Y) / chamferTan) : (point.X - (num - point.Y) / chamferTan));
					Point point2 = MainModule.Document.Points.Add(x, num, 0.0);
					Segment segment = MainModule.Document.Segments.Add(point, point2);
					TryAddSegment(MainModule.FC1, segment, "Turning");
					MainModule.Document.Points.Remove(point2.Key);
					MainModule.Document.Segments.Remove(segment.Key);
				}
				if (MainModule.SL != 1.0)
				{
					continue;
				}
				int num2 = 1;
				do
				{
					if (Operators.CompareString(MainModule.FC1.Name, "TurningProfile" + Conversions.ToString(num2), false) == 0)
					{
						if (MainModule.Chamfer != 90.0)
						{
							double chamferTan2 = Math.Tan(Math.PI * MainModule.Chamfer / 180.0);
							if (double.IsNaN(chamferTan2) || Math.Abs(chamferTan2) < 1e-6)
							{
								chamferTan2 = Math.Tan(Math.PI / 4.0);
								DentalLogger.Log($"ExtendTurning: Chamfer({MainModule.Chamfer}) 보정(프로파일)");
							}
							x = ((!MainModule.SpindleSide) ? (point.X + (double)(MainModule.TurningTimes - num2) * MainModule.TurningDepth / chamferTan2) : (point.X - (double)(MainModule.TurningTimes - num2) * MainModule.TurningDepth / chamferTan2));
						}
						double num = point.Y;
						Point point2 = MainModule.Document.Points.Add(x, num, 0.0);
						Segment segment = MainModule.Document.Segments.Add(point, point2);
						TryAddSegment(MainModule.FC1, segment, "TurningProfile");
						MainModule.Document.Points.Remove(point2.Key);
						MainModule.Document.Segments.Remove(segment.Key);
						point = null;
						point2 = null;
						segment = null;
						point = MainModule.Document.Points.Add(x, num, 0.0);
						num = MainModule.Document.LatheMachineSetup.BarDiameter / 2.0;
						x = ((!MainModule.SpindleSide) ? (point.X + (num - point.Y) / Math.Tan(Math.PI * MainModule.Chamfer / 180.0)) : (point.X - (num - point.Y) / Math.Tan(Math.PI * MainModule.Chamfer / 180.0)));
						point2 = MainModule.Document.Points.Add(x, num, 0.0);
						segment = MainModule.Document.Segments.Add(point, point2);
						TryAddSegment(MainModule.FC1, segment, "TurningProfileTop");
						MainModule.Document.Points.Remove(point.Key);
						MainModule.Document.Points.Remove(point2.Key);
						MainModule.Document.Segments.Remove(segment.Key);
					}
					num2++;
				}
				while (num2 <= 14);
			}
		}
	}

	public static void HandleFirstFeature()
	{
		int count = MainModule.Document.FeatureChains.Count;
		checked
		{
			FeatureChain featureChain = default(FeatureChain);
			for (int i = 1; i <= count; i++)
			{
				featureChain = MainModule.Document.FeatureChains[i];
				if (Operators.CompareString(featureChain.Name, "TurningProfile1_Front", false) == 0)
				{
					break;
				}
				featureChain = null;
			}
			Point point;
			if (featureChain == null)
			{
				point = ((!(MainModule.HighY > MainModule.Document.LatheMachineSetup.BarDiameter / 2.0 - 0.25)) ? MainModule.Document.Points.Add(0.0, MainModule.Document.LatheMachineSetup.BarDiameter / 2.0 - 0.25, 0.0) : MainModule.Document.Points.Add(0.0, MainModule.HighY + 0.05, 0.0));
			}
			else
			{
				Point point2 = featureChain.Extremity(espExtremityType.espExtremityEnd);
				point = ((!(MainModule.HighY > MainModule.Document.LatheMachineSetup.BarDiameter / 2.0 - 0.25)) ? MainModule.Document.Points.Add(point2.X - 1.0, MainModule.Document.LatheMachineSetup.BarDiameter / 2.0 - 0.25, 0.0) : MainModule.Document.Points.Add(point2.X - 1.0, MainModule.HighY + 0.05, 0.0));
			}
			int count2 = MainModule.Document.FeatureChains.Count;
			for (int j = 1; j <= count2; j++)
			{
				featureChain = MainModule.Document.FeatureChains[j];
				if (Operators.CompareString(featureChain.Name, "TurningProfile1", false) == 0)
				{
					break;
				}
			}
			if (featureChain != null)
			{
				Point point3 = featureChain.Extremity(espExtremityType.espExtremityStart);
				Point point4 = MainModule.Document.Points.Add(point3.X, point.Y, 0.0);
				featureChain.Reverse();
				featureChain.RemoveEnd(featureChain.Count);
				Point point5 = featureChain.Extremity(espExtremityType.espExtremityEnd);
				if (Math.Abs(point5.Y - MainModule.Document.LatheMachineSetup.BarDiameter / 2.0) <= 0.25)
				{
					featureChain.RemoveEnd(featureChain.Count);
					point5 = featureChain.Extremity(espExtremityType.espExtremityEnd);
				}
				Segment segment = MainModule.Document.Segments.Add(point5, point4);
				featureChain.Add(segment);
				MainModule.Document.Segments.Remove(segment.Key);
				segment = null;
				segment = MainModule.Document.Segments.Add(point4, point);
				featureChain.Add(segment);
				featureChain.Reverse();
				MainModule.Document.Points.Remove(point4.Key);
				MainModule.Document.Points.Remove(point.Key);
			}
		}
	}

	private static void TryAddSegment(FeatureChain featureChain, Segment segment, string context)
{
    if (featureChain == null)
    {
        DentalLogger.Log($"ExtendTurning:{context} - FeatureChain null (segment:{segment?.Key})");
        return;
    }
    if (segment == null)
    {
        DentalLogger.Log($"ExtendTurning:{context} - segment null");
        return;
    }

    try
    {
        featureChain.Add(segment);
    }
    catch (Exception ex)
    {
        DentalLogger.Log($"ExtendTurning:{context} - FeatureChain.Add 실패 (segment:{segment.Key}) - {ex.Message}");
        throw;
    }
}

	private static void SearchSubNumber(ref double Count, double Hvalue, byte Th)
	{
		double num = Count;
		MainModule.iLine = 1.0;
		Point point = default(Point);
		Point point2 = default(Point);
		while (MainModule.iLine <= num)
		{
			GraphicObject graphicObject = checked((Th != 1) ? ((GraphicObject)((IFeatureChain)MainModule.FC2).get_Item((int)Math.Round(MainModule.iLine))) : ((GraphicObject)((IFeatureChain)MainModule.FC1).get_Item((int)Math.Round(MainModule.iLine))));
			switch (graphicObject.GraphicObjectType)
			{
			case espGraphicObjectType.espArc:
			{
				Arc arc = (Arc)graphicObject;
				point = arc.Extremity(espExtremityType.espExtremityStart);
				point2 = arc.Extremity(espExtremityType.espExtremityEnd);
				if (point.X > point2.X)
				{
					point2 = arc.Extremity(espExtremityType.espExtremityStart);
					point = arc.Extremity(espExtremityType.espExtremityEnd);
				}
				break;
			}
			case espGraphicObjectType.espSegment:
			{
				Segment segment = (Segment)graphicObject;
				point = segment.Extremity(espExtremityType.espExtremityStart);
				point2 = segment.Extremity(espExtremityType.espExtremityEnd);
				if (point.X > point2.X)
				{
					point2 = segment.Extremity(espExtremityType.espExtremityStart);
					point = segment.Extremity(espExtremityType.espExtremityEnd);
				}
				break;
			}
			}
			if (!((Hvalue > point.Y) & (Hvalue <= point2.Y)) && !((Hvalue < point.Y) & (Hvalue >= point2.Y)))
			{
				MainModule.iLine += 1.0;
				continue;
			}
			break;
		}
	}

	public static void BackT()
	{
		FeatureChain[] array = new FeatureChain[7];
		double[] array2 = new double[5];
		double[] array3 = new double[5];
		int turningTimes = MainModule.TurningTimes;
		checked
		{
			for (int i = 1; i <= turningTimes; i++)
			{
				array2[2] = MainModule.EndXValue + MainModule.TurningExtend - 1.0;
				array3[2] = MainModule.LowerY + (double)(MainModule.TurningTimes - i) * MainModule.TurningDepth;
				array3[1] = MainModule.Document.LatheMachineSetup.BarDiameter / 2.0;
				array2[1] = array2[2] - (array3[1] - array3[2]) / Math.Tan(Math.PI * (90.0 - MainModule.Chamfer) / 180.0);
				array2[3] = array2[2] + MainModule.BackTurn + (double)(MainModule.TurningTimes - i) * MainModule.TurningDepth / Math.Tan(Math.PI * MainModule.Chamfer / 180.0);
				array3[3] = array3[2];
				array3[4] = array3[1];
				array2[4] = array2[3] + (array3[4] - array3[3]) / Math.Tan(Math.PI * MainModule.Chamfer / 180.0);
				Point point = MainModule.Document.Points.Add(array2[1], array3[1], 0.0);
				array[i] = MainModule.Document.FeatureChains.Add(point);
				array[i].Name = "Back_Turning_" + Conversions.ToString(i);
				MainModule.Document.Points.Remove(point.Key);
				point = MainModule.Document.Points.Add(array2[2], array3[2], 0.0);
				array[i].Add(point);
				MainModule.Document.Points.Remove(point.Key);
				point = MainModule.Document.Points.Add(array2[3], array3[3], 0.0);
				array[i].Add(point);
				MainModule.Document.Points.Remove(point.Key);
				point = MainModule.Document.Points.Add(array2[4], array3[4], 0.0);
				array[i].Add(point);
				MainModule.Document.Points.Remove(point.Key);
			}
		}
	}

#pragma warning restore CS0162
}
