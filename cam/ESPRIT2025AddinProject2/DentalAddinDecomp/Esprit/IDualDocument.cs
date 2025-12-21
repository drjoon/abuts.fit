using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;

namespace Esprit;

[ComImport]
[CompilerGenerated]
[Guid("E8F73F35-CA98-41CE-8EE7-570E9365EBF8")]
[TypeIdentifier]
public interface IDualDocument
{
	void _VtblGap1_4();

	[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
	[DispId(101)]
	void Refresh([Optional][In][MarshalAs(UnmanagedType.Struct)] object RefreshType, [Optional][In][MarshalAs(UnmanagedType.Struct)] object RefreshHint);

	void _VtblGap2_2();

	[DispId(103)]
	Points Points
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(103)]
		[return: MarshalAs(UnmanagedType.Interface)]
		get;
	}

	void _VtblGap3_2();

	[DispId(106)]
	Segments Segments
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(106)]
		[return: MarshalAs(UnmanagedType.Interface)]
		get;
	}

	[DispId(107)]
	Arcs Arcs
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(107)]
		[return: MarshalAs(UnmanagedType.Interface)]
		get;
	}

	[DispId(108)]
	FeatureChains FeatureChains
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(108)]
		[return: MarshalAs(UnmanagedType.Interface)]
		get;
	}

	void _VtblGap4_1();

	[DispId(110)]
	object Tools
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(110)]
		[return: MarshalAs(UnmanagedType.IDispatch)]
		get;
	}

	[DispId(111)]
	Layers Layers
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(111)]
		[return: MarshalAs(UnmanagedType.Interface)]
		get;
	}

	[DispId(120)]
	Layer ActiveLayer
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(120)]
		[return: MarshalAs(UnmanagedType.Interface)]
		get;
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(120)]
		[param: In]
		[param: MarshalAs(UnmanagedType.Interface)]
		set;
	}

	[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
	[DispId(122)]
	[return: MarshalAs(UnmanagedType.Interface)]
	Point GetPoint([Optional][In][MarshalAs(UnmanagedType.Struct)] object Vx, [Optional][In][MarshalAs(UnmanagedType.Struct)] object Vy, [Optional][In][MarshalAs(UnmanagedType.Struct)] object Vz);

	void _VtblGap5_2();

	[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
	[DispId(125)]
	[return: MarshalAs(UnmanagedType.Interface)]
	Segment GetSegment([Optional][In][MarshalAs(UnmanagedType.Struct)] object v1, [Optional][In][MarshalAs(UnmanagedType.Struct)] object v2);

	[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
	[DispId(126)]
	[return: MarshalAs(UnmanagedType.Interface)]
	Arc GetArc([Optional][In][MarshalAs(UnmanagedType.Struct)] object v1, [Optional][In][MarshalAs(UnmanagedType.Struct)] object v2, [Optional][In][MarshalAs(UnmanagedType.Struct)] object v3, [Optional][In][MarshalAs(UnmanagedType.Struct)] object v4);

	[DispId(127)]
	Operations Operations
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(127)]
		[return: MarshalAs(UnmanagedType.Interface)]
		get;
	}

	[DispId(128)]
	Windows Windows
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(128)]
		[return: MarshalAs(UnmanagedType.Interface)]
		get;
	}

	void _VtblGap6_1();

	[DispId(1610743834)]
	GraphicsCollection GraphicsCollection
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(1610743834)]
		[return: MarshalAs(UnmanagedType.Interface)]
		get;
	}

	[DispId(130)]
	LatheMachineSetup LatheMachineSetup
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(130)]
		[return: MarshalAs(UnmanagedType.Interface)]
		get;
	}

	void _VtblGap7_10();

	[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
	[DispId(143)]
	[return: MarshalAs(UnmanagedType.Interface)]
	IGraphicObject GetAnyElement([In][MarshalAs(UnmanagedType.BStr)] string Prompt, [Optional][In][MarshalAs(UnmanagedType.Struct)] object Type);

	void _VtblGap8_1();

	[DispId(145)]
	SelectionSets SelectionSets
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(145)]
		[return: MarshalAs(UnmanagedType.Interface)]
		get;
	}

	void _VtblGap9_2();

	[DispId(148)]
	Planes Planes
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(148)]
		[return: MarshalAs(UnmanagedType.Interface)]
		get;
	}

	void _VtblGap10_3();

	[DispId(152)]
	FeatureSets FeatureSets
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(152)]
		[return: MarshalAs(UnmanagedType.Interface)]
		get;
	}

	void _VtblGap11_1();

	[DispId(153)]
	Plane ActivePlane
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(153)]
		[return: MarshalAs(UnmanagedType.Interface)]
		get;
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(153)]
		[param: In]
		[param: MarshalAs(UnmanagedType.Interface)]
		set;
	}

	void _VtblGap12_4();

	[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
	[DispId(157)]
	void MergeFile([In][MarshalAs(UnmanagedType.BStr)] string MergeFileName, [Optional][In][MarshalAs(UnmanagedType.Struct)] object Val);

	void _VtblGap13_3();

	[DispId(160)]
	FeatureRecognition FeatureRecognition
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(160)]
		[return: MarshalAs(UnmanagedType.Interface)]
		get;
	}

	void _VtblGap14_12();

	[DispId(174)]
	FreeFormFeatures FreeFormFeatures
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(174)]
		[return: MarshalAs(UnmanagedType.Interface)]
		get;
	}
}
