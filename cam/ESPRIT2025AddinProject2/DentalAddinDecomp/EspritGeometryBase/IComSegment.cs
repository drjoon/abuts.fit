using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;

namespace EspritGeometryBase;

[ComImport]
[CompilerGenerated]
[Guid("119EE105-7FC0-45A7-A82A-39A69E56934A")]
[TypeIdentifier]
public interface IComSegment : ComGeoBoundUnbound
{
	void _VtblGap1_10();

	[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
	[DispId(13)]
	[return: MarshalAs(UnmanagedType.Interface)]
	IComPoint PointAlong([In] double Length);

	[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
	[DispId(14)]
	[return: MarshalAs(UnmanagedType.Interface)]
	IComVector TangentAlong([In] double Length);

	[DispId(15)]
	double Length
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(15)]
		get;
	}

	void _VtblGap2_7();

	[DispId(40)]
	IComPoint StartPoint
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(40)]
		[return: MarshalAs(UnmanagedType.Interface)]
		get;
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(40)]
		[param: In]
		[param: MarshalAs(UnmanagedType.Interface)]
		set;
	}

	[DispId(41)]
	IComPoint EndPoint
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(41)]
		[return: MarshalAs(UnmanagedType.Interface)]
		get;
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(41)]
		[param: In]
		[param: MarshalAs(UnmanagedType.Interface)]
		set;
	}
}
