using System.Collections;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;

namespace Esprit;

[ComImport]
[CompilerGenerated]
[Guid("DD69EDA0-293A-416A-B801-4EAFEC44D434")]
[TypeIdentifier]
public interface IOperation : IGraphicObject, IEnumerable
{
	void _VtblGap1_23();

	[DispId(0)]
	Operation this[[In] int Index]
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(0)]
		[return: MarshalAs(UnmanagedType.Interface)]
		get;
	}
}
