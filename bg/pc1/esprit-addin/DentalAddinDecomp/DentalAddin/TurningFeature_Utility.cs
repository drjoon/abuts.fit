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
internal sealed class TurningFeature_Utility
{
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

	public static void SearchSubNumber(ref double Count, double Hvalue, byte Th)
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

	public static void TryAddSegment(FeatureChain featureChain, Segment segment, string context)
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
}

#pragma warning restore CS0162
