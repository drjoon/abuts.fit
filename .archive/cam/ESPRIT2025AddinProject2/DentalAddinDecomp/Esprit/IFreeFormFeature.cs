using System.Collections;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using EspritConstants;
using EspritFeatures;

namespace Esprit;

[ComImport]
[CompilerGenerated]
[Guid("588C8065-2906-4FD1-876C-68CC9519F088")]
[TypeIdentifier]
public interface IFreeFormFeature : IFeature, IEnumerable
{
	void _VtblGap1_25();

	[DispId(92)]
	string Name
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(92)]
		[return: MarshalAs(UnmanagedType.BStr)]
		get;
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(92)]
		[param: In]
		[param: MarshalAs(UnmanagedType.BStr)]
		set;
	}

	void _VtblGap2_2();

	[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
	[DispId(201)]
	[return: MarshalAs(UnmanagedType.Interface)]
	ComFreeFormFeatureElement Add([In][MarshalAs(UnmanagedType.IDispatch)] object GO, [In] espFreeFormElementType FreeFormFeatureElementType);
}
