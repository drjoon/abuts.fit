using System.Collections;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;

namespace EspritTechnology;

[ComImport]
[CompilerGenerated]
[Guid("CD4C0B39-1EAB-4B28-9E17-A937DECE1934")]
[TypeIdentifier]
public interface ITechnology : IEnumerable
{
	[DispId(0)]
	Parameter this[[In][MarshalAs(UnmanagedType.Struct)] object NameOrIndex1]
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(0)]
		[return: MarshalAs(UnmanagedType.Interface)]
		get;
	}
}
