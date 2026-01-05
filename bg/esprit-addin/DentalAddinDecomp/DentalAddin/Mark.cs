using System;
using System.Reflection;
using System.Runtime.CompilerServices;
using Esprit;
using EspritConstants;
using Microsoft.VisualBasic;
using Microsoft.VisualBasic.CompilerServices;

#pragma warning disable CS0649

namespace DentalAddin
{

 [StandardModule]
 internal sealed class Mark
 {
	public static double AngC;

	public static string MarkString;

	public static double MarkX;

	public static bool MarkSign;

	private static double[] X = new double[131];

	private static double[] Y = new double[131];

	private static FeatureChain FcNumber;

	private static FeatureSet FSNumber;

	public static SelectionSet SsNumber;

	public static void MarkRotatePart(double Ang)
	{
		Point[] array = new Point[3];
		SelectionSet selectionSet = MainModule.Document.SelectionSets["Tempt"];
		if (selectionSet == null)
		{
			selectionSet = MainModule.Document.SelectionSets.Add("Tempt");
		}

#pragma warning restore CS0649
		selectionSet.RemoveAll();
		foreach (GraphicObject item in MainModule.Document.GraphicsCollection)
		{
			if (item.GraphicObjectType == espGraphicObjectType.espSTL_Model)
			{
				selectionSet.Add(item, RuntimeHelpers.GetObjectValue(Missing.Value));
				break;
			}
		}
		array[1] = MainModule.Document.GetPoint(0, 0, 0);
		array[2] = MainModule.Document.GetPoint(1, 0, 0);
		Segment segment = MainModule.Document.GetSegment(array[1], array[2]);
		Ang = Ang * Math.PI / 180.0;
		selectionSet.Rotate(segment, Ang, RuntimeHelpers.GetObjectValue(Missing.Value));
	}

	public static void OutputNumberFeature()
	{
		string[] array = new string[21];
		int num = Strings.Len(MarkString);
		checked
		{
			for (int i = 1; i <= num; i++)
			{
				string text = Strings.Mid(MarkString, i, 1);
				array[i] = text;
			}
			int count = MainModule.Document.Layers.Count;
			for (int i = 1; i <= count; i++)
			{
				if (Operators.CompareString(MainModule.Document.Layers[i].Name, "MarkNumber", false) == 0)
				{
					MainModule.Document.Layers.Remove("MarkNumber");
					break;
				}
			}
			MainModule.Document.Layers.Add("MarkNumber");
			MainModule.Document.ActiveLayer = MainModule.Document.Layers["MarkNumber"];
			SsNumber = MainModule.Document.SelectionSets["SsNumber"];
			if (SsNumber == null)
			{
				SsNumber = MainModule.Document.SelectionSets.Add("SsNumber");
			}
			SsNumber.RemoveAll();
			int count2 = MainModule.Document.FeatureSets.Count;
			for (int i = 1; i <= count2; i++)
			{
				FSNumber = MainModule.Document.FeatureSets[i];
				if (Operators.CompareString(FSNumber.Name, "Text", false) == 0)
				{
					MainModule.Document.FeatureSets.Remove(i);
					break;
				}
			}
			FSNumber = MainModule.Document.FeatureSets.Add(RuntimeHelpers.GetObjectValue(Missing.Value));
			FSNumber.Name = "Text";
			FSNumber.Layer = MainModule.Document.Layers["MarkNumber"];
			int num2 = Strings.Len(MarkString);
			for (int i = 1; i <= num2; i++)
			{
				NumberFc(i, array[i]);
			}
			Point[] array2 = new Point[3];
			Point point = MainModule.Document.GetPoint(0, 0, 0);
			array2[1] = MainModule.Document.GetPoint(0, 0, 0);
			array2[2] = MainModule.Document.GetPoint(1, 0, 0);
			Segment segment = MainModule.Document.GetSegment(array2[1], array2[2]);
			SsNumber.ScaleUniform(point, 2.0, 0);
			SsNumber.Translate(MarkX - 0.5, -0.5, 20.0, RuntimeHelpers.GetObjectValue(Missing.Value));
			SsNumber.Rotate(segment, (0.0 - AngC) * Math.PI / 180.0, RuntimeHelpers.GetObjectValue(Missing.Value));
		}
	}

	private static void NumberFc(int i, string t)
	{
		if (Operators.CompareString(t, "a", false) == 0)
		{
			Numbera(i);
		}
		else if (Operators.CompareString(t, "b", false) == 0)
		{
			numberb(i);
		}
		else if (Operators.CompareString(t, Conversions.ToString(0), false) == 0)
		{
			Number0(i);
		}
		else if (Operators.CompareString(t, Conversions.ToString(1), false) == 0)
		{
			Number1(i);
		}
		else if (Operators.CompareString(t, Conversions.ToString(2), false) == 0)
		{
			Number2(i);
		}
		else if (Operators.CompareString(t, Conversions.ToString(3), false) == 0)
		{
			Number3(i);
		}
		else if (Operators.CompareString(t, Conversions.ToString(4), false) == 0)
		{
			Number4(i);
		}
		else if (Operators.CompareString(t, Conversions.ToString(5), false) == 0)
		{
			Number5(i);
		}
		else if (Operators.CompareString(t, Conversions.ToString(6), false) == 0)
		{
			Number6(i);
		}
		else if (Operators.CompareString(t, Conversions.ToString(7), false) == 0)
		{
			Number7(i);
		}
		else if (Operators.CompareString(t, Conversions.ToString(8), false) == 0)
		{
			Number8(i);
		}
		else if (Operators.CompareString(t, Conversions.ToString(9), false) == 0)
		{
			Number9(i);
		}
	}

