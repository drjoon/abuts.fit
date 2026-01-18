using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using EspritConstants;

namespace EspritMenus;

[ComImport]
[CompilerGenerated]
[Guid("DC8EE712-27AC-4868-A387-5B57D3B901B6")]
[TypeIdentifier]
public interface IMenu
{
	[DispId(0)]
	MenuItem this[[In][MarshalAs(UnmanagedType.Struct)] object index]
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(0)]
		[return: MarshalAs(UnmanagedType.Interface)]
		get;
	}

	void _VtblGap1_2();

	[DispId(2)]
	int Count
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(2)]
		get;
	}

	[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
	[DispId(3)]
	[return: MarshalAs(UnmanagedType.Interface)]
	MenuItem Add([In] espMenuItemType Type, [Optional][In][MarshalAs(UnmanagedType.Struct)] object Name, [Optional][In][MarshalAs(UnmanagedType.Struct)] object Command, [Optional][In][MarshalAs(UnmanagedType.Struct)] object index);

	[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
	[DispId(4)]
	void Remove([In][MarshalAs(UnmanagedType.Struct)] object index);
}
