using System;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using EspritConstants;

namespace Esprit;

[ComImport]
[CompilerGenerated]
[Guid("0F8C53C2-371D-44A6-8B4F-F5632D9CC574")]
[TypeIdentifier]
public interface IFeatureRecognition
{
	[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
	[DispId(1)]
	[return: MarshalAs(UnmanagedType.SafeArray, SafeArraySubType = VarEnum.VT_DISPATCH)]
	Array CreatePartProfileShadow([In][MarshalAs(UnmanagedType.Interface)] SelectionSet Elements, [In][MarshalAs(UnmanagedType.Interface)] Plane Plane, [In] espGraphicObjectReturnType RetType);

	[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
	[DispId(2)]
	[return: MarshalAs(UnmanagedType.SafeArray, SafeArraySubType = VarEnum.VT_DISPATCH)]
	Array CreatePartProfileCrossSection([In][MarshalAs(UnmanagedType.Interface)] SelectionSet Elements, [In][MarshalAs(UnmanagedType.Interface)] Plane Plane, [In] espGraphicObjectReturnType RetType, [In] bool SplitPart);

	void _VtblGap1_3();

	[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
	[DispId(6)]
	[return: MarshalAs(UnmanagedType.SafeArray, SafeArraySubType = VarEnum.VT_DISPATCH)]
	Array CreateAutoChains([In][MarshalAs(UnmanagedType.Interface)] SelectionSet GraphicObjects);

	void _VtblGap2_22();

	[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
	[DispId(29)]
	[return: MarshalAs(UnmanagedType.SafeArray, SafeArraySubType = VarEnum.VT_DISPATCH)]
	Array CreateTurningProfile([In][MarshalAs(UnmanagedType.Interface)] SelectionSet SelectionSet, [In][MarshalAs(UnmanagedType.Interface)] Plane Plane, [In] espTurningProfileType eProfileType, [In] espGraphicObjectReturnType RetType, [In] espTurningProfileLocationType eLocationType, [In] double PartTolerance, [In] double ArcApproximation, [In] double eAngle);
}