	private static void Numbera(int i)
	{
		X[1] = 0.553;
		Y[1] = 0.484;
		X[2] = 0.545;
		Y[2] = 0.458;
		X[3] = 0.545;
		Y[3] = 0.457;
		X[4] = 0.538;
		Y[4] = 0.433;
		X[5] = 0.538;
		Y[5] = 0.432;
		X[6] = 0.526;
		Y[6] = 0.387;
		X[7] = 0.525;
		Y[7] = 0.386;
		X[8] = 0.517;
		Y[8] = 0.35;
		X[9] = 0.517;
		Y[9] = 0.349;
		X[10] = 0.51;
		Y[10] = 0.321;
		X[11] = 0.51;
		Y[11] = 0.321;
		X[12] = 0.501;
		Y[12] = 0.277;
		X[13] = 0.5;
		Y[13] = 0.276;
		X[14] = 0.492;
		Y[14] = 0.231;
		X[15] = 0.468;
		Y[15] = 0.145;
		X[16] = 0.44;
		Y[16] = 0.079;
		X[17] = 0.439;
		Y[17] = 0.078;
		X[18] = 0.435;
		Y[18] = 0.067;
		X[19] = 0.43;
		Y[19] = 0.059;
		X[20] = 0.426;
		Y[20] = 0.052;
		X[21] = 0.417;
		Y[21] = 0.039;
		X[22] = 0.408;
		Y[22] = 0.03;
		X[23] = 0.4;
		Y[23] = 0.024;
		X[24] = 0.392;
		Y[24] = 0.018;
		X[25] = 0.385;
		Y[25] = 0.015;
		X[26] = 0.37;
		Y[26] = 0.008;
		X[27] = 0.357;
		Y[27] = 0.005;
		X[28] = 0.348;
		Y[28] = 0.003;
		X[29] = 0.331;
		Y[29] = 0.001;
		X[30] = 0.312;
		Y[30] = 0.0;
		X[31] = 0.308;
		Y[31] = 0.0;
		X[32] = 0.296;
		Y[32] = 0.002;
		X[33] = 0.284;
		Y[33] = 0.006;
		X[34] = 0.272;
		Y[34] = 0.012;
		X[35] = 0.261;
		Y[35] = 0.018;
		X[36] = 0.25;
		Y[36] = 0.026;
		X[37] = 0.239;
		Y[37] = 0.034;
		X[38] = 0.23;
		Y[38] = 0.042;
		X[39] = 0.212;
		Y[39] = 0.061;
		X[40] = 0.197;
		Y[40] = 0.079;
		X[41] = 0.185;
		Y[41] = 0.096;
		X[42] = 0.176;
		Y[42] = 0.111;
		X[43] = 0.169;
		Y[43] = 0.124;
		X[44] = 0.157;
		Y[44] = 0.15;
		X[45] = 0.151;
		Y[45] = 0.169;
		X[46] = 0.148;
		Y[46] = 0.182;
		X[47] = 0.144;
		Y[47] = 0.203;
		X[48] = 0.143;
		Y[48] = 0.223;
		X[49] = 0.144;
		Y[49] = 0.242;
		X[50] = 0.147;
		Y[50] = 0.261;
		X[51] = 0.151;
		Y[51] = 0.278;
		X[52] = 0.156;
		Y[52] = 0.294;
		X[53] = 0.163;
		Y[53] = 0.31;
		X[54] = 0.169;
		Y[54] = 0.324;
		X[55] = 0.176;
		Y[55] = 0.336;
		X[56] = 0.192;
		Y[56] = 0.36;
		X[57] = 0.206;
		Y[57] = 0.378;
		X[58] = 0.22;
		Y[58] = 0.393;
		X[59] = 0.232;
		Y[59] = 0.405;
		X[60] = 0.243;
		Y[60] = 0.414;
		X[61] = 0.252;
		Y[61] = 0.421;
		X[62] = 0.27;
		Y[62] = 0.432;
		X[63] = 0.282;
		Y[63] = 0.437;
		X[64] = 0.29;
		Y[64] = 0.44;
		X[65] = 0.303;
		Y[65] = 0.443;
		X[66] = 0.314;
		Y[66] = 0.444;
		X[67] = 0.321;
		Y[67] = 0.444;
		X[68] = 0.328;
		Y[68] = 0.443;
		X[69] = 0.345;
		Y[69] = 0.439;
		X[70] = 0.359;
		Y[70] = 0.434;
		X[71] = 0.373;
		Y[71] = 0.427;
		X[72] = 0.384;
		Y[72] = 0.422;
		X[73] = 0.403;
		Y[73] = 0.409;
		X[74] = 0.417;
		Y[74] = 0.398;
		X[75] = 0.425;
		Y[75] = 0.39;
		X[76] = 0.437;
		Y[76] = 0.378;
		X[77] = 0.447;
		Y[77] = 0.365;
		X[78] = 0.463;
		Y[78] = 0.339;
		X[79] = 0.474;
		Y[79] = 0.317;
		X[80] = 0.482;
		Y[80] = 0.28;
		X[81] = 0.491;
		Y[81] = 0.217;
		X[82] = 0.491;
		Y[82] = 0.215;
		X[83] = 0.495;
		Y[83] = 0.193;
		X[84] = 0.495;
		Y[84] = 0.192;
		X[85] = 0.503;
		Y[85] = 0.153;
		X[86] = 0.503;
		Y[86] = 0.152;
		X[87] = 0.51;
		Y[87] = 0.12;
		X[88] = 0.51;
		Y[88] = 0.12;
		X[89] = 0.515;
		Y[89] = 0.094;
		X[90] = 0.515;
		Y[90] = 0.094;
		X[91] = 0.52;
		Y[91] = 0.072;
		X[92] = 0.52;
		Y[92] = 0.072;
		X[93] = 0.525;
		Y[93] = 0.054;
		X[94] = 0.525;
		Y[94] = 0.054;
		X[95] = 0.528;
		Y[95] = 0.04;
		X[96] = 0.528;
		Y[96] = 0.039;
		X[97] = 0.535;
		Y[97] = 0.016;
		X[98] = 0.535;
		Y[98] = 0.015;
		X[99] = 0.54;
		Y[99] = -0.001;
		X[100] = 0.54;
		Y[100] = -0.002;
		X[101] = 0.543;
		Y[101] = -0.012;
		X[102] = 0.544;
		Y[102] = -0.013;
		X[103] = 0.549;
		Y[103] = -0.028;
		X[104] = 0.549;
		Y[104] = -0.03;
		X[105] = 0.554;
		Y[105] = -0.043;
		checked
		{
			Point point = MainModule.Document.GetPoint(X[1] + 0.35 * (double)(i - 1), Y[1], 0);
			FcNumber = MainModule.Document.FeatureChains.Add(point);
			int num = 2;
			do
			{
				point = MainModule.Document.GetPoint(X[num] + 0.35 * (double)(i - 1), Y[num], 0);
				FcNumber.Add(point);
				num++;
			}
			while (num <= 105);
			FcNumber.Name = "a";
			SsNumber.Add(FcNumber, RuntimeHelpers.GetObjectValue(Missing.Value));
			FcNumber.Layer = MainModule.Document.Layers["MarkNumber"];
			FSNumber.Add(FcNumber);
			FcNumber = null;
		}
	}

