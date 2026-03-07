using System;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using Esprit;
using EspritGeometry;
using EspritGeometryBase;
using EspritGeometryRoutines;
using Microsoft.VisualBasic;
using Microsoft.VisualBasic.CompilerServices;

#pragma warning disable CS0162

namespace DentalAddin
{

 [StandardModule]
 internal sealed class Intersection
 {
	[SpecialName]
	private static GeoUtility _0024STATIC_0024GetGeoUtility_002400128278_0024MyGeoUtility;

	public static void DemoFc()
	{
		int num = 1;
		MainModule.FcNumber[1] = 0;
		MainModule.FcNumber[2] = 0;
		MainModule.FcNumber[3] = 0;
		MainModule.FcNumber[4] = 0;
		MainModule.FcNumber[5] = 0;
		MainModule.FcNumber[6] = 0;
		int count = MainModule.FC2.Count;
		checked
		{
			int j = default(int);
			for (int i = 1; i <= count; i++)
			{
				object obj = MainModule.FC2.ComGeoBaseItem(i);
				if (Operators.ConditionalCompareObjectEqual(NewLateBinding.LateGet(obj, (Type)null, "Type", new object[0], (string[])null, (Type[])null, (bool[])null), (object)geoElementType.geoArc, false))
				{
					int count2 = MainModule.FC1.Count;
					for (j = 1; j <= count2; j++)
					{
						object obj2 = MainModule.FC1.ComGeoBaseItem(j);
						if (Operators.ConditionalCompareObjectEqual(NewLateBinding.LateGet(obj2, (Type)null, "Type", new object[0], (string[])null, (Type[])null, (bool[])null), (object)geoElementType.geoArc, false))
						{
							DemoIntersectArcArc(MainModule.FC2, MainModule.FC1, i, j);
							if (MainModule.Intersect == 1)
							{
								break;
							}
						}
						if (Operators.ConditionalCompareObjectEqual(NewLateBinding.LateGet(obj2, (Type)null, "Type", new object[0], (string[])null, (Type[])null, (bool[])null), (object)geoElementType.geoSegment, false))
						{
							DemoIntersectArcSegment(MainModule.FC2, MainModule.FC1, i, j);
							if (MainModule.Intersect == 1)
							{
								break;
							}
						}
					}
				}
				if (Operators.ConditionalCompareObjectEqual(NewLateBinding.LateGet(obj, (Type)null, "Type", new object[0], (string[])null, (Type[])null, (bool[])null), (object)geoElementType.geoSegment, false))
				{
					int count3 = MainModule.FC1.Count;
					for (j = 1; j <= count3; j++)
					{
						object obj2 = MainModule.FC1.ComGeoBaseItem(j);
						if (Operators.ConditionalCompareObjectEqual(NewLateBinding.LateGet(obj2, (Type)null, "Type", new object[0], (string[])null, (Type[])null, (bool[])null), (object)geoElementType.geoArc, false))
						{
							DemoIntersectSegmentArc(MainModule.FC2, MainModule.FC1, i, j);
							if (MainModule.Intersect == 1)
							{
								break;
							}
						}
						if (Operators.ConditionalCompareObjectEqual(NewLateBinding.LateGet(obj2, (Type)null, "Type", new object[0], (string[])null, (Type[])null, (bool[])null), (object)geoElementType.geoSegment, false))
						{
							DemoIntersectSegments(MainModule.FC2, MainModule.FC1, i, j);
							if (MainModule.Intersect == 1)
							{
								break;
							}
						}
					}
				}
				if (unchecked(MainModule.Intersect == 1 && num <= 6))
				{
					MainModule.ptp[num] = MainModule.Document.GetPoint(MainModule.IntPt[0].X, MainModule.IntPt[0].Y, 0);
					MainModule.FcNumber[num] = j;
					num++;
				}
				MainModule.Intersect = 0;
			}
		}
	}

