using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;

namespace Esprit;

[ComImport]
[CompilerGenerated]
[Guid("BE358234-1792-44C0-A6DC-4AF800AF1268")]
[TypeIdentifier]
public interface IGroup
{
	[DispId(0)]
	object this[[In][MarshalAs(UnmanagedType.Struct)] object vIndex]
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(0)]
		[return: MarshalAs(UnmanagedType.IDispatch)]
		get;
	}
}