	private static void numberb(int i)
	{
		X[1] = 0.24;
		Y[1] = 0.216;
		X[2] = 0.275;
		Y[2] = 0.172;
		X[3] = 0.281;
		Y[3] = 0.165;
		X[4] = 0.286;
		Y[4] = 0.16;
		X[5] = 0.289;
		Y[5] = 0.157;
		X[6] = 0.293;
		Y[6] = 0.154;
		X[7] = 0.301;
		Y[7] = 0.15;
		X[8] = 0.304;
		Y[8] = 0.149;
		X[9] = 0.309;
		Y[9] = 0.147;
		X[10] = 0.315;
		Y[10] = 0.146;
		X[11] = 0.324;
		Y[11] = 0.144;
		X[12] = 0.334;
		Y[12] = 0.144;
		X[13] = 0.339;
		Y[13] = 0.144;
		X[14] = 0.345;
		Y[14] = 0.146;
		X[15] = 0.348;
		Y[15] = 0.147;
		X[16] = 0.354;
		Y[16] = 0.15;
		X[17] = 0.364;
		Y[17] = 0.155;
		X[18] = 0.368;
		Y[18] = 0.158;
		X[19] = 0.374;
		Y[19] = 0.163;
		X[20] = 0.381;
		Y[20] = 0.169;
		X[21] = 0.388;
		Y[21] = 0.176;
		X[22] = 0.395;
		Y[22] = 0.185;
		X[23] = 0.403;
		Y[23] = 0.197;
		X[24] = 0.405;
		Y[24] = 0.202;
		X[25] = 0.408;
		Y[25] = 0.207;
		X[26] = 0.411;
		Y[26] = 0.213;
		X[27] = 0.412;
		Y[27] = 0.218;
		X[28] = 0.413;
		Y[28] = 0.222;
		X[29] = 0.413;
		Y[29] = 0.225;
		X[30] = 0.413;
		Y[30] = 0.225;
		X[31] = 0.413;
		Y[31] = 0.225;
		X[32] = 0.413;
		Y[32] = 0.226;
		X[33] = 0.411;
		Y[33] = 0.233;
		X[34] = 0.41;
		Y[34] = 0.236;
		X[35] = 0.407;
		Y[35] = 0.242;
		X[36] = 0.401;
		Y[36] = 0.252;
		X[37] = 0.398;
		Y[37] = 0.257;
		X[38] = 0.393;
		Y[38] = 0.263;
		X[39] = 0.387;
		Y[39] = 0.269;
		X[40] = 0.38;
		Y[40] = 0.276;
		X[41] = 0.37;
		Y[41] = 0.283;
		X[42] = 0.367;
		Y[42] = 0.285;
		X[43] = 0.277;
		Y[43] = 0.33;
		X[44] = 0.276;
		Y[44] = 0.331;
		X[45] = 0.276;
		Y[45] = 0.331;
		X[46] = 0.276;
		Y[46] = 0.331;
		X[47] = 0.276;
		Y[47] = 0.331;
		X[48] = 0.275;
		Y[48] = 0.331;
		X[49] = 0.275;
		Y[49] = 0.332;
		X[50] = 0.275;
		Y[50] = 0.332;
		X[51] = 0.275;
		Y[51] = 0.332;
		X[52] = 0.275;
		Y[52] = 0.332;
		X[53] = 0.275;
		Y[53] = 0.333;
		X[54] = 0.275;
		Y[54] = 0.333;
		X[55] = 0.275;
		Y[55] = 0.333;
		X[56] = 0.275;
		Y[56] = 0.334;
		X[57] = 0.275;
		Y[57] = 0.334;
		X[58] = 0.275;
		Y[58] = 0.334;
		X[59] = 0.275;
		Y[59] = 0.335;
		X[60] = 0.275;
		Y[60] = 0.335;
		X[61] = 0.275;
		Y[61] = 0.335;
		X[62] = 0.275;
		Y[62] = 0.336;
		X[63] = 0.275;
		Y[63] = 0.336;
		X[64] = 0.275;
		Y[64] = 0.336;
		X[65] = 0.276;
		Y[65] = 0.336;
		X[66] = 0.276;
		Y[66] = 0.337;
		X[67] = 0.276;
		Y[67] = 0.337;
		X[68] = 0.36;
		Y[68] = 0.398;
		X[69] = 0.369;
		Y[69] = 0.406;
		X[70] = 0.373;
		Y[70] = 0.41;
		X[71] = 0.377;
		Y[71] = 0.415;
		X[72] = 0.381;
		Y[72] = 0.421;
		X[73] = 0.385;
		Y[73] = 0.428;
		X[74] = 0.386;
		Y[74] = 0.43;
		X[75] = 0.387;
		Y[75] = 0.432;
		X[76] = 0.387;
		Y[76] = 0.433;
		X[77] = 0.387;
		Y[77] = 0.434;
		X[78] = 0.387;
		Y[78] = 0.435;
		X[79] = 0.386;
		Y[79] = 0.436;
		X[80] = 0.386;
		Y[80] = 0.437;
		X[81] = 0.386;
		Y[81] = 0.438;
		X[82] = 0.385;
		Y[82] = 0.44;
		X[83] = 0.382;
		Y[83] = 0.445;
		X[84] = 0.377;
		Y[84] = 0.454;
		X[85] = 0.373;
		Y[85] = 0.459;
		X[86] = 0.368;
		Y[86] = 0.464;
		X[87] = 0.362;
		Y[87] = 0.47;
		X[88] = 0.355;
		Y[88] = 0.477;
		X[89] = 0.345;
		Y[89] = 0.484;
		X[90] = 0.341;
		Y[90] = 0.486;
		X[91] = 0.335;
		Y[91] = 0.489;
		X[92] = 0.33;
		Y[92] = 0.491;
		X[93] = 0.325;
		Y[93] = 0.493;
		X[94] = 0.321;
		Y[94] = 0.494;
		X[95] = 0.315;
		Y[95] = 0.494;
		X[96] = 0.315;
		Y[96] = 0.494;
		X[97] = 0.313;
		Y[97] = 0.494;
		X[98] = 0.306;
		Y[98] = 0.492;
		X[99] = 0.302;
		Y[99] = 0.491;
		X[100] = 0.295;
		Y[100] = 0.488;
		X[101] = 0.284;
		Y[101] = 0.482;
		X[102] = 0.279;
		Y[102] = 0.479;
		X[103] = 0.272;
		Y[103] = 0.474;
		X[104] = 0.265;
		Y[104] = 0.468;
		X[105] = 0.258;
		Y[105] = 0.46;
		X[106] = 0.25;
		Y[106] = 0.451;
		X[107] = 0.247;
		Y[107] = 0.446;
		X[108] = 0.244;
		Y[108] = 0.441;
		X[109] = 0.241;
		Y[109] = 0.435;
		X[110] = 0.238;
		Y[110] = 0.429;
		X[111] = 0.236;
		Y[111] = 0.422;
		X[112] = 0.234;
		Y[112] = 0.415;
		X[113] = 0.233;
		Y[113] = 0.408;
		X[114] = 0.232;
		Y[114] = 0.399;
		X[115] = 0.232;
		Y[115] = -0.02;
		checked
		{
			Point point = MainModule.Document.GetPoint(X[1] + 0.35 * (double)(i - 1), Y[1], 0);
			FcNumber = MainModule.Document.FeatureChains.Add(point);
			int num = 2;
			do
			{
				point = MainModule.Document.GetPoint(X[num] + 0.35 * (double)(i - 1), Y[num], 0);
				FcNumber.Add(point);
				num++;
			}
			while (num <= 115);
			FcNumber.Name = "b";
			SsNumber.Add(FcNumber, RuntimeHelpers.GetObjectValue(Missing.Value));
			FcNumber.Layer = MainModule.Document.Layers["MarkNumber"];
			FSNumber.Add(FcNumber);
			FcNumber = null;
		}
	}

