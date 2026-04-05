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
	private static void CleanupTurningArtifacts()
	{
		try
		{
			if (MainModule.Document == null)
			{
				return;
			}

			int removed = 0;
			int count = MainModule.Document.FeatureChains.Count;
			checked
			{
				for (int i = 1; i <= count && i <= MainModule.Document.FeatureChains.Count; i++)
				{
					FeatureChain fc = MainModule.Document.FeatureChains[i];
					string name = fc?.Name ?? string.Empty;
					string layerName = fc?.Layer?.Name ?? string.Empty;
					if (Operators.CompareString(name, "Turning", false) == 0
						|| Operators.CompareString(Strings.Left(name, 13), "TurningProfile", false) == 0
						|| Operators.CompareString(layerName, "TurningLayer", false) == 0
						|| Operators.CompareString(layerName, "MyLayer", false) == 0)
					{
						MainModule.Document.FeatureChains.Remove(fc.Key);
						removed++;
						i = 0;
						continue;
					}
				}
			}

			try
			{
				MainModule.Document.Layers.Remove("MyLayer");
			}
			catch
			{
			}
			try
			{
				MainModule.Document.Layers.Remove("TurningLayer");
			}
			catch
			{
			}

			DentalLogger.Log($"TurningFeature: Cleanup 완료 - removedFeatureChains={removed}");
		}
		catch (Exception ex)
		{
			DentalLogger.LogException("TurningFeature: CleanupTurningArtifacts", ex);
		}
	}

	public static void TurningMain()
	{
		MainModule.FirstFeatureNeed = 0;
		MainModule.NeedFirstFeature = 0;
		MainModule.MinF = 0;
		MainModule.SL = 1.0;
		CleanupTurningArtifacts();
		TurningFeature_Profile.TurningProfile();
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
			double stockDiameter = halfBarDiameter * 2.0;
			double finishDiameter = 0.0;
			if (MoveSTL_Module.FinishLineR > 0.001)
			{
				finishDiameter = MoveSTL_Module.FinishLineR * 2.0;
			}
			else if (MainModule.LowerY > 0.001)
			{
				finishDiameter = MainModule.LowerY * 2.0;
			}
			double diameterRemoval = stockDiameter - finishDiameter;
			if (!double.IsNaN(diameterRemoval) && !double.IsInfinity(diameterRemoval) && diameterRemoval > 0.001)
			{
				MainModule.TurningTimes = Math.Max(1, (int)Math.Ceiling(diameterRemoval / 2.0));
				if (MainModule.TurningTimes > 1)
				{
					turningDepth = diameterRemoval / 2.0 / (double)(MainModule.TurningTimes - 1);
				}
				else
				{
					turningDepth = diameterRemoval / 2.0;
				}
				if (turningDepth <= 0.0 || double.IsNaN(turningDepth) || double.IsInfinity(turningDepth))
				{
					turningDepth = Math.Max(0.5, turningSpan);
				}
				MainModule.TurningDepth = turningDepth;
				DentalLogger.Log($"TurningMain: OD 패스 계산 - StockDia:{stockDiameter:F3}, FinishDia:{finishDiameter:F3}, Removal:{diameterRemoval:F3}, Paths:{MainModule.TurningTimes}, RadialStep:{turningDepth:F3}");
			}
			else
			{
				MainModule.TurningTimes = Math.Max(1, (int)Conversion.Int(turningSpan / turningDepth));
				double turningRatio = turningSpan / turningDepth - (double)MainModule.TurningTimes;
				if (turningRatio > 0.1 && turningRatio + turningDepth > 1.05)
				{
					MainModule.TurningTimes++;
				}
			}
			if (MainModule.TurningTimes >= 15)
			{
				MainModule.TurningTimes = 15;
			}
			TurningFeature_Profile.MutipleProfile();
			MainModule.Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
			if (MainModule.TurningTimes > 2)
			{
				TurningFeature_FeatureChain.FeatureExchange();
				TurningFeature_FeatureChain.HandleTurningFeature();
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
			TurningFeature_Extension.OffFrontFeature();
			MainModule.Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
			count = MainModule.Document.FeatureChains.Count;
			for (int i = 1; i <= count && i <= MainModule.Document.FeatureChains.Count; i++)
			{
				MainModule.FC1 = MainModule.Document.FeatureChains[i];
				string name = MainModule.FC1?.Name ?? string.Empty;
				if ((Operators.CompareString(Strings.Left(name, 14), "TurningProfile", false) == 0 && Operators.CompareString(Strings.Right(name, 6), "_Front", false) == 0)
					|| Operators.CompareString(Strings.Left(name, 13), "Back_Turning_", false) == 0)
				{
					MainModule.Document.FeatureChains.Remove(i);
					i = 0;
				}
			}
			MainModule.Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
			MainModule.FC1 = null;
			MainModule.FC2 = null;
			TurningFeature_Extension.ExtendTurning();
			if (MainModule.FirstFeatureNeed == 1)
			{
				TurningFeature_Extension.HandleFirstFeature();
			}
			MainModule.FC1 = null;
			MainModule.FC2 = null;
		}
	}
}

#pragma warning restore CS0162
