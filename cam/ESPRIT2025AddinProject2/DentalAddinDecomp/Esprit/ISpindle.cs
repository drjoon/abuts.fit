using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using EspritConstants;

namespace Esprit;

[ComImport]
[CompilerGenerated]
[Guid("A0CF3A4A-24F6-4905-9126-C8A2581339A4")]
[TypeIdentifier]
public interface ISpindle : IHeadSpindleTurret
{
	void _VtblGap1_6();

	[DispId(13)]
	espSpindleType Type
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(13)]
		get;
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(13)]
		[param: In]
		set;
	}

	[DispId(14)]
	espSpindleOrientation Orientation
	{
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(14)]
		get;
		[MethodImpl(MethodImplOptions.InternalCall, MethodCodeType = MethodCodeType.Runtime)]
		[DispId(14)]
		[param: In]
		set;
	}
}