	private static void Number0(int i)
	{
		X[1] = 11.0 / 64.0;
		Y[1] = 0.375;
		X[2] = 11.0 / 64.0;
		Y[2] = 0.25;
		X[3] = 11.0 / 64.0;
		Y[3] = 0.125;
		X[4] = 13.0 / 64.0;
		Y[4] = 0.0625;
		X[5] = 15.0 / 64.0;
		Y[5] = 1.0 / 32.0;
		X[6] = 19.0 / 64.0;
		Y[6] = 0.0;
		X[7] = 21.0 / 64.0;
		Y[7] = 0.0;
		X[8] = 25.0 / 64.0;
		Y[8] = 1.0 / 32.0;
		X[9] = 27.0 / 64.0;
		Y[9] = 0.0625;
		X[10] = 29.0 / 64.0;
		Y[10] = 0.125;
		X[11] = 29.0 / 64.0;
		Y[11] = 0.375;
		X[12] = 27.0 / 64.0;
		Y[12] = 0.4375;
		X[13] = 25.0 / 64.0;
		Y[13] = 15.0 / 32.0;
		X[14] = 21.0 / 64.0;
		Y[14] = 0.5;
		X[15] = 19.0 / 64.0;
		Y[15] = 0.5;
		X[16] = 15.0 / 64.0;
		Y[16] = 15.0 / 32.0;
		X[17] = 13.0 / 64.0;
		Y[17] = 0.4375;
		X[18] = 11.0 / 64.0;
		Y[18] = 0.375;
		checked
		{
			Point point = MainModule.Document.GetPoint(X[1] + 0.35 * (double)(i - 1), Y[1], 0);
			FcNumber = MainModule.Document.FeatureChains.Add(point);
			int num = 2;
			do
			{
				point = MainModule.Document.GetPoint(X[num] + 0.35 * (double)(i - 1), Y[num], 0);
				FcNumber.Add(point);
				num++;
			}
			while (num <= 18);
			FcNumber.Name = "0";
			SsNumber.Add(FcNumber, RuntimeHelpers.GetObjectValue(Missing.Value));
			FcNumber.Layer = MainModule.Document.Layers["MarkNumber"];
			FSNumber.Add(FcNumber);
			FcNumber = null;
		}
	}

