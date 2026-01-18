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
 internal sealed class Intersection2
 {
	[SpecialName]
	private static GeoUtility _0024STATIC_0024GetGeoUtility_002400128278_0024MyGeoUtility;

	public static void Calculate(Segment Segnew, FeatureChain FFF)
	{
		//IL_0000: Unknown result type (might be due to invalid IL or missing references)
		//IL_0006: Expected O, but got Unknown
		ComSegment val = (ComSegment)new ComSegmentClass();
		int num = 1;
		Segment segment = Segnew;
		((IComSegment)val).StartPoint.SetXyz(segment.XStart, segment.YStart, segment.ZStart);
		((IComSegment)val).EndPoint.SetXyz(segment.XEnd, segment.YEnd, segment.ZEnd);
		segment = null;
		MainModule.FcNumber[1] = 0;
		MainModule.FcNumber[2] = 0;
		MainModule.FcNumber[3] = 0;
		MainModule.FcNumber[4] = 0;
		MainModule.FcNumber[5] = 0;
		MainModule.FcNumber[6] = 0;
		int count = FFF.Count;
		for (int i = 1; i <= count; i = checked(i + 1))
		{
			object obj = FFF.ComGeoBaseItem(i);
			if (Operators.ConditionalCompareObjectEqual(NewLateBinding.LateGet(obj, (Type)null, "Type", new object[0], (string[])null, (Type[])null, (bool[])null), (object)geoElementType.geoArc, false))
			{
				DemoIntersectSegmentArc(val, FFF, i);
				if (MainModule.Intersect == 1)
				{
					break;
				}
			}
			if (Operators.ConditionalCompareObjectEqual(NewLateBinding.LateGet(obj, (Type)null, "Type", new object[0], (string[])null, (Type[])null, (bool[])null), (object)geoElementType.geoSegment, false))
			{
				DemoIntersectSegments(val, FFF, i);
				if (MainModule.Intersect == 1)
				{
					break;
				}
			}
		}
		if (MainModule.Intersect == 1 && num <= 6)
		{
			MainModule.ptp[num] = MainModule.Document.GetPoint(MainModule.IntPt[0].X, MainModule.IntPt[0].Y, 0);
		}
		MainModule.Intersect = 0;
	}

	public static void DemoIntersectSegments(ComSegment ComSeg, FeatureChain MFc, int j)
	{
		//IL_002a: Unknown result type (might be due to invalid IL or missing references)
		//IL_0030: Expected O, but got Unknown
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
				case 258:
					{
						num = num2;
						switch (num3)
						{
						case 2:
							break;
						case 1:
							goto IL_00aa;
						default:
							goto end_IL_0000;
						}
						goto IL_006a;
					}
					IL_00aa:
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
						goto IL_0037;
					case 9:
						goto IL_003e;
					case 10:
						goto IL_0059;
					case 11:
						goto IL_006a;
					case 12:
						goto IL_007a;
					case 14:
						goto IL_0085;
					case 15:
						goto IL_0091;
					case 17:
						goto end_IL_0000_2;
					default:
						goto end_IL_0000;
					case 7:
					case 13:
					case 16:
					case 18:
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
					array[1] = (ComSegment)MFc.ComGeoBaseItem(j);
					goto IL_0030;
					IL_0030:
					num2 = 6;
					if (array[1] == null)
					{
						goto end_IL_0000_3;
					}
					goto IL_0037;
					IL_0037:
					ProjectData.ClearProjectError();
					num3 = 2;
					goto IL_003e;
					IL_003e:
					num2 = 9;
					MainModule.IntPt = (IComPoint[])GetGeoUtility().Intersect((ComGeoBase)ComSeg, (ComGeoBase)array[1]);
					goto IL_0059;
					IL_0059:
					num2 = 10;
					num5 = Information.UBound((Array)MainModule.IntPt, 1);
					goto IL_006a;
					IL_006a:
					num2 = 11;
					if (num5 == 123.0)
					{
						goto IL_007a;
					}
					goto IL_0085;
					IL_007a:
					num2 = 12;
					MainModule.Intersect = 0;
					goto end_IL_0000_3;
					IL_0085:
					num2 = 14;
					if (MainModule.IntPt[0] != null)
					{
						break;
					}
					goto IL_0091;
					IL_0091:
					num2 = 15;
					MainModule.Intersect = 0;
					goto end_IL_0000_3;
					end_IL_0000_2:
					break;
				}
				num2 = 17;
				MainModule.Intersect = 1;
				break;
				end_IL_0000:;
			}
			catch (Exception ex) when (num3 != 0 && num == 0)
			{
				ProjectData.SetProjectError(ex);
				try0000_dispatch = 258;
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

	public static void DemoIntersectSegmentArc(ComSegment ComSeg, FeatureChain MFc, int j)
	{
		//IL_0033: Unknown result type (might be due to invalid IL or missing references)
		//IL_0039: Expected O, but got Unknown
		int try0000_dispatch = -1;
		int num2 = default(int);
		int num = default(int);
		int num3 = default(int);
		ComArc[] array = default(ComArc[]);
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
					_ = new ComSegment[2];
					goto IL_0009;
				case 271:
					{
						num = num2;
						switch (num3)
						{
						case 2:
							break;
						case 1:
							goto IL_00b3;
						default:
							goto end_IL_0000;
						}
						goto IL_0073;
					}
					IL_00b3:
					num4 = num + 1;
					num = 0;
					switch (num4)
					{
					case 1:
						break;
					case 2:
						goto IL_0009;
					case 3:
						goto IL_0012;
					case 4:
						goto IL_001f;
					case 5:
						goto IL_0021;
					case 6:
						goto IL_0028;
					case 7:
						goto IL_0039;
					case 9:
						goto IL_0040;
					case 10:
						goto IL_0047;
					case 11:
						goto IL_0062;
					case 12:
						goto IL_0073;
					case 13:
						goto IL_0083;
					case 15:
						goto IL_008e;
					case 16:
						goto IL_009a;
					case 18:
						goto end_IL_0000_2;
					default:
						goto end_IL_0000;
					case 8:
					case 14:
					case 17:
					case 19:
						goto end_IL_0000_3;
					}
					goto default;
					IL_0009:
					num2 = 2;
					array = (ComArc[])(object)new ComArc[2];
					goto IL_0012;
					IL_0012:
					num2 = 3;
					num5 = 123.0;
					goto IL_001f;
					IL_001f:
					num2 = 4;
					goto IL_0021;
					IL_0021:
					ProjectData.ClearProjectError();
					num3 = 1;
					goto IL_0028;
					IL_0028:
					num2 = 6;
					array[1] = (ComArc)MFc.ComGeoBaseItem(j);
					goto IL_0039;
					IL_0039:
					num2 = 7;
					if (array[1] == null)
					{
						goto end_IL_0000_3;
					}
					goto IL_0040;
					IL_0040:
					ProjectData.ClearProjectError();
					num3 = 2;
					goto IL_0047;
					IL_0047:
					num2 = 10;
					MainModule.IntPt = (IComPoint[])GetGeoUtility().Intersect((ComGeoBase)ComSeg, (ComGeoBase)array[1]);
					goto IL_0062;
					IL_0062:
					num2 = 11;
					num5 = Information.UBound((Array)MainModule.IntPt, 1);
					goto IL_0073;
					IL_0073:
					num2 = 12;
					if (num5 == 123.0)
					{
						goto IL_0083;
					}
					goto IL_008e;
					IL_0083:
					num2 = 13;
					MainModule.Intersect = 0;
					goto end_IL_0000_3;
					IL_008e:
					num2 = 15;
					if (MainModule.IntPt[0] != null)
					{
						break;
					}
					goto IL_009a;
					IL_009a:
					num2 = 16;
					MainModule.Intersect = 0;
					goto end_IL_0000_3;
					end_IL_0000_2:
					break;
				}
				num2 = 18;
				MainModule.Intersect = 1;
				break;
				end_IL_0000:;
			}
			catch (Exception ex) when (num3 != 0 && num == 0)
			{
				ProjectData.SetProjectError(ex);
				try0000_dispatch = 271;
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

#pragma warning restore CS0162
