using Abuts.EspritAddIns.ESPRIT2025AddinProject;
using Esprit;
using EspritConstants;
using EspritFeatures;
using EspritGeometry;
using EspritGeometryBase;
using EspritGeometryRoutines;
using EspritTechnology;
using Microsoft.VisualBasic;
using Microsoft.VisualBasic.CompilerServices;
using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;

#pragma warning disable CS0162, CS0164, CS0649

namespace DentalAddin
{
    internal sealed partial class MainModule
    {
        public static void DeleteFeature(int I, int j)
        {
            Fcb2[j].Reverse();
            checked
            {
                if (Fcb2[j].Count - I == 1)
                {
                    Fcb2[j].RemoveEnd(Fcb2[j].Count - I + 2);
                }
                else
                {
                    Fcb2[j].RemoveEnd(Fcb2[j].Count - I + 1);
                }
                Point point = Fcb2[j].Extremity(espExtremityType.espExtremityEnd);
                Point point2 = ((!SpindleSide) ? Document.Points.Add(point.X - 0.4, point.Y + 0.4, 0.0) : Document.Points.Add(point.X + 0.4, point.Y + 0.4, 0.0));
                Segment segment = Document.Segments.Add(point, point2);
                Fcb2[j].Add(segment);
                Fcb2[j].Reverse();
                if (Strings.Len(Fcb2[j].Name) == 15)
                {
                    Fcb2[j].Name = Fcb2[j].Name + "-Gr" + Strings.Right(Fcb2[j].Name, 1);
                }
                if (Strings.Len(Fcb2[j].Name) == 16)
                {
                    Fcb2[j].Name = Fcb2[j].Name + "-Gr" + Strings.Right(Fcb2[j].Name, 2);
                }
                Document.Points.Remove(point2.Key);
                point2 = null;
                Document.Segments.Remove(segment.Key);
                segment = null;
            }
        }

        public static void CopyFeature(int I)
        {
            SelectionSet selectionSet = Document.SelectionSets["123"];
            if (selectionSet == null)
            {
                selectionSet = Document.SelectionSets.Add("123");
            }
            selectionSet.RemoveAll();
            selectionSet.Add(FC1, RuntimeHelpers.GetObjectValue(Missing.Value));
            selectionSet.Translate(0.0, 0.0, 0.0, 1);
            int count = Document.FeatureChains.Count;
            for (int i = 1; i <= count; i = checked(i + 1))
            {
                FeatureChain featureChain = Document.FeatureChains[i];
                if ((Operators.CompareString(featureChain.Key, FC1.Key, false) != 0) & (Operators.CompareString(featureChain.Name, FC1.Name, false) == 0))
                {
                    Fcb2[I] = featureChain;
                    featureChain = null;
                    break;
                }
            }
        }

        public static void SearchSubNumberX(int Count, double Hvalue, int Th)
        {
            double num = Count;
            Point point = new Point();
            Point point2 = new Point();
            for (iLine = 1.0; iLine <= num; iLine += 1.0)
            {
                GraphicObject graphicObject = checked((Th != 1) ? ((GraphicObject)((IFeatureChain)FC2).get_Item((int)Math.Round(iLine))) : ((GraphicObject)((IFeatureChain)FC1).get_Item((int)Math.Round(iLine))));
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
                if (SpindleSide)
                {
                    if ((Hvalue > point.X) & (Hvalue <= point2.X))
                    {
                        break;
                    }
                }
                else if ((Hvalue > point.X) & (Hvalue <= point2.X))
                {
                    break;
                }
            }
        }

