using System;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;

namespace EspritTechnology;

[ComImport]
[CompilerGenerated]
[Guid("32C8660C-E4B5-4FCF-92A8-1CBCA50B3641")]
[TypeIdentifier]
public interface ITechnologyUtility
{
	void _VtblGap1_13();

	[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
	[DispId(13)]
	[return: MarshalAs(UnmanagedType.SafeArray, SafeArraySubType = VarEnum.VT_DISPATCH)]
	Array OpenProcess([In][MarshalAs(UnmanagedType.BStr)] string File);
}
