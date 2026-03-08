using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using EspritConstants;

namespace EspritTechnology;

[ComImport]
[CompilerGenerated]
[Guid("9F6FD304-7FBF-4D8E-B538-D42AAE3DB2D3")]
[TypeIdentifier]
public interface ITechLatheMillContour1
{
	void _VtblGap1_34();

	[DispId(18)]
	espMillCuttingStrategy CuttingStrategy
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(18)]
		get;
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(18)]
		[param: In]
		set;
	}

	void _VtblGap2_44();

	[DispId(41)]
	double IncrementalDepth
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(41)]
		get;
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(41)]
		[param: In]
		set;
	}

	void _VtblGap3_28();

	[DispId(56)]
	espMillContourOffsetSide OffsetSideComputer
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(56)]
		get;
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(56)]
		[param: In]
		set;
	}

	void _VtblGap4_2();

	[DispId(58)]
	string OperationName
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(58)]
		[return: MarshalAs(UnmanagedType.BStr)]
		get;
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(58)]
		[param: In]
		[param: MarshalAs(UnmanagedType.BStr)]
		set;
	}

	void _VtblGap5_46();

	[DispId(82)]
	string ToolID
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(82)]
		[return: MarshalAs(UnmanagedType.BStr)]
		get;
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(82)]
		[param: In]
		[param: MarshalAs(UnmanagedType.BStr)]
		set;
	}
}
