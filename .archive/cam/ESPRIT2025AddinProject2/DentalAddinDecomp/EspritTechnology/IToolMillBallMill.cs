using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using EspritConstants;

namespace EspritTechnology;

[ComImport]
[CompilerGenerated]
[Guid("541DBD29-C703-4E90-959A-EDFA088FB6DC")]
[TypeIdentifier]
public interface IToolMillBallMill
{
	void _VtblGap1_8();

	[DispId(5)]
	string ToolID
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(5)]
		[return: MarshalAs(UnmanagedType.BStr)]
		get;
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(5)]
		[param: In]
		[param: MarshalAs(UnmanagedType.BStr)]
		set;
	}

	void _VtblGap2_50();

	[DispId(31)]
	espMillToolOrientation Orientation
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(31)]
		get;
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(31)]
		[param: In]
		set;
	}

	void _VtblGap3_24();

	[DispId(44)]
	double ToolDiameter
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(44)]
		get;
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(44)]
		[param: In]
		set;
	}
}