	private static void Number1(int i)
	{
		X[1] = 0.3125;
		Y[1] = 0.0;
		X[2] = 0.3125;
		Y[2] = 0.5;
		X[3] = 0.1875;
		Y[3] = 0.375;
		checked
		{
			Point point = MainModule.Document.GetPoint(X[1] + 0.35 * (double)(i - 1), Y[1], 0);
			FcNumber = MainModule.Document.FeatureChains.Add(point);
			int num = 2;
			do
			{
				point = MainModule.Document.GetPoint(X[num] + 0.35 * (double)(i - 1), Y[num], 0);
				FcNumber.Add(point);
				num++;
			}
			while (num <= 3);
			FcNumber.Name = "1";
			SsNumber.Add(FcNumber, RuntimeHelpers.GetObjectValue(Missing.Value));
			FcNumber.Layer = MainModule.Document.Layers["MarkNumber"];
			FSNumber.Add(FcNumber);
			FcNumber = null;
		}
	}

	private static void Number2(int i)
	{
		X[1] = 13.0 / 32.0;
		Y[1] = 0.0;
		X[2] = 3.0 / 32.0;
		Y[2] = 0.0;
		X[3] = 0.375;
		Y[3] = 9.0 / 32.0;
		X[4] = 13.0 / 32.0;
		Y[4] = 11.0 / 32.0;
		X[5] = 13.0 / 32.0;
		Y[5] = 0.375;
		X[6] = 0.375;
		Y[6] = 0.4375;
		X[7] = 11.0 / 32.0;
		Y[7] = 15.0 / 32.0;
		X[8] = 9.0 / 32.0;
		Y[8] = 0.5;
		X[9] = 7.0 / 32.0;
		Y[9] = 0.5;
		X[10] = 5.0 / 32.0;
		Y[10] = 15.0 / 32.0;
		X[11] = 0.125;
		Y[11] = 0.4375;
		X[12] = 3.0 / 32.0;
		Y[12] = 0.375;
		checked
		{
			Point point = MainModule.Document.GetPoint(X[1] + 0.35 * (double)(i - 1), Y[1], 0);
			FcNumber = MainModule.Document.FeatureChains.Add(point);
			int num = 2;
			do
			{
				point = MainModule.Document.GetPoint(X[num] + 0.35 * (double)(i - 1), Y[num], 0);
				FcNumber.Add(point);
				num++;
			}
			while (num <= 12);
			FcNumber.Name = "2";
			SsNumber.Add(FcNumber, RuntimeHelpers.GetObjectValue(Missing.Value));
			FcNumber.Layer = MainModule.Document.Layers["MarkNumber"];
			FSNumber.Add(FcNumber);
			FcNumber = null;
		}
	}

