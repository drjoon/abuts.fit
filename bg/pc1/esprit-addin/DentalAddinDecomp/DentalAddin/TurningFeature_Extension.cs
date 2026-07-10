using System;
using System.Globalization;
using System.Reflection;
using System.Runtime.CompilerServices;
using Esprit;
using EspritConstants;
using Microsoft.VisualBasic;
using Microsoft.VisualBasic.CompilerServices;

namespace DentalAddin;

#pragma warning disable CS0162

[StandardModule]
internal sealed class TurningFeature_Extension
{
	public static void ExtendTurning()
	{
		int count = MainModule.Document.FeatureChains.Count;
		checked
		{
			double topY = MainModule.Document.LatheMachineSetup.BarDiameter / 2.0;
			double turningExtend = MainModule.TurningExtend;
			string finishMinZRaw = Environment.GetEnvironmentVariable("ABUTS_FINISHLINE_MIN_Z");
			if (!string.IsNullOrWhiteSpace(finishMinZRaw) && double.TryParse(finishMinZRaw, NumberStyles.Float, CultureInfo.InvariantCulture, out double finishLineMinZ) && !double.IsNaN(finishLineMinZ) && !double.IsInfinity(finishLineMinZ))
			{
				turningExtend = 6.0 - finishLineMinZ;
				DentalLogger.Log($"ExtendTurning: TurningExtend override 적용 - 6.0 - finishLineMinZ({finishLineMinZ.ToString("F4", CultureInfo.InvariantCulture)}) = {turningExtend.ToString("F4", CultureInfo.InvariantCulture)}");
			}
			else
			{
				DentalLogger.Log($"ExtendTurning: ABUTS_FINISHLINE_MIN_Z 미사용('{finishMinZRaw ?? ""}'), 기존 TurningExtend({turningExtend.ToString("F4", CultureInfo.InvariantCulture)}) 사용");
			}
			double chamfer = MainModule.Chamfer;

			// 모든 패스의 끝점 X 좌표 중 최대값 찾기
			double maxEndX = MainModule.EndXValue;
			for (int i = 1; i <= count; i++)
			{
				FeatureChain fc = MainModule.Document.FeatureChains[i];
				if (fc == null) continue;

				bool isTurning = (Operators.CompareString(fc.Name, "Turning", false) == 0);
				bool isProfile = false;
				if (!isTurning && MainModule.SL == 1.0)
				{
					for (int p = 1; p <= 14; p++)
					{
						if (Operators.CompareString(fc.Name, "TurningProfile" + Conversions.ToString(p), false) == 0)
						{
							isProfile = true;
							break;
						}
					}
				}

				if (isTurning || isProfile)
				{
					Point pt = fc.Extremity(espExtremityType.espExtremityEnd);
					if (!MainModule.SpindleSide)
						maxEndX = Math.Max(maxEndX, pt.X);
					else
						maxEndX = Math.Min(maxEndX, pt.X);
				}
			}

			// 공통 기준 X: TurningExtend 반영
			double commonVerticalX;
			if (!MainModule.SpindleSide)
				commonVerticalX = maxEndX + turningExtend;
			else
				commonVerticalX = maxEndX - turningExtend;

			MainModule.ExtendX = commonVerticalX;
			DentalLogger.Log($"ExtendTurning: maxEndX:{maxEndX:F3}, topY:{topY:F3}, turningExtend:{turningExtend:F3}, chamfer:{chamfer:F3}, commonBaseX:{commonVerticalX:F3}");

			for (int i = 1; i <= count; i++)
			{
				MainModule.FC1 = MainModule.Document.FeatureChains[i];
				if (MainModule.FC1 == null)
				{
					DentalLogger.Log($"ExtendTurning: FeatureChain[{i}]가 null입니다.");
					continue;
				}

				bool isTurning = (Operators.CompareString(MainModule.FC1.Name, "Turning", false) == 0);
				bool isProfile = false;
				if (!isTurning && MainModule.SL == 1.0)
				{
					for (int p = 1; p <= 14; p++)
					{
						if (Operators.CompareString(MainModule.FC1.Name, "TurningProfile" + Conversions.ToString(p), false) == 0)
						{
							isProfile = true;
							break;
						}
					}
				}

				if (!isTurning && !isProfile)
					continue;

				Point point = MainModule.FC1.Extremity(espExtremityType.espExtremityEnd);
				double currentY = point.Y;
				double currentX = point.X;
				string label = MainModule.FC1.Name;

				// 1단계: 기준 X까지 수평 이동
				Point pBase = MainModule.Document.Points.Add(commonVerticalX, currentY, 0.0);
				Segment segBase = MainModule.Document.Segments.Add(point, pBase);
				TurningFeature_Utility.TryAddSegment(MainModule.FC1, segBase, label + "_Base");
				MainModule.Document.Points.Remove(pBase.Key);
				MainModule.Document.Segments.Remove(segBase.Key);

				// 2단계: Exit angle(Chamfer) 반영하여 topY까지 상승
				double rise = topY - currentY;
				double endX = commonVerticalX;
				if (rise > 0.0001)
				{
					if (Math.Abs(chamfer - 90.0) > 0.001 && Math.Abs(Math.Tan(Math.PI * chamfer / 180.0)) > 1e-6)
					{
						double dx = rise / Math.Tan(Math.PI * chamfer / 180.0);
						endX = (!MainModule.SpindleSide) ? commonVerticalX + dx : commonVerticalX - dx;
					}
					Point pRiseStart = MainModule.Document.Points.Add(commonVerticalX, currentY, 0.0);
					Point pRiseEnd = MainModule.Document.Points.Add(endX, topY, 0.0);
					Segment segRise = MainModule.Document.Segments.Add(pRiseStart, pRiseEnd);
					TurningFeature_Utility.TryAddSegment(MainModule.FC1, segRise, label + "_Rise");
					MainModule.Document.Points.Remove(pRiseStart.Key);
					MainModule.Document.Points.Remove(pRiseEnd.Key);
					MainModule.Document.Segments.Remove(segRise.Key);
				}

				DentalLogger.Log($"ExtendTurning: {label} - currentX:{currentX:F3}, currentY:{currentY:F3}, baseX:{commonVerticalX:F3}, endX:{endX:F3}, rise:{rise:F3}, chamfer:{chamfer:F3}");
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
						TurningFeature_Utility.SearchSubNumber(ref Count, MainModule.Document.LatheMachineSetup.BarDiameter / 2.0, 2);
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

	public static void BackT()
	{
		FeatureChain[] array = new FeatureChain[7];
		double[] array2 = new double[5];
		double[] array3 = new double[5];
		int turningTimes = MainModule.TurningTimes;
		double backTurningExtend = MainModule.TurningExtend;
		string finishMinZRaw = Environment.GetEnvironmentVariable("ABUTS_FINISHLINE_MIN_Z");
		if (!string.IsNullOrWhiteSpace(finishMinZRaw) && double.TryParse(finishMinZRaw, NumberStyles.Float, CultureInfo.InvariantCulture, out double finishLineMinZ) && !double.IsNaN(finishLineMinZ) && !double.IsInfinity(finishLineMinZ))
		{
			backTurningExtend = Math.Max(0.0, 6.0 - finishLineMinZ);
			DentalLogger.Log($"BackT: TurningExtend override 적용 - 6.0 - finishLineMinZ({finishLineMinZ.ToString("F4", CultureInfo.InvariantCulture)}) = {backTurningExtend.ToString("F4", CultureInfo.InvariantCulture)}");
		}
		else
		{
			DentalLogger.Log($"BackT: ABUTS_FINISHLINE_MIN_Z 미사용('{finishMinZRaw ?? ""}'), 기존 TurningExtend({backTurningExtend.ToString("F4", CultureInfo.InvariantCulture)}) 유지");
		}
		checked
		{
			for (int i = 1; i <= turningTimes; i++)
			{
				double legacyStartX = MainModule.EndXValue + backTurningExtend - 1.0;
				double stockNearStartX = MoveSTL_Module.FrontPointX;
				array2[2] = (!MainModule.SpindleSide)
					? Math.Max(legacyStartX, stockNearStartX)
					: Math.Min(legacyStartX, stockNearStartX);
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
}

#pragma warning restore CS0162
