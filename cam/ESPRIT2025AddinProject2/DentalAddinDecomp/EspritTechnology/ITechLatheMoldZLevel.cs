using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;

namespace EspritTechnology;

[ComImport]
[CompilerGenerated]
[Guid("810C35D2-3B72-40F6-B645-EC9E4D72E31A")]
[TypeIdentifier]
public interface ITechLatheMoldZLevel
{
	void _VtblGap1_42();

	[DispId(22)]
	string BoundaryProfiles
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(22)]
		[return: MarshalAs(UnmanagedType.BStr)]
		get;
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(22)]
		[param: In]
		[param: MarshalAs(UnmanagedType.BStr)]
		set;
	}
}