	private static void Number3(int i)
	{
		X[1] = 3.0 / 32.0;
		Y[1] = 0.375;
		X[2] = 0.125;
		Y[2] = 0.4375;
		X[3] = 5.0 / 32.0;
		Y[3] = 15.0 / 32.0;
		X[4] = 7.0 / 32.0;
		Y[4] = 0.5;
		X[5] = 9.0 / 32.0;
		Y[5] = 0.5;
		X[6] = 11.0 / 32.0;
		Y[6] = 15.0 / 32.0;
		X[7] = 0.375;
		Y[7] = 0.4375;
		X[8] = 13.0 / 32.0;
		Y[8] = 0.375;
		X[9] = 13.0 / 32.0;
		Y[9] = 11.0 / 32.0;
		X[10] = 0.375;
		Y[10] = 9.0 / 32.0;
		X[11] = 11.0 / 32.0;
		Y[11] = 0.25;
		X[12] = 7.0 / 32.0;
		Y[12] = 0.25;
		X[13] = 11.0 / 32.0;
		Y[13] = 0.25;
		X[14] = 0.375;
		Y[14] = 7.0 / 32.0;
		X[15] = 13.0 / 32.0;
		Y[15] = 5.0 / 32.0;
		X[16] = 13.0 / 32.0;
		Y[16] = 0.125;
		X[17] = 0.375;
		Y[17] = 0.0625;
		X[18] = 11.0 / 32.0;
		Y[18] = 1.0 / 32.0;
		X[19] = 9.0 / 32.0;
		Y[19] = 0.0;
		X[20] = 7.0 / 32.0;
		Y[20] = 0.0;
		X[21] = 5.0 / 32.0;
		Y[21] = 1.0 / 32.0;
		X[22] = 0.125;
		Y[22] = 0.0625;
		X[23] = 3.0 / 32.0;
		Y[23] = 0.125;
		checked
		{
			Point point = MainModule.Document.GetPoint(X[1] + 0.35 * (double)(i - 1), Y[1], 0);
			FcNumber = MainModule.Document.FeatureChains.Add(point);
			int num = 2;
			do
			{
				point = MainModule.Document.GetPoint(X[num] + 0.35 * (double)(i - 1), Y[num], 0);
				FcNumber.Add(point);
				num++;
			}
			while (num <= 23);
			FcNumber.Name = "3";
			SsNumber.Add(FcNumber, RuntimeHelpers.GetObjectValue(Missing.Value));
			FcNumber.Layer = MainModule.Document.Layers["MarkNumber"];
			FSNumber.Add(FcNumber);
			FcNumber = null;
		}
	}

	private static void Number4(int i)
	{
		X[1] = 0.3125;
		Y[1] = 0.5;
		X[2] = 3.0 / 32.0;
		Y[2] = 0.125;
		X[3] = 13.0 / 32.0;
		Y[3] = 0.125;
		checked
		{
			Point point = MainModule.Document.GetPoint(X[1] + 0.35 * (double)(i - 1), Y[1], 0);
			FcNumber = MainModule.Document.FeatureChains.Add(point);
			int num = 2;
			do
			{
				point = MainModule.Document.GetPoint(X[num] + 0.35 * (double)(i - 1), Y[num], 0);
				FcNumber.Add(point);
				num++;
			}
			while (num <= 3);
			FcNumber.Name = "4_1";
			SsNumber.Add(FcNumber, RuntimeHelpers.GetObjectValue(Missing.Value));
			FcNumber.Layer = MainModule.Document.Layers["MarkNumber"];
			FSNumber.Add(FcNumber);
			FcNumber = null;
			X[1] = 0.3125;
			Y[1] = 0.0;
			X[2] = 0.3125;
			Y[2] = 7.0 / 32.0;
			point = MainModule.Document.GetPoint(X[1] + 0.35 * (double)(i - 1), Y[1], 0);
			FcNumber = MainModule.Document.FeatureChains.Add(point);
			num = 2;
			do
			{
				point = MainModule.Document.GetPoint(X[num] + 0.35 * (double)(i - 1), Y[num], 0);
				FcNumber.Add(point);
				num++;
			}
			while (num <= 2);
			FcNumber.Name = "4_2";
			SsNumber.Add(FcNumber, RuntimeHelpers.GetObjectValue(Missing.Value));
			FcNumber.Layer = MainModule.Document.Layers["MarkNumber"];
			FSNumber.Add(FcNumber);
			FcNumber = null;
		}
	}

	private static void Number5(int i)
	{
		X[1] = 3.0 / 32.0;
		Y[1] = 0.0625;
		X[2] = 0.125;
		Y[2] = 1.0 / 32.0;
		X[3] = 0.1875;
		Y[3] = 0.0;
		X[4] = 9.0 / 32.0;
		Y[4] = 0.0;
		X[5] = 11.0 / 32.0;
		Y[5] = 1.0 / 32.0;
		X[6] = 0.375;
		Y[6] = 0.0625;
		X[7] = 13.0 / 32.0;
		Y[7] = 0.125;
		X[8] = 13.0 / 32.0;
		Y[8] = 5.0 / 32.0;
		X[9] = 13.0 / 32.0;
		Y[9] = 0.1875;
		X[10] = 0.375;
		Y[10] = 0.25;
		X[11] = 11.0 / 32.0;
		Y[11] = 9.0 / 32.0;
		X[12] = 9.0 / 32.0;
		Y[12] = 0.3125;
		X[13] = 0.1875;
		Y[13] = 0.3125;
		X[14] = 0.125;
		Y[14] = 9.0 / 32.0;
		X[15] = 3.0 / 32.0;
		Y[15] = 0.25;
		X[16] = 3.0 / 32.0;
		Y[16] = 0.5;
		X[17] = 13.0 / 32.0;
		Y[17] = 0.5;
		checked
		{
			Point point = MainModule.Document.GetPoint(X[1] + 0.35 * (double)(i - 1), Y[1], 0);
			FcNumber = MainModule.Document.FeatureChains.Add(point);
			int num = 2;
			do
			{
				point = MainModule.Document.GetPoint(X[num] + 0.35 * (double)(i - 1), Y[num], 0);
				FcNumber.Add(point);
				num++;
			}
			while (num <= 17);
			FcNumber.Name = "5";
			SsNumber.Add(FcNumber, RuntimeHelpers.GetObjectValue(Missing.Value));
			FcNumber.Layer = MainModule.Document.Layers["MarkNumber"];
			FSNumber.Add(FcNumber);
			FcNumber = null;
		}
	}