        public static void SearchSubNumberSpecial(int Count, double Hvalue, int Th)
        {
            Point point = FC1.Extremity(espExtremityType.espExtremityStart);
            if (Hvalue < point.Y)
            {
                Hvalue = point.Y + 0.2;
            }
            double num = Count;
            Point point2 = default(Point);
            Point point3 = default(Point);
            for (iLine = 1.0; iLine <= num; iLine += 1.0)
            {
                GraphicObject graphicObject = checked((Th != 1) ? ((GraphicObject)((IFeatureChain)FC2).get_Item((int)Math.Round(iLine))) : ((GraphicObject)((IFeatureChain)FC1).get_Item((int)Math.Round(iLine))));
                if (graphicObject.GraphicObjectType == espGraphicObjectType.espArc)
                {
                    Arc obj = (Arc)graphicObject;
                    point2 = obj.Extremity(espExtremityType.espExtremityStart);
                    point3 = obj.Extremity(espExtremityType.espExtremityEnd);
                    if (point2.X > point3.X)
                    {
                        double x = point3.X;
                        double y = point3.Y;
                        point3.X = point2.X;
                        point3.Y = point2.Y;
                        point2.X = x;
                        point2.Y = y;
                    }
                }
                if (graphicObject.GraphicObjectType == espGraphicObjectType.espSegment)
                {
                    Segment obj2 = (Segment)graphicObject;
                    point2 = obj2.Extremity(espExtremityType.espExtremityStart);
                    point3 = obj2.Extremity(espExtremityType.espExtremityEnd);
                    if (point2.X > point3.X)
                    {
                        double x = point3.X;
                        double y = point3.Y;
                        point3.X = point2.X;
                        point3.Y = point2.Y;
                        point2.X = x;
                        point2.Y = y;
                    }
                }
                if (Math.Abs(point2.Y) > Math.Abs(point3.Y))
                {
                    if ((Hvalue < point2.Y) & (Hvalue >= point3.Y))
                    {
                        break;
                    }
                }
                else if ((Hvalue >= point2.Y) & (Hvalue < point3.Y))
                {
                    break;
                }
            }
        }

        
        private static void SearchSubNumberY(int Count, double Hvalue, int Th)
        {
            double num = Count;
            iLine = 1.0;
            Point point = default(Point);
            Point point2 = default(Point);
            while (iLine <= num)
            {
                GraphicObject graphicObject = checked((Th != 1) ? ((GraphicObject)((IFeatureChain)FC2).get_Item((int)Math.Round(iLine))) : ((GraphicObject)((IFeatureChain)FC1).get_Item((int)Math.Round(iLine))));
                if (graphicObject.GraphicObjectType == espGraphicObjectType.espArc)
                {
                    Arc obj = (Arc)graphicObject;
                    point = obj.Extremity(espExtremityType.espExtremityStart);
                    point2 = obj.Extremity(espExtremityType.espExtremityEnd);
                    Point point3 = obj.Extremity(espExtremityType.espExtremityMiddle);
                    if (point.X > point2.X)
                    {
                        double x = point2.X;
                        double y = point2.Y;
                        point2.X = point.X;
                        point2.Y = point.Y;
                        point.X = x;
                        point.Y = y;
                    }
                    if ((point3.Y < point.Y) & (point3.Y < point2.Y))
                    {
                        if (point.Y < point2.Y)
                        {
                            point.Y = point3.Y;
                        }
                        else
                        {
                            point2.Y = point3.Y;
                        }
                    }
                    else if ((point3.Y > point.Y) & (point3.Y > point2.Y))
                    {
                        if (point.Y > point2.Y)
                        {
                            point.Y = point3.Y;
                        }
                        else
                        {
                            point2.Y = point3.Y;
                        }
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
                if (!((Hvalue >= point.Y) & (Hvalue <= point2.Y)) && !((Hvalue <= point.Y) & (Hvalue >= point2.Y)))
                {
                    iLine += 1.0;
                    continue;
                }
                break;
            }
        }

        private static void SearchSubNumberYy(int Count, double Hvalue, int Th)
        {
            double num = Count;
            double x2 = default(double);
            double y2 = default(double);
            double num2 = default(double);
            double num3 = default(double);
            for (iLine = 1.0; iLine <= num; iLine += 1.0)
            {
                GraphicObject graphicObject = (GraphicObject)((IFeatureChain)Fcc).get_Item(checked((int)Math.Round(iLine)));
                if (graphicObject.GraphicObjectType == espGraphicObjectType.espArc)
                {
                    Arc obj = (Arc)graphicObject;
                    Point point = obj.Extremity(espExtremityType.espExtremityStart);
                    Point point2 = obj.Extremity(espExtremityType.espExtremityEnd);
                    if (point.X > point2.X)
                    {
                        double x = point2.X;
                        double y = point2.Y;
                        x2 = point.X;
                        y2 = point.Y;
                        num2 = x;
                        num3 = y;
                    }
                }
                if (graphicObject.GraphicObjectType == espGraphicObjectType.espSegment)
                {
                    Segment obj2 = (Segment)graphicObject;
                    Point point = obj2.Extremity(espExtremityType.espExtremityStart);
                    Point point2 = obj2.Extremity(espExtremityType.espExtremityEnd);
                    if (point.X > point2.X)
                    {
                        double x = point2.X;
                        double y3 = point2.Y;
                        x2 = point.X;
                        y2 = point.Y;
                        num2 = x;
                        num3 = y3;
                    }
                }
                if (RL == 1.0)
                {
                    if (((Hvalue > num3 && Hvalue <= y2) & (num2 > MoveSTL_Module.BackPointX)) || ((Hvalue < num3 && Hvalue >= y2) & (num2 > MoveSTL_Module.BackPointX)))
                    {
                        break;
                    }
                }
                else if (RL == 2.0 && (((Hvalue > num3 && Hvalue <= y2) & (x2 < MoveSTL_Module.BackPointX)) || ((Hvalue < num3 && Hvalue >= y2) & (x2 < MoveSTL_Module.BackPointX))))
                {
                    break;
                }
            }
        }

        private static void SearchSubNumber(int Count, double Hvalue, int Th)
        {
            double num = Count;
            iLine = 1.0;
            Point point = default(Point);
            Point point2 = default(Point);
            while (iLine <= num)
            {
                GraphicObject graphicObject = checked((Th != 1) ? ((GraphicObject)((IFeatureChain)FC2).get_Item((int)Math.Round(iLine))) : ((GraphicObject)((IFeatureChain)FC1).get_Item((int)Math.Round(iLine))));
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
                if (!((Hvalue > point.X) & (Hvalue <= point2.X)) && !((Hvalue < point.X) & (Hvalue >= point2.X)))
                {
                    iLine += 1.0;
                    continue;
                }
                break;
            }
        }

#pragma warning restore CS0162, CS0649
    }
}
