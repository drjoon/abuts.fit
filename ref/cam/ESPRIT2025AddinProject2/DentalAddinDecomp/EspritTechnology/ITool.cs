using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using EspritConstants;

namespace EspritTechnology;

[ComImport]
[CompilerGenerated]
[Guid("CEBCFC53-F992-4CD6-946F-C2E6ED9FEC91")]
[TypeIdentifier]
public interface ITool
{
	void _VtblGap1_9();

	[DispId(6)]
	string ToolID
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(6)]
		[return: MarshalAs(UnmanagedType.BStr)]
		get;
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(6)]
		[param: In]
		[param: MarshalAs(UnmanagedType.BStr)]
		set;
	}

	void _VtblGap2_4();

	[DispId(10)]
	espToolType ToolStyle
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(10)]
		get;
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(10)]
		[param: In]
		set;
	}
}