	private static void Number6(int i)
	{
		X[1] = 13.0 / 32.0;
		Y[1] = 0.375;
		X[2] = 0.375;
		Y[2] = 0.4375;
		X[3] = 11.0 / 32.0;
		Y[3] = 15.0 / 32.0;
		X[4] = 9.0 / 32.0;
		Y[4] = 0.5;
		X[5] = 7.0 / 32.0;
		Y[5] = 0.5;
		X[6] = 5.0 / 32.0;
		Y[6] = 15.0 / 32.0;
		X[7] = 0.125;
		Y[7] = 0.4375;
		X[8] = 3.0 / 32.0;
		Y[8] = 0.375;
		X[9] = 3.0 / 32.0;
		Y[9] = 0.1875;
		X[10] = 3.0 / 32.0;
		Y[10] = 0.125;
		X[11] = 0.125;
		Y[11] = 0.0625;
		X[12] = 5.0 / 32.0;
		Y[12] = 1.0 / 32.0;
		X[13] = 7.0 / 32.0;
		Y[13] = 0.0;
		X[14] = 9.0 / 32.0;
		Y[14] = 0.0;
		X[15] = 11.0 / 32.0;
		Y[15] = 1.0 / 32.0;
		X[16] = 0.375;
		Y[16] = 0.0625;
		X[17] = 13.0 / 32.0;
		Y[17] = 0.125;
		X[18] = 13.0 / 32.0;
		Y[18] = 0.1875;
		X[19] = 0.375;
		Y[19] = 0.25;
		X[20] = 11.0 / 32.0;
		Y[20] = 9.0 / 32.0;
		X[21] = 9.0 / 32.0;
		Y[21] = 0.3125;
		X[22] = 7.0 / 32.0;
		Y[22] = 0.3125;
		X[23] = 5.0 / 32.0;
		Y[23] = 9.0 / 32.0;
		X[24] = 0.125;
		Y[24] = 0.25;
		X[25] = 3.0 / 32.0;
		Y[25] = 0.1875;
		checked
		{
			Point point = MainModule.Document.GetPoint(X[1] + 0.35 * (double)(i - 1), Y[1], 0);
			FcNumber = MainModule.Document.FeatureChains.Add(point);
			int num = 2;
			do
			{
				point = MainModule.Document.GetPoint(X[num] + 0.35 * (double)(i - 1), Y[num], 0);
				FcNumber.Add(point);
				num++;
			}
			while (num <= 25);
			FcNumber.Name = "6";
			SsNumber.Add(FcNumber, RuntimeHelpers.GetObjectValue(Missing.Value));
			FcNumber.Layer = MainModule.Document.Layers["MarkNumber"];
			FSNumber.Add(FcNumber);
			FcNumber = null;
		}
	}

	private static void Number7(int i)
	{
		X[1] = 0.125;
		Y[1] = 0.4375;
		X[2] = 0.125;
		Y[2] = 0.5;
		X[3] = 0.375;
		Y[3] = 0.5;
		X[4] = 0.1875;
		Y[4] = 0.0;
		checked
		{
			Point point = MainModule.Document.GetPoint(X[1] + 0.35 * (double)(i - 1), Y[1], 0);
			FcNumber = MainModule.Document.FeatureChains.Add(point);
			int num = 2;
			do
			{
				point = MainModule.Document.GetPoint(X[num] + 0.35 * (double)(i - 1), Y[num], 0);
				FcNumber.Add(point);
				num++;
			}
			while (num <= 4);
			FcNumber.Name = "7";
			SsNumber.Add(FcNumber, RuntimeHelpers.GetObjectValue(Missing.Value));
			FcNumber.Layer = MainModule.Document.Layers["MarkNumber"];
			FSNumber.Add(FcNumber);
			FcNumber = null;
		}
	}

