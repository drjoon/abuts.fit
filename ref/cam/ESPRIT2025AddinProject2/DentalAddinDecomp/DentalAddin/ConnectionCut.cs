using System;
using System.Collections;
using System.Reflection;
using System.Runtime.CompilerServices;
using Esprit;
using EspritConstants;
using Microsoft.VisualBasic.CompilerServices;

namespace DentalAddin
{

 [StandardModule]
 internal sealed class ConnectionCut
 {
	public static void GetBackTurningOD()
	{
		int try0000_dispatch = -1;
		int num2 = default(int);
		FeatureChain featureChain = default(FeatureChain);
		int num = default(int);
		while (true)
		{
			try
			{
				/*Note: ILSpy has introduced the following switch to emulate a goto from catch-block to try-block*/;
				checked
				{
					switch (try0000_dispatch)
					{
					default:
					{
						SelectionSet selectionSet = MainModule.Document.SelectionSets["SsB"];
						if (selectionSet == null)
						{
							selectionSet = MainModule.Document.SelectionSets.Add("SsB");
						}
						selectionSet.RemoveAll();
						Point[] array = new Point[3];
						IEnumerator enumerator = MainModule.Document.GraphicsCollection.GetEnumerator();
						while (enumerator.MoveNext())
						{
							GraphicObject graphicObject = (GraphicObject)enumerator.Current;
							if (graphicObject.GraphicObjectType == espGraphicObjectType.espSTL_Model)
							{
								selectionSet.Add(graphicObject, RuntimeHelpers.GetObjectValue(Missing.Value));
								break;
							}
						}
						if (enumerator is IDisposable)
						{
							(enumerator as IDisposable).Dispose();
						}
						int count = MainModule.Document.Layers.Count;
						for (int i = 1; i <= count; i++)
						{
							if (Operators.CompareString(MainModule.Document.Layers[i].Name, "LayB", false) == 0)
							{
								MainModule.Document.Layers.Remove("LayB");
								break;
							}
						}
						MainModule.Document.Layers.Add("LayB");
						MainModule.Document.ActiveLayer = MainModule.Document.Layers["LayB"];
						ProjectData.ClearProjectError();
						num2 = 2;
						if (MainModule.RL == 1.0)
						{
							MainModule.Document.FeatureRecognition.CreateTurningProfile(selectionSet, MainModule.Wp, espTurningProfileType.espTurningProfileFrontFace, espGraphicObjectReturnType.espFeatureChains, espTurningProfileLocationType.espTurningProfileLocationTop, 0.01, 0.01, 5.0);
						}
						else if (MainModule.RL == 2.0)
						{
							MainModule.Document.FeatureRecognition.CreateTurningProfile(selectionSet, MainModule.Wp, espTurningProfileType.espTurningProfileBackFace, espGraphicObjectReturnType.espFeatureChains, espTurningProfileLocationType.espTurningProfileLocationTop, 0.01, 0.01, 5.0);
						}
						IEnumerator enumerator2 = MainModule.Document.FeatureChains.GetEnumerator();
						while (enumerator2.MoveNext())
						{
							featureChain = (FeatureChain)enumerator2.Current;
							if (Operators.CompareString(featureChain.Layer.Name, "LayB", false) == 0)
							{
								break;
							}
						}
						if (enumerator2 is IDisposable)
						{
							(enumerator2 as IDisposable).Dispose();
						}
						if (featureChain != null)
						{
							array[1] = featureChain.PointAlong(0.0);
							array[2] = featureChain.PointAlong(0.5);
							if (!(Math.Abs(array[1].X) < Math.Abs(array[2].X)))
							{
								featureChain.Reverse();
							}
							int count2 = featureChain.Count;
							int i;
							for (i = 1; i <= count2; i++)
							{
								GraphicObject graphicObject = (GraphicObject)((IFeatureChain)featureChain).get_Item(i);
								if (graphicObject.GraphicObjectType == espGraphicObjectType.espSegment)
								{
									Segment segment = (Segment)graphicObject;
									array[1] = segment.Extremity(espExtremityType.espExtremityStart);
									array[2] = segment.Extremity(espExtremityType.espExtremityEnd);
									if ((Math.Abs(Math.Abs(array[1].X) - MoveSTL_Module.FrontStock) <= 0.01) & (Math.Abs(Math.Abs(array[2].X) - MoveSTL_Module.FrontStock) <= 0.01))
									{
										break;
									}
								}
							}
							featureChain.RemoveEnd(i);
							featureChain.Reverse();
							int count3 = featureChain.Count;
							for (i = 1; i <= count3; i++)
							{
								GraphicObject graphicObject = (GraphicObject)((IFeatureChain)featureChain).get_Item(i);
								if (graphicObject.GraphicObjectType == espGraphicObjectType.espSegment)
								{
									Segment segment = (Segment)graphicObject;
									array[1] = segment.Extremity(espExtremityType.espExtremityStart);
									array[2] = segment.Extremity(espExtremityType.espExtremityEnd);
									if ((Math.Abs(Math.Abs(array[1].X) - MoveSTL_Module.MTI) <= 0.01) | (Math.Abs(Math.Abs(array[2].X) - MoveSTL_Module.MTI) <= 0.01))
									{
										break;
									}
								}
								if (graphicObject.GraphicObjectType == espGraphicObjectType.espSegment)
								{
									Arc arc = (Arc)graphicObject;
									array[1] = arc.Extremity(espExtremityType.espExtremityStart);
									array[2] = arc.Extremity(espExtremityType.espExtremityEnd);
									if ((Math.Abs(Math.Abs(array[1].X) - MoveSTL_Module.MTI) <= 0.01) | (Math.Abs(Math.Abs(array[2].X) - MoveSTL_Module.MTI) <= 0.01))
									{
										break;
									}
								}
							}
							if (i < featureChain.Count)
							{
								featureChain.RemoveEnd(i + 1);
								featureChain.Reverse();
							}
							featureChain.Name = "BackTurning";
						}
						MainModule.Document.Refresh(RuntimeHelpers.GetObjectValue(Missing.Value), RuntimeHelpers.GetObjectValue(Missing.Value));
						break;
					}
					case 1176:
						num = -1;
						switch (num2)
						{
						case 2:
							break;
						default:
							goto IL_04ce;
						}
						break;
					}
				}
			}
			catch (Exception ex) when (num2 != 0 && num == 0)
			{
				ProjectData.SetProjectError(ex);
				try0000_dispatch = 1176;
				continue;
			}
			break;
			IL_04ce:
			throw ProjectData.CreateProjectError(-2146828237);
		}
		if (num != 0)
		{
			ProjectData.ClearProjectError();
		}
	}

