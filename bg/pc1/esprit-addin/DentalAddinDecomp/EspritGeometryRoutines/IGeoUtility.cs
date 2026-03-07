using System;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using EspritGeometryBase;

namespace EspritGeometryRoutines;

[ComImport]
[CompilerGenerated]
[Guid("74E05F3D-2279-4FA0-BB75-9FA7EB686F1D")]
[TypeIdentifier]
public interface IGeoUtility
{
	[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
	[DispId(1)]
	[return: MarshalAs(UnmanagedType.SafeArray, SafeArraySubType = VarEnum.VT_DISPATCH)]
	Array Intersect([In][MarshalAs(UnmanagedType.Interface)] ComGeoBase pEle1, [In][MarshalAs(UnmanagedType.Interface)] ComGeoBase pEle2);

	void _VtblGap1_14();

	[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
	[DispId(16)]
	[return: MarshalAs(UnmanagedType.Interface)]
	IComArc Arc3([In][MarshalAs(UnmanagedType.Interface)] ComGeoBase pGeoBase1, [In][MarshalAs(UnmanagedType.Interface)] IComPoint pRef1, [In][MarshalAs(UnmanagedType.Interface)] ComGeoBase pGeoBase2, [In][MarshalAs(UnmanagedType.Interface)] IComPoint pRef2, [In][MarshalAs(UnmanagedType.Interface)] ComGeoBase pGeoBase3, [In][MarshalAs(UnmanagedType.Interface)] IComPoint pRef3);
}