	private static void Number8(int i)
	{
		X[1] = 9.0 / 32.0;
		Y[1] = 9.0 / 32.0;
		X[2] = 11.0 / 32.0;
		Y[2] = 0.3125;
		X[3] = 0.375;
		Y[3] = 0.375;
		X[4] = 0.375;
		Y[4] = 13.0 / 32.0;
		X[5] = 11.0 / 32.0;
		Y[5] = 15.0 / 32.0;
		X[6] = 9.0 / 32.0;
		Y[6] = 0.5;
		X[7] = 7.0 / 32.0;
		Y[7] = 0.5;
		X[8] = 5.0 / 32.0;
		Y[8] = 15.0 / 32.0;
		X[9] = 0.125;
		Y[9] = 13.0 / 32.0;
		X[10] = 0.125;
		Y[10] = 0.375;
		X[11] = 5.0 / 32.0;
		Y[11] = 0.3125;
		X[12] = 7.0 / 32.0;
		Y[12] = 9.0 / 32.0;
		checked
		{
			Point point = MainModule.Document.GetPoint(X[1] + 0.35 * (double)(i - 1), Y[1], 0);
			FcNumber = MainModule.Document.FeatureChains.Add(point);
			int num = 2;
			do
			{
				point = MainModule.Document.GetPoint(X[num] + 0.35 * (double)(i - 1), Y[num], 0);
				FcNumber.Add(point);
				num++;
			}
			while (num <= 12);
			FcNumber.Name = "8_1";
			SsNumber.Add(FcNumber, RuntimeHelpers.GetObjectValue(Missing.Value));
			FcNumber.Layer = MainModule.Document.Layers["MarkNumber"];
			FSNumber.Add(FcNumber);
			FcNumber = null;
			X[1] = 0.3125;
			Y[1] = 17.0 / 64.0;
			X[2] = 11.0 / 32.0;
			Y[2] = 0.25;
			X[3] = 0.375;
			Y[3] = 7.0 / 32.0;
			X[4] = 25.0 / 64.0;
			Y[4] = 0.1875;
			X[5] = 13.0 / 32.0;
			Y[5] = 5.0 / 32.0;
			X[6] = 13.0 / 32.0;
			Y[6] = 0.125;
			X[7] = 0.375;
			Y[7] = 0.0625;
			X[8] = 11.0 / 32.0;
			Y[8] = 1.0 / 32.0;
			X[9] = 9.0 / 32.0;
			Y[9] = 0.0;
			X[10] = 7.0 / 32.0;
			Y[10] = 0.0;
			X[11] = 5.0 / 32.0;
			Y[11] = 1.0 / 32.0;
			X[12] = 0.125;
			Y[12] = 0.0625;
			X[13] = 3.0 / 32.0;
			Y[13] = 0.125;
			X[14] = 3.0 / 32.0;
			Y[14] = 5.0 / 32.0;
			X[15] = 0.125;
			Y[15] = 7.0 / 32.0;
			X[16] = 5.0 / 32.0;
			Y[16] = 0.25;
			X[17] = 7.0 / 32.0;
			Y[17] = 9.0 / 32.0;
			X[18] = 9.0 / 32.0;
			Y[18] = 9.0 / 32.0;
			X[19] = 0.3125;
			Y[19] = 17.0 / 64.0;
			point = MainModule.Document.GetPoint(X[1] + 0.35 * (double)(i - 1), Y[1], 0);
			FcNumber = MainModule.Document.FeatureChains.Add(point);
			num = 2;
			do
			{
				point = MainModule.Document.GetPoint(X[num] + 0.35 * (double)(i - 1), Y[num], 0);
				FcNumber.Add(point);
				num++;
			}
			while (num <= 19);
			FcNumber.Name = "8_2";
			SsNumber.Add(FcNumber, RuntimeHelpers.GetObjectValue(Missing.Value));
			FcNumber.Layer = MainModule.Document.Layers["MarkNumber"];
			FSNumber.Add(FcNumber);
			FcNumber = null;
		}
	}

	private static void Number9(int i)
	{
		X[1] = 3.0 / 32.0;
		Y[1] = 0.125;
		X[2] = 0.125;
		Y[2] = 0.0625;
		X[3] = 5.0 / 32.0;
		Y[3] = 1.0 / 32.0;
		X[4] = 7.0 / 32.0;
		Y[4] = 0.0;
		X[5] = 9.0 / 32.0;
		Y[5] = 0.0;
		X[6] = 11.0 / 32.0;
		Y[6] = 1.0 / 32.0;
		X[7] = 0.375;
		Y[7] = 0.0625;
		X[8] = 13.0 / 32.0;
		Y[8] = 0.125;
		X[9] = 13.0 / 32.0;
		Y[9] = 0.3125;
		X[10] = 13.0 / 32.0;
		Y[10] = 0.375;
		X[11] = 0.375;
		Y[11] = 0.4375;
		X[12] = 11.0 / 32.0;
		Y[12] = 15.0 / 32.0;
		X[13] = 9.0 / 32.0;
		Y[13] = 0.5;
		X[14] = 7.0 / 32.0;
		Y[14] = 0.5;
		X[15] = 5.0 / 32.0;
		Y[15] = 15.0 / 32.0;
		X[16] = 0.125;
		Y[16] = 0.4375;
		X[17] = 3.0 / 32.0;
		Y[17] = 0.375;
		X[18] = 3.0 / 32.0;
		Y[18] = 0.3125;
		X[19] = 0.125;
		Y[19] = 0.25;
		X[20] = 5.0 / 32.0;
		Y[20] = 7.0 / 32.0;
		X[21] = 7.0 / 32.0;
		Y[21] = 0.1875;
		X[22] = 9.0 / 32.0;
		Y[22] = 0.1875;
		X[23] = 11.0 / 32.0;
		Y[23] = 7.0 / 32.0;
		X[24] = 0.375;
		Y[24] = 0.25;
		X[25] = 13.0 / 32.0;
		Y[25] = 0.3125;
		checked
		{
			Point point = MainModule.Document.GetPoint(X[1] + 0.35 * (double)(i - 1), Y[1], 0);
			FcNumber = MainModule.Document.FeatureChains.Add(point);
			int num = 2;
			do
			{
				point = MainModule.Document.GetPoint(X[num] + 0.35 * (double)(i - 1), Y[num], 0);
				FcNumber.Add(point);
				num++;
			}
			while (num <= 25);
			FcNumber.Name = "9";
			SsNumber.Add(FcNumber, RuntimeHelpers.GetObjectValue(Missing.Value));
			FcNumber.Layer = MainModule.Document.Layers["MarkNumber"];
			FSNumber.Add(FcNumber);
			FcNumber = null;
		}
	}
 }
}
