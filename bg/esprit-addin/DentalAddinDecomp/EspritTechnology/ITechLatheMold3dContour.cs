using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;

namespace EspritTechnology;

[ComImport]
[CompilerGenerated]
[Guid("E36BC9C4-3AA7-440C-BDD3-A96D86AF1EF4")]
[TypeIdentifier]
public interface ITechLatheMold3dContour
{
	[DispId(1)]
	string CuttingProfiles
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(1)]
		[return: MarshalAs(UnmanagedType.BStr)]
		get;
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(1)]
		[param: In]
		[param: MarshalAs(UnmanagedType.BStr)]
		set;
	}

	void _VtblGap1_42();

	[DispId(23)]
	string ToolID
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(23)]
		[return: MarshalAs(UnmanagedType.BStr)]
		get;
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(23)]
		[param: In]
		[param: MarshalAs(UnmanagedType.BStr)]
		set;
	}
}
