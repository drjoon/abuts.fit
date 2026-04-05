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
internal sealed class TurningFeature_FeatureChain
{
	private const int FeatureSlotCapacity = 128;

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
						TurningFeature_Utility.FindPointL(MainModule.MaxX, MainModule.MaxY);
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
						TurningFeature_Utility.FindPointL(MainModule.ptp[1].X, MainModule.ptp[1].Y);
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
							Point point2 = ((!MainModule.SpindleSide) ? MainModule.Document.Points.Add(point.X - Math.Cos(TurningFeature_Profile.TurnMaxAngle) * 0.8, point.Y + Math.Sin(TurningFeature_Profile.TurnMaxAngle) * 0.8, 0.0) : MainModule.Document.Points.Add(point.X + Math.Cos(TurningFeature_Profile.TurnMaxAngle) * 0.8, point.Y + Math.Sin(TurningFeature_Profile.TurnMaxAngle) * 0.8, 0.0));
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
							Point point2 = ((!MainModule.SpindleSide) ? MainModule.Document.Points.Add(point.X - Math.Cos(TurningFeature_Profile.TurnMaxAngle) * 0.8, point.Y + Math.Sin(TurningFeature_Profile.TurnMaxAngle) * 0.8, 0.0) : MainModule.Document.Points.Add(point.X + Math.Cos(TurningFeature_Profile.TurnMaxAngle) * 0.8, point.Y + Math.Sin(TurningFeature_Profile.TurnMaxAngle) * 0.8, 0.0));
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
							Point point2 = ((!MainModule.SpindleSide) ? MainModule.Document.Points.Add(point.X - Math.Cos(TurningFeature_Profile.TurnMaxAngle) * 0.8, point.Y + Math.Sin(TurningFeature_Profile.TurnMaxAngle) * 0.8, 0.0) : MainModule.Document.Points.Add(point.X + Math.Cos(TurningFeature_Profile.TurnMaxAngle) * 0.8, point.Y + Math.Sin(TurningFeature_Profile.TurnMaxAngle) * 8.0, 0.0));
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
				if (MainModule.MinF == 1 && Operators.CompareString(MainModule.FC1.Name, "TurningProfile1_Front", false) == 0)
				{
					MainModule.Document.FeatureChains.Remove(MainModule.FC1.Key);
					MainModule.FC1 = null;
					i = 0;
				}
			}
		}
	}
}

#pragma warning restore CS0162
