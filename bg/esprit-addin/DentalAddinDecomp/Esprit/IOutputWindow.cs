using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;

namespace Esprit;

[ComImport]
[CompilerGenerated]
[Guid("A14AFEC4-43D3-4604-BC13-C8010DEE744A")]
[TypeIdentifier]
public interface IOutputWindow : IDockingBar
{
	void _VtblGap1_17();

	[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
	[DispId(103)]
	void Text([In][MarshalAs(UnmanagedType.BStr)] string OutputText);
}
