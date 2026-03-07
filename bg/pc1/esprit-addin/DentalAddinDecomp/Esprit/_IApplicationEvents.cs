using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;

namespace Esprit;

[ComImport]
[CompilerGenerated]
[Guid("33C24FC2-1CF4-447F-BCDB-07C222089E43")]
[InterfaceType(2)]
[TypeIdentifier]
public interface _IApplicationEvents
{
	void _VtblGap1_3();

	[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
	[DispId(4)]
	void AfterDocumentOpen([In][MarshalAs(UnmanagedType.BStr)] string FileName);

	[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
	[DispId(5)]
	void AfterNewDocumentOpen();

	[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
	[DispId(6)]
	void AfterTemplateOpen([In][MarshalAs(UnmanagedType.BStr)] string FileName);
}
