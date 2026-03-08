using System.Collections;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;

namespace Esprit;

[ComImport]
[CompilerGenerated]
[Guid("6621B3B9-40CA-4267-AD9B-589C9C002088")]
[TypeIdentifier]
public interface IArcs : IEnumerable
{
	[DispId(0)]
	Arc this[[In][MarshalAs(UnmanagedType.Struct)] object Index]
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(0)]
		[return: MarshalAs(UnmanagedType.Interface)]
		get;
	}

	[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
	[DispId(1)]
	[return: MarshalAs(UnmanagedType.Interface)]
	Arc Add([In][MarshalAs(UnmanagedType.Interface)] Point CenterPoint, [In] double Radius, [In] double StartAngle, [In] double EndAngle);

	[DispId(2)]
	int Count
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(2)]
		get;
	}
}