	public static void DemoIntersectSegments(FeatureChain TFc, FeatureChain MFc, int i, int j)
	{
		//IL_002a: Unknown result type (might be due to invalid IL or missing references)
		//IL_0030: Expected O, but got Unknown
		//IL_0045: Unknown result type (might be due to invalid IL or missing references)
		//IL_004b: Expected O, but got Unknown
		int try0000_dispatch = -1;
		int num2 = default(int);
		ComSegment[] array = default(ComSegment[]);
		int num = default(int);
		int num3 = default(int);
		double num5 = default(double);
		while (true)
		{
			try
			{
				/*Note: ILSpy has introduced the following switch to emulate a goto from catch-block to try-block*/;
				int num4;
				switch (try0000_dispatch)
				{
				default:
					num2 = 1;
					array = (ComSegment[])(object)new ComSegment[2];
					goto IL_0009;
				case 300:
					{
						num = num2;
						switch (num3)
						{
						case 2:
							break;
						case 1:
							goto IL_00c8;
						default:
							goto end_IL_0000;
						}
						goto IL_0088;
					}
					IL_00c8:
					num4 = num + 1;
					num = 0;
					switch (num4)
					{
					case 1:
						break;
					case 2:
						goto IL_0009;
					case 3:
						goto IL_000b;
					case 4:
						goto IL_0018;
					case 5:
						goto IL_001f;
					case 6:
						goto IL_0030;
					case 8:
						goto IL_003a;
					case 9:
						goto IL_004b;
					case 11:
						goto IL_0053;
					case 12:
						goto IL_005a;
					case 13:
						goto IL_0077;
					case 14:
						goto IL_0088;
					case 15:
						goto IL_0098;
					case 17:
						goto IL_00a3;
					case 18:
						goto IL_00af;
					case 20:
						goto end_IL_0000_2;
					default:
						goto end_IL_0000;
					case 7:
					case 10:
					case 16:
					case 19:
					case 21:
						goto end_IL_0000_3;
					}
					goto default;
					IL_0009:
					num2 = 2;
					goto IL_000b;
					IL_000b:
					num2 = 3;
					num5 = 123.0;
					goto IL_0018;
					IL_0018:
					ProjectData.ClearProjectError();
					num3 = 1;
					goto IL_001f;
					IL_001f:
					num2 = 5;
					array[0] = (ComSegment)TFc.ComGeoBaseItem(i);
					goto IL_0030;
					IL_0030:
					num2 = 6;
					if (array[0] == null)
					{
						goto end_IL_0000_3;
					}
					goto IL_003a;
					IL_003a:
					num2 = 8;
					array[1] = (ComSegment)MFc.ComGeoBaseItem(j);
					goto IL_004b;
					IL_004b:
					num2 = 9;
					if (array[1] == null)
					{
						goto end_IL_0000_3;
					}
					goto IL_0053;
					IL_0053:
					ProjectData.ClearProjectError();
					num3 = 2;
					goto IL_005a;
					IL_005a:
					num2 = 12;
					MainModule.IntPt = (IComPoint[])GetGeoUtility().Intersect((ComGeoBase)array[0], (ComGeoBase)array[1]);
					goto IL_0077;
					IL_0077:
					num2 = 13;
					num5 = Information.UBound((Array)MainModule.IntPt, 1);
					goto IL_0088;
					IL_0088:
					num2 = 14;
					if (num5 == 123.0)
					{
						goto IL_0098;
					}
					goto IL_00a3;
					IL_0098:
					num2 = 15;
					MainModule.Intersect = 0;
					goto end_IL_0000_3;
					IL_00a3:
					num2 = 17;
					if (MainModule.IntPt[0] != null)
					{
						break;
					}
					goto IL_00af;
					IL_00af:
					num2 = 18;
					MainModule.Intersect = 0;
					goto end_IL_0000_3;
					end_IL_0000_2:
					break;
				}
				num2 = 20;
				MainModule.Intersect = 1;
				break;
				end_IL_0000:;
			}
			catch (Exception ex) when (num3 != 0 && num == 0)
			{
				ProjectData.SetProjectError(ex);
				try0000_dispatch = 300;
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

	public static void DemoIntersectSegmentArc(FeatureChain TFc, FeatureChain MFc, int i, int j)
	{
		//IL_0034: Unknown result type (might be due to invalid IL or missing references)
		//IL_003a: Expected O, but got Unknown
		//IL_0051: Unknown result type (might be due to invalid IL or missing references)
		//IL_0057: Expected O, but got Unknown
		int try0000_dispatch = -1;
		int num2 = default(int);
		ComSegment[] array = default(ComSegment[]);
		int num = default(int);
		int num3 = default(int);
		ComArc[] array2 = default(ComArc[]);
		double num5 = default(double);
		while (true)
		{
			try
			{
				/*Note: ILSpy has introduced the following switch to emulate a goto from catch-block to try-block*/;
				int num4;
				switch (try0000_dispatch)
				{
				default:
					num2 = 1;
					array = (ComSegment[])(object)new ComSegment[2];
					goto IL_0009;
				case 318:
					{
						num = num2;
						switch (num3)
						{
						case 2:
							break;
						case 1:
							goto IL_00d6;
						default:
							goto end_IL_0000;
						}
						goto IL_0096;
					}
					IL_00d6:
					num4 = num + 1;
					num = 0;
					switch (num4)
					{
					case 1:
						break;
					case 2:
						goto IL_0009;
					case 3:
						goto IL_0013;
					case 4:
						goto IL_0020;
					case 5:
						goto IL_0022;
					case 6:
						goto IL_0029;
					case 7:
						goto IL_003a;
					case 9:
						goto IL_0044;
					case 10:
						goto IL_0057;
					case 12:
						goto IL_0060;
					case 13:
						goto IL_0067;
					case 14:
						goto IL_0085;
					case 15:
						goto IL_0096;
					case 16:
						goto IL_00a6;
					case 18:
						goto IL_00b1;
					case 19:
						goto IL_00bd;
					case 21:
						goto end_IL_0000_2;
					default:
						goto end_IL_0000;
					case 8:
					case 11:
					case 17:
					case 20:
					case 22:
						goto end_IL_0000_3;
					}
					goto default;
					IL_0009:
					num2 = 2;
					array2 = (ComArc[])(object)new ComArc[2];
					goto IL_0013;
					IL_0013:
					num2 = 3;
					num5 = 123.0;
					goto IL_0020;
					IL_0020:
					num2 = 4;
					goto IL_0022;
					IL_0022:
					ProjectData.ClearProjectError();
					num3 = 1;
					goto IL_0029;
					IL_0029:
					num2 = 6;
					array[1] = (ComSegment)TFc.ComGeoBaseItem(i);
					goto IL_003a;
					IL_003a:
					num2 = 7;
					if (array[1] == null)
					{
						goto end_IL_0000_3;
					}
					goto IL_0044;
					IL_0044:
					num2 = 9;
					array2[1] = (ComArc)MFc.ComGeoBaseItem(j);
					goto IL_0057;
					IL_0057:
					num2 = 10;
					if (array2[1] == null)
					{
						goto end_IL_0000_3;
					}
					goto IL_0060;
					IL_0060:
					ProjectData.ClearProjectError();
					num3 = 2;
					goto IL_0067;
					IL_0067:
					num2 = 13;
					MainModule.IntPt = (IComPoint[])GetGeoUtility().Intersect((ComGeoBase)array[1], (ComGeoBase)array2[1]);
					goto IL_0085;
					IL_0085:
					num2 = 14;
					num5 = Information.UBound((Array)MainModule.IntPt, 1);
					goto IL_0096;
					IL_0096:
					num2 = 15;
					if (num5 == 123.0)
					{
						goto IL_00a6;
					}
					goto IL_00b1;
					IL_00a6:
					num2 = 16;
					MainModule.Intersect = 0;
					goto end_IL_0000_3;
					IL_00b1:
					num2 = 18;
					if (MainModule.IntPt[0] != null)
					{
						break;
					}
					goto IL_00bd;
					IL_00bd:
					num2 = 19;
					MainModule.Intersect = 0;
					goto end_IL_0000_3;
					end_IL_0000_2:
					break;
				}
				num2 = 21;
				MainModule.Intersect = 1;
				break;
				end_IL_0000:;
			}
			catch (Exception ex) when (num3 != 0 && num == 0)
			{
				ProjectData.SetProjectError(ex);
				try0000_dispatch = 318;
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

	public static void DemoIntersectArcSegment(FeatureChain TFc, FeatureChain MFc, int i, int j)
	{
		//IL_0035: Unknown result type (might be due to invalid IL or missing references)
		//IL_003b: Expected O, but got Unknown
		//IL_0052: Unknown result type (might be due to invalid IL or missing references)
		//IL_0058: Expected O, but got Unknown
		int try0000_dispatch = -1;
		int num2 = default(int);
		ComSegment[] array = default(ComSegment[]);
		int num = default(int);
		int num3 = default(int);
		ComArc[] array2 = default(ComArc[]);
		double num5 = default(double);
		while (true)
		{
			try
			{
				/*Note: ILSpy has introduced the following switch to emulate a goto from catch-block to try-block*/;
				int num4;
				switch (try0000_dispatch)
				{
				default:
					num2 = 1;
					array = (ComSegment[])(object)new ComSegment[2];
					goto IL_0009;
				case 318:
					{
						num = num2;
						switch (num3)
						{
						case 2:
							break;
						case 1:
							goto IL_00d6;
						default:
							goto end_IL_0000;
						}
						goto IL_0096;
					}
					IL_00d6:
					num4 = num + 1;
					num = 0;
					switch (num4)
					{
					case 1:
						break;
					case 2:
						goto IL_0009;
					case 3:
						goto IL_0013;
					case 4:
						goto IL_0020;
					case 5:
						goto IL_0022;
					case 6:
						goto IL_0029;
					case 7:
						goto IL_003b;
					case 9:
						goto IL_0046;
					case 10:
						goto IL_0058;
					case 12:
						goto IL_0060;
					case 13:
						goto IL_0067;
					case 14:
						goto IL_0085;
					case 15:
						goto IL_0096;
					case 16:
						goto IL_00a6;
					case 18:
						goto IL_00b1;
					case 19:
						goto IL_00bd;
					case 21:
						goto end_IL_0000_2;
					default:
						goto end_IL_0000;
					case 8:
					case 11:
					case 17:
					case 20:
					case 22:
						goto end_IL_0000_3;
					}
					goto default;
					IL_0009:
					num2 = 2;
					array2 = (ComArc[])(object)new ComArc[2];
					goto IL_0013;
					IL_0013:
					num2 = 3;
					num5 = 123.0;
					goto IL_0020;
					IL_0020:
					num2 = 4;
					goto IL_0022;
					IL_0022:
					ProjectData.ClearProjectError();
					num3 = 1;
					goto IL_0029;
					IL_0029:
					num2 = 6;
					array2[1] = (ComArc)TFc.ComGeoBaseItem(i);
					goto IL_003b;
					IL_003b:
					num2 = 7;
					if (array2[1] == null)
					{
						goto end_IL_0000_3;
					}
					goto IL_0046;
					IL_0046:
					num2 = 9;
					array[1] = (ComSegment)MFc.ComGeoBaseItem(j);
					goto IL_0058;
					IL_0058:
					num2 = 10;
					if (array[1] == null)
					{
						goto end_IL_0000_3;
					}
					goto IL_0060;
					IL_0060:
					ProjectData.ClearProjectError();
					num3 = 2;
					goto IL_0067;
					IL_0067:
					num2 = 13;
					MainModule.IntPt = (IComPoint[])GetGeoUtility().Intersect((ComGeoBase)array[1], (ComGeoBase)array2[1]);
					goto IL_0085;
					IL_0085:
					num2 = 14;
					num5 = Information.UBound((Array)MainModule.IntPt, 1);
					goto IL_0096;
					IL_0096:
					num2 = 15;
					if (num5 == 123.0)
					{
						goto IL_00a6;
					}
					goto IL_00b1;
					IL_00a6:
					num2 = 16;
					MainModule.Intersect = 0;
					goto end_IL_0000_3;
					IL_00b1:
					num2 = 18;
					if (MainModule.IntPt[0] != null)
					{
						break;
					}
					goto IL_00bd;
					IL_00bd:
					num2 = 19;
					MainModule.Intersect = 0;
					goto end_IL_0000_3;
					end_IL_0000_2:
					break;
				}
				num2 = 21;
				MainModule.Intersect = 1;
				break;
				end_IL_0000:;
			}
			catch (Exception ex) when (num3 != 0 && num == 0)
			{
				ProjectData.SetProjectError(ex);
				try0000_dispatch = 318;
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

	public static void DemoIntersectArcArc(FeatureChain TFc, FeatureChain MFc, int i, int j)
	{
		//IL_002a: Unknown result type (might be due to invalid IL or missing references)
		//IL_0030: Expected O, but got Unknown
		//IL_0045: Unknown result type (might be due to invalid IL or missing references)
		//IL_004b: Expected O, but got Unknown
		int try0000_dispatch = -1;
		int num2 = default(int);
		ComArc[] array = default(ComArc[]);
		int num = default(int);
		int num3 = default(int);
		double num5 = default(double);
		while (true)
		{
			try
			{
				/*Note: ILSpy has introduced the following switch to emulate a goto from catch-block to try-block*/;
				int num4;
				switch (try0000_dispatch)
				{
				default:
					num2 = 1;
					array = (ComArc[])(object)new ComArc[2];
					goto IL_0009;
				case 300:
					{
						num = num2;
						switch (num3)
						{
						case 2:
							break;
						case 1:
							goto IL_00c8;
						default:
							goto end_IL_0000;
						}
						goto IL_0088;
					}
					IL_00c8:
					num4 = num + 1;
					num = 0;
					switch (num4)
					{
					case 1:
						break;
					case 2:
						goto IL_0009;
					case 3:
						goto IL_0016;
					case 4:
						goto IL_0018;
					case 5:
						goto IL_001f;
					case 6:
						goto IL_0030;
					case 8:
						goto IL_003a;
					case 9:
						goto IL_004b;
					case 11:
						goto IL_0053;
					case 12:
						goto IL_005a;
					case 13:
						goto IL_0077;
					case 14:
						goto IL_0088;
					case 15:
						goto IL_0098;
					case 17:
						goto IL_00a3;
					case 18:
						goto IL_00af;
					case 20:
						goto end_IL_0000_2;
					default:
						goto end_IL_0000;
					case 7:
					case 10:
					case 16:
					case 19:
					case 21:
						goto end_IL_0000_3;
					}
					goto default;
					IL_0009:
					num2 = 2;
					num5 = 123.0;
					goto IL_0016;
					IL_0016:
					num2 = 3;
					goto IL_0018;
					IL_0018:
					ProjectData.ClearProjectError();
					num3 = 1;
					goto IL_001f;
					IL_001f:
					num2 = 5;
					array[0] = (ComArc)TFc.ComGeoBaseItem(i);
					goto IL_0030;
					IL_0030:
					num2 = 6;
					if (array[0] == null)
					{
						goto end_IL_0000_3;
					}
					goto IL_003a;
					IL_003a:
					num2 = 8;
					array[1] = (ComArc)MFc.ComGeoBaseItem(j);
					goto IL_004b;
					IL_004b:
					num2 = 9;
					if (array[1] == null)
					{
						goto end_IL_0000_3;
					}
					goto IL_0053;
					IL_0053:
					ProjectData.ClearProjectError();
					num3 = 2;
					goto IL_005a;
					IL_005a:
					num2 = 12;
					MainModule.IntPt = (IComPoint[])GetGeoUtility().Intersect((ComGeoBase)array[0], (ComGeoBase)array[1]);
					goto IL_0077;
					IL_0077:
					num2 = 13;
					num5 = Information.UBound((Array)MainModule.IntPt, 1);
					goto IL_0088;
					IL_0088:
					num2 = 14;
					if (num5 == 123.0)
					{
						goto IL_0098;
					}
					goto IL_00a3;
					IL_0098:
					num2 = 15;
					MainModule.Intersect = 0;
					goto end_IL_0000_3;
					IL_00a3:
					num2 = 17;
					if (MainModule.IntPt[0] != null)
					{
						break;
					}
					goto IL_00af;
					IL_00af:
					num2 = 18;
					MainModule.Intersect = 0;
					goto end_IL_0000_3;
					end_IL_0000_2:
					break;
				}
				num2 = 20;
				MainModule.Intersect = 1;
				break;
				end_IL_0000:;
			}
			catch (Exception ex) when (num3 != 0 && num == 0)
			{
				ProjectData.SetProjectError(ex);
				try0000_dispatch = 300;
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

	public static GeoUtility GetGeoUtility()
	{
		if (_0024STATIC_0024GetGeoUtility_002400128278_0024MyGeoUtility == null)
		{
			_0024STATIC_0024GetGeoUtility_002400128278_0024MyGeoUtility = (GeoUtility)Activator.CreateInstance(Marshal.GetTypeFromCLSID(new Guid("53AB9AB1-52F3-4CAA-91AC-991BE20E3085")));
		}
		return _0024STATIC_0024GetGeoUtility_002400128278_0024MyGeoUtility;
	}
 }
}
