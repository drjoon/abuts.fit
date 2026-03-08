using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using EspritConstants;

namespace Esprit;

[ComImport]
[CompilerGenerated]
[Guid("AB4D5FF3-17FB-4AE6-9BBB-D2FE25A02693")]
[TypeIdentifier]
public interface IGraphicObject
{
	void _VtblGap1_2();

	[DispId(13)]
	string Key
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(13)]
		[return: MarshalAs(UnmanagedType.BStr)]
		get;
	}

	[DispId(14)]
	Layer Layer
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(14)]
		[return: MarshalAs(UnmanagedType.Interface)]
		get;
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(14)]
		[param: In]
		[param: MarshalAs(UnmanagedType.Interface)]
		set;
	}

	void _VtblGap2_5();

	[DispId(18)]
	espGraphicObjectType GraphicObjectType
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(18)]
		get;
	}
}
