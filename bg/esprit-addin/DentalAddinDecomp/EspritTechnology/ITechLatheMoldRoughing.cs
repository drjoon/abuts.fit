using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;

namespace EspritTechnology;

[ComImport]
[CompilerGenerated]
[Guid("C826CAB3-CABB-48F5-BACF-50E7DF37E5C6")]
[TypeIdentifier]
public interface ITechLatheMoldRoughing
{
	void _VtblGap1_44();

	[DispId(23)]
	string BoundaryProfiles
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
