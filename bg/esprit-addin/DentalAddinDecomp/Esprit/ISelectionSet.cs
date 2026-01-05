using System.Collections;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using EspritConstants;

namespace Esprit;

[ComImport]
[CompilerGenerated]
[Guid("DE29E857-A27A-40F9-9961-B094A31C03DF")]
[TypeIdentifier]
public interface ISelectionSet : IGroup, IEnumerable
{
	[DispId(0)]
	new object this[[In][MarshalAs(UnmanagedType.Struct)] object vIndex]
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(0)]
		[return: MarshalAs(UnmanagedType.IDispatch)]
		get;
	}

	[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
	[DispId(1)]
	void Add([In][MarshalAs(UnmanagedType.Struct)] object Item, [Optional][In][MarshalAs(UnmanagedType.Struct)] object DigitizeInformation);

	[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
	[DispId(2)]
	void Remove([In][MarshalAs(UnmanagedType.Struct)] object vIndex);

	[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
	[DispId(3)]
	void Clear();

	[DispId(4)]
	int Count
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(4)]
		get;
	}

	void _VtblGap1_6();

	[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
	[DispId(22)]
	void RemoveAll();

	void _VtblGap2_4();

	[DispId(24)]
	bool AddCopiesToSelectionSet
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(24)]
		get;
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(24)]
		[param: In]
		set;
	}

	[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
	[DispId(25)]
	void Translate([In] double X, [In] double Y, [In] double Z, [Optional][In][MarshalAs(UnmanagedType.Struct)] object NumberOfCopies);

	[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
	[DispId(26)]
	void Rotate([In][MarshalAs(UnmanagedType.Interface)] IGraphicObject AroundObj, [In] double Angle, [Optional][In][MarshalAs(UnmanagedType.Struct)] object NumberOfCopies);

	void _VtblGap3_1();

	[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
	[DispId(28)]
	void ScaleUniform([MarshalAs(UnmanagedType.Interface)] IGraphicObject CenterPoint, double Factor, [MarshalAs(UnmanagedType.Struct)] object CreateCopy);

	void _VtblGap4_10();

	[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
	[DispId(39)]
	void Smash([In] bool CreateWireFrame, [In] bool CreateSurfaces, [In] bool CreateSTL, [In] espWireFrameElementType Wireframe, [In] double Tolerance, [In] double MinimumFaceAngle);

	[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
	[DispId(40)]
	void Offset([In] double Distance, [In] espOffsetSide Side, [In] bool ToolBlend, [In] espLookAheadMode LookAhead, [Optional][In][MarshalAs(UnmanagedType.Struct)] object CreateCopy);
}