	public static void CutOff()
	{
		Point[] array = new Point[3];
		if (MainModule.RL == 1.0)
		{
			array[1] = MainModule.Document.GetPoint(MoveSTL_Module.FrontStock, MainModule.Document.LatheMachineSetup.BarDiameter / 2.0, 0);
			array[2] = MainModule.Document.GetPoint(MoveSTL_Module.FrontStock, 0, 0);
		}
		else
		{
			array[1] = MainModule.Document.GetPoint(0.0 - MoveSTL_Module.FrontStock, MainModule.Document.LatheMachineSetup.BarDiameter / 2.0, 0);
			array[2] = MainModule.Document.GetPoint(0.0 - MoveSTL_Module.FrontStock, 0, 0);
		}
		FeatureChain featureChain = MainModule.Document.FeatureChains.Add(array[1]);
		featureChain.Add(array[2]);
		featureChain.Name = "CutOff";
		featureChain.Layer = MainModule.Document.Layers["LayB"];
	}

	public static void Face()
	{
		Point[] array = new Point[3];
		if (MainModule.RL == 1.0)
		{
			array[1] = MainModule.Document.GetPoint(0, MainModule.Document.LatheMachineSetup.BarDiameter / 2.0, 0);
			array[2] = MainModule.Document.GetPoint(0, 0, 0);
		}
		else
		{
			array[1] = MainModule.Document.GetPoint(0, MainModule.Document.LatheMachineSetup.BarDiameter / 2.0, 0);
			array[2] = MainModule.Document.GetPoint(0, 0, 0);
		}
		FeatureChain featureChain = MainModule.Document.FeatureChains.Add(array[1]);
		featureChain.Add(array[2]);
		featureChain.Name = "Face";
		featureChain.Layer = MainModule.Document.Layers["LayB"];
	}
 }
}
