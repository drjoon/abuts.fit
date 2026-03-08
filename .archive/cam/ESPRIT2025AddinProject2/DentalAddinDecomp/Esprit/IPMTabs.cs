using System.Collections;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;

namespace Esprit;

[ComImport]
[CompilerGenerated]
[Guid("4152E522-2B36-46DB-9BDF-F7C699225858")]
[TypeIdentifier]
public interface IPMTabs : IEnumerable
{
	[DispId(0)]
	PMTab this[[In] int Index]
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(0)]
		[return: MarshalAs(UnmanagedType.Interface)]
		get;
	}

	void _VtblGap1_2();

	[DispId(3)]
	int HWND
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(3)]
		get;
	}

	[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
	[DispId(5)]
	void Remove([In] int HWND);

	[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
	[DispId(6)]
	[return: MarshalAs(UnmanagedType.Interface)]
	PMTab Add([In] int HWND, [In][MarshalAs(UnmanagedType.BStr)] string Caption, [In] int Icon, [Optional][In][MarshalAs(UnmanagedType.Struct)] object Order);

	void _VtblGap2_1();

	[DispId(8)]
	PMTab ActiveTab
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(8)]
		[return: MarshalAs(UnmanagedType.Interface)]
		get;
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(8)]
		[param: In]
		[param: MarshalAs(UnmanagedType.Interface)]
		set;
	}
}
