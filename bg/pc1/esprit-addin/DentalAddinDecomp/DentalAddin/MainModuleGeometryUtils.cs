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
        
        public static void GenerateGeo()
        {
            int try0000_dispatch = -1;
            int num2 = default(int);
            int num6 = default(int);
            int num = default(int);
            int num3 = default(int);
            int num5 = default(int);
            int num7 = default(int);
            int num8 = default(int);
            int num9 = default(int);
            int count = default(int);
            Layer activeLayer = default(Layer);
            FeatureChain featureChain = default(FeatureChain);
            Arc arc = default(Arc);
            Point point = default(Point);
            Segment segment = default(Segment);
            Point point2 = default(Point);
            while (true)
            {
                try
                {
                    /*Note: ILSpy has introduced the following switch to emulate a goto from catch-block to try-block*/
                    ;
                    checked
                    {
                        switch (try0000_dispatch)
                        {
                            default:
                                num2 = 1;
                                num6 = 1;
                                goto IL_0004;
                            case 938:
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
                                            goto IL_0004;
                                        case 3:
                                            goto IL_0032;
                                        case 4:
                                            goto IL_004c;
                                        case 5:
                                            goto IL_0069;
                                        case 6:
                                            goto IL_0070;
                                        case 7:
                                            goto IL_008b;
                                        case 8:
                                            goto IL_0094;
                                        case 9:
                                            goto IL_00af;
                                        case 10:
                                            goto IL_00bc;
                                        case 11:
                                            goto IL_00d0;
                                        case 12:
                                            goto IL_00dc;
                                        case 13:
                                            goto IL_00f7;
                                        case 14:
                                            goto IL_0113;
                                        case 15:
                                            goto IL_0120;
                                        case 16:
                                            goto IL_0131;
                                        case 17:
                                            goto IL_014a;
                                        case 18:
                                            goto IL_0159;
                                        case 19:
                                            goto IL_016d;
                                        case 20:
                                            goto IL_0179;
                                        case 21:
                                            goto IL_0194;
                                        case 22:
                                            goto IL_01b0;
                                        case 23:
                                            goto IL_01bd;
                                        case 24:
                                            goto IL_01ce;
                                        case 25:
                                            goto IL_01e7;
                                        case 26:
                                            goto IL_01f6;
                                        case 27:
                                            goto IL_020e;
                                        case 28:
                                            goto IL_0214;
                                        case 29:
                                            goto IL_022d;
                                        case 30:
                                            goto IL_0248;
                                        case 31:
                                            goto IL_0264;
                                        case 32:
                                            goto IL_026d;
                                        case 33:
                                            goto IL_027c;
                                        case 34:
                                            goto IL_0293;
                                        case 35:
                                            goto IL_02ac;
                                        case 36:
                                            goto IL_02bb;
                                        case 38:
                                            goto end_IL_0000_2;
                                        case 37:
                                        case 40:
                                            goto IL_02e3;
                                        default:
                                            goto end_IL_0000;
                                        case 39:
                                        case 41:
                                            goto end_IL_0000_3;
                                    }
                                    goto default;
                                }
                            IL_014a:
                                num2 = 17;
                                num5++;
                                goto IL_0153;
                            IL_0004:
                                num2 = 2;
                                EspritApp.Configuration.ConfigurationFeatureRecognition.Tolerance = 0.01 + 0.03 * (double)(num6 - 1);
                                goto IL_0032;
                            IL_0032:
                                num2 = 3;
                                EspritApp.Configuration.GapTolerance = 0.01;
                                goto IL_004c;
                            IL_004c:
                                num2 = 4;
                                Document.FeatureRecognition.CreatePartProfileShadow(SS1, Wp, espGraphicObjectReturnType.espSegmentsArcs);
                                goto IL_0069;
                            IL_0069:
                                ProjectData.ClearProjectError();
                                num3 = 1;
                                goto IL_0070;
                            IL_0070:
                                num2 = 6;
                                Ss = Document.SelectionSets["Temp"];
                                goto IL_008b;
                            IL_008b:
                                num2 = 7;
                                if (Ss == null)
                                {
                                    goto IL_0094;
                                }
                                goto IL_00af;
                            IL_0094:
                                num2 = 8;
                                Ss = Document.SelectionSets.Add("Temp");
                                goto IL_00af;
                            IL_00af:
                                num2 = 9;
                                Ss.RemoveAll();
                                goto IL_00bc;
                            IL_00bc:
                                num2 = 10;
                                num7 = Document.Segments.Count;
                                goto IL_00d0;
                            IL_00d0:
                                num2 = 11;
                                num8 = num7;
                                num5 = 1;
                                goto IL_0153;
                            IL_0153:
                                if (num5 <= num8)
                                {
                                    goto IL_00dc;
                                }
                                goto IL_0159;
                            IL_0159:
                                num2 = 18;
                                num7 = Document.Arcs.Count;
                                goto IL_016d;
                            IL_016d:
                                num2 = 19;
                                num9 = num7;
                                num5 = 1;
                                goto IL_01f0;
                            IL_01f0:
                                if (num5 <= num9)
                                {
                                    goto IL_0179;
                                }
                                goto IL_01f6;
                            IL_01f6:
                                num2 = 26;
                                Document.FeatureRecognition.CreateAutoChains(Ss);
                                goto IL_020e;
                            IL_020e:
                                num2 = 27;
                                num7 = 0;
                                goto IL_0214;
                            IL_0214:
                                num2 = 28;
                                count = Document.FeatureChains.Count;
                                num5 = 1;
                                goto IL_0276;
                            IL_0276:
                                if (num5 <= count)
                                {
                                    goto IL_022d;
                                }
                                goto IL_027c;
                            IL_027c:
                                num2 = 33;
                                Document.Layers.Remove("MillingGeoLayer");
                                goto IL_0293;
                            IL_0293:
                                num2 = 34;
                                activeLayer = Document.Layers.Add("MillingGeoLayer");
                                goto IL_02ac;
                            IL_02ac:
                                num2 = 35;
                                Document.ActiveLayer = activeLayer;
                                goto IL_02bb;
                            IL_02bb:
                                num2 = 36;
                                if (num7 <= 1)
                                {
                                    break;
                                }
                                goto IL_02e3;
                            IL_02e3:
                                num2 = 40;
                                num6++;
                                if (num6 > 4)
                                {
                                    goto end_IL_0000_3;
                                }
                                goto IL_0004;
                            IL_022d:
                                num2 = 29;
                                featureChain = Document.FeatureChains[num5];
                                goto IL_0248;
                            IL_0248:
                                num2 = 30;
                                if (Operators.CompareString(featureChain.Layer.Name, "MillingGeoLayer", false) == 0)
                                {
                                    goto IL_0264;
                                }
                                goto IL_026d;
                            IL_0264:
                                num2 = 31;
                                num7++;
                                goto IL_026d;
                            IL_026d:
                                num2 = 32;
                                num5++;
                                goto IL_0276;
                            IL_0179:
                                num2 = 20;
                                arc = Document.Arcs[num5];
                                goto IL_0194;
                            IL_0194:
                                num2 = 21;
                                if (Operators.CompareString(arc.Layer.Name, "MillingGeoLayer", false) == 0)
                                {
                                    goto IL_01b0;
                                }
                                goto IL_01e7;
                            IL_01b0:
                                num2 = 22;
                                point = arc.Extremity(espExtremityType.espExtremityMiddle);
                                goto IL_01bd;
                            IL_01bd:
                                num2 = 23;
                                if (point.X <= MoveSTL_Module.BackPointX)
                                {
                                    goto IL_01ce;
                                }
                                goto IL_01e7;
                            IL_01ce:
                                num2 = 24;
                                Ss.Add(arc, RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_01e7;
                            IL_01e7:
                                num2 = 25;
                                num5++;
                                goto IL_01f0;
                            IL_00dc:
                                num2 = 12;
                                segment = Document.Segments[num5];
                                goto IL_00f7;
                            IL_00f7:
                                num2 = 13;
                                if (Operators.CompareString(segment.Layer.Name, "MillingGeoLayer", false) == 0)
                                {
                                    goto IL_0113;
                                }
                                goto IL_014a;
                            IL_0113:
                                num2 = 14;
                                point2 = segment.Extremity(espExtremityType.espExtremityMiddle);
                                goto IL_0120;
                            IL_0120:
                                num2 = 15;
                                if (point2.X <= MoveSTL_Module.BackPointX)
                                {
                                    goto IL_0131;
                                }
                                goto IL_014a;
                            IL_0131:
                                num2 = 16;
                                Ss.Add(segment, RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_014a;
                            end_IL_0000_2:
                                break;
                        }
                        num2 = 38;
                        Document.FeatureRecognition.CreatePartProfileShadow(SS1, Wp, espGraphicObjectReturnType.espSegmentsArcs);
                        break;
                    }
                end_IL_0000:;
                }
                catch (Exception ex) when (num3 != 0 && num == 0)
                {
                    ProjectData.SetProjectError(ex);
                    try0000_dispatch = 938;
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

        public static void OffsetMulti(int w)
        {
            int try0000_dispatch = -1;
            int num2 = default(int);
            int count = default(int);
            int num5 = default(int);
            int num = default(int);
            int num3 = default(int);
            SelectionSet selectionSet = default(SelectionSet);
            FeatureChain fC = default(FeatureChain);
            Point point = default(Point);
            int num6 = default(int);
            int num7 = default(int);
            GraphicObject graphicObject = default(GraphicObject);
            Segment segment = default(Segment);
            Arc arc = default(Arc);
            int count2 = default(int);
            int num8 = default(int);
            int count3 = default(int);
            int count4 = default(int);
            int count5 = default(int);
            int count6 = default(int);
            int count7 = default(int);
            int count8 = default(int);
            SelectionSet selectionSet2 = default(SelectionSet);
            int count9 = default(int);
            Layer activeLayer = default(Layer);
            int count10 = default(int);
            int num9 = default(int);
            int count11 = default(int);
            int count12 = default(int);
            int num10 = default(int);
            int count13 = default(int);
            int count14 = default(int);
            FeatureChain featureChain = default(FeatureChain);
            while (true)
            {
                try
                {
                    /*Note: ILSpy has introduced the following switch to emulate a goto from catch-block to try-block*/
                    ;
                    checked
                    {
                        switch (try0000_dispatch)
                        {
                            default:
                                num2 = 1;
                                count = Document.FeatureChains.Count;
                                num5 = 1;
                                goto IL_0052;
                            case 11501:
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
                                            goto IL_0017;
                                        case 3:
                                            goto IL_0033;
                                        case 5:
                                            goto IL_004c;
                                        case 4:
                                        case 6:
                                            goto IL_0057;
                                        case 7:
                                            goto IL_005e;
                                        case 8:
                                            goto IL_0076;
                                        case 9:
                                            goto IL_007c;
                                        case 10:
                                            goto IL_0095;
                                        case 11:
                                            goto IL_009f;
                                        case 12:
                                            goto IL_00b8;
                                        case 13:
                                            goto IL_00c3;
                                        case 14:
                                            goto IL_00ee;
                                        case 15:
                                            goto IL_0108;
                                        case 16:
                                            goto IL_0129;
                                        case 17:
                                            goto IL_0139;
                                        case 18:
                                            goto IL_015a;
                                        case 19:
                                            goto IL_016d;
                                        case 21:
                                            goto IL_018f;
                                        case 22:
                                            goto IL_01a2;
                                        case 20:
                                        case 23:
                                            goto IL_01c2;
                                        case 24:
                                            goto IL_01d9;
                                        case 25:
                                            goto IL_01e3;
                                        case 26:
                                            goto IL_01ff;
                                        case 27:
                                            goto IL_0220;
                                        case 28:
                                            goto IL_022a;
                                        case 29:
                                            goto IL_0237;
                                        case 30:
                                            goto IL_0258;
                                        case 31:
                                            goto IL_02aa;
                                        case 32:
                                            goto IL_02b9;
                                        case 33:
                                            goto IL_02da;
                                        case 34:
                                            goto IL_02fb;
                                        case 35:
                                            goto IL_0308;
                                        case 36:
                                            goto IL_030e;
                                        case 37:
                                            goto IL_032f;
                                        case 38:
                                            goto IL_0340;
                                        case 39:
                                            goto IL_0365;
                                        case 40:
                                            goto IL_0373;
                                        case 41:
                                            goto IL_0390;
                                        case 42:
                                            goto IL_03a3;
                                        case 45:
                                            goto IL_03b7;
                                        case 46:
                                            goto IL_03c8;
                                        case 47:
                                            goto IL_03d7;
                                        case 49:
                                            goto IL_03e8;
                                        case 50:
                                            goto IL_03fb;
                                        case 53:
                                            goto IL_040c;
                                        case 54:
                                            goto IL_041d;
                                        case 55:
                                            goto IL_042c;
                                        case 44:
                                        case 48:
                                        case 52:
                                        case 56:
                                            goto IL_043b;
                                        case 43:
                                        case 51:
                                        case 57:
                                            goto IL_044a;
                                        case 58:
                                            goto IL_0452;
                                        case 59:
                                            goto IL_0470;
                                        case 60:
                                            goto IL_047d;
                                        case 61:
                                            goto IL_0489;
                                        case 62:
                                            goto IL_049e;
                                        case 63:
                                            goto IL_04ba;
                                        case 64:
                                            goto IL_04c7;
                                        case 65:
                                            goto IL_04d3;
                                        case 66:
                                            goto IL_04e8;
                                        case 67:
                                            goto IL_0504;
                                        case 68:
                                            goto IL_051d;
                                        case 69:
                                            goto IL_052f;
                                        case 70:
                                            goto IL_0542;
                                        case 72:
                                            goto IL_0564;
                                        case 73:
                                            goto IL_0577;
                                        case 71:
                                        case 74:
                                            goto IL_0597;
                                        case 75:
                                            goto IL_05b1;
                                        case 76:
                                            goto IL_05bb;
                                        case 77:
                                            goto IL_05dc;
                                        case 78:
                                            goto IL_05fd;
                                        case 79:
                                            goto IL_061e;
                                        case 80:
                                            goto IL_063a;
                                        case 81:
                                            goto IL_0658;
                                        case 82:
                                            goto IL_0677;
                                        case 83:
                                            goto IL_0698;
                                        case 85:
                                            goto IL_06bb;
                                        case 84:
                                        case 86:
                                            goto IL_06cd;
                                        case 87:
                                            goto IL_06d3;
                                        case 88:
                                            goto IL_06ea;
                                        case 89:
                                            goto IL_0700;
                                        case 90:
                                            goto IL_070d;
                                        case 91:
                                            goto IL_0719;
                                        case 92:
                                            goto IL_0765;
                                        case 93:
                                            goto IL_076e;
                                        case 94:
                                            goto IL_0780;
                                        case 95:
                                            goto IL_078b;
                                        case 96:
                                            goto IL_07a7;
                                        case 97:
                                            goto IL_07c0;
                                        case 98:
                                            goto IL_07de;
                                        case 100:
                                            goto IL_07f8;
                                        case 99:
                                        case 101:
                                            goto IL_0807;
                                        case 102:
                                            goto IL_0820;
                                        case 103:
                                            goto IL_0833;
                                        case 105:
                                            goto IL_0855;
                                        case 106:
                                            goto IL_0868;
                                        case 104:
                                        case 107:
                                            goto IL_0888;
                                        case 108:
                                            goto IL_0892;
                                        case 109:
                                            goto IL_08ae;
                                        case 110:
                                            goto IL_08c7;
                                        case 111:
                                            goto IL_08e5;
                                        case 113:
                                            goto IL_08ff;
                                        case 112:
                                        case 114:
                                            goto IL_090e;
                                        case 115:
                                            goto IL_0927;
                                        case 116:
                                            goto IL_093a;
                                        case 118:
                                            goto IL_095c;
                                        case 119:
                                            goto IL_096f;
                                        case 117:
                                        case 120:
                                            goto IL_098f;
                                        case 121:
                                            goto IL_0999;
                                        case 122:
                                            goto IL_09b5;
                                        case 123:
                                            goto IL_09d6;
                                        case 124:
                                            goto IL_09ee;
                                        case 125:
                                            goto IL_0a0b;
                                        case 126:
                                            goto IL_0a25;
                                        case 128:
                                            goto IL_0a4b;
                                        case 130:
                                            goto IL_0a5f;
                                        case 131:
                                            goto IL_0a7b;
                                        case 132:
                                            goto IL_0a9c;
                                        case 134:
                                            goto IL_0ab9;
                                        case 133:
                                        case 135:
                                            goto IL_0acb;
                                        case 136:
                                            goto IL_0aea;
                                        case 137:
                                            goto IL_0b06;
                                        case 138:
                                            goto IL_0b27;
                                        case 139:
                                            goto IL_0b4e;
                                        case 141:
                                            goto IL_0b65;
                                        case 127:
                                        case 129:
                                        case 140:
                                        case 142:
                                            goto IL_0b77;
                                        case 143:
                                            goto IL_0b9b;
                                        case 144:
                                            goto IL_0ba8;
                                        case 146:
                                            goto IL_0bb5;
                                        case 145:
                                        case 147:
                                            goto IL_0bc0;
                                        case 148:
                                            goto IL_0be4;
                                        case 149:
                                            goto IL_0bf1;
                                        case 150:
                                            goto IL_0c0d;
                                        case 151:
                                            goto IL_0c17;
                                        case 152:
                                            goto IL_0c33;
                                        case 153:
                                            goto IL_0c40;
                                        case 154:
                                            goto IL_0c48;
                                        case 155:
                                            goto IL_0c64;
                                        case 156:
                                            goto IL_0c85;
                                        case 158:
                                            goto IL_0ca2;
                                        case 157:
                                        case 159:
                                            goto IL_0cb4;
                                        case 160:
                                            goto IL_0cd0;
                                        case 161:
                                            goto IL_0ce6;
                                        case 163:
                                            goto IL_0d0a;
                                        case 164:
                                            goto IL_0d20;
                                        case 162:
                                        case 165:
                                            goto IL_0d42;
                                        case 166:
                                            goto IL_0d5f;
                                        case 167:
                                            goto IL_0d6c;
                                        case 168:
                                            goto IL_0d90;
                                        case 169:
                                            goto IL_0db5;
                                        case 170:
                                            goto IL_0dd9;
                                        case 171:
                                            goto IL_0de4;
                                        case 172:
                                            goto IL_0df5;
                                        case 173:
                                            goto IL_0e04;
                                        case 174:
                                            goto IL_0e23;
                                        case 177:
                                            goto IL_0e34;
                                        case 178:
                                            goto IL_0e46;
                                        case 179:
                                            goto IL_0f1b;
                                        case 182:
                                            goto IL_0f3f;
                                        case 183:
                                            goto IL_0f5d;
                                        case 184:
                                            goto IL_0f6d;
                                        case 185:
                                            goto IL_0f91;
                                        case 186:
                                            goto IL_0fba;
                                        case 187:
                                            goto IL_0fde;
                                        case 188:
                                            goto IL_0fe9;
                                        case 189:
                                            goto IL_0ff9;
                                        case 191:
                                            goto IL_1022;
                                        case 192:
                                            goto IL_1034;
                                        case 193:
                                            goto IL_110c;
                                        case 194:
                                            goto IL_111e;
                                        case 195:
                                            goto IL_113c;
                                        case 196:
                                            goto IL_114c;
                                        case 197:
                                            goto IL_1170;
                                        case 198:
                                            goto IL_1199;
                                        case 199:
                                            goto IL_11bd;
                                        case 200:
                                            goto IL_11c8;
                                        case 201:
                                            goto IL_11d8;
                                        case 203:
                                            goto IL_1201;
                                        case 204:
                                            goto IL_125e;
                                        case 207:
                                            goto IL_1282;
                                        case 208:
                                            goto IL_12a0;
                                        case 209:
                                            goto IL_12b0;
                                        case 210:
                                            goto IL_12d9;
                                        case 211:
                                            goto IL_12e4;
                                        case 213:
                                            goto IL_12f9;
                                        case 214:
                                            goto IL_1308;
                                        case 216:
                                            goto IL_132b;
                                        case 217:
                                            goto IL_1403;
                                        case 218:
                                            goto IL_1421;
                                        case 219:
                                            goto IL_1431;
                                        case 220:
                                            goto IL_1455;
                                        case 221:
                                            goto IL_147e;
                                        case 222:
                                            goto IL_14a2;
                                        case 223:
                                            goto IL_14ad;
                                        case 224:
                                            goto IL_14bd;
                                        case 226:
                                            goto IL_14e6;
                                        case 227:
                                            goto IL_1563;
                                        case 229:
                                            goto IL_1586;
                                        case 230:
                                            goto IL_15a2;
                                        case 231:
                                            goto IL_15be;
                                        case 232:
                                            goto IL_15d0;
                                        case 233:
                                            goto IL_15fe;
                                        case 234:
                                            goto IL_160b;
                                        case 235:
                                            goto IL_1629;
                                        case 236:
                                            goto IL_164b;
                                        case 237:
                                            goto IL_1656;
                                        case 238:
                                            goto IL_167a;
                                        case 239:
                                            goto IL_1699;
                                        case 240:
                                            goto IL_16ba;
                                        case 241:
                                            goto IL_16dc;
                                        case 242:
                                            goto IL_16fc;
                                        case 243:
                                            goto IL_1706;
                                        case 245:
                                            goto IL_172c;
                                        case 244:
                                        case 246:
                                            goto IL_1741;
                                        case 247:
                                            goto IL_175f;
                                        case 248:
                                            goto IL_176f;
                                        case 249:
                                            goto IL_1798;
                                        case 250:
                                            goto IL_17a3;
                                        case 251:
                                            goto IL_17b3;
                                        case 253:
                                            goto IL_17d2;
                                        case 254:
                                            goto IL_18aa;
                                        case 255:
                                            goto IL_18bc;
                                        case 256:
                                            goto IL_1919;
                                        case 257:
                                            goto IL_1938;
                                        case 260:
                                            goto IL_1949;
                                        case 261:
                                            goto IL_1967;
                                        case 262:
                                            goto IL_1977;
                                        case 263:
                                            goto IL_19a0;
                                        case 264:
                                            goto IL_19ab;
                                        case 266:
                                            goto IL_19c0;
                                        case 267:
                                            goto IL_1a98;
                                        case 268:
                                            goto IL_1af5;
                                        case 271:
                                            goto IL_1b19;
                                        case 272:
                                            goto IL_1b37;
                                        case 273:
                                            goto IL_1b47;
                                        case 274:
                                            goto IL_1b70;
                                        case 275:
                                            goto IL_1b7b;
                                        case 277:
                                            goto IL_1b90;
                                        case 278:
                                            goto IL_1bed;
                                        case 279:
                                            goto IL_1c0b;
                                        case 280:
                                            goto IL_1c1b;
                                        case 281:
                                            goto IL_1c44;
                                        case 282:
                                            goto IL_1c4f;
                                        case 284:
                                            goto IL_1c64;
                                        case 285:
                                            goto IL_1c82;
                                        case 286:
                                            goto IL_1c92;
                                        case 287:
                                            goto IL_1cbb;
                                        case 288:
                                            goto IL_1cc6;
                                        case 290:
                                            goto IL_1cdb;
                                        case 291:
                                            goto IL_1ced;
                                        case 292:
                                            goto IL_1d4a;
                                        case 293:
                                            goto IL_1d68;
                                        case 294:
                                            goto IL_1d78;
                                        case 295:
                                            goto IL_1da1;
                                        case 296:
                                            goto IL_1dac;
                                        case 298:
                                            goto IL_1dc1;
                                        case 299:
                                            goto IL_1ddd;
                                        case 300:
                                            goto IL_1df9;
                                        case 301:
                                            goto IL_1e0b;
                                        case 302:
                                            goto IL_1e39;
                                        case 303:
                                            goto IL_1e46;
                                        case 304:
                                            goto IL_1e64;
                                        case 305:
                                            goto IL_1e86;
                                        case 306:
                                            goto IL_1e91;
                                        case 307:
                                            goto IL_1eb0;
                                        case 308:
                                            goto IL_1ed1;
                                        case 309:
                                            goto IL_1ef3;
                                        case 310:
                                            goto IL_1f13;
                                        case 311:
                                            goto IL_1f1d;
                                        case 313:
                                            goto IL_1f43;
                                        case 312:
                                        case 314:
                                            goto IL_1f58;
                                        case 315:
                                            goto IL_1f76;
                                        case 316:
                                            goto IL_1f86;
                                        case 317:
                                            goto IL_1faf;
                                        case 318:
                                            goto IL_1fba;
                                        case 319:
                                            goto IL_1fca;
                                        case 321:
                                            goto IL_1fe9;
                                        case 322:
                                            goto IL_20c1;
                                        case 323:
                                            goto IL_211e;
                                        case 324:
                                            goto IL_213c;
                                        case 325:
                                            goto IL_214c;
                                        case 326:
                                            goto IL_2175;
                                        case 327:
                                            goto IL_2180;
                                        case 329:
                                            goto IL_2195;
                                        case 330:
                                            goto IL_21b1;
                                        case 331:
                                            goto IL_21cd;
                                        case 332:
                                            goto IL_21df;
                                        case 333:
                                            goto IL_220d;
                                        case 334:
                                            goto IL_221a;
                                        case 335:
                                            goto IL_2238;
                                        case 336:
                                            goto IL_225a;
                                        case 337:
                                            goto IL_2265;
                                        case 338:
                                            goto IL_2284;
                                        case 339:
                                            goto IL_22a5;
                                        case 340:
                                            goto IL_22c7;
                                        case 341:
                                            goto IL_22e7;
                                        case 342:
                                            goto IL_22f1;
                                        case 344:
                                            goto IL_2317;
                                        case 343:
                                        case 345:
                                            goto IL_232c;
                                        case 346:
                                            goto IL_234a;
                                        case 347:
                                            goto IL_235a;
                                        case 348:
                                            goto IL_2383;
                                        case 349:
                                            goto IL_238e;
                                        case 350:
                                            goto IL_239e;
                                        case 352:
                                            goto IL_23bd;
                                        case 353:
                                            goto IL_241a;
                                        case 355:
                                            goto IL_243a;
                                        case 176:
                                        case 181:
                                        case 190:
                                        case 202:
                                        case 206:
                                        case 212:
                                        case 215:
                                        case 225:
                                        case 228:
                                        case 252:
                                        case 259:
                                        case 265:
                                        case 270:
                                        case 276:
                                        case 283:
                                        case 289:
                                        case 297:
                                        case 320:
                                        case 328:
                                        case 351:
                                        case 354:
                                        case 356:
                                            goto IL_2458;
                                        case 357:
                                            goto IL_2463;
                                        case 358:
                                            goto IL_2487;
                                        case 359:
                                            goto IL_24a3;
                                        case 175:
                                        case 180:
                                        case 205:
                                        case 258:
                                        case 269:
                                        case 360:
                                            goto IL_24b5;
                                        case 361:
                                            goto IL_24d4;
                                        case 362:
                                            goto IL_24f8;
                                        case 363:
                                            goto IL_2530;
                                        case 364:
                                            goto IL_2549;
                                        case 366:
                                            goto IL_2557;
                                        case 367:
                                            goto IL_2575;
                                        case 369:
                                            goto IL_2580;
                                        case 370:
                                            goto IL_259e;
                                        case 372:
                                            goto IL_25a9;
                                        case 373:
                                            goto IL_25bd;
                                        case 375:
                                            goto IL_25df;
                                        case 365:
                                        case 368:
                                        case 371:
                                        case 374:
                                        case 376:
                                            goto IL_25ff;
                                        case 377:
                                            goto IL_260e;
                                        case 378:
                                            goto IL_2618;
                                        case 380:
                                            goto IL_2628;
                                        case 381:
                                            goto IL_263b;
                                        case 384:
                                            goto IL_2649;
                                        case 385:
                                            goto IL_2668;
                                        case 383:
                                        case 386:
                                            goto IL_2684;
                                        case 379:
                                        case 382:
                                        case 387:
                                            goto IL_2693;
                                        case 388:
                                            goto end_IL_0000_2;
                                        default:
                                            goto end_IL_0000;
                                        case 389:
                                            goto end_IL_0000_3;
                                    }
                                    goto default;
                                }
                            IL_043b:
                                num2 = 56;
                                num5++;
                                goto IL_0442;
                            IL_0052:
                                if (num5 <= count)
                                {
                                    goto IL_0017;
                                }
                                goto IL_0057;
                            IL_0017:
                                num2 = 2;
                                FC2 = Document.FeatureChains[num5];
                                goto IL_0033;
                            IL_0033:
                                num2 = 3;
                                if (Operators.CompareString(FC2.Name, "Turning", false) != 0)
                                {
                                    goto IL_004c;
                                }
                                goto IL_0057;
                            IL_004c:
                                num2 = 5;
                                num5++;
                                goto IL_0052;
                            IL_0057:
                                ProjectData.ClearProjectError();
                                num3 = 1;
                                goto IL_005e;
                            IL_005e:
                                num2 = 7;
                                selectionSet = Document.SelectionSets["Temp3"];
                                goto IL_0076;
                            IL_0076:
                                num2 = 8;
                                if (selectionSet == null)
                                {
                                    goto IL_007c;
                                }
                                goto IL_0095;
                            IL_007c:
                                num2 = 9;
                                selectionSet = Document.SelectionSets.Add("Temp3");
                                goto IL_0095;
                            IL_0095:
                                num2 = 10;
                                selectionSet.RemoveAll();
                                goto IL_009f;
                            IL_009f:
                                num2 = 11;
                                selectionSet.Add(FC2, RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_00b8;
                            IL_00b8:
                                num2 = 12;
                                selectionSet.AddCopiesToSelectionSet = true;
                                goto IL_00c3;
                            IL_00c3:
                                num2 = 13;
                                selectionSet.Translate(0.0, 0.0, 0.0, 1);
                                goto IL_00ee;
                            IL_00ee:
                                num2 = 14;
                                FC2 = (FeatureChain)selectionSet[2];
                                goto IL_0108;
                            IL_0108:
                                num2 = 15;
                                FC2.Layer = Document.Layers["TurningLayer"];
                                goto IL_0129;
                            IL_0129:
                                num2 = 16;
                                selectionSet.Remove(1);
                                goto IL_0139;
                            IL_0139:
                                num2 = 17;
                                Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_015a;
                            IL_015a:
                                num2 = 18;
                                if (RL == 1.0)
                                {
                                    goto IL_016d;
                                }
                                goto IL_018f;
                            IL_016d:
                                num2 = 19;
                                selectionSet.Offset(0.2, espOffsetSide.espOffsetLeft, ToolBlend: true, espLookAheadMode.espLookAheadOn, RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_01c2;
                            IL_018f:
                                num2 = 21;
                                if (RL == 2.0)
                                {
                                    goto IL_01a2;
                                }
                                goto IL_01c2;
                            IL_01a2:
                                num2 = 22;
                                selectionSet.Offset(0.2, espOffsetSide.espOffsetRight, ToolBlend: true, espLookAheadMode.espLookAheadOn, RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_01c2;
                            IL_01c2:
                                num2 = 23;
                                fC = (FeatureChain)selectionSet[2];
                                goto IL_01d9;
                            IL_01d9:
                                num2 = 24;
                                selectionSet.RemoveAll();
                                goto IL_01e3;
                            IL_01e3:
                                num2 = 25;
                                Document.FeatureChains.Remove(FC2.Key);
                                goto IL_01ff;
                            IL_01ff:
                                num2 = 26;
                                Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_0220;
                            IL_0220:
                                num2 = 27;
                                FC2 = fC;
                                goto IL_022a;
                            IL_022a:
                                num2 = 28;
                                FC2.Reverse();
                                goto IL_0237;
                            IL_0237:
                                num2 = 29;
                                Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_0258;
                            IL_0258:
                                num2 = 30;
                                point = Document.GetPoint(FC2.Extremity(espExtremityType.espExtremityEnd).X, -1.0 * Document.LatheMachineSetup.BarDiameter / 2.0, 0);
                                goto IL_02aa;
                            IL_02aa:
                                num2 = 31;
                                FC2.Add(point);
                                goto IL_02b9;
                            IL_02b9:
                                num2 = 32;
                                FC2.Name += "Compare";
                                goto IL_02da;
                            IL_02da:
                                num2 = 33;
                                FC2.Layer = Document.Layers["TurningLayer"];
                                goto IL_02fb;
                            IL_02fb:
                                num2 = 34;
                                FC2.Reverse();
                                goto IL_0308;
                            IL_0308:
                                num2 = 35;
                                point = null;
                                goto IL_030e;
                            IL_030e:
                                num2 = 36;
                                Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_032f;
                            IL_032f:
                                num2 = 37;
                                Py = 0.0;
                                goto IL_0340;
                            IL_0340:
                                num2 = 38;
                                num6 = (int)Math.Round(Math.Round(FC2.Length / 0.2, 0));
                                goto IL_0365;
                            IL_0365:
                                num2 = 39;
                                num7 = num6;
                                num5 = 1;
                                goto IL_0442;
                            IL_0442:
                                if (num5 <= num7)
                                {
                                    goto IL_0373;
                                }
                                goto IL_044a;
                            IL_0373:
                                num2 = 40;
                                point = FC2.PointAlong((double)(num5 - 1) * 0.2);
                                goto IL_0390;
                            IL_0390:
                                num2 = 41;
                                if (RL == 1.0)
                                {
                                    goto IL_03a3;
                                }
                                goto IL_03e8;
                            IL_03a3:
                                num2 = 42;
                                if (!(point.X >= MoveSTL_Module.BackPointX))
                                {
                                    goto IL_03b7;
                                }
                                goto IL_044a;
                            IL_03b7:
                                num2 = 45;
                                if (point.Y >= Py)
                                {
                                    goto IL_03c8;
                                }
                                goto IL_043b;
                            IL_03c8:
                                num2 = 46;
                                Py = point.Y;
                                goto IL_03d7;
                            IL_03d7:
                                num2 = 47;
                                Px = point.X;
                                goto IL_043b;
                            IL_03e8:
                                num2 = 49;
                                if (RL == 2.0)
                                {
                                    goto IL_03fb;
                                }
                                goto IL_043b;
                            IL_03fb:
                                num2 = 50;
                                if (!(point.X <= MoveSTL_Module.BackPointX))
                                {
                                    goto IL_040c;
                                }
                                goto IL_044a;
                            IL_040c:
                                num2 = 53;
                                if (point.Y >= Py)
                                {
                                    goto IL_041d;
                                }
                                goto IL_043b;
                            IL_041d:
                                num2 = 54;
                                Py = point.Y;
                                goto IL_042c;
                            IL_042c:
                                num2 = 55;
                                Px = point.X;
                                goto IL_043b;
                            IL_044a:
                                num2 = 57;
                                Extend();
                                goto IL_0452;
                            IL_0452:
                                num2 = 58;
                                graphicObject = (GraphicObject)((IFeatureChain)FC1).get_Item(FC1.Count);
                                goto IL_0470;
                            IL_0470:
                                num2 = 59;
                                if (graphicObject.GraphicObjectType == espGraphicObjectType.espSegment)
                                {
                                    goto IL_047d;
                                }
                                goto IL_04ba;
                            IL_047d:
                                num2 = 60;
                                segment = (Segment)graphicObject;
                                goto IL_0489;
                            IL_0489:
                                num2 = 61;
                                if (segment.Length <= 0.01)
                                {
                                    goto IL_049e;
                                }
                                goto IL_04ba;
                            IL_049e:
                                num2 = 62;
                                FC1.RemoveEnd(FC1.Count);
                                goto IL_04ba;
                            IL_04ba:
                                num2 = 63;
                                if (graphicObject.GraphicObjectType == espGraphicObjectType.espArc)
                                {
                                    goto IL_04c7;
                                }
                                goto IL_0504;
                            IL_04c7:
                                num2 = 64;
                                arc = (Arc)graphicObject;
                                goto IL_04d3;
                            IL_04d3:
                                num2 = 65;
                                if (arc.Length <= 0.01)
                                {
                                    goto IL_04e8;
                                }
                                goto IL_0504;
                            IL_04e8:
                                num2 = 66;
                                FC1.RemoveEnd(FC1.Count);
                                goto IL_0504;
                            IL_0504:
                                num2 = 67;
                                selectionSet.Add(FC1, RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_051d;
                            IL_051d:
                                num2 = 68;
                                fcname = FC1.Name;
                                goto IL_052f;
                            IL_052f:
                                num2 = 69;
                                if (RL == 1.0)
                                {
                                    goto IL_0542;
                                }
                                goto IL_0564;
                            IL_0542:
                                num2 = 70;
                                selectionSet.Offset(0.2, espOffsetSide.espOffsetLeft, ToolBlend: true, espLookAheadMode.espLookAheadOn, RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_0597;
                            IL_0564:
                                num2 = 72;
                                if (RL == 2.0)
                                {
                                    goto IL_0577;
                                }
                                goto IL_0597;
                            IL_0577:
                                num2 = 73;
                                selectionSet.Offset(0.2, espOffsetSide.espOffsetRight, ToolBlend: true, espLookAheadMode.espLookAheadOn, RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_0597;
                            IL_0597:
                                num2 = 74;
                                FC1 = (FeatureChain)selectionSet[2];
                                goto IL_05b1;
                            IL_05b1:
                                num2 = 75;
                                selectionSet.RemoveAll();
                                goto IL_05bb;
                            IL_05bb:
                                num2 = 76;
                                Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_05dc;
                            IL_05dc:
                                num2 = 77;
                                FC1.Name += "T";
                                goto IL_05fd;
                            IL_05fd:
                                num2 = 78;
                                FC1.Layer = Document.Layers["RoughMillingLayer"];
                                goto IL_061e;
                            IL_061e:
                                num2 = 79;
                                count2 = Document.FeatureChains.Count;
                                num6 = 1;
                                goto IL_06c4;
                            IL_06c4:
                                if (num6 <= count2)
                                {
                                    goto IL_063a;
                                }
                                goto IL_06cd;
                            IL_063a:
                                num2 = 80;
                                FC1 = Document.FeatureChains[num6];
                                goto IL_0658;
                            IL_0658:
                                num2 = 81;
                                if (Operators.CompareString(FC1.Layer.Name, "Temp", false) == 0)
                                {
                                    goto IL_0677;
                                }
                                goto IL_06bb;
                            IL_0677:
                                num2 = 82;
                                FC1.Name += "T";
                                goto IL_0698;
                            IL_0698:
                                num2 = 83;
                                FC1.Layer = Document.Layers["RoughMillingLayer"];
                                goto IL_06cd;
                            IL_06cd:
                                num2 = 86;
                                num8 = 0;
                                goto IL_06d3;
                            IL_06d3:
                                num2 = 87;
                                count3 = FC1.Count;
                                num6 = 1;
                                goto IL_0777;
                            IL_0777:
                                if (num6 <= count3)
                                {
                                    goto IL_06ea;
                                }
                                goto IL_0780;
                            IL_0780:
                                num2 = 94;
                                if (num8 == 2)
                                {
                                    goto IL_078b;
                                }
                                goto IL_0a5f;
                            IL_078b:
                                num2 = 95;
                                Document.FeatureChains.Remove(FC1.Key);
                                goto IL_07a7;
                            IL_07a7:
                                num2 = 96;
                                count4 = Document.FeatureChains.Count;
                                num6 = 1;
                                goto IL_0801;
                            IL_0801:
                                if (num6 <= count4)
                                {
                                    goto IL_07c0;
                                }
                                goto IL_0807;
                            IL_07c0:
                                num2 = 97;
                                FC1 = Document.FeatureChains[num6];
                                goto IL_07de;
                            IL_07de:
                                num2 = 98;
                                if (Operators.CompareString(FC1.Name, fcname, false) != 0)
                                {
                                    goto IL_07f8;
                                }
                                goto IL_0807;
                            IL_07f8:
                                num2 = 100;
                                num6++;
                                goto IL_0801;
                            IL_0807:
                                num2 = 101;
                                selectionSet.Add(FC1, RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_0820;
                            IL_0820:
                                num2 = 102;
                                if (RL == 1.0)
                                {
                                    goto IL_0833;
                                }
                                goto IL_0855;
                            IL_0833:
                                num2 = 103;
                                selectionSet.Offset(0.01, espOffsetSide.espOffsetRight, ToolBlend: true, espLookAheadMode.espLookAheadOn, RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_0888;
                            IL_0855:
                                num2 = 105;
                                if (RL == 2.0)
                                {
                                    goto IL_0868;
                                }
                                goto IL_0888;
                            IL_0868:
                                num2 = 106;
                                selectionSet.Offset(0.01, espOffsetSide.espOffsetLeft, ToolBlend: true, espLookAheadMode.espLookAheadOn, RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_0888;
                            IL_0888:
                                num2 = 107;
                                selectionSet.RemoveAll();
                                goto IL_0892;
                            IL_0892:
                                num2 = 108;
                                Document.FeatureChains.Remove(FC1.Key);
                                goto IL_08ae;
                            IL_08ae:
                                num2 = 109;
                                count5 = Document.FeatureChains.Count;
                                num6 = 1;
                                goto IL_0908;
                            IL_0908:
                                if (num6 <= count5)
                                {
                                    goto IL_08c7;
                                }
                                goto IL_090e;
                            IL_08c7:
                                num2 = 110;
                                FC1 = Document.FeatureChains[num6];
                                goto IL_08e5;
                            IL_08e5:
                                num2 = 111;
                                if (Operators.CompareString(FC1.Name, fcname, false) != 0)
                                {
                                    goto IL_08ff;
                                }
                                goto IL_090e;
                            IL_08ff:
                                num2 = 113;
                                num6++;
                                goto IL_0908;
                            IL_090e:
                                num2 = 114;
                                selectionSet.Add(FC1, RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_0927;
                            IL_0927:
                                num2 = 115;
                                if (RL == 1.0)
                                {
                                    goto IL_093a;
                                }
                                goto IL_095c;
                            IL_093a:
                                num2 = 116;
                                selectionSet.Offset(0.21, espOffsetSide.espOffsetLeft, ToolBlend: true, espLookAheadMode.espLookAheadOn, RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_098f;
                            IL_095c:
                                num2 = 118;
                                if (RL == 2.0)
                                {
                                    goto IL_096f;
                                }
                                goto IL_098f;
                            IL_096f:
                                num2 = 119;
                                selectionSet.Offset(0.21, espOffsetSide.espOffsetRight, ToolBlend: true, espLookAheadMode.espLookAheadOn, RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_098f;
                            IL_098f:
                                num2 = 120;
                                selectionSet.RemoveAll();
                                goto IL_0999;
                            IL_0999:
                                num2 = 121;
                                Document.FeatureChains.Remove(FC1.Key);
                                goto IL_09b5;
                            IL_09b5:
                                num2 = 122;
                                Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_09d6;
                            IL_09d6:
                                num2 = 123;
                                count6 = Document.FeatureChains.Count;
                                num5 = 1;
                                goto IL_0a55;
                            IL_0a55:
                                if (num5 <= count6)
                                {
                                    goto IL_09ee;
                                }
                                goto IL_0b77;
                            IL_09ee:
                                num2 = 124;
                                FC1 = Document.FeatureChains[num5];
                                goto IL_0a0b;
                            IL_0a0b:
                                num2 = 125;
                                if (Operators.CompareString(FC1.Name, fcname, false) == 0)
                                {
                                    goto IL_0a25;
                                }
                                goto IL_0a4b;
                            IL_0a25:
                                num2 = 126;
                                FC1.Layer = Document.Layers["RoughMillingLayer"];
                                goto IL_0b77;
                            IL_0a4b:
                                num2 = 128;
                                num5++;
                                goto IL_0a55;
                            IL_0a5f:
                                num2 = 130;
                                count7 = Document.FeatureChains.Count;
                                num6 = 1;
                                goto IL_0ac5;
                            IL_0ac5:
                                if (num6 <= count7)
                                {
                                    goto IL_0a7b;
                                }
                                goto IL_0acb;
                            IL_0a7b:
                                num2 = 131;
                                FC1 = Document.FeatureChains[num6];
                                goto IL_0a9c;
                            IL_0a9c:
                                num2 = 132;
                                if (Operators.CompareString(FC1.Name, fcname, false) != 0)
                                {
                                    goto IL_0ab9;
                                }
                                goto IL_0acb;
                            IL_0ab9:
                                num2 = 134;
                                num6++;
                                goto IL_0ac5;
                            IL_0acb:
                                num2 = 135;
                                Document.FeatureChains.Remove(FC1.Key);
                                goto IL_0aea;
                            IL_0aea:
                                num2 = 136;
                                count8 = Document.FeatureChains.Count;
                                num6 = 1;
                                goto IL_0b71;
                            IL_0b71:
                                if (num6 <= count8)
                                {
                                    goto IL_0b06;
                                }
                                goto IL_0b77;
                            IL_0b06:
                                num2 = 137;
                                FC1 = Document.FeatureChains[num6];
                                goto IL_0b27;
                            IL_0b27:
                                num2 = 138;
                                if (Operators.CompareString(FC1.Name, fcname + "T", false) == 0)
                                {
                                    goto IL_0b4e;
                                }
                                goto IL_0b65;
                            IL_0b4e:
                                num2 = 139;
                                FC1.Name = fcname;
                                goto IL_0b77;
                            IL_0b77:
                                num2 = 142;
                                Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_0b9b;
                            IL_0b9b:
                                num2 = 143;
                                if (NeedEndPart == 0)
                                {
                                    goto IL_0ba8;
                                }
                                goto IL_0bb5;
                            IL_0ba8:
                                num2 = 144;
                                ExtendEnd();
                                goto IL_0bc0;
                            IL_0bb5:
                                num2 = 146;
                                ExtendEndFirst();
                                goto IL_0bc0;
                            IL_0bc0:
                                num2 = 147;
                                Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_0be4;
                            IL_0be4:
                                num2 = 148;
                                selectionSet.RemoveAll();
                                goto IL_0bf1;
                            IL_0bf1:
                                num2 = 149;
                                selectionSet2 = Document.SelectionSets["Tem"];
                                goto IL_0c0d;
                            IL_0c0d:
                                num2 = 150;
                                if (selectionSet2 == null)
                                {
                                    goto IL_0c17;
                                }
                                goto IL_0c33;
                            IL_0c17:
                                num2 = 151;
                                selectionSet2 = Document.SelectionSets.Add("Tem");
                                goto IL_0c33;
                            IL_0c33:
                                num2 = 152;
                                selectionSet2.RemoveAll();
                                goto IL_0c40;
                            IL_0c40:
                                num2 = 153;
                                num5 = 1;
                                goto IL_0c48;
                            IL_0c48:
                                num2 = 154;
                                count9 = Document.FeatureChains.Count;
                                num6 = 1;
                                goto IL_0cae;
                            IL_0cae:
                                if (num6 <= count9)
                                {
                                    goto IL_0c64;
                                }
                                goto IL_0cb4;
                            IL_0c64:
                                num2 = 155;
                                FC1 = Document.FeatureChains[num6];
                                goto IL_0c85;
                            IL_0c85:
                                num2 = 156;
                                if (Operators.CompareString(FC1.Name, fcname, false) != 0)
                                {
                                    goto IL_0ca2;
                                }
                                goto IL_0cb4;
                            IL_0ca2:
                                num2 = 158;
                                num6++;
                                goto IL_0cae;
                            IL_0cb4:
                                num2 = 159;
                                selectionSet.Add(FC1, RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_0cd0;
                            IL_0cd0:
                                num2 = 160;
                                if (RL == 1.0)
                                {
                                    goto IL_0ce6;
                                }
                                goto IL_0d0a;
                            IL_0ce6:
                                num2 = 161;
                                selectionSet.Offset(MillingDepth * (double)num5, espOffsetSide.espOffsetLeft, ToolBlend: true, espLookAheadMode.espLookAheadOn, RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_0d42;
                            IL_0d0a:
                                num2 = 163;
                                if (RL == 2.0)
                                {
                                    goto IL_0d20;
                                }
                                goto IL_0d42;
                            IL_0d20:
                                num2 = 164;
                                selectionSet.Offset(MillingDepth * (double)num5, espOffsetSide.espOffsetRight, ToolBlend: true, espLookAheadMode.espLookAheadOn, RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_0d42;
                            IL_0d42:
                                num2 = 165;
                                FC1 = (FeatureChain)selectionSet[2];
                                goto IL_0d5f;
                            IL_0d5f:
                                num2 = 166;
                                selectionSet.RemoveAll();
                                goto IL_0d6c;
                            IL_0d6c:
                                num2 = 167;
                                Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_0d90;
                            IL_0d90:
                                num2 = 168;
                                FC1.Name += Conversions.ToString(num5);
                                goto IL_0db5;
                            IL_0db5:
                                num2 = 169;
                                FC1.Layer = Document.Layers["RoughMillingLayer"];
                                goto IL_0dd9;
                            IL_0dd9:
                                num2 = 170;
                                Intersection.DemoFc();
                                goto IL_0de4;
                            IL_0de4:
                                num2 = 171;
                                _ = FC1.Count;
                                goto IL_0df5;
                            IL_0df5:
                                num2 = 172;
                                if (FcNumber[1] == 0)
                                {
                                    goto IL_0e04;
                                }
                                goto IL_0e34;
                            IL_0e04:
                                num2 = 173;
                                Document.FeatureChains.Remove(FC1.Key);
                                goto IL_0e23;
                            IL_0e23:
                                num2 = 174;
                                FC1 = null;
                                goto IL_24b5;
                            IL_0e34:
                                num2 = 177;
                                if (FcNumber[3] == 0)
                                {
                                    goto IL_0e46;
                                }
                                goto IL_1022;
                            IL_0e46:
                                num2 = 178;
                                if (((Math.Abs(ptp[1].X - ptp[2].X) <= 2.5) & (Math.Abs(ptp[1].Y - ptp[2].Y) <= MillingDepth)) | (Math.Sqrt((ptp[1].X - ptp[2].X) * (ptp[1].X - ptp[2].X) + (ptp[1].Y - ptp[2].Y) * (ptp[1].Y - ptp[2].Y)) < 1.8))
                                {
                                    goto IL_0f1b;
                                }
                                goto IL_0f3f;
                            IL_0f1b:
                                num2 = 179;
                                Document.FeatureChains.Remove(FC1.Key);
                                goto IL_24b5;
                            IL_0f3f:
                                num2 = 182;
                                FC1.RemoveEnd(FcNumber[2] + 1);
                                goto IL_0f5d;
                            IL_0f5d:
                                num2 = 183;
                                FC1.Reverse();
                                goto IL_0f6d;
                            IL_0f6d:
                                num2 = 184;
                                Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_0f91;
                            IL_0f91:
                                num2 = 185;
                                FC1.RemoveEnd(FC1.Count - FcNumber[1] + 2);
                                goto IL_0fba;
                            IL_0fba:
                                num2 = 186;
                                Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_0fde;
                            IL_0fde:
                                num2 = 187;
                                ExtendEnd2();
                                goto IL_0fe9;
                            IL_0fe9:
                                num2 = 188;
                                FC1.Reverse();
                                goto IL_0ff9;
                            IL_0ff9:
                                num2 = 189;
                                Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_2458;
                            IL_1022:
                                num2 = 191;
                                if (FcNumber[5] == 0)
                                {
                                    goto IL_1034;
                                }
                                goto IL_17d2;
                            IL_1034:
                                num2 = 192;
                                if (((Math.Abs(ptp[1].X - ptp[2].X) <= 2.5) & (Math.Abs(ptp[1].Y - ptp[2].Y) <= MillingDepth)) | (Math.Sqrt((ptp[1].X - ptp[2].X) * (ptp[1].X - ptp[2].X) + (ptp[1].Y - ptp[2].Y) * (ptp[1].Y - ptp[2].Y)) < 1.8))
                                {
                                    goto IL_110c;
                                }
                                goto IL_12f9;
                            IL_110c:
                                num2 = 193;
                                if (FcNumber[4] == 0)
                                {
                                    goto IL_111e;
                                }
                                goto IL_1201;
                            IL_111e:
                                num2 = 194;
                                FC1.RemoveEnd(FcNumber[3] + 1);
                                goto IL_113c;
                            IL_113c:
                                num2 = 195;
                                FC1.Reverse();
                                goto IL_114c;
                            IL_114c:
                                num2 = 196;
                                Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_1170;
                            IL_1170:
                                num2 = 197;
                                FC1.RemoveEnd(FC1.Count - FcNumber[2] + 2);
                                goto IL_1199;
                            IL_1199:
                                num2 = 198;
                                Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_11bd;
                            IL_11bd:
                                num2 = 199;
                                ExtendEnd2();
                                goto IL_11c8;
                            IL_11c8:
                                num2 = 200;
                                FC1.Reverse();
                                goto IL_11d8;
                            IL_11d8:
                                num2 = 201;
                                Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_2458;
                            IL_1201:
                                num2 = 203;
                                if ((Math.Abs(ptp[3].X - ptp[4].X) <= 2.5) & (Math.Abs(ptp[3].Y - ptp[4].Y) <= MillingDepth))
                                {
                                    goto IL_125e;
                                }
                                goto IL_1282;
                            IL_125e:
                                num2 = 204;
                                Document.FeatureChains.Remove(FC1.Key);
                                goto IL_24b5;
                            IL_1282:
                                num2 = 207;
                                FC1.RemoveEnd(FcNumber[4] + 1);
                                goto IL_12a0;
                            IL_12a0:
                                num2 = 208;
                                FC1.Reverse();
                                goto IL_12b0;
                            IL_12b0:
                                num2 = 209;
                                FC1.RemoveEnd(FC1.Count - FcNumber[3] + 2);
                                goto IL_12d9;
                            IL_12d9:
                                num2 = 210;
                                ExtendEnd2();
                                goto IL_12e4;
                            IL_12e4:
                                num2 = 211;
                                FC1.Reverse();
                                goto IL_2458;
                            IL_12f9:
                                num2 = 213;
                                if (FcNumber[4] == 0)
                                {
                                    goto IL_1308;
                                }
                                goto IL_132b;
                            IL_1308:
                                num2 = 214;
                                FC1.RemoveEnd(FcNumber[3] + 1);
                                goto IL_2458;
                            IL_132b:
                                num2 = 216;
                                if (((Math.Abs(ptp[3].X - ptp[4].X) <= 2.5) & (Math.Abs(ptp[3].Y - ptp[4].Y) <= MillingDepth)) | (Math.Sqrt((ptp[3].X - ptp[4].X) * (ptp[3].X - ptp[4].X) + (ptp[3].Y - ptp[4].Y) * (ptp[3].Y - ptp[4].Y)) < 1.8))
                                {
                                    goto IL_1403;
                                }
                                goto IL_14e6;
                            IL_1403:
                                num2 = 217;
                                FC1.RemoveEnd(FcNumber[2] + 1);
                                goto IL_1421;
                            IL_1421:
                                num2 = 218;
                                FC1.Reverse();
                                goto IL_1431;
                            IL_1431:
                                num2 = 219;
                                Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_1455;
                            IL_1455:
                                num2 = 220;
                                FC1.RemoveEnd(FC1.Count - FcNumber[1] + 2);
                                goto IL_147e;
                            IL_147e:
                                num2 = 221;
                                Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_14a2;
                            IL_14a2:
                                num2 = 222;
                                ExtendEnd2();
                                goto IL_14ad;
                            IL_14ad:
                                num2 = 223;
                                FC1.Reverse();
                                goto IL_14bd;
                            IL_14bd:
                                num2 = 224;
                                Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_2458;
                            IL_14e6:
                                num2 = 226;
                                if (Math.Sqrt((ptp[2].X - ptp[3].X) * (ptp[2].X - ptp[3].X) + (ptp[2].Y - ptp[3].Y) * (ptp[2].Y - ptp[3].Y)) <= 4.0)
                                {
                                    goto IL_1563;
                                }
                                goto IL_1586;
                            IL_1563:
                                num2 = 227;
                                FC1.RemoveEnd(FcNumber[4] + 1);
                                goto IL_2458;
                            IL_1586:
                                num2 = 229;
                                selectionSet.Add(FC1, RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_15a2;
                            IL_15a2:
                                num2 = 230;
                                activeLayer = Document.Layers.Add("Temp");
                                goto IL_15be;
                            IL_15be:
                                num2 = 231;
                                Document.ActiveLayer = activeLayer;
                                goto IL_15d0;
                            IL_15d0:
                                num2 = 232;
                                selectionSet.Translate(0.0, 0.0, 0.0, 1);
                                goto IL_15fe;
                            IL_15fe:
                                num2 = 233;
                                selectionSet.RemoveAll();
                                goto IL_160b;
                            IL_160b:
                                num2 = 234;
                                FC1.RemoveEnd(FcNumber[2] + 1);
                                goto IL_1629;
                            IL_1629:
                                num2 = 235;
                                FC1.Name = fcname + Conversions.ToString(num5 + 1);
                                goto IL_164b;
                            IL_164b:
                                num2 = 236;
                                ExtendEnd();
                                goto IL_1656;
                            IL_1656:
                                num2 = 237;
                                Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_167a;
                            IL_167a:
                                num2 = 238;
                                count10 = Document.FeatureChains.Count;
                                num9 = 1;
                                goto IL_1738;
                            IL_1738:
                                if (num9 <= count10)
                                {
                                    goto IL_1699;
                                }
                                goto IL_1741;
                            IL_1699:
                                num2 = 239;
                                FC1 = Document.FeatureChains[num9];
                                goto IL_16ba;
                            IL_16ba:
                                num2 = 240;
                                if (Operators.CompareString(FC1.Layer.Name, "Temp", false) == 0)
                                {
                                    goto IL_16dc;
                                }
                                goto IL_172c;
                            IL_16dc:
                                num2 = 241;
                                FC1.Name = fcname + Conversions.ToString(num5);
                                goto IL_16fc;
                            IL_16fc:
                                num2 = 242;
                                num5++;
                                goto IL_1706;
                            IL_1706:
                                num2 = 243;
                                FC1.Layer = Document.Layers["RoughMillingLayer"];
                                goto IL_1741;
                            IL_1741:
                                num2 = 246;
                                FC1.RemoveEnd(FcNumber[4] + 1);
                                goto IL_175f;
                            IL_175f:
                                num2 = 247;
                                FC1.Reverse();
                                goto IL_176f;
                            IL_176f:
                                num2 = 248;
                                FC1.RemoveEnd(FC1.Count - FcNumber[3] + 2);
                                goto IL_1798;
                            IL_1798:
                                num2 = 249;
                                ExtendEnd2();
                                goto IL_17a3;
                            IL_17a3:
                                num2 = 250;
                                FC1.Reverse();
                                goto IL_17b3;
                            IL_17b3:
                                num2 = 251;
                                Document.Layers.Remove("Temp");
                                goto IL_2458;
                            IL_172c:
                                num2 = 245;
                                num9++;
                                goto IL_1738;
                            IL_17d2:
                                num2 = 253;
                                if (((Math.Abs(ptp[1].X - ptp[2].X) <= 2.5) & (Math.Abs(ptp[1].Y - ptp[2].Y) <= MillingDepth)) | (Math.Sqrt((ptp[1].X - ptp[2].X) * (ptp[1].X - ptp[2].X) + (ptp[1].Y - ptp[2].Y) * (ptp[1].Y - ptp[2].Y)) < 1.8))
                                {
                                    goto IL_18aa;
                                }
                                goto IL_1cdb;
                            IL_18aa:
                                num2 = 254;
                                if (FcNumber[6] == 0)
                                {
                                    goto IL_18bc;
                                }
                                goto IL_19c0;
                            IL_18bc:
                                num2 = 255;
                                if ((Math.Abs(ptp[5].X - ptp[4].X) <= 2.0) & (Math.Abs(ptp[5].Y - ptp[4].Y) <= MillingDepth))
                                {
                                    goto IL_1919;
                                }
                                goto IL_1949;
                            IL_1919:
                                num2 = 256;
                                Document.FeatureChains.Remove(FC1.Key);
                                goto IL_1938;
                            IL_1938:
                                num2 = 257;
                                FC1 = null;
                                goto IL_24b5;
                            IL_1949:
                                num2 = 260;
                                FC1.RemoveEnd(FcNumber[5] + 1);
                                goto IL_1967;
                            IL_1967:
                                num2 = 261;
                                FC1.Reverse();
                                goto IL_1977;
                            IL_1977:
                                num2 = 262;
                                FC1.RemoveEnd(FC1.Count - FcNumber[4] + 2);
                                goto IL_19a0;
                            IL_19a0:
                                num2 = 263;
                                ExtendEnd2();
                                goto IL_19ab;
                            IL_19ab:
                                num2 = 264;
                                FC1.Reverse();
                                goto IL_2458;
                            IL_19c0:
                                num2 = 266;
                                if (((Math.Abs(ptp[3].X - ptp[4].X) <= 2.5) & (Math.Abs(ptp[3].Y - ptp[4].Y) <= MillingDepth)) | (Math.Sqrt((ptp[3].X - ptp[4].X) * (ptp[3].X - ptp[4].X) + (ptp[3].Y - ptp[4].Y) * (ptp[3].Y - ptp[4].Y)) < 1.8))
                                {
                                    goto IL_1a98;
                                }
                                goto IL_1b90;
                            IL_1a98:
                                num2 = 267;
                                if ((Math.Abs(ptp[5].X - ptp[6].X) <= 2.0) & (Math.Abs(ptp[5].Y - ptp[6].Y) <= MillingDepth))
                                {
                                    goto IL_1af5;
                                }
                                goto IL_1b19;
                            IL_1af5:
                                num2 = 268;
                                Document.FeatureChains.Remove(FC1.Key);
                                goto IL_24b5;
                            IL_1b19:
                                num2 = 271;
                                FC1.RemoveEnd(FcNumber[6] + 1);
                                goto IL_1b37;
                            IL_1b37:
                                num2 = 272;
                                FC1.Reverse();
                                goto IL_1b47;
                            IL_1b47:
                                num2 = 273;
                                FC1.RemoveEnd(FC1.Count - FcNumber[5] + 2);
                                goto IL_1b70;
                            IL_1b70:
                                num2 = 274;
                                ExtendEnd2();
                                goto IL_1b7b;
                            IL_1b7b:
                                num2 = 275;
                                FC1.Reverse();
                                goto IL_2458;
                            IL_1b90:
                                num2 = 277;
                                if ((Math.Abs(ptp[5].X - ptp[6].X) <= 2.5) & (Math.Abs(ptp[5].Y - ptp[6].Y) <= MillingDepth))
                                {
                                    goto IL_1bed;
                                }
                                goto IL_1c64;
                            IL_1bed:
                                num2 = 278;
                                FC1.RemoveEnd(FcNumber[4] + 1);
                                goto IL_1c0b;
                            IL_1c0b:
                                num2 = 279;
                                FC1.Reverse();
                                goto IL_1c1b;
                            IL_1c1b:
                                num2 = 280;
                                FC1.RemoveEnd(FC1.Count - FcNumber[3] + 2);
                                goto IL_1c44;
                            IL_1c44:
                                num2 = 281;
                                ExtendEnd2();
                                goto IL_1c4f;
                            IL_1c4f:
                                num2 = 282;
                                FC1.Reverse();
                                goto IL_2458;
                            IL_1c64:
                                num2 = 284;
                                FC1.RemoveEnd(FcNumber[6] + 1);
                                goto IL_1c82;
                            IL_1c82:
                                num2 = 285;
                                FC1.Reverse();
                                goto IL_1c92;
                            IL_1c92:
                                num2 = 286;
                                FC1.RemoveEnd(FC1.Count - FcNumber[3] + 2);
                                goto IL_1cbb;
                            IL_1cbb:
                                num2 = 287;
                                ExtendEnd2();
                                goto IL_1cc6;
                            IL_1cc6:
                                num2 = 288;
                                FC1.Reverse();
                                goto IL_2458;
                            IL_1cdb:
                                num2 = 290;
                                if (FcNumber[6] == 0)
                                {
                                    goto IL_1ced;
                                }
                                goto IL_1fe9;
                            IL_1ced:
                                num2 = 291;
                                if ((Math.Abs(ptp[5].X - ptp[4].X) <= 2.5) & (Math.Abs(ptp[5].Y - ptp[4].Y) <= MillingDepth))
                                {
                                    goto IL_1d4a;
                                }
                                goto IL_1dc1;
                            IL_1d4a:
                                num2 = 292;
                                FC1.RemoveEnd(FcNumber[2] + 1);
                                goto IL_1d68;
                            IL_1d68:
                                num2 = 293;
                                FC1.Reverse();
                                goto IL_1d78;
                            IL_1d78:
                                num2 = 294;
                                FC1.RemoveEnd(FC1.Count - FcNumber[1] + 2);
                                goto IL_1da1;
                            IL_1da1:
                                num2 = 295;
                                ExtendEnd2();
                                goto IL_1dac;
                            IL_1dac:
                                num2 = 296;
                                FC1.Reverse();
                                goto IL_2458;
                            IL_1dc1:
                                num2 = 298;
                                selectionSet.Add(FC1, RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_1ddd;
                            IL_1ddd:
                                num2 = 299;
                                activeLayer = Document.Layers.Add("Temp");
                                goto IL_1df9;
                            IL_1df9:
                                num2 = 300;
                                Document.ActiveLayer = activeLayer;
                                goto IL_1e0b;
                            IL_1e0b:
                                num2 = 301;
                                selectionSet.Translate(0.0, 0.0, 0.0, 1);
                                goto IL_1e39;
                            IL_1e39:
                                num2 = 302;
                                selectionSet.RemoveAll();
                                goto IL_1e46;
                            IL_1e46:
                                num2 = 303;
                                FC1.RemoveEnd(FcNumber[2] + 1);
                                goto IL_1e64;
                            IL_1e64:
                                num2 = 304;
                                FC1.Name = fcname + Conversions.ToString(num5 + 1);
                                goto IL_1e86;
                            IL_1e86:
                                num2 = 305;
                                ExtendEnd();
                                goto IL_1e91;
                            IL_1e91:
                                num2 = 306;
                                count11 = Document.FeatureChains.Count;
                                num9 = 1;
                                goto IL_1f4f;
                            IL_1f4f:
                                if (num9 <= count11)
                                {
                                    goto IL_1eb0;
                                }
                                goto IL_1f58;
                            IL_1eb0:
                                num2 = 307;
                                FC1 = Document.FeatureChains[num9];
                                goto IL_1ed1;
                            IL_1ed1:
                                num2 = 308;
                                if (Operators.CompareString(FC1.Layer.Name, "Temp", false) == 0)
                                {
                                    goto IL_1ef3;
                                }
                                goto IL_1f43;
                            IL_1ef3:
                                num2 = 309;
                                FC1.Name = fcname + Conversions.ToString(num5);
                                goto IL_1f13;
                            IL_1f13:
                                num2 = 310;
                                num5++;
                                goto IL_1f1d;
                            IL_1f1d:
                                num2 = 311;
                                FC1.Layer = Document.Layers["RoughMillingLayer"];
                                goto IL_1f58;
                            IL_1f58:
                                num2 = 314;
                                FC1.RemoveEnd(FcNumber[5] + 1);
                                goto IL_1f76;
                            IL_1f76:
                                num2 = 315;
                                FC1.Reverse();
                                goto IL_1f86;
                            IL_1f86:
                                num2 = 316;
                                FC1.RemoveEnd(FC1.Count - FcNumber[4] + 2);
                                goto IL_1faf;
                            IL_1faf:
                                num2 = 317;
                                ExtendEnd2();
                                goto IL_1fba;
                            IL_1fba:
                                num2 = 318;
                                FC1.Reverse();
                                goto IL_1fca;
                            IL_1fca:
                                num2 = 319;
                                Document.Layers.Remove("Temp");
                                goto IL_2458;
                            IL_1f43:
                                num2 = 313;
                                num9++;
                                goto IL_1f4f;
                            IL_1fe9:
                                num2 = 321;
                                if (((Math.Abs(ptp[3].X - ptp[4].X) <= 2.5) & (Math.Abs(ptp[3].Y - ptp[4].Y) <= MillingDepth)) | (Math.Sqrt((ptp[3].X - ptp[4].X) * (ptp[3].X - ptp[4].X) + (ptp[3].Y - ptp[4].Y) * (ptp[3].Y - ptp[4].Y)) < 1.8))
                                {
                                    goto IL_20c1;
                                }
                                goto IL_23bd;
                            IL_20c1:
                                num2 = 322;
                                if ((Math.Abs(ptp[5].X - ptp[6].X) <= 2.5) & (Math.Abs(ptp[5].Y - ptp[6].Y) <= MillingDepth))
                                {
                                    goto IL_211e;
                                }
                                goto IL_2195;
                            IL_211e:
                                num2 = 323;
                                FC1.RemoveEnd(FcNumber[2] + 1);
                                goto IL_213c;
                            IL_213c:
                                num2 = 324;
                                FC1.Reverse();
                                goto IL_214c;
                            IL_214c:
                                num2 = 325;
                                FC1.RemoveEnd(FC1.Count - FcNumber[1] + 2);
                                goto IL_2175;
                            IL_2175:
                                num2 = 326;
                                ExtendEnd2();
                                goto IL_2180;
                            IL_2180:
                                num2 = 327;
                                FC1.Reverse();
                                goto IL_2458;
                            IL_2195:
                                num2 = 329;
                                selectionSet.Add(FC1, RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_21b1;
                            IL_21b1:
                                num2 = 330;
                                activeLayer = Document.Layers.Add("Temp");
                                goto IL_21cd;
                            IL_21cd:
                                num2 = 331;
                                Document.ActiveLayer = activeLayer;
                                goto IL_21df;
                            IL_21df:
                                num2 = 332;
                                selectionSet.Translate(0.0, 0.0, 0.0, 1);
                                goto IL_220d;
                            IL_220d:
                                num2 = 333;
                                selectionSet.RemoveAll();
                                goto IL_221a;
                            IL_221a:
                                num2 = 334;
                                FC1.RemoveEnd(FcNumber[2] + 1);
                                goto IL_2238;
                            IL_2238:
                                num2 = 335;
                                FC1.Name = fcname + Conversions.ToString(num5 + 1);
                                goto IL_225a;
                            IL_225a:
                                num2 = 336;
                                ExtendEnd();
                                goto IL_2265;
                            IL_2265:
                                num2 = 337;
                                count12 = Document.FeatureChains.Count;
                                num9 = 1;
                                goto IL_2323;
                            IL_2323:
                                if (num9 <= count12)
                                {
                                    goto IL_2284;
                                }
                                goto IL_232c;
                            IL_2284:
                                num2 = 338;
                                FC1 = Document.FeatureChains[num9];
                                goto IL_22a5;
                            IL_22a5:
                                num2 = 339;
                                if (Operators.CompareString(FC1.Layer.Name, "Temp", false) == 0)
                                {
                                    goto IL_22c7;
                                }
                                goto IL_2317;
                            IL_22c7:
                                num2 = 340;
                                FC1.Name = fcname + Conversions.ToString(num5);
                                goto IL_22e7;
                            IL_22e7:
                                num2 = 341;
                                num5++;
                                goto IL_22f1;
                            IL_22f1:
                                num2 = 342;
                                FC1.Layer = Document.Layers["RoughMillingLayer"];
                                goto IL_232c;
                            IL_232c:
                                num2 = 345;
                                FC1.RemoveEnd(FcNumber[6] + 1);
                                goto IL_234a;
                            IL_234a:
                                num2 = 346;
                                FC1.Reverse();
                                goto IL_235a;
                            IL_235a:
                                num2 = 347;
                                FC1.RemoveEnd(FC1.Count - FcNumber[5] + 2);
                                goto IL_2383;
                            IL_2383:
                                num2 = 348;
                                ExtendEnd2();
                                goto IL_238e;
                            IL_238e:
                                num2 = 349;
                                FC1.Reverse();
                                goto IL_239e;
                            IL_239e:
                                num2 = 350;
                                Document.Layers.Remove("Temp");
                                goto IL_2458;
                            IL_2317:
                                num2 = 344;
                                num9++;
                                goto IL_2323;
                            IL_23bd:
                                num2 = 352;
                                if ((Math.Abs(ptp[5].X - ptp[6].X) <= 2.5) & (Math.Abs(ptp[5].Y - ptp[6].Y) <= MillingDepth))
                                {
                                    goto IL_241a;
                                }
                                goto IL_243a;
                            IL_241a:
                                num2 = 353;
                                FC1.RemoveEnd(FcNumber[4] + 1);
                                goto IL_2458;
                            IL_243a:
                                num2 = 355;
                                FC1.RemoveEnd(FcNumber[6] + 1);
                                goto IL_2458;
                            IL_2458:
                                num2 = 356;
                                ExtendEnd();
                                goto IL_2463;
                            IL_2463:
                                num2 = 357;
                                FC1.Layer = Document.Layers["RoughMillingLayer"];
                                goto IL_2487;
                            IL_2487:
                                num2 = 358;
                                selectionSet2.Add(FC1, RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_24a3;
                            IL_24a3:
                                num2 = 359;
                                num5++;
                                if (num5 <= 19)
                                {
                                    goto IL_0c48;
                                }
                                goto IL_24b5;
                            IL_24b5:
                                num2 = 360;
                                Document.FeatureChains.Remove(FC2.Key);
                                goto IL_24d4;
                            IL_24d4:
                                num2 = 361;
                                Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                                goto IL_24f8;
                            IL_24f8:
                                num2 = 362;
                                num10 = (int)Math.Round((double)selectionSet2.Count / 2.0 - Conversion.Int((double)selectionSet2.Count / 2.0));
                                goto IL_2530;
                            IL_2530:
                                num2 = 363;
                                if ((AngNumber == 4) & (AngType1 == 1))
                                {
                                    goto IL_2549;
                                }
                                goto IL_2557;
                            IL_2549:
                                num2 = 364;
                                num10 = 1;
                                goto IL_25ff;
                            IL_2557:
                                num2 = 366;
                                if (unchecked(AngNumber == 5 && w == 4) & (AngType1 == 1))
                                {
                                    goto IL_2575;
                                }
                                goto IL_2580;
                            IL_2575:
                                num2 = 367;
                                num10 = 1;
                                goto IL_25ff;
                            IL_2580:
                                num2 = 369;
                                if (unchecked(AngNumber == 5 && w == 5) & (AngType2 == 1))
                                {
                                    goto IL_259e;
                                }
                                goto IL_25a9;
                            IL_259e:
                                num2 = 370;
                                num10 = 1;
                                goto IL_25ff;
                            IL_25a9:
                                num2 = 372;
                                if ((double)num10 <= 0.001)
                                {
                                    goto IL_25bd;
                                }
                                goto IL_25df;
                            IL_25bd:
                                num2 = 373;
                                num10 = (int)Conversion.Int((double)selectionSet2.Count / 2.0);
                                goto IL_25ff;
                            IL_25df:
                                num2 = 375;
                                num10 = (int)Conversion.Int((double)selectionSet2.Count / 2.0);
                                goto IL_25ff;
                            IL_25ff:
                                num2 = 376;
                                count13 = selectionSet2.Count;
                                goto IL_260e;
                            IL_260e:
                                num2 = 377;
                                if (w > 3)
                                {
                                    goto IL_2618;
                                }
                                goto IL_2693;
                            IL_2618:
                                num2 = 378;
                                if (selectionSet2.Count != 1)
                                {
                                    goto IL_2628;
                                }
                                goto IL_2693;
                            IL_2628:
                                num2 = 380;
                                count14 = selectionSet2.Count;
                                num5 = 1;
                                goto IL_268e;
                            IL_268e:
                                if (num5 <= count14)
                                {
                                    goto IL_263b;
                                }
                                goto IL_2693;
                            IL_263b:
                                num2 = 381;
                                if (count13 - num5 >= num10)
                                {
                                    goto IL_2649;
                                }
                                goto IL_2693;
                            IL_2649:
                                num2 = 384;
                                featureChain = (FeatureChain)selectionSet2[count13 - num5 + 1];
                                goto IL_2668;
                            IL_2668:
                                num2 = 385;
                                Document.FeatureChains.Remove(featureChain.Key);
                                goto IL_2684;
                            IL_2684:
                                num2 = 386;
                                num5++;
                                goto IL_268e;
                            IL_2693:
                                num2 = 387;
                                selectionSet2.RemoveAll();
                                break;
                            IL_0b65:
                                num2 = 141;
                                num6++;
                                goto IL_0b71;
                            IL_06ea:
                                num2 = 88;
                                graphicObject = (GraphicObject)((IFeatureChain)FC1).get_Item(num6);
                                goto IL_0700;
                            IL_0700:
                                num2 = 89;
                                if (graphicObject.GraphicObjectType == espGraphicObjectType.espArc)
                                {
                                    goto IL_070d;
                                }
                                goto IL_076e;
                            IL_070d:
                                num2 = 90;
                                arc = (Arc)graphicObject;
                                goto IL_0719;
                            IL_0719:
                                num2 = 91;
                                if ((Math.Abs(arc.Radius - 0.2) <= 0.01) & (Math.Abs(arc.EndAngle - arc.StartAngle) >= 2.45))
                                {
                                    goto IL_0765;
                                }
                                goto IL_076e;
                            IL_0765:
                                num2 = 92;
                                num8++;
                                goto IL_076e;
                            IL_076e:
                                num2 = 93;
                                num6++;
                                goto IL_0777;
                            IL_06bb:
                                num2 = 85;
                                num6++;
                                goto IL_06c4;
                            end_IL_0000_2:
                                break;
                        }
                        num2 = 388;
                        Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
                        break;
                    }
                end_IL_0000:;
                }
                catch (Exception ex) when (num3 != 0 && num == 0)
                {
                    ProjectData.SetProjectError(ex);
                    try0000_dispatch = 11501;
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

        public static void Extend()
        {
            Point[] array = new Point[3];
            FC1.Reverse();
            Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
            FC1.Extremity(espExtremityType.espExtremityEnd);
            object obj = ((IFeatureChain)FC1).get_Item(FC1.Count);
            Point point = default(Point);
            if (RL == 1.0)
            {
                if (Operators.ConditionalCompareObjectEqual(NewLateBinding.LateGet(obj, (Type)null, "GraphicObjectType", new object[0], (string[])null, (Type[])null, (bool[])null), (object)espGraphicObjectType.espSegment, false))
                {
                    IComSegment comSegment = (IComSegment)obj;
                    array[1] = Document.GetPoint(comSegment.PointAlong(0.0).X, comSegment.PointAlong(0.0).Y, comSegment.PointAlong(0.0).Z);
                    array[2] = Document.GetPoint(comSegment.PointAlong(comSegment.Length).X, comSegment.PointAlong(comSegment.Length).Y, comSegment.PointAlong(comSegment.Length).Z);
                    if (array[1].X < array[2].X)
                    {
                        IComVector comVector = comSegment.TangentAlong(0.0);
                        point = ((!(Math.Abs(comVector.Y / comVector.X) > 1.731)) ? Document.GetPoint(array[1].X + 3.5 * comVector.X, array[1].Y + 3.5 * comVector.Y, array[1].Z * comVector.Z) : Document.GetPoint(array[1].X - 1.75, array[1].Y - 3.031, array[1].Z));
                    }
                    else
                    {
                        IComVector comVector = comSegment.TangentAlong(comSegment.Length);
                        point = ((!(Math.Abs(comVector.Y / comVector.X) > 1.731)) ? Document.GetPoint(array[2].X + 3.5 * comVector.X, array[2].Y + 3.5 * comVector.Y, array[2].Z + 3.5 * comVector.Z) : Document.GetPoint(array[2].X - 1.75, array[2].Y - 3.031, array[2].Z));
                    }
                }
                if (Operators.ConditionalCompareObjectEqual(NewLateBinding.LateGet(obj, (Type)null, "GraphicObjectType", new object[0], (string[])null, (Type[])null, (bool[])null), (object)espGraphicObjectType.espArc, false))
                {
                    IComArc comArc = (IComArc)obj;
                    array[1] = Document.GetPoint(comArc.PointAlong(0.0).X, comArc.PointAlong(0.0).Y, comArc.PointAlong(0.0).Z);
                    array[2] = Document.GetPoint(comArc.PointAlong(comArc.Length).X, comArc.PointAlong(comArc.Length).Y, comArc.PointAlong(comArc.Length).Z);
                    if (array[1].X < array[2].X)
                    {
                        IComVector comVector = comArc.TangentAlong(0.0);
                        point = ((!(Math.Abs(comVector.Y / comVector.X) > 1.731)) ? Document.GetPoint(array[1].X + 3.5 * comVector.X, array[1].Y + 3.5 * comVector.Y, array[1].Z + 3.5 * comVector.Z) : Document.GetPoint(array[1].X - 1.75, array[1].Y - 3.031, array[1].Z));
                    }
                    else
                    {
                        IComVector comVector = comArc.TangentAlong(comArc.Length);
                        point = ((!(Math.Abs(comVector.Y / comVector.X) > 1.731)) ? Document.GetPoint(array[2].X + 3.5 * comVector.X, array[2].Y + 3.5 * comVector.Y, array[2].Z + 3.5 * comVector.Z) : Document.GetPoint(array[2].X - 1.75, array[2].Y - 3.031, array[2].Z));
                    }
                }
            }
            else if (RL == 2.0)
            {
                if (Operators.ConditionalCompareObjectEqual(NewLateBinding.LateGet(obj, (Type)null, "GraphicObjectType", new object[0], (string[])null, (Type[])null, (bool[])null), (object)espGraphicObjectType.espSegment, false))
                {
                    IComSegment comSegment = (IComSegment)obj;
                    array[1] = Document.GetPoint(comSegment.PointAlong(0.0).X, comSegment.PointAlong(0.0).Y, comSegment.PointAlong(0.0).Z);
                    array[2] = Document.GetPoint(comSegment.PointAlong(comSegment.Length).X, comSegment.PointAlong(comSegment.Length).Y, comSegment.PointAlong(comSegment.Length).Z);
                    if (array[1].X > array[2].X)
                    {
                        IComVector comVector = comSegment.TangentAlong(0.0);
                        point = ((!(Math.Abs(comVector.Y / comVector.X) > 1.731)) ? Document.GetPoint(array[1].X + 3.5 * comVector.X, array[1].Y + 3.5 * comVector.Y, array[1].Z + 3.5 * comVector.Z) : Document.GetPoint(array[1].X + 1.75, array[1].Y - 3.031, array[1].Z));
                    }
                    else
                    {
                        IComVector comVector = comSegment.TangentAlong(comSegment.Length);
                        point = ((!(Math.Abs(comVector.Y / comVector.X) > 1.731)) ? Document.GetPoint(array[2].X + 3.5 * comVector.X, array[2].Y + 3.5 * comVector.Y, array[2].Z + 3.5 * comVector.Z) : Document.GetPoint(array[2].X + 1.75, array[2].Y - 3.031, array[2].Z));
                    }
                }
                if (Operators.ConditionalCompareObjectEqual(NewLateBinding.LateGet(obj, (Type)null, "GraphicObjectType", new object[0], (string[])null, (Type[])null, (bool[])null), (object)espGraphicObjectType.espArc, false))
                {
                    IComArc comArc = (IComArc)obj;
                    array[1] = Document.GetPoint(comArc.PointAlong(0.0).X, comArc.PointAlong(0.0).Y, comArc.PointAlong(0.0).Z);
                    array[2] = Document.GetPoint(comArc.PointAlong(comArc.Length).X, comArc.PointAlong(comArc.Length).Y, comArc.PointAlong(comArc.Length).Z);
                    if (array[1].X > array[2].X)
                    {
                        IComVector comVector = comArc.TangentAlong(0.0);
                        point = ((!(Math.Abs(comVector.Y / comVector.X) > 1.731)) ? Document.GetPoint(array[1].X + 3.5 * comVector.X, array[1].Y + 3.5 * comVector.Y, array[1].Z + 3.5 * comVector.Z) : Document.GetPoint(array[1].X + 1.75, array[1].Y - 3.031, array[1].Z));
                    }
                    else
                    {
                        IComVector comVector = comArc.TangentAlong(comArc.Length);
                        point = ((!(Math.Abs(comVector.Y / comVector.X) > 1.731)) ? Document.GetPoint(array[2].X + 3.5 * comVector.X, array[2].Y + 3.5 * comVector.Y, array[2].Z + 3.5 * comVector.Z) : Document.GetPoint(array[2].X + 1.75, array[2].Y - 3.031, array[2].Z));
                    }
                }
            }
            if (point != null)
            {
                FC1.Add(point);
            }
            FC1.Reverse();
            Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
        }

        public static void ExtendEnd()
        {
            Point point = FC1.Extremity(espExtremityType.espExtremityEnd);
            Point v = default(Point);
            if (RL == 1.0)
            {
                v = ((!(point.X < MoveSTL_Module.FirstPX)) ? Document.GetPoint(point.X + 2.0, point.Y + 1.0, 0) : Document.GetPoint(point.X - 0.5, point.Y + 3.0, 0));
            }
            else if (RL == 2.0)
            {
                v = ((!(point.X > MoveSTL_Module.FirstPX)) ? Document.GetPoint(point.X - 2.0, point.Y + 1.0, 0) : Document.GetPoint(point.X + 0.5, point.Y + 3.0, 0));
            }
            Segment segment = Document.GetSegment(point, v);
            FC1.Add(segment);
            v = null;
            point = null;
            segment = null;
            Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
        }

        public static void ExtendEnd3()
        {
            Point point = FC1.Extremity(espExtremityType.espExtremityEnd);
            Point point2 = default(Point);
            if (RL == 1.0)
            {
                point2 = Document.Points.Add(point.X + Math.Sqrt(6.75), point.Y + 1.5, 0.0);
            }
            else if (RL == 2.0)
            {
                point2 = Document.Points.Add(point.X - Math.Sqrt(6.75), point.Y + 1.5, 0.0);
            }
            Segment segment = Document.Segments.Add(point, point2);
            FC1.Add(segment);
            Document.Points.Remove(point2.Key);
            Document.Segments.Remove(segment.Key);
            Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
        }

        public static void ExtendEnd2()
        {
            Point[] array = new Point[3];
            FC1.Extremity(espExtremityType.espExtremityEnd);
            object obj = ((IFeatureChain)FC1).get_Item(FC1.Count);
            Point point = default(Point);
            if (RL == 1.0)
            {
                if (Operators.ConditionalCompareObjectEqual(NewLateBinding.LateGet(obj, (Type)null, "GraphicObjectType", new object[0], (string[])null, (Type[])null, (bool[])null), (object)espGraphicObjectType.espSegment, false))
                {
                    IComSegment comSegment = (IComSegment)obj;
                    array[1] = Document.GetPoint(comSegment.PointAlong(0.0).X, comSegment.PointAlong(0.0).Y, comSegment.PointAlong(0.0).Z);
                    array[2] = Document.GetPoint(comSegment.PointAlong(comSegment.Length).X, comSegment.PointAlong(comSegment.Length).Y, comSegment.PointAlong(comSegment.Length).Z);
                    if (array[1].X < array[2].X)
                    {
                        IComVector comVector = comSegment.TangentAlong(0.0);
                        point = ((!(Math.Abs(comVector.Y / comVector.X) > 1.731)) ? Document.GetPoint(array[1].X + 3.5 * comVector.X, array[1].Y + 3.5 * comVector.Y, array[1].Z * comVector.Z) : Document.GetPoint(array[1].X - 1.75, array[1].Y - 3.031, array[1].Z));
                    }
                    else
                    {
                        IComVector comVector = comSegment.TangentAlong(comSegment.Length);
                        point = ((!(Math.Abs(comVector.Y / comVector.X) > 1.731)) ? Document.GetPoint(array[2].X + 3.5 * comVector.X, array[2].Y + 3.5 * comVector.Y, array[2].Z + 3.5 * comVector.Z) : Document.GetPoint(array[2].X - 1.75, array[2].Y - 3.031, array[2].Z));
                    }
                }
                if (Operators.ConditionalCompareObjectEqual(NewLateBinding.LateGet(obj, (Type)null, "GraphicObjectType", new object[0], (string[])null, (Type[])null, (bool[])null), (object)espGraphicObjectType.espArc, false))
                {
                    IComArc comArc = (IComArc)obj;
                    array[1] = Document.GetPoint(comArc.PointAlong(0.0).X, comArc.PointAlong(0.0).Y, comArc.PointAlong(0.0).Z);
                    array[2] = Document.GetPoint(comArc.PointAlong(comArc.Length).X, comArc.PointAlong(comArc.Length).Y, comArc.PointAlong(comArc.Length).Z);
                    if (array[1].X < array[2].X)
                    {
                        IComVector comVector = comArc.TangentAlong(0.0);
                        point = ((!(Math.Abs(comVector.Y / comVector.X) > 1.731)) ? Document.GetPoint(array[1].X + 3.5 * comVector.X, array[1].Y + 3.5 * comVector.Y, array[1].Z + 3.5 * comVector.Z) : Document.GetPoint(array[1].X - 1.75, array[1].Y - 3.031, array[1].Z));
                    }
                    else
                    {
                        IComVector comVector = comArc.TangentAlong(comArc.Length);
                        point = ((!(Math.Abs(comVector.Y / comVector.X) > 1.731)) ? Document.GetPoint(array[2].X + 3.5 * comVector.X, array[2].Y + 3.5 * comVector.Y, array[2].Z + 3.5 * comVector.Z) : Document.GetPoint(array[2].X - 1.75, array[2].Y - 3.031, array[2].Z));
                    }
                }
            }
            else if (RL == 2.0)
            {
                if (Operators.ConditionalCompareObjectEqual(NewLateBinding.LateGet(obj, (Type)null, "GraphicObjectType", new object[0], (string[])null, (Type[])null, (bool[])null), (object)espGraphicObjectType.espSegment, false))
                {
                    IComSegment comSegment = (IComSegment)obj;
                    array[1] = Document.GetPoint(comSegment.PointAlong(0.0).X, comSegment.PointAlong(0.0).Y, comSegment.PointAlong(0.0).Z);
                    array[2] = Document.GetPoint(comSegment.PointAlong(comSegment.Length).X, comSegment.PointAlong(comSegment.Length).Y, comSegment.PointAlong(comSegment.Length).Z);
                    if (array[1].X > array[2].X)
                    {
                        IComVector comVector = comSegment.TangentAlong(0.0);
                        point = ((!(Math.Abs(comVector.Y / comVector.X) > 1.731)) ? Document.GetPoint(array[1].X + 3.5 * comVector.X, array[1].Y + 3.5 * comVector.Y, array[1].Z + 3.5 * comVector.Z) : Document.GetPoint(array[1].X + 1.75, array[1].Y - 3.031, array[1].Z));
                    }
                    else
                    {
                        IComVector comVector = comSegment.TangentAlong(comSegment.Length);
                        point = ((!(Math.Abs(comVector.Y / comVector.X) > 1.731)) ? Document.GetPoint(array[2].X + 3.5 * comVector.X, array[2].Y + 3.5 * comVector.Y, array[2].Z + 3.5 * comVector.Z) : Document.GetPoint(array[2].X + 1.75, array[2].Y - 3.031, array[2].Z));
                    }
                }
                if (Operators.ConditionalCompareObjectEqual(NewLateBinding.LateGet(obj, (Type)null, "GraphicObjectType", new object[0], (string[])null, (Type[])null, (bool[])null), (object)espGraphicObjectType.espArc, false))
                {
                    IComArc comArc = (IComArc)obj;
                    array[1] = Document.GetPoint(comArc.PointAlong(0.0).X, comArc.PointAlong(0.0).Y, comArc.PointAlong(0.0).Z);
                    array[2] = Document.GetPoint(comArc.PointAlong(comArc.Length).X, comArc.PointAlong(comArc.Length).Y, comArc.PointAlong(comArc.Length).Z);
                    if (array[1].X > array[2].X)
                    {
                        IComVector comVector = comArc.TangentAlong(0.0);
                        point = ((!(Math.Abs(comVector.Y / comVector.X) > 1.731)) ? Document.GetPoint(array[1].X + 3.5 * comVector.X, array[1].Y + 3.5 * comVector.Y, array[1].Z + 3.5 * comVector.Z) : Document.GetPoint(array[1].X + 1.75, array[1].Y - 3.031, array[1].Z));
                    }
                    else
                    {
                        IComVector comVector = comArc.TangentAlong(comArc.Length);
                        point = ((!(Math.Abs(comVector.Y / comVector.X) > 1.731)) ? Document.GetPoint(array[2].X + 3.5 * comVector.X, array[2].Y + 3.5 * comVector.Y, array[2].Z + 3.5 * comVector.Z) : Document.GetPoint(array[2].X + 1.75, array[2].Y - 3.031, array[2].Z));
                    }
                }
            }
            if (point != null)
            {
                FC1.Add(point);
            }
        }

        
        public static void Connect2Feature()
        {
            int num = 1;
            checked
            {
                Point point;
                do
                {
                    point = FC1.Extremity(espExtremityType.espExtremityEnd);
                    if (!(point.Y > Document.LatheMachineSetup.BarDiameter / 2.0))
                    {
                        break;
                    }
                    FC1.RemoveEnd(FC1.Count);
                    num++;
                }
                while (num <= 3);
                Point endPoint = FC2.Extremity(espExtremityType.espExtremityStart);
                Segment segment = Document.Segments.Add(point, endPoint);
                FC1.Add(segment);
                Document.Segments.Remove(segment.Key);
                segment = null;
                int count = FC2.Count;
                for (num = 1; num <= count; num++)
                {
                    GraphicObject graphicObject = (GraphicObject)((IFeatureChain)FC2).get_Item(num);
                    if (graphicObject.GraphicObjectType == espGraphicObjectType.espArc)
                    {
                        Arc pIGraphicObject = (Arc)graphicObject;
                        FC1.Add(pIGraphicObject);
                    }
                    if (graphicObject.GraphicObjectType == espGraphicObjectType.espSegment)
                    {
                        segment = (Segment)graphicObject;
                        FC1.Add(segment);
                    }
                }
            }
        }

        public static void MaxYPoint(FeatureChain Fc)
        {
            MaxX = 0.0;
            MaxY = 0.0;
            NeedFirstFeature = 0;
            double num = Math.Round(Fc.Length / 0.01, 0);
            double num2 = num;
            for (double num3 = 1.0; num3 <= num2; num3 += 1.0)
            {
                Pt12 = Fc.PointAlong((num3 - 1.0) * 0.01);
                if (Pt12.Y > MaxY)
                {
                    MaxY = Pt12.Y;
                    MaxX = Pt12.X;
                }
            }
            if (!(MaxY > Document.LatheMachineSetup.BarDiameter / 2.0))
            {
                return;
            }
            double num4 = num;
            for (double num3 = 1.0; num3 <= num4; num3 += 1.0)
            {
                Pt12 = Fc.PointAlong((num3 - 1.0) * 0.01);
                if (Math.Abs(Pt12.Y - Document.LatheMachineSetup.BarDiameter / 2.0) <= 0.15)
                {
                    MaxY = Pt12.Y;
                    MaxX = Pt12.X;
                    break;
                }
            }
        }

        public static void TurningMaxYPoint(FeatureChain Fc)
        {
            HighY = 0.0;
            double length = Fc.Length;
            for (double num = 0.0; num <= length; num += 0.02)
            {
                Pt12 = Fc.PointAlong(num);
                if (Pt12.Y > HighY)
                {
                    HighY = Pt12.Y;
                }
            }
        }


#pragma warning restore CS0162, CS0649
    }
}