using System.Collections;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;

namespace Esprit;

[ComImport]
[CompilerGenerated]
[Guid("FBBA7A9B-5916-46C5-AFAA-18FDCF6B59F2")]
[TypeIdentifier]
public interface IOperations : IEnumerable
{
	[DispId(0)]
	Operation this[[In][MarshalAs(UnmanagedType.Struct)] object Index]
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(0)]
		[return: MarshalAs(UnmanagedType.Interface)]
		get;
	}

	[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
	[DispId(1)]
	[return: MarshalAs(UnmanagedType.Interface)]
	Operation Add([In][MarshalAs(UnmanagedType.IDispatch)] object pITechnology, [In][MarshalAs(UnmanagedType.Interface)] IGraphicObject pIFeature = null, [Optional][In][MarshalAs(UnmanagedType.Struct)] object vOptArg);
}
